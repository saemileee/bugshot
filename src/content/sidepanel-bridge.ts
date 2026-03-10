/**
 * Side Panel Bridge
 * Handles communication between the side panel and the content script
 * for operations that require direct DOM access (element picking, region selection, etc.)
 */

import type { CSSChange } from '@/shared/types/css-change';
import type { CDPStyleResult } from '@/shared/types/messages';

// Direct port connection from side panel (CSS Peeper pattern)
let sidePanelPort: chrome.runtime.Port | null = null;

let isPickingForPanel = false;
let pickingOverlay: HTMLDivElement | null = null;
let highlightOverlay: HTMLDivElement | null = null;
let infoPanel: HTMLDivElement | null = null;
let currentPickedElement: Element | null = null;

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

  // Highlight overlay (shows hovered element)
  highlightOverlay = document.createElement('div');
  highlightOverlay.style.cssText = `
    position: fixed;
    pointer-events: none;
    z-index: 2147483645;
    border: 2px solid #8b5cf6;
    background: rgba(139, 92, 246, 0.1);
    border-radius: 2px;
    transition: all 0.1s ease;
    display: none;
  `;

  // Info panel (shows element info)
  infoPanel = document.createElement('div');
  infoPanel.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 8px 12px;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 11px;
    color: #374151;
    pointer-events: none;
    display: none;
    max-width: 300px;
  `;

  document.body.appendChild(pickingOverlay);
  document.body.appendChild(highlightOverlay);
  document.body.appendChild(infoPanel);
}

function removeOverlays() {
  pickingOverlay?.remove();
  highlightOverlay?.remove();
  infoPanel?.remove();
  pickingOverlay = null;
  highlightOverlay = null;
  infoPanel = null;
}

function updateHighlight(element: Element) {
  if (!highlightOverlay || !infoPanel) return;

  const rect = element.getBoundingClientRect();

  highlightOverlay.style.display = 'block';
  highlightOverlay.style.left = `${rect.left}px`;
  highlightOverlay.style.top = `${rect.top}px`;
  highlightOverlay.style.width = `${rect.width}px`;
  highlightOverlay.style.height = `${rect.height}px`;

  // Update info panel
  const tagName = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const classes = Array.from(element.classList).slice(0, 3).map(c => `.${c}`).join('');

  infoPanel.innerHTML = `
    <div style="font-weight: 600; color: #8b5cf6; margin-bottom: 4px;">
      ${tagName}${id}${classes}
    </div>
    <div style="color: #6b7280;">
      ${Math.round(rect.width)} × ${Math.round(rect.height)}
    </div>
  `;
  infoPanel.style.display = 'block';

  // Position info panel
  const panelRect = infoPanel.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + 8;

  // Keep within viewport
  if (left + panelRect.width > window.innerWidth) {
    left = window.innerWidth - panelRect.width - 8;
  }
  if (top + panelRect.height > window.innerHeight) {
    top = rect.top - panelRect.height - 8;
  }
  if (top < 0) top = 8;
  if (left < 0) left = 8;

  infoPanel.style.left = `${left}px`;
  infoPanel.style.top = `${top}px`;
}

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

function escapeCSSIdentifier(str: string): string {
  return str.replace(/([[\]!/:@.#()'"*+,;\\<=>^`{|}~])/g, '\\$1');
}

function isSafeClassName(className: string): boolean {
  if (className.includes('[')) return false;
  if (className.includes('(')) return false;
  if (className.length > 40) return false;
  if (/^[!@#$%^&*()+=]/.test(className)) return false;
  return true;
}

function generateSelector(element: Element): string {
  const tagName = element.tagName.toLowerCase();

  if (element.id) {
    return `${tagName}#${element.id}`;
  }

  const classes = Array.from(element.classList)
    .filter(c => !c.startsWith('bugshot'))
    .slice(0, 2);

  if (classes.length > 0) {
    return `${tagName}.${classes.join('.')}`;
  }

  return tagName;
}

// Build a more specific selector for CDP
function buildCDPSelector(el: Element): string {
  if (el === document.documentElement) return 'html';
  if (el === document.body) return 'body';

  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.body && parts.length < 5) {
    let s = current.tagName.toLowerCase();
    if (current.id) {
      parts.unshift('#' + escapeCSSIdentifier(current.id));
      break;
    }
    if (current.className && typeof current.className === 'string') {
      const safeClasses = current.className
        .trim()
        .split(/\s+/)
        .filter(isSafeClassName)
        .slice(0, 2)
        .map(escapeCSSIdentifier)
        .join('.');
      if (safeClasses) s += '.' + safeClasses;
    }
    parts.unshift(s);
    current = current.parentElement;
  }

  return parts.length > 0 ? parts.join(' > ') : el.tagName.toLowerCase();
}

// Fetch styles via CDP
async function fetchStylesViaCDP(selector: string): Promise<CDPStyleResult | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'GET_ELEMENT_STYLES', selector },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[SidePanelBridge] CDP request failed:', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        if (response?.success && response.styles) {
          resolve(response.styles as CDPStyleResult);
        } else {
          console.warn('[SidePanelBridge] CDP fetch failed:', response?.error);
          resolve(null);
        }
      }
    );
  });
}

