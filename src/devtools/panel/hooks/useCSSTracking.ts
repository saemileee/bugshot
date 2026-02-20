import { useState, useCallback, useRef } from 'react';
import type { CSSChange, ElementStyleSnapshot } from '@/shared/types/css-change';
import { diffSnapshots } from '@/shared/utils/css-diff';

export type CaptureStatus =
  | { state: 'idle' }
  | { state: 'before_captured'; selector: string }
  | { state: 'capturing' }
  | { state: 'success'; change: CSSChange }
  | { state: 'error'; message: string }
  | { state: 'no_diff' };

export function useCSSTracking() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [status, setStatus] = useState<CaptureStatus>({ state: 'idle' });
  const beforeSnapshotRef = useRef<ElementStyleSnapshot | null>(null);

  const captureElementStyles = useCallback((): Promise<ElementStyleSnapshot | null> => {
    return new Promise((resolve) => {
      chrome.devtools.inspectedWindow.eval(
        `(function() {
          var el = $0;
          if (!el) return null;

          // --- Collect authored styles from matched CSS rules ---
          var authored = {};
          var cssVars = {};
          var ruleCount = 0;

          function collectFromRules(ruleList) {
            for (var r = 0; r < ruleList.length && ruleCount < 10000; r++) {
              ruleCount++;
              var rule = ruleList[r];
              // Recurse into nested rules (@media, @supports, @layer, etc.)
              if (rule.cssRules) {
                collectFromRules(rule.cssRules);
              }
              if (rule.selectorText && rule.style) {
                try {
                  if (el.matches(rule.selectorText)) {
                    for (var p = 0; p < rule.style.length; p++) {
                      var prop = rule.style.item(p);
                      var val = rule.style.getPropertyValue(prop).trim();
                      if (val) {
                        if (prop.startsWith('--')) {
                          cssVars[prop] = val;
                        } else {
                          authored[prop] = val;
                        }
                      }
                    }
                  }
                } catch(e) {}
              }
            }
          }

          try {
            var sheets = document.styleSheets;
            for (var s = 0; s < sheets.length; s++) {
              try {
                collectFromRules(sheets[s].cssRules);
              } catch(e) { /* CORS on external stylesheets */ }
            }
          } catch(e) {}

          // --- Inline styles (override rules, separate for class-change handling) ---
          var inlineStyles = {};
          for (var i = 0; i < el.style.length; i++) {
            var prop = el.style.item(i);
            var val = el.style.getPropertyValue(prop).trim();
            if (val) {
              if (prop.startsWith('--')) {
                cssVars[prop] = val;
              } else {
                authored[prop] = val;
                inlineStyles[prop] = val;
              }
            }
          }

          // --- className ---
          var cn = el.className;
          if (typeof cn !== 'string') cn = '';

          // --- Direct text content (text nodes only, not nested elements) ---
          var directText = '';
          for (var i = 0; i < el.childNodes.length; i++) {
            if (el.childNodes[i].nodeType === 3) {
              directText += el.childNodes[i].textContent;
            }
          }

          // --- Build selector ---
          var parts = [];
          var current = el;
          while (current && current !== document.body && parts.length < 5) {
            var s = current.tagName.toLowerCase();
            if (current.id) { parts.unshift('#' + current.id); break; }
            if (current.className && typeof current.className === 'string') {
              var cls = current.className.trim().split(/\\s+/).slice(0, 2).join('.');
              if (cls) s += '.' + cls;
            }
            parts.unshift(s);
            current = current.parentElement;
          }

          return {
            selector: parts.join(' > '),
            authoredStyles: authored,
            inlineStyles: inlineStyles,
            cssVariables: cssVars,
            className: cn.trim(),
            textContent: directText.trim(),
            tagName: el.tagName.toLowerCase(),
            url: window.location.href,
            timestamp: Date.now()
          };
        })()`,
        (result: unknown, exceptionInfo?: { isException?: boolean }) => {
          if (exceptionInfo?.isException || !result) {
            resolve(null);
          } else {
            resolve(result as ElementStyleSnapshot);
          }
        },
      );
    });
  }, []);

  const captureBeforeSnapshot = useCallback(async () => {
    setIsCapturing(true);
    setStatus({ state: 'capturing' });

    const snapshot = await captureElementStyles();
    beforeSnapshotRef.current = snapshot;
    setIsCapturing(false);

    if (!snapshot) {
      setStatus({
        state: 'error',
        message: 'No element selected. Click an element in the Elements panel first.',
      });
    } else {
      setStatus({ state: 'before_captured', selector: snapshot.selector });
    }
  }, [captureElementStyles]);

  const captureAfterSnapshot = useCallback(async (): Promise<CSSChange | null> => {
    if (!beforeSnapshotRef.current) {
      setStatus({
        state: 'error',
        message: 'Click "1. Before" first to capture the original state.',
      });
      return null;
    }

    setIsCapturing(true);
    setStatus({ state: 'capturing' });
    const afterSnapshot = await captureElementStyles();
    setIsCapturing(false);

    if (!afterSnapshot) {
      setStatus({
        state: 'error',
        message: 'No element selected. Make sure the element is still selected in Elements panel.',
      });
      return null;
    }

    const properties = diffSnapshots(beforeSnapshotRef.current, afterSnapshot);

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

    beforeSnapshotRef.current = null;
    setStatus({ state: 'success', change });
    return change;
  }, [captureElementStyles]);

  const resetStatus = useCallback(() => {
    setStatus({ state: 'idle' });
    beforeSnapshotRef.current = null;
  }, []);

  return { captureBeforeSnapshot, captureAfterSnapshot, isCapturing, status, resetStatus };
}
