import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { WidgetRoot } from './widget/WidgetRoot';
import { VisibilityProvider } from './widget/contexts/VisibilityContext';
import widgetCSS from './widget/styles/widget.css?inline';
import { STORAGE_KEYS } from '@/shared/constants';
import { initDevTools } from './widget/dev-tools';
import { initSidePanelBridge } from './sidepanel-bridge';

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
  reactRoot.render(
    createElement(VisibilityProvider, null, createElement(WidgetRoot))
  );
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

  // Check display mode and widget visibility before mounting
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.WIDGET_VISIBLE, STORAGE_KEYS.DISPLAY_MODE]);
    const displayMode = result[STORAGE_KEYS.DISPLAY_MODE] ?? 'widget';
    const visible = result[STORAGE_KEYS.WIDGET_VISIBLE] ?? true;

    // Only mount widget if in widget mode AND visible
    if (displayMode === 'widget' && visible) {
      mountWidget();
    }
  } catch (error) {
    // Storage access failed (context invalidated), skip mounting
    console.warn('[BugShot] Failed to check visibility:', error);
    return;
  }

  // Listen for visibility and display mode changes
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'local') {
      const displayModeChanged = STORAGE_KEYS.DISPLAY_MODE in changes;
      const visibilityChanged = STORAGE_KEYS.WIDGET_VISIBLE in changes;

      if (displayModeChanged || visibilityChanged) {
        // Re-read current state
        const result = await chrome.storage.local.get([STORAGE_KEYS.WIDGET_VISIBLE, STORAGE_KEYS.DISPLAY_MODE]);
        const displayMode = result[STORAGE_KEYS.DISPLAY_MODE] ?? 'widget';
        const visible = result[STORAGE_KEYS.WIDGET_VISIBLE] ?? true;

        // Only show widget if in widget mode AND visible
        if (displayMode === 'widget' && visible) {
          mountWidget();
        } else {
          unmountWidget();
        }
      }
    }
  });

  // Note: We no longer unmount on visibilitychange to preserve form state.
  // Instead, VisibilityProvider notifies components to pause expensive operations
  // (observers, RAF loops) while keeping React state intact.
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeWidget, { once: true });
} else {
  initializeWidget();
}

// Initialize side panel bridge (for element picking when in panel mode)
initSidePanelBridge();

// Initialize dev tools (development only)
initDevTools();
