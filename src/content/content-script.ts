import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { WidgetRoot } from './widget/WidgetRoot';
import widgetCSS from './widget/styles/widget.css?inline';
import { STORAGE_KEYS } from '@/shared/constants';

/** Delay before retrying widget injection when DOM body is not ready */
const DOM_READY_RETRY_DELAY_MS = 10;

// Track mounted state for cleanup
let reactRoot: Root | null = null;
let hostElement: HTMLDivElement | null = null;

function mountWidget() {
  // Already mounted
  if (hostElement) return;

  // Wait for body to be available
  if (!document.body) {
    setTimeout(mountWidget, DOM_READY_RETRY_DELAY_MS);
    return;
  }

  const host = document.createElement('div');
  host.id = 'bugshot-root';
  host.style.cssText =
    'all: initial; position: fixed; z-index: 2147483647; top: 0; left: 0; width: 0; height: 0; pointer-events: none;';
  document.body.appendChild(host);
  hostElement = host;

  const shadow = host.attachShadow({ mode: 'closed' });

  // Inject compiled CSS into Shadow DOM
  const style = document.createElement('style');
  style.textContent = widgetCSS;
  shadow.appendChild(style);

  // React mount point
  const container = document.createElement('div');
  container.id = 'widget-container';
  shadow.appendChild(container);

  reactRoot = createRoot(container);
  reactRoot.render(createElement(WidgetRoot));
}

function unmountWidget() {
  if (reactRoot) {
    reactRoot.unmount();
    reactRoot = null;
  }
  if (hostElement) {
    hostElement.remove();
    hostElement = null;
  }
}

async function initializeWidget() {
  // Remove any stale widget from previous context (hard refresh scenario)
  const existing = document.getElementById('bugshot-root');
  if (existing) {
    existing.remove();
  }

  // Check if extension context is valid
  if (!chrome.runtime?.id) {
    console.warn('[BugShot] Extension context invalidated, skipping injection');
    return;
  }

  // Check if widget should be visible before mounting
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.WIDGET_VISIBLE);
    const visible = result[STORAGE_KEYS.WIDGET_VISIBLE] ?? true;

    if (visible) {
      mountWidget();
    }
  } catch (error) {
    // Storage access failed (context invalidated), skip mounting
    console.warn('[BugShot] Failed to check visibility:', error);
    return;
  }

  // Listen for visibility changes to mount/unmount
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && STORAGE_KEYS.WIDGET_VISIBLE in changes) {
      const newVisible = changes[STORAGE_KEYS.WIDGET_VISIBLE].newValue ?? true;
      if (newVisible) {
        mountWidget();
      } else {
        unmountWidget();
      }
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeWidget, { once: true });
} else {
  initializeWidget();
}
