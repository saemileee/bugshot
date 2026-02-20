import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Element picker: hover to highlight, click to select.
 * Injects a highlight overlay into the main document (not shadow DOM).
 * Auto-cleans up on unmount or when picking is cancelled (Escape).
 */
export function useElementPicker() {
  const [isPicking, setIsPicking] = useState(false);
  const [pickedElement, setPickedElement] = useState<Element | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const hoveredRef = useRef<Element | null>(null);

  // Create / destroy highlight overlay
  useEffect(() => {
    if (!isPicking) return;

    const highlight = document.createElement('div');
    highlight.id = 'design-qa-picker-highlight';
    highlight.style.cssText = [
      'position:fixed',
      'z-index:2147483646',
      'pointer-events:none',
      'border:2px solid #3b82f6',
      'background:rgba(59,130,246,0.08)',
      'border-radius:3px',
      'transition:top .05s,left .05s,width .05s,height .05s',
      'display:none',
    ].join(';');
    document.documentElement.appendChild(highlight);
    highlightRef.current = highlight;
    document.documentElement.style.cursor = 'crosshair';

    // Tooltip label
    const label = document.createElement('div');
    label.id = 'design-qa-picker-label';
    label.style.cssText = [
      'position:fixed',
      'z-index:2147483646',
      'pointer-events:none',
      'background:#1e293b',
      'color:#f8fafc',
      'font:11px/1.4 -apple-system,BlinkMacSystemFont,sans-serif',
      'padding:2px 6px',
      'border-radius:3px',
      'white-space:nowrap',
      'display:none',
    ].join(';');
    document.documentElement.appendChild(label);

    return () => {
      highlight.remove();
      label.remove();
      highlightRef.current = null;
      document.documentElement.style.cursor = '';
    };
  }, [isPicking]);

  // Event listeners
  useEffect(() => {
    if (!isPicking) return;

    const isWidgetElement = (el: Element) =>
      el.id === 'design-qa-helper-root' ||
      el.id === 'design-qa-picker-highlight' ||
      el.id === 'design-qa-picker-label';

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target || isWidgetElement(target)) return;
      hoveredRef.current = target;

      const rect = target.getBoundingClientRect();
      const hl = highlightRef.current;
      if (hl) {
        hl.style.display = 'block';
        hl.style.top = rect.top + 'px';
        hl.style.left = rect.left + 'px';
        hl.style.width = rect.width + 'px';
        hl.style.height = rect.height + 'px';
      }

      // Update label
      const label = document.getElementById('design-qa-picker-label');
      if (label) {
        let tag = target.tagName.toLowerCase();
        if (target.id) tag += '#' + target.id;
        else if (target.className && typeof target.className === 'string') {
          const cls = target.className.trim().split(/\s+/).slice(0, 2).join('.');
          if (cls) tag += '.' + cls;
        }
        label.textContent = tag;
        label.style.display = 'block';
        label.style.top = Math.max(0, rect.top - 22) + 'px';
        label.style.left = rect.left + 'px';
      }
    };

    const handleClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const target = hoveredRef.current;
      if (target && !isWidgetElement(target)) {
        setPickedElement(target);
      }
      setIsPicking(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsPicking(false);
      }
    };

    // Capture phase so we intercept before page handlers
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('mouseover', handleMouseOver, true);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      hoveredRef.current = null;
    };
  }, [isPicking]);

  // ── Persistent highlight on picked element ──
  useEffect(() => {
    if (!pickedElement) return;

    const overlay = document.createElement('div');
    overlay.id = 'design-qa-picked-highlight';
    overlay.style.cssText = [
      'position:fixed',
      'z-index:2147483645',
      'pointer-events:none',
      'border:2px solid #3b82f6',
      'background:rgba(59,130,246,0.06)',
      'border-radius:3px',
      'box-shadow:0 0 0 4px rgba(59,130,246,0.12)',
      'transition:top .15s,left .15s,width .15s,height .15s',
    ].join(';');
    document.documentElement.appendChild(overlay);

    const update = () => {
      const rect = pickedElement.getBoundingClientRect();
      overlay.style.top = rect.top + 'px';
      overlay.style.left = rect.left + 'px';
      overlay.style.width = rect.width + 'px';
      overlay.style.height = rect.height + 'px';
    };
    update();

    // Track scroll / resize
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    const raf = setInterval(update, 500); // fallback for layout shifts

    return () => {
      overlay.remove();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      clearInterval(raf);
    };
  }, [pickedElement]);

  const startPicking = useCallback(() => {
    setPickedElement(null);
    setIsPicking(true);
  }, []);

  const cancelPicking = useCallback(() => {
    setIsPicking(false);
  }, []);

  const clearPicked = useCallback(() => {
    setPickedElement(null);
  }, []);

  return { isPicking, pickedElement, startPicking, cancelPicking, clearPicked };
}
