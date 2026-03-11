/**
 * Shared CSS snapshot utilities for capturing element styles.
 * Used by both widget (useContentCSSTracking) and side panel (sidepanel-bridge).
 *
 * Captures comprehensive authored styles from CSS rules + inline styles,
 * matching Chrome DevTools' Styles panel behavior.
 */

import type { ElementStyleSnapshot } from '../types/css-change';
import { buildCDPSelector, hasInteractivePseudoClass } from './css-selector';

// Performance limits to prevent UI freezing
const MAX_RULES = 3000;
const MAX_PROPERTIES = 500;

/**
 * Capture a comprehensive style snapshot of an element.
 * Collects authored styles from matched CSS rules and inline styles.
 *
 * @param el - The element to capture styles from
 * @returns ElementStyleSnapshot with all style information
 */
export function captureSnapshot(el: Element): ElementStyleSnapshot {
  const authored: Record<string, string> = {};
  const cssVars: Record<string, string> = {};
  let ruleCount = 0;

  // ── 1. Authored styles from matched CSS rules ──
  function collectFromRules(ruleList: CSSRuleList) {
    for (let r = 0; r < ruleList.length && ruleCount < MAX_RULES; r++) {
      ruleCount++;

      // Early exit if we have enough properties
      if (Object.keys(authored).length > MAX_PROPERTIES) {
        break;
      }

      const rule = ruleList[r];

      // Recurse into @media, @supports, @layer, etc.
      if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) {
        collectFromRules((rule as CSSGroupingRule).cssRules);
      }

      const styleRule = rule as CSSStyleRule;
      if (styleRule.selectorText && styleRule.style) {
        // Skip very complex selectors (likely not relevant)
        if (styleRule.selectorText.length > 200) {
          continue;
        }

        try {
          // Skip rules with interactive pseudo-classes (:hover, :focus, etc.)
          // These cause false positive diffs based on user interaction state
          if (hasInteractivePseudoClass(styleRule.selectorText)) {
            continue;
          }

          if (el.matches(styleRule.selectorText)) {
            for (let p = 0; p < styleRule.style.length; p++) {
              const prop = styleRule.style.item(p);
              const val = styleRule.style.getPropertyValue(prop).trim();
              if (val) {
                if (prop.startsWith('--')) cssVars[prop] = val;
                else authored[prop] = val;
              }
            }
          }
        } catch {
          /* complex/invalid selectors */
        }
      }
    }
  }

  try {
    for (const sheet of document.styleSheets) {
      try {
        collectFromRules(sheet.cssRules);
      } catch {
        /* CORS on external stylesheets */
      }
    }
  } catch {
    /* no stylesheets */
  }

  // ── 2. Inline styles (override rules) ──
  const htmlEl = el as HTMLElement;
  const inlineStyles: Record<string, string> = {};
  for (let i = 0; i < htmlEl.style.length; i++) {
    const prop = htmlEl.style.item(i);
    const val = htmlEl.style.getPropertyValue(prop).trim();
    if (val) {
      if (prop.startsWith('--')) {
        cssVars[prop] = val;
      } else {
        authored[prop] = val;
        inlineStyles[prop] = val;
      }
    }
  }

  // ── 3. className ──
  let cn = el.className;
  if (typeof cn !== 'string') cn = '';

  // ── 4. Direct text (text nodes only) ──
  let directText = '';
  for (let i = 0; i < el.childNodes.length; i++) {
    if (el.childNodes[i].nodeType === Node.TEXT_NODE) {
      directText += el.childNodes[i].textContent;
    }
  }

  return {
    selector: buildCDPSelector(el),
    authoredStyles: authored,
    inlineStyles,
    cssVariables: cssVars,
    className: cn.trim(),
    textContent: directText.trim(),
    tagName: el.tagName.toLowerCase(),
    url: window.location.href,
    timestamp: Date.now(),
  };
}