// Collect CSS custom properties (tokens) from the page
function collectPageTokens(): Array<{ name: string; value: string }> {
  const tokens = new Map<string, string>();

  function extractFromRules(rules: CSSRuleList) {
    for (let r = 0; r < rules.length; r++) {
      const rule = rules[r];
      try {
        if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) {
          extractFromRules((rule as CSSGroupingRule).cssRules);
        }
      } catch { /* can't access nested rules */ }

      if (!(rule instanceof CSSStyleRule)) continue;

      for (let p = 0; p < rule.style.length; p++) {
        const prop = rule.style.item(p);
        if (prop.startsWith('--')) {
          tokens.set(prop, rule.style.getPropertyValue(prop).trim());
        }
      }
    }
  }

  // Collect from all stylesheets
  for (let s = 0; s < document.styleSheets.length; s++) {
    let rules: CSSRuleList;
    try { rules = document.styleSheets[s].cssRules; } catch { continue; }
    try { extractFromRules(rules); } catch { /* skip */ }
  }

  // Also collect resolved values from :root via getComputedStyle
  const rootStyle = getComputedStyle(document.documentElement);
  for (const [name] of tokens) {
    const resolved = rootStyle.getPropertyValue(name).trim();
    if (resolved) tokens.set(name, resolved);
  }

  // Collect from inline style of documentElement
  const root = document.documentElement;
  for (let i = 0; i < root.style.length; i++) {
    const prop = root.style.item(i);
    if (prop.startsWith('--')) {
      tokens.set(prop, root.style.getPropertyValue(prop).trim());
    }
  }

  return Array.from(tokens.entries()).map(([name, value]) => ({ name, value }));
}

// Get computed styles as fallback
function getComputedStylesSimple(element: Element): Array<{ name: string; value: string }> {
  const computed = window.getComputedStyle(element);
  const important = [
    'display', 'position', 'width', 'height', 'padding', 'margin',
    'background-color', 'color', 'font-size', 'font-weight', 'border',
    'border-radius', 'flex', 'grid', 'gap', 'opacity', 'z-index'
  ];

  const styles: Array<{ name: string; value: string }> = [];
  for (const prop of important) {
    const value = computed.getPropertyValue(prop);
    if (value && value !== 'none' && value !== 'normal' && value !== 'auto') {
      styles.push({ name: prop, value });
    }
  }
  return styles;
}

interface ElementInfo {
  cssChange: Partial<CSSChange>;
  className: string;
  textContent: string;
  cdpSelector: string;
  computedStyles: Array<{ name: string; value: string }>;
  cdpStyles: CDPStyleResult | null;
  pageTokens: Array<{ name: string; value: string }>;
}

async function captureElementInfo(element: Element): Promise<ElementInfo> {
  const selector = generateSelector(element);
  const cdpSelector = buildCDPSelector(element);

  // Get class name and text content
  let className = '';
  if (typeof element.className === 'string') {
    className = element.className.trim();
  }

  let textContent = '';
  for (let i = 0; i < element.childNodes.length; i++) {
    if (element.childNodes[i].nodeType === Node.TEXT_NODE) {
      textContent += element.childNodes[i].textContent;
    }
  }
  textContent = textContent.trim();

  // Get computed styles (simple fallback)
  const computedStyles = getComputedStylesSimple(element);

  // Try to get CDP styles
  const cdpStyles = await fetchStylesViaCDP(cdpSelector);

  // Collect page tokens (CSS custom properties)
  const pageTokens = collectPageTokens();

  return {
    cssChange: {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      selector,
      elementDescription: selector,
      url: window.location.href,
      properties: [],
      status: 'pending',
    },
    className,
    textContent,
    cdpSelector,
    computedStyles,
    cdpStyles,
    pageTokens,
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

      const elementInfo = await captureElementInfo(element);
      console.log('[SidePanelBridge] Element captured:', {
        selector: elementInfo.cssChange?.selector,
        hasClassName: !!elementInfo.className,
        hasCdpStyles: !!elementInfo.cdpStyles,
        computedStylesCount: elementInfo.computedStyles?.length,
      });
      // Send via direct port if available, fallback to runtime.sendMessage
      const message = { type: 'ELEMENT_PICKED', ...elementInfo };
      if (sidePanelPort) {
        console.log('[SidePanelBridge] Sending via direct port');
        sidePanelPort.postMessage(message);
      } else {
        console.log('[SidePanelBridge] Sending via service worker relay');
        chrome.runtime.sendMessage({ type: 'SIDEPANEL_ELEMENT_PICKED', ...elementInfo });
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

      default:
        // Let other handlers process the message
        return false;
    }
    return true;
  });
}
