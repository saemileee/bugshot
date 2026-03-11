/**
 * Element Info Utilities
 * Shared logic for capturing element information
 * Used by both widget (local DOM) and panel (via content script messages)
 */

import type { CDPStyleResult } from '@/shared/types/messages';
import type { BreadcrumbData, SerializedBreadcrumbItem } from '@/shared/types/element-info';
import { buildCDPSelector, generateDisplaySelector } from '@/shared/utils/css-selector';

// ============================================================================
// Types
// ============================================================================

export interface ElementInfo {
  selector: string;
  cdpSelector: string;
  className: string;
  textContent: string;
  computedStyles: Array<{ name: string; value: string }>;
  cdpStyles: CDPStyleResult | null;
  pageTokens: Array<{ name: string; value: string }>;
  breadcrumbData: BreadcrumbData;
}

// ============================================================================
// Breadcrumb Helpers (exported for reuse in sidepanel-bridge)
// ============================================================================

export function getElementLabel(el: Element): string {
  let tag = el.tagName.toLowerCase();

  if (el.id) {
    tag += '#' + el.id;
  } else if (el.className && typeof el.className === 'string') {
    const classes = el.className.trim().split(/\s+/).filter(Boolean);
    if (classes.length > 0) {
      tag += '.' + classes[0];
      if (classes.length > 1) {
        tag += '...';
      }
    }
  }

  return tag;
}

export function getAncestorChain(element: Element, maxDepth = 5): Element[] {
  const ancestors: Element[] = [];
  let current = element.parentElement;

  while (current && current !== document.documentElement && ancestors.length < maxDepth) {
    ancestors.unshift(current);
    current = current.parentElement;
  }

  return ancestors;
}

export function getDirectChildren(element: Element, maxCount = 10): Element[] {
  const children: Element[] = [];

  for (let i = 0; i < element.children.length && children.length < maxCount; i++) {
    const child = element.children[i];
    if (
      child.tagName !== 'SCRIPT' &&
      child.tagName !== 'STYLE' &&
      child.tagName !== 'NOSCRIPT' &&
      !child.id?.startsWith('bugshot-')
    ) {
      children.push(child);
    }
  }

  return children;
}

export function getBreadcrumbData(element: Element): BreadcrumbData {
  const ancestorElements = getAncestorChain(element);
  const ancestors: SerializedBreadcrumbItem[] = ancestorElements.map((el, index) => ({
    index,
    label: getElementLabel(el),
    isCurrentPicked: false,
    type: 'ancestor' as const,
  }));

  const current: SerializedBreadcrumbItem = {
    index: 0,
    label: getElementLabel(element),
    isCurrentPicked: true,
    type: 'current' as const,
  };

  const childElements = getDirectChildren(element);
  const children: SerializedBreadcrumbItem[] = childElements.map((el, index) => ({
    index,
    label: getElementLabel(el),
    isCurrentPicked: false,
    type: 'child' as const,
  }));

  return { ancestors, current, children };
}

// ============================================================================
// Style Collection
// ============================================================================

/**
 * Get important computed styles as fallback when CDP is not available
 */
