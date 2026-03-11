/**
 * Side Panel Bridge
 * Handles communication between the side panel and the content script
 * for operations that require direct DOM access (element picking, region selection, etc.)
 */

import type { CSSChange, ElementStyleSnapshot } from '@/shared/types/css-change';
import { cropScreenshotToRect } from '@/shared/utils/screenshot';
import { generateDisplaySelector } from '@/shared/utils/css-selector';
import { captureSnapshot } from '@/shared/utils/css-snapshot';
import { diffSnapshots } from '@/shared/utils/css-diff';
import {
  createGuidelineElements,
  updateGuidelines,
  createInfoPanel,
  updateInfoPanel,
  createHighlightOverlay,
  createPickedHighlight as createPickedHighlightEl,
  createHoverHighlight,
  updateHighlightPosition,
} from '@/shared/utils/picking-visuals';
import {
  captureElementInfo as captureElementInfoShared,
  getElementLabel,
  getAncestorChain,
  getDirectChildren,
} from '@/shared/utils/element-info';
import type { BreadcrumbData, SerializedBreadcrumbItem } from '@/shared/types/element-info';
import { STORAGE_KEYS } from '@/shared/constants';

// Direct port connection from side panel (CSS Peeper pattern)
let sidePanelPort: chrome.runtime.Port | null = null;

let isPickingForPanel = false;

// CSS tracking state (uses same snapshot format as widget)
let beforeSnapshotData: ElementStyleSnapshot | null = null;
let beforeScreenshotDataUrl: string | null = null;
let pickingOverlay: HTMLDivElement | null = null;
let highlightOverlay: HTMLDivElement | null = null;
let guidelinesContainer: HTMLDivElement | null = null;
let infoPanel: HTMLDivElement | null = null;
let currentPickedElement: Element | null = null;
let pickedHighlight: HTMLDivElement | null = null;
let hoverHighlight: HTMLDivElement | null = null;

// For style reset (Phase 4)
let originalStyleText: string | null = null;

// Cache for breadcrumb navigation
let ancestorElements: Element[] = [];
let childElements: Element[] = [];

// ID prefix for panel-specific elements
const PANEL_GUIDE_PREFIX = 'bugshot-panel-guide';

// ── Hover highlight functions (same as widget) ──
function showHoverHighlightOnElement(element: Element) {
  if (!hoverHighlight) {
    hoverHighlight = createHoverHighlight('bugshot-panel-hover-highlight');
    document.documentElement.appendChild(hoverHighlight);
  }

  const rect = element.getBoundingClientRect();
  updateHighlightPosition(hoverHighlight, rect, true);
}

function hideHoverHighlightElement() {
  if (hoverHighlight) {
    hoverHighlight.style.display = 'none';
  }
}

function removeHoverHighlight() {
  if (hoverHighlight) {
    hoverHighlight.remove();
    hoverHighlight = null;
  }
}

// ── Breadcrumb data with element caching (for later lookup) ──
function getBreadcrumbDataWithCache(element: Element): BreadcrumbData {
  // Get and cache ancestors
  ancestorElements = getAncestorChain(element);
  const ancestors: SerializedBreadcrumbItem[] = ancestorElements.map((el, index) => ({
    index,
    label: getElementLabel(el),
    isCurrentPicked: false,
    type: 'ancestor' as const,
  }));

  // Current element
  const current: SerializedBreadcrumbItem = {
    index: 0,
    label: getElementLabel(element),
    isCurrentPicked: true,
    type: 'current' as const,
  };

  // Get and cache children
  childElements = getDirectChildren(element);
  const children: SerializedBreadcrumbItem[] = childElements.map((el, index) => ({
    index,
    label: getElementLabel(el),
    isCurrentPicked: false,
    type: 'child' as const,
  }));

  return { ancestors, current, children };
}

