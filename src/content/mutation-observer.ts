// MutationObserver for detecting inline style changes made via DevTools
// Serves as a backup detection mechanism alongside the DevTools panel snapshot approach

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
      const element = mutation.target as HTMLElement;
      const oldValue = mutation.oldValue;
      const newValue = element.getAttribute('style');

      if (oldValue !== newValue) {
        chrome.runtime.sendMessage({
          type: 'INLINE_STYLE_CHANGED',
          selector: generateSelector(element),
          oldValue: oldValue ?? '',
          newValue: newValue ?? '',
          url: window.location.href,
          timestamp: Date.now(),
        });
      }
    }
  }
});

observer.observe(document.body, {
  attributes: true,
  attributeFilter: ['style', 'class'],
  attributeOldValue: true,
  subtree: true,
});

function generateSelector(element: HTMLElement): string {
  if (element.id) return `#${element.id}`;

  const parts: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector = `#${current.id}`;
      parts.unshift(selector);
      break;
    }

    if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).slice(0, 2).join('.');
      if (classes) selector += `.${classes}`;
    }

    parts.unshift(selector);
    current = current.parentElement;
  }

  return parts.join(' > ');
}
