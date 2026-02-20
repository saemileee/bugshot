import { useState, useCallback, useRef } from 'react';
import type { CSSChange, ElementStyleSnapshot } from '@/shared/types/css-change';
import { diffSnapshots } from '@/shared/utils/css-diff';

export type CaptureStatus =
  | { state: 'idle' }
  | { state: 'before_captured'; selector: string }
  | { state: 'success'; change: CSSChange }
  | { state: 'error'; message: string }
  | { state: 'no_diff' };

// ── Helpers ──────────────────────────────────────────

function buildSelector(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.body && parts.length < 5) {
    let s = current.tagName.toLowerCase();
    if (current.id) {
      parts.unshift('#' + current.id);
      break;
    }
    if (current.className && typeof current.className === 'string') {
      const cls = current.className
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .join('.');
      if (cls) s += '.' + cls;
    }
    parts.unshift(s);
    current = current.parentElement;
  }
  return parts.join(' > ');
}

function captureSnapshot(el: Element): ElementStyleSnapshot {
  const authored: Record<string, string> = {};
  const cssVars: Record<string, string> = {};
  let ruleCount = 0;

  // ── 1. Authored styles from matched CSS rules ──
  function collectFromRules(ruleList: CSSRuleList) {
    for (let r = 0; r < ruleList.length && ruleCount < 10_000; r++) {
      ruleCount++;
      const rule = ruleList[r];

      // Recurse into @media, @supports, @layer, etc.
      if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) {
        collectFromRules((rule as CSSGroupingRule).cssRules);
      }

      const styleRule = rule as CSSStyleRule;
      if (styleRule.selectorText && styleRule.style) {
        try {
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
    selector: buildSelector(el),
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

// ── Hook ──────────────────────────────────────────

export function useContentCSSTracking() {
  const [status, setStatus] = useState<CaptureStatus>({ state: 'idle' });
  const beforeRef = useRef<ElementStyleSnapshot | null>(null);
  const targetRef = useRef<Element | null>(null);

  const captureBefore = useCallback((el: Element) => {
    targetRef.current = el;
    const snapshot = captureSnapshot(el);
    beforeRef.current = snapshot;
    setStatus({ state: 'before_captured', selector: snapshot.selector });
  }, []);

  const captureAfter = useCallback((): CSSChange | null => {
    const el = targetRef.current;
    if (!el || !beforeRef.current) {
      setStatus({ state: 'error', message: 'Select an element first.' });
      return null;
    }

    // Check element is still in DOM
    if (!document.contains(el)) {
      setStatus({
        state: 'error',
        message: 'Element was removed from the page. Pick again.',
      });
      beforeRef.current = null;
      targetRef.current = null;
      return null;
    }

    const afterSnapshot = captureSnapshot(el);
    const properties = diffSnapshots(beforeRef.current, afterSnapshot);

    if (properties.length === 0) {
      setStatus({ state: 'no_diff' });
      return null;
    }

    const change: CSSChange = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      selector: afterSnapshot.selector,
      elementDescription: afterSnapshot.selector,
      url: afterSnapshot.url,
      properties,
      status: 'pending',
    };

    beforeRef.current = null;
    targetRef.current = null;
    setStatus({ state: 'success', change });
    return change;
  }, []);

  const reset = useCallback(() => {
    setStatus({ state: 'idle' });
    beforeRef.current = null;
    targetRef.current = null;
  }, []);

  return { status, captureBefore, captureAfter, reset };
}