function createOverlays() {
  // Main picking overlay (captures clicks)
  pickingOverlay = document.createElement('div');
  pickingOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 2147483646;
    cursor: crosshair;
    pointer-events: auto;
  `;

  // Highlight overlay (using shared utility - same as widget)
  highlightOverlay = createHighlightOverlay('bugshot-panel-highlight');

  // Guidelines (using shared utility - same as widget)
  guidelinesContainer = createGuidelineElements(PANEL_GUIDE_PREFIX);

  // Info panel (using shared utility - same as widget)
  infoPanel = createInfoPanel('bugshot-panel-info');

  document.body.appendChild(pickingOverlay);
  document.body.appendChild(highlightOverlay);
  document.body.appendChild(guidelinesContainer);
  document.body.appendChild(infoPanel);
  document.documentElement.style.cursor = 'crosshair';
}

function removeOverlays() {
  pickingOverlay?.remove();
  highlightOverlay?.remove();
  guidelinesContainer?.remove();
  infoPanel?.remove();
  pickingOverlay = null;
  highlightOverlay = null;
  guidelinesContainer = null;
  infoPanel = null;
  document.documentElement.style.cursor = '';
}

function updateHighlight(element: Element) {
  if (!highlightOverlay) return;

  const rect = element.getBoundingClientRect();

  // Update highlight box (using shared utility - same as widget)
  updateHighlightPosition(highlightOverlay, rect, true);

  // Update guidelines (using shared utility - same as widget)
  updateGuidelines(rect, PANEL_GUIDE_PREFIX);

  // Update info panel (using shared utility - same as widget)
  updateInfoPanel(element, rect, 'bugshot-panel-info');
}

// Element removal observer
let elementRemovalObserver: MutationObserver | null = null;

// Create persistent highlight for picked element (using shared utility - same as widget)
function createPickedHighlight(element: Element) {
  removePickedHighlight();

  // Use shared utility for consistent styling
  pickedHighlight = createPickedHighlightEl('bugshot-panel-picked-highlight');
  document.documentElement.appendChild(pickedHighlight);

  const updatePosition = () => {
    if (!pickedHighlight || !element.isConnected) {
      removePickedHighlight();
      return;
    }
    const rect = element.getBoundingClientRect();
    updateHighlightPosition(pickedHighlight, rect, true);
  };
  updatePosition();

  // Track scroll/resize
  window.addEventListener('scroll', updatePosition, true);
  window.addEventListener('resize', updatePosition);

  // ── Element removal detection (same as widget) ──
  // Watch for element removal from DOM
  elementRemovalObserver?.disconnect();
  elementRemovalObserver = new MutationObserver(() => {
    if (!element.isConnected) {
      console.log('[SidePanelBridge] Picked element removed from DOM');
      // Notify panel that element was removed
      const message = { type: 'ELEMENT_REMOVED' };
      if (sidePanelPort) {
        sidePanelPort.postMessage(message);
      } else {
        chrome.runtime.sendMessage({ type: 'SIDEPANEL_ELEMENT_REMOVED' });
      }
      // Clean up
      removePickedHighlight();
      currentPickedElement = null;
      resetTracking();
    }
  });
  // Observe parent element for child removals
  const parent = element.parentElement || document.body;
  elementRemovalObserver.observe(parent, { childList: true, subtree: true });

  // Store cleanup function
  (pickedHighlight as any)._cleanup = () => {
    window.removeEventListener('scroll', updatePosition, true);
    window.removeEventListener('resize', updatePosition);
    elementRemovalObserver?.disconnect();
    elementRemovalObserver = null;
  };
}

function removePickedHighlight() {
  if (pickedHighlight) {
    if ((pickedHighlight as any)._cleanup) {
      (pickedHighlight as any)._cleanup();
    }
    pickedHighlight.remove();
    pickedHighlight = null;
  }
}

/**
 * Comprehensive cleanup of all panel picking state.
 * Called when switching from Panel mode to Widget mode to avoid conflicts.
 */
function cleanupPanelState() {
  console.log('[SidePanelBridge] Cleaning up panel state for mode switch');

  // Cancel ongoing picking
  if (isPickingForPanel) {
    cancelPicking();
  }

  // Restore original style before clearing element reference
  if (originalStyleText !== null && currentPickedElement) {
    try {
      (currentPickedElement as HTMLElement).style.cssText = originalStyleText;
    } catch { /* ignore */ }
  }
  originalStyleText = null;

  // Reset tracking state
  resetTracking();

  // Clear picked element and caches
  currentPickedElement = null;
  ancestorElements = [];
  childElements = [];

  // Remove hover highlight
  removeHoverHighlight();
}

// Listen for cleanup events from widget
window.addEventListener('bugshot-cleanup-panel-state', () => {
  cleanupPanelState();
});

function getElementAtPoint(x: number, y: number): Element | null {
  // Temporarily hide overlays to get element underneath
  if (pickingOverlay) pickingOverlay.style.pointerEvents = 'none';
  if (highlightOverlay) highlightOverlay.style.display = 'none';

  const element = document.elementFromPoint(x, y);

  if (pickingOverlay) pickingOverlay.style.pointerEvents = 'auto';
  if (highlightOverlay) highlightOverlay.style.display = 'block';

  // Skip BugShot elements
  if (element?.closest('#bugshot-root')) return null;

  return element;
}

// Use shared captureElementInfo and add cssChange wrapper
async function captureElementInfo(element: Element) {
  const info = await captureElementInfoShared(element);

  return {
    cssChange: {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      selector: info.selector,
      elementDescription: info.selector,
      url: window.location.href,
      properties: [],
      status: 'pending' as const,
    },
    className: info.className,
    textContent: info.textContent,
    cdpSelector: info.cdpSelector,
    computedStyles: info.computedStyles,
    cdpStyles: info.cdpStyles,
    pageTokens: info.pageTokens,
  };
}

function startPicking() {
  console.log('[SidePanelBridge] startPicking called, isPickingForPanel:', isPickingForPanel);
  if (isPickingForPanel) return;
  isPickingForPanel = true;

  console.log('[SidePanelBridge] Creating overlays');
  createOverlays();

  const handleMouseMove = (e: MouseEvent) => {
    const element = getElementAtPoint(e.clientX, e.clientY);
    if (element) {
      updateHighlight(element);
    }
  };

  const handleClick = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const element = getElementAtPoint(e.clientX, e.clientY);

    cleanup();

    if (element) {
      // Save reference to picked element for later style changes
      currentPickedElement = element;

      // Create persistent highlight (same as widget)
      createPickedHighlight(element);

      // Save original style for reset functionality (Phase 4)
      originalStyleText = (element as HTMLElement).style.cssText;

      const elementInfo = await captureElementInfo(element);

      // Capture before screenshot and CSS snapshot (uses shared utilities - same as widget)
      captureBefore(element);
      beforeScreenshotDataUrl = await captureElementScreenshot(element);
      const selector = beforeSnapshotData?.selector || generateDisplaySelector(element);

      // Get breadcrumb data for panel (Phase 2)
      const breadcrumbData = getBreadcrumbDataWithCache(element);

      console.log('[SidePanelBridge] Element captured with before screenshot:', {
        selector,
        hasBeforeScreenshot: !!beforeScreenshotDataUrl,
        hasCdpStyles: !!elementInfo.cdpStyles,
        breadcrumbAncestors: breadcrumbData.ancestors.length,
        breadcrumbChildren: breadcrumbData.children.length,
      });

      // Include before screenshot and breadcrumb data in the message
      const message = {
        type: 'ELEMENT_PICKED',
        ...elementInfo,
        screenshotBefore: beforeScreenshotDataUrl,
        breadcrumbData,
      };

      if (sidePanelPort) {
        console.log('[SidePanelBridge] Sending via direct port');
        sidePanelPort.postMessage(message);
      } else {
        console.log('[SidePanelBridge] Sending via service worker relay');
        chrome.runtime.sendMessage({
          type: 'SIDEPANEL_ELEMENT_PICKED',
          ...elementInfo,
          screenshotBefore: beforeScreenshotDataUrl,
          breadcrumbData,
        });
      }
    } else {
      const message = { type: 'PICKING_CANCELLED' };
      if (sidePanelPort) {
        sidePanelPort.postMessage(message);
      } else {
        chrome.runtime.sendMessage({ type: 'SIDEPANEL_PICKING_CANCELLED' });
      }
    }
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      cleanup();
      const message = { type: 'PICKING_CANCELLED' };
      if (sidePanelPort) {
        sidePanelPort.postMessage(message);
      } else {
        chrome.runtime.sendMessage({ type: 'SIDEPANEL_PICKING_CANCELLED' });
      }
    }
  };

  const cleanup = () => {
    isPickingForPanel = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleKeydown);
    removeOverlays();
  };

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeydown);
}

function cancelPicking() {
  if (!isPickingForPanel) return;
  isPickingForPanel = false;
  removeOverlays();
}

// ── Screenshot capture for element (uses shared cropping utility) ──
let screenshotInProgress = false;

async function captureElementScreenshot(element: Element): Promise<string | null> {
  // Prevent concurrent screenshot captures
  if (screenshotInProgress) {
    console.warn('[SidePanelBridge] Screenshot capture already in progress, skipping');
    return null;
  }
  screenshotInProgress = true;

  try {
    // Get element rect before any scrolling
    let rect = element.getBoundingClientRect();
    const isInViewport = (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.right <= window.innerWidth
    );

    // Scroll into view if needed
    if (!isInViewport) {
      element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
      await new Promise(resolve => setTimeout(resolve, 100));
      // Update rect after scroll
      rect = element.getBoundingClientRect();
    }

    // Hide ALL BugShot UI elements before capturing screenshot
    const bugshotElements = document.querySelectorAll('[id^="bugshot-"]');
    const elementsToRestore: Array<{ el: HTMLElement; display: string; visibility: string }> = [];
    bugshotElements.forEach((el) => {
      if (el instanceof HTMLElement) {
        elementsToRestore.push({
          el,
          display: el.style.display,
          visibility: el.style.visibility,
        });
        el.style.display = 'none';
        el.style.visibility = 'hidden';
      }
    });

    // Wait for repaint
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    // Request full page screenshot from service worker
    const fullPageDataUrl = await new Promise<string | null>((resolve) => {
      chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT', tabId: 0 }, (response) => {
        if (chrome.runtime.lastError || !response?.dataUrl) {
          console.warn('[SidePanelBridge] Screenshot capture failed');
          resolve(null);
        } else {
          resolve(response.dataUrl);
        }
      });
    });

    // Restore all BugShot UI elements
    elementsToRestore.forEach(({ el, display, visibility }) => {
      el.style.display = display;
      el.style.visibility = visibility;
    });

    if (!fullPageDataUrl) {
      return null;
    }

    // Use shared cropping utility (same as widget)
    const croppedDataUrl = await cropScreenshotToRect(fullPageDataUrl, {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });

    console.log('[SidePanelBridge] Cropped screenshot to element bounds:', {
      element: element.tagName,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    });

    return croppedDataUrl;
  } catch (error) {
    console.warn('[SidePanelBridge] Screenshot capture error:', error);
    return null;
  } finally {
    screenshotInProgress = false;
  }
}

// ── CSS tracking (uses shared utilities - same as widget) ──

function captureBefore(element: Element) {
  beforeSnapshotData = captureSnapshot(element);
  console.log('[SidePanelBridge] Captured before snapshot for:', beforeSnapshotData.selector);
}

function captureAfterAndDiff(element: Element): CSSChange | null {
  if (!beforeSnapshotData) {
    console.warn('[SidePanelBridge] No before snapshot to compare');
    return null;
  }

  const afterSnapshot = captureSnapshot(element);
  const properties = diffSnapshots(beforeSnapshotData, afterSnapshot);

  // Reset tracking state
  const selector = beforeSnapshotData.selector;
  beforeSnapshotData = null;

  if (properties.length === 0) {
    return null;
  }

  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    selector,
    elementDescription: selector,
    url: afterSnapshot.url,
    properties,
    status: 'pending',
  };
}

function resetTracking() {
  beforeSnapshotData = null;
  beforeScreenshotDataUrl = null;
  removePickedHighlight();
}

// Apply style changes from side panel
function applyStyleChange(change: { type: 'class' | 'text' | 'style'; property?: string; value: string }) {
  if (!currentPickedElement) {
    console.warn('[SidePanelBridge] No element selected for style change');
    return false;
  }

  const el = currentPickedElement as HTMLElement;

  switch (change.type) {
    case 'class':
      el.className = change.value;
      console.log('[SidePanelBridge] Applied class change:', change.value);
      break;
    case 'text':
      // Find first text node and update it
      for (let i = 0; i < el.childNodes.length; i++) {
        if (el.childNodes[i].nodeType === Node.TEXT_NODE) {
          el.childNodes[i].textContent = change.value;
          console.log('[SidePanelBridge] Applied text change:', change.value);
          return true;
        }
      }
      // No text node found, insert one
      el.insertBefore(document.createTextNode(change.value), el.firstChild);
      console.log('[SidePanelBridge] Inserted text node:', change.value);
      break;
    case 'style':
      if (change.property) {
        el.style.setProperty(change.property, change.value);
        console.log('[SidePanelBridge] Applied style change:', change.property, '=', change.value);
      }
      break;
  }
  return true;
}

// Region selection for side panel
let regionOverlay: HTMLDivElement | null = null;
let regionSelection: HTMLDivElement | null = null;
let isSelectingRegion = false;
let regionStart: { x: number; y: number } | null = null;

function startRegionSelect() {
  if (isSelectingRegion) return;
  isSelectingRegion = true;

  regionOverlay = document.createElement('div');
  regionOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 2147483646;
    cursor: crosshair;
    background: rgba(0, 0, 0, 0.1);
  `;

  regionSelection = document.createElement('div');
  regionSelection.style.cssText = `
    position: fixed;
    border: 2px dashed #8b5cf6;
    background: rgba(139, 92, 246, 0.1);
    pointer-events: none;
    z-index: 2147483647;
    display: none;
  `;

  document.body.appendChild(regionOverlay);
  document.body.appendChild(regionSelection);

  const handleMouseDown = (e: MouseEvent) => {
    regionStart = { x: e.clientX, y: e.clientY };
    if (regionSelection) {
      regionSelection.style.display = 'block';
      regionSelection.style.left = `${e.clientX}px`;
      regionSelection.style.top = `${e.clientY}px`;
      regionSelection.style.width = '0px';
      regionSelection.style.height = '0px';
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!regionStart || !regionSelection) return;

    const x = Math.min(regionStart.x, e.clientX);
    const y = Math.min(regionStart.y, e.clientY);
    const width = Math.abs(e.clientX - regionStart.x);
    const height = Math.abs(e.clientY - regionStart.y);

    regionSelection.style.left = `${x}px`;
    regionSelection.style.top = `${y}px`;
    regionSelection.style.width = `${width}px`;
    regionSelection.style.height = `${height}px`;
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (!regionStart) {
      cleanup();
      return;
    }

    const x = Math.min(regionStart.x, e.clientX);
    const y = Math.min(regionStart.y, e.clientY);
    const width = Math.abs(e.clientX - regionStart.x);
    const height = Math.abs(e.clientY - regionStart.y);

    cleanup();

    if (width > 10 && height > 10) {
      const message = { type: 'REGION_SELECTED', region: { x, y, width, height } };
      if (sidePanelPort) {
        sidePanelPort.postMessage(message);
      } else {
        chrome.runtime.sendMessage({ type: 'SIDEPANEL_REGION_SELECTED', region: { x, y, width, height } });
      }
    } else {
      const message = { type: 'REGION_CANCELLED' };
      if (sidePanelPort) {
        sidePanelPort.postMessage(message);
      } else {
        chrome.runtime.sendMessage({ type: 'SIDEPANEL_REGION_CANCELLED' });
      }
    }
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      cleanup();
      const message = { type: 'REGION_CANCELLED' };
      if (sidePanelPort) {
        sidePanelPort.postMessage(message);
      } else {
        chrome.runtime.sendMessage({ type: 'SIDEPANEL_REGION_CANCELLED' });
      }
    }
  };

  const cleanup = () => {
    isSelectingRegion = false;
    regionStart = null;
    document.removeEventListener('mousedown', handleMouseDown);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('keydown', handleKeydown);
    regionOverlay?.remove();
    regionSelection?.remove();
    regionOverlay = null;
    regionSelection = null;
  };

  document.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('keydown', handleKeydown);
}

