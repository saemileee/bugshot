import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { WidgetRoot } from './widget/WidgetRoot';
import widgetCSS from './widget/styles/widget.css?inline';
import './mutation-observer';

function injectWidget() {
  // Prevent double injection
  if (document.getElementById('design-qa-helper-root')) return;

  const host = document.createElement('div');
  host.id = 'design-qa-helper-root';
  host.style.cssText =
    'all: initial; position: fixed; z-index: 2147483647; top: 0; left: 0; width: 0; height: 0; pointer-events: none;';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });

  // Inject compiled Tailwind CSS into Shadow DOM
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectWidget);
} else {
  injectWidget();
}
