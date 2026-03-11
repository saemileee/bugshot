import { useState, useCallback, useRef } from 'react';
import type { CSSChange, ElementStyleSnapshot } from '@/shared/types/css-change';
import { diffSnapshots } from '@/shared/utils/css-diff';
import { captureSnapshot } from '@/shared/utils/css-snapshot';

export type CaptureStatus =
  | { state: 'idle' }
  | { state: 'before_captured'; selector: string }
  | { state: 'success'; change: CSSChange }
  | { state: 'error'; message: string }
  | { state: 'no_diff' };

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
    // Revert element's inline styles to original state
    const el = targetRef.current as HTMLElement | null;
    const beforeSnapshot = beforeRef.current;

    if (el && beforeSnapshot) {
      // Clear all current inline styles
      el.style.cssText = '';

      // Restore original inline styles from snapshot
      if (beforeSnapshot.inlineStyles) {
        Object.entries(beforeSnapshot.inlineStyles).forEach(([prop, value]) => {
          el.style.setProperty(prop, value);
        });
      }
    }

    setStatus({ state: 'idle' });
    beforeRef.current = null;
    targetRef.current = null;
  }, []);

  const restoreBefore = useCallback((el: Element, snapshot: ElementStyleSnapshot) => {
    targetRef.current = el;
    beforeRef.current = snapshot;
    setStatus({ state: 'before_captured', selector: snapshot.selector });
  }, []);

  // Expose beforeSnapshot for draft persistence
  const beforeSnapshot = beforeRef.current;

  return { status, captureBefore, captureAfter, reset, restoreBefore, beforeSnapshot };
}