export function initSidePanelBridge() {
  console.log('[SidePanelBridge] Initializing side panel bridge...');

  // Listen for direct port connections from side panel (CSS Peeper pattern)
  chrome.runtime.onConnect.addListener((port) => {
    console.log('[SidePanelBridge] onConnect received:', port.name);
    // Check if this is a side panel connection
    if (port.name.startsWith('sidepanel_')) {
      console.log('[SidePanelBridge] Side panel connected:', port.name);
      sidePanelPort = port;

      port.onMessage.addListener((message) => {
        switch (message.type) {
          case 'START_PICKING':
            startPicking();
            break;
          case 'CANCEL_PICKING':
            cancelPicking();
            break;
          case 'START_REGION_SELECT':
            startRegionSelect();
            break;
        }
      });

      port.onDisconnect.addListener(() => {
        console.log('[SidePanelBridge] Side panel disconnected');
        sidePanelPort = null;
        // Cancel any ongoing picking when side panel disconnects
        cancelPicking();
      });
    }
  });

  // Also listen for messages via service worker (fallback for older approach)
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    console.log('[SidePanelBridge] onMessage received:', message.type);
    switch (message.type) {
      case 'START_PICKING':
        console.log('[SidePanelBridge] Starting pick mode');
        startPicking();
        sendResponse({ success: true });
        break;

      case 'CANCEL_PICKING':
        cancelPicking();
        sendResponse({ success: true });
        break;

      case 'START_REGION_SELECT':
        startRegionSelect();
        sendResponse({ success: true });
        break;

      case 'APPLY_STYLE_CHANGE':
        if (message.change) {
          const success = applyStyleChange(message.change);
          sendResponse({ success });
        } else {
          sendResponse({ success: false, error: 'No change data provided' });
        }
        break;

      case 'CAPTURE_AFTER': {
        // Capture after screenshot and CSS diff, return the complete change
        (async () => {
          if (!currentPickedElement) {
            sendResponse({ success: false, error: 'No element selected' });
            return;
          }

          const afterScreenshot = await captureElementScreenshot(currentPickedElement);
          const cssChange = captureAfterAndDiff(currentPickedElement);

          sendResponse({
            success: true,
            screenshotBefore: beforeScreenshotDataUrl,
            screenshotAfter: afterScreenshot,
            cssChange,
          });

          // Reset state
          beforeScreenshotDataUrl = null;
        })();
        return true; // Will respond asynchronously
      }

      case 'RESET_TRACKING':
        resetTracking();
        currentPickedElement = null;
        removeHoverHighlight();
        sendResponse({ success: true });
        break;

      case 'CLEANUP_PANEL_STATE':
        // Called by widget before starting picking to ensure no conflicts
        cleanupPanelState();
        sendResponse({ success: true });
        break;

      // ── Breadcrumb operations ──
      case 'GET_BREADCRUMB_DATA': {
        if (!currentPickedElement) {
          sendResponse({ success: false, error: 'No element selected' });
        } else {
          const data = getBreadcrumbDataWithCache(currentPickedElement);
          sendResponse({ success: true, data });
        }
        break;
      }

      case 'SELECT_BREADCRUMB_ELEMENT': {
        const { elementType, index } = message;
        let targetElement: Element | null = null;

        if (elementType === 'ancestor' && ancestorElements[index]) {
          targetElement = ancestorElements[index];
        } else if (elementType === 'child' && childElements[index]) {
          targetElement = childElements[index];
        }

        if (!targetElement) {
          sendResponse({ success: false, error: 'Element not found' });
          break;
        }

        // Update picked element and highlight
        currentPickedElement = targetElement;
        createPickedHighlight(targetElement);

        // Capture new before snapshot
        captureBefore(targetElement);
        originalStyleText = (targetElement as HTMLElement).style.cssText;

        // Capture before screenshot async
        (async () => {
          beforeScreenshotDataUrl = await captureElementScreenshot(targetElement!);
          const elementInfo = await captureElementInfo(targetElement!);
          const breadcrumbData = getBreadcrumbDataWithCache(targetElement!);

          sendResponse({
            success: true,
            elementInfo,
            breadcrumbData,
            screenshotBefore: beforeScreenshotDataUrl,
          });
        })();
        return true; // Will respond asynchronously
      }

      case 'SHOW_HOVER_HIGHLIGHT': {
        const { elementType, index } = message;
        let targetElement: Element | null = null;

        if (elementType === 'ancestor' && ancestorElements[index]) {
          targetElement = ancestorElements[index];
        } else if (elementType === 'child' && childElements[index]) {
          targetElement = childElements[index];
        }

        if (targetElement) {
          showHoverHighlightOnElement(targetElement);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Element not found' });
        }
        break;
      }

      case 'HIDE_HOVER_HIGHLIGHT':
        hideHoverHighlightElement();
        sendResponse({ success: true });
        break;

      // ── Style reset (Phase 4) ──
      case 'RESTORE_ORIGINAL_STYLE':
        if (!currentPickedElement) {
          sendResponse({ success: false, error: 'No element selected' });
        } else if (originalStyleText === null) {
          sendResponse({ success: false, error: 'No original style saved' });
        } else {
          (currentPickedElement as HTMLElement).style.cssText = originalStyleText;
          console.log('[SidePanelBridge] Restored original style:', originalStyleText);
          sendResponse({ success: true });
        }
        break;

      default:
        // Let other handlers process the message
        return false;
    }
    return true;
  });

  // Listen for display mode changes to cleanup panel state when switching to widget
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && STORAGE_KEYS.DISPLAY_MODE in changes) {
      const newMode = changes[STORAGE_KEYS.DISPLAY_MODE]?.newValue;
      if (newMode === 'widget') {
        console.log('[SidePanelBridge] Mode switched to widget, cleaning up panel state');
        cleanupPanelState();
      }
    }
  });
}
