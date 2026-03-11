/**
 * Shared CSS selector utilities.
 * Used by widget (useContentCSSTracking, StyleEditor) and side panel (sidepanel-bridge).
 */

/**
 * Escape special characters in CSS identifiers.
 * Required for IDs and class names containing special characters.
 */
export function escapeCSSIdentifier(str: string): string {
  return str.replace(/([[\]!/:@.#()'"*+,;\\<=>^`{|}~])/g, '\\$1');
}

/**
 * Check if a class name is safe to use in selectors.
 * Filters out Tailwind arbitrary values and other problematic patterns.
 */
export function isSafeClassName(className: string): boolean {
  // Tailwind arbitrary values like `w-[100px]`
  if (className.includes('[')) return false;
  // Function-like syntax
  if (className.includes('(')) return false;
  // Very long class names (likely generated/hashed)
  if (className.length > 40) return false;
  // Starts with special characters
  if (/^[!@#$%^&*()+=]/.test(className)) return false;
  return true;
}

/**
 * Build a CSS selector for an element, suitable for CDP queries.
 * Creates a path from the element up to an ID or body.
 *
 * @param el - The element to build a selector for
 * @param maxDepth - Maximum ancestor depth to traverse (default: 5)
 * @returns A CSS selector string
 */
export function buildCDPSelector(el: Element, maxDepth: number = 5): string {
  if (el === document.documentElement) return 'html';
  if (el === document.body) return 'body';

  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.body && parts.length < maxDepth) {
    let s = current.tagName.toLowerCase();

    // If element has ID, use it and stop (IDs are unique)
    if (current.id) {
      parts.unshift('#' + escapeCSSIdentifier(current.id));
      break;
    }

    // Add safe class names
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

/**
 * Generate a simple selector for display purposes.
 * Less specific than buildCDPSelector, meant for UI display.
 *
 * @param element - The element to generate a selector for
 * @returns A simple selector string (e.g., "div#main", "button.primary")
 */
export function generateDisplaySelector(element: Element): string {
  const tagName = element.tagName.toLowerCase();

  if (element.id) {
    return `${tagName}#${element.id}`;
  }

  const classes = Array.from(element.classList)
    .filter((c) => !c.startsWith('bugshot') && isSafeClassName(c))
    .slice(0, 2);

  if (classes.length > 0) {
    return `${tagName}.${classes.join('.')}`;
  }

  return tagName;
}

/**
 * Interactive pseudo-classes that should be excluded from style snapshots.
 * These represent transient states that shouldn't be captured as "current" styles.
 */
export const INTERACTIVE_PSEUDO_CLASSES = [
  ':hover',
  ':focus',
  ':focus-within',
  ':focus-visible',
  ':active',
  ':visited',
];

/**
 * Check if a selector contains interactive pseudo-classes.
 * Used to filter out hover/focus styles from snapshots.
 */
export function hasInteractivePseudoClass(selector: string): boolean {
  const lowerSelector = selector.toLowerCase();
  return INTERACTIVE_PSEUDO_CLASSES.some((pseudo) => lowerSelector.includes(pseudo));
}
