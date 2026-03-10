/**
 * Side Panel Bridge
 * Handles communication between the side panel and the content script
 * for operations that require direct DOM access (element picking, region selection, etc.)
 */

import type { CSSChange } from '@/shared/types/css-change';

let isPickingForPanel = false;
let pickingOverlay: HTMLDivElement | null = null;
let highlightOverlay: HTMLDivElement | null = null;
let infoPanel: HTMLDivElement | null = null;

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

function captureElementInfo(element: Element): Partial<CSSChange> {
  const selector = generateSelector(element);

  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    selector,
    elementDescription: selector,
    url: window.location.href,
    properties: [],
    status: 'pending',
  };
}

function startPicking() {
  if (isPickingForPanel) return;
  isPickingForPanel = true;

  createOverlays();

  const handleMouseMove = (e: MouseEvent) => {
    const element = getElementAtPoint(e.clientX, e.clientY);
    if (element) {
      updateHighlight(element);
    }
  };

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const element = getElementAtPoint(e.clientX, e.clientY);

    cleanup();

    if (element) {
      const cssChange = captureElementInfo(element);
      chrome.runtime.sendMessage({
        type: 'SIDEPANEL_ELEMENT_PICKED',
        cssChange,
      });
    } else {
      chrome.runtime.sendMessage({
        type: 'SIDEPANEL_PICKING_CANCELLED',
      });
    }
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      cleanup();
      chrome.runtime.sendMessage({
        type: 'SIDEPANEL_PICKING_CANCELLED',
      });
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
      chrome.runtime.sendMessage({
        type: 'SIDEPANEL_REGION_SELECTED',
        region: { x, y, width, height },
      });
    } else {
      chrome.runtime.sendMessage({
        type: 'SIDEPANEL_REGION_CANCELLED',
      });
    }
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      cleanup();
      chrome.runtime.sendMessage({
        type: 'SIDEPANEL_REGION_CANCELLED',
      });
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
  // Listen for messages from side panel (via service worker)
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.type) {
      case 'START_PICKING':
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

      default:
        // Let other handlers process the message
        return false;
    }
    return true;
  });
}
