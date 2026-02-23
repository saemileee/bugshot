import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { WidgetRoot } from './widget/WidgetRoot';
import widgetCSS from './widget/styles/widget.css?inline';

function injectWidget() {
  // Remove any stale widget from previous context (hard refresh scenario)
  const existing = document.getElementById('bugshot-root');
  if (existing) {
    existing.remove();
  }

  // Wait for body to be available
  if (!document.body) {
    // Retry after a short delay
    setTimeout(injectWidget, 10);
    return;
  }

  const host = document.createElement('div');
  host.id = 'bugshot-root';
  host.style.cssText =
    'all: initial; position: fixed; z-index: 2147483647; top: 0; left: 0; width: 0; height: 0; pointer-events: none;';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });

  // Inject compiled CSS into Shadow DOM
  const style = document.createElement('style');
  style.textContent = widgetCSS;
  shadow.appendChild(style);

  // React mount point
  const container = document.createElement('div');
  container.id = 'widget-container';
  shadow.appendChild(container);

  const root = createRoot(container);
  root.render(createElement(WidgetRoot));
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectWidget, { once: true });
} else {
  injectWidget();
}