export function getComputedStylesSimple(element: Element): Array<{ name: string; value: string }> {
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

/**
 * Collect CSS custom properties (tokens) from the page
 * Limited to prevent performance issues on pages with many stylesheets
 */
export function collectPageTokens(): Array<{ name: string; value: string }> {
  const tokens = new Map<string, string>();
  const MAX_STYLESHEETS = 20;
  const MAX_RULES_PER_SHEET = 500;
  const MAX_TOKENS = 200;

  let ruleCount = 0;

  function extractFromRules(rules: CSSRuleList, depth = 0) {
    if (depth > 3 || tokens.size >= MAX_TOKENS) return; // Limit recursion and tokens

    for (let r = 0; r < rules.length && ruleCount < MAX_RULES_PER_SHEET; r++) {
      ruleCount++;
      const rule = rules[r];
      try {
        if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) {
          extractFromRules((rule as CSSGroupingRule).cssRules, depth + 1);
        }
      } catch { /* can't access nested rules */ }

      if (!(rule instanceof CSSStyleRule)) continue;

      for (let p = 0; p < rule.style.length && tokens.size < MAX_TOKENS; p++) {
        const prop = rule.style.item(p);
        if (prop.startsWith('--')) {
          tokens.set(prop, rule.style.getPropertyValue(prop).trim());
        }
      }
    }
  }

  // Collect from stylesheets (limited)
  const sheetCount = Math.min(document.styleSheets.length, MAX_STYLESHEETS);
  for (let s = 0; s < sheetCount && tokens.size < MAX_TOKENS; s++) {
    ruleCount = 0;
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
  for (let i = 0; i < root.style.length && tokens.size < MAX_TOKENS; i++) {
    const prop = root.style.item(i);
    if (prop.startsWith('--')) {
      tokens.set(prop, root.style.getPropertyValue(prop).trim());
    }
  }

  return Array.from(tokens.entries()).map(([name, value]) => ({ name, value }));
}

// ============================================================================
// CDP Style Fetching
// ============================================================================

/**
 * Fetch styles via CDP (Chrome DevTools Protocol)
 * Only works in extension context
 * Includes timeout to prevent hanging
 */
// Track CDP failures to avoid spamming requests
let cdpLastFailure = 0;
const CDP_CLIENT_COOLDOWN = 30000; // 30 seconds

export async function fetchStylesViaCDP(selector: string): Promise<CDPStyleResult | null> {
  const CDP_TIMEOUT = 3000; // 3 second timeout

  // Skip if CDP failed recently
  if (Date.now() - cdpLastFailure < CDP_CLIENT_COOLDOWN) {
    return null;
  }

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      cdpLastFailure = Date.now();
      resolve(null);
    }, CDP_TIMEOUT);

    try {
      chrome.runtime.sendMessage(
        { type: 'GET_ELEMENT_STYLES', selector },
        (response) => {
          clearTimeout(timeoutId);
          if (chrome.runtime.lastError) {
            cdpLastFailure = Date.now();
            resolve(null);
            return;
          }
          if (response?.success && response.styles) {
            resolve(response.styles as CDPStyleResult);
          } else {
            // Mark as failed if it's a connection error
            const errMsg = response?.error || '';
            if (errMsg.includes('cooldown') || errMsg.includes('attach') || errMsg.includes('Detached')) {
              cdpLastFailure = Date.now();
            }
            resolve(null);
          }
        }
      );
    } catch (error) {
      clearTimeout(timeoutId);
      cdpLastFailure = Date.now();
      resolve(null);
    }
  });
}

// ============================================================================
// Main Element Info Capture
// ============================================================================

// Guard against duplicate calls
let lastCaptureElement: WeakRef<Element> | null = null;
let lastCaptureTime = 0;
let captureInProgress = false;
const CAPTURE_DEBOUNCE_MS = 500;

/**
 * Capture comprehensive element information
 * Used by both widget and panel for consistent data structure
 */
export async function captureElementInfo(element: Element): Promise<ElementInfo> {
  // Log call stack to debug repeated calls
  console.log('[captureElementInfo] Called for:', element.tagName, new Error().stack?.split('\n').slice(1, 4).join(' <- '));

  // Prevent duplicate captures of the same element within debounce window
  const now = Date.now();
  if (lastCaptureElement?.deref() === element && now - lastCaptureTime < CAPTURE_DEBOUNCE_MS) {
    console.warn('[captureElementInfo] Skipping duplicate capture (debounced)');
    // Return minimal info to prevent errors
    return {
      selector: element.tagName.toLowerCase(),
      cdpSelector: '',
      className: '',
      textContent: '',
      computedStyles: [],
      cdpStyles: null,
      pageTokens: [],
      breadcrumbData: { ancestors: [], current: { index: 0, label: element.tagName.toLowerCase(), isCurrentPicked: true, type: 'current' }, children: [] },
    };
  }

  // Prevent concurrent captures
  if (captureInProgress) {
    console.warn('[captureElementInfo] Another capture in progress, skipping');
    return {
      selector: element.tagName.toLowerCase(),
      cdpSelector: '',
      className: '',
      textContent: '',
      computedStyles: [],
      cdpStyles: null,
      pageTokens: [],
      breadcrumbData: { ancestors: [], current: { index: 0, label: element.tagName.toLowerCase(), isCurrentPicked: true, type: 'current' }, children: [] },
    };
  }

  lastCaptureElement = new WeakRef(element);
  lastCaptureTime = now;
  captureInProgress = true;

  try {
    const selector = generateDisplaySelector(element);
  const cdpSelector = buildCDPSelector(element);

  // Get class name
  let className = '';
  if (typeof element.className === 'string') {
    className = element.className.trim();
  }

  // Get direct text content (not from children)
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

  // Get breadcrumb data
  const breadcrumbData = getBreadcrumbData(element);

    return {
      selector,
      cdpSelector,
      className,
      textContent,
      computedStyles,
      cdpStyles,
      pageTokens,
      breadcrumbData,
    };
  } finally {
    captureInProgress = false;
  }
}

/**
 * Get element's text content (direct text nodes only)
 */
export function getElementTextContent(element: Element): string {
  let textContent = '';
  for (let i = 0; i < element.childNodes.length; i++) {
    if (element.childNodes[i].nodeType === Node.TEXT_NODE) {
      textContent += element.childNodes[i].textContent;
    }
  }
  return textContent.trim();
}

/**
 * Get element's class name as string
 */
export function getElementClassName(element: Element): string {
  if (typeof element.className === 'string') {
    return element.className.trim();
  }
  return '';
}
