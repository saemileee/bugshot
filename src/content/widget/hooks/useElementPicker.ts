import { useState, useCallback, useRef, useEffect } from 'react';

// ── Helper functions ──

function rgbToHex(rgb: string): string {
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return rgb;
  const r = parseInt(match[1]).toString(16).padStart(2, '0');
  const g = parseInt(match[2]).toString(16).padStart(2, '0');
  const b = parseInt(match[3]).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`.toUpperCase();
}

function getTagString(el: Element): string {
  let tag = el.tagName.toLowerCase();
  if (el.id) {
    tag += '#' + el.id;
  } else if (el.className && typeof el.className === 'string') {
    const cls = el.className.trim().split(/\s+/).slice(0, 2).join('.');
    if (cls) tag += '.' + cls;
  }
  return tag;
}

function createGuidelineElements() {
  const container = document.createElement('div');
  container.id = 'bugshot-guidelines';
  container.style.cssText = 'position:fixed;inset:0;z-index:2147483645;pointer-events:none;';

  const lineStyle = 'position:absolute;background:#ec4899;opacity:0.7;';

  // Top line (viewport top to element top) - vertical
  const topLine = document.createElement('div');
  topLine.id = 'bugshot-guide-top-line';
  topLine.style.cssText = lineStyle + 'width:1px;';

  // Bottom line (element bottom to viewport bottom) - vertical
  const bottomLine = document.createElement('div');
  bottomLine.id = 'bugshot-guide-bottom-line';
  bottomLine.style.cssText = lineStyle + 'width:1px;';

  // Left line (viewport left to element left) - horizontal
  const leftLine = document.createElement('div');
  leftLine.id = 'bugshot-guide-left-line';
  leftLine.style.cssText = lineStyle + 'height:1px;';

  // Right line (element right to viewport right) - horizontal
  const rightLine = document.createElement('div');
  rightLine.id = 'bugshot-guide-right-line';
  rightLine.style.cssText = lineStyle + 'height:1px;';

  // Labels
  const createLabel = (id: string) => {
    const label = document.createElement('div');
    label.id = id;
    label.style.cssText = [
      'position:absolute',
      'background:#1e293b',
      'color:#f8fafc',
      'font:10px/1 -apple-system,BlinkMacSystemFont,monospace',
      'padding:2px 4px',
      'border-radius:2px',
      'white-space:nowrap',
    ].join(';');
    return label;
  };

  const topLabel = createLabel('bugshot-guide-top');
  const bottomLabel = createLabel('bugshot-guide-bottom');
  const leftLabel = createLabel('bugshot-guide-left');
  const rightLabel = createLabel('bugshot-guide-right');

  container.appendChild(topLine);
  container.appendChild(bottomLine);
  container.appendChild(leftLine);
  container.appendChild(rightLine);
  container.appendChild(topLabel);
  container.appendChild(bottomLabel);
  container.appendChild(leftLabel);
  container.appendChild(rightLabel);

  return container;
}

function createInfoPanel() {
  const panel = document.createElement('div');
  panel.id = 'bugshot-info-panel';
  panel.style.cssText = [
    'position:fixed',
    'z-index:2147483646',
    'pointer-events:none',
    'background:#1e293b',
    'color:#f8fafc',
    'font:11px/1.5 -apple-system,BlinkMacSystemFont,sans-serif',
    'padding:8px 10px',
    'border-radius:6px',
    'box-shadow:0 4px 12px rgba(0,0,0,0.3)',
    'max-width:320px',
    'display:none',
  ].join(';');
  return panel;
}

function updateGuidelines(rect: DOMRect) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  // Distance values
  const top = Math.round(rect.top);
  const bottom = Math.round(vh - rect.bottom);
  const left = Math.round(rect.left);
  const right = Math.round(vw - rect.right);

  // Top line: viewport top (0) to element top, at element center X
  const topLine = document.getElementById('bugshot-guide-top-line');
  if (topLine) {
    topLine.style.left = `${centerX}px`;
    topLine.style.top = '0';
    topLine.style.height = `${rect.top}px`;
  }

  // Bottom line: element bottom to viewport bottom, at element center X
  const bottomLine = document.getElementById('bugshot-guide-bottom-line');
  if (bottomLine) {
    bottomLine.style.left = `${centerX}px`;
    bottomLine.style.top = `${rect.bottom}px`;
    bottomLine.style.height = `${vh - rect.bottom}px`;
  }

  // Left line: viewport left (0) to element left, at element center Y
  const leftLine = document.getElementById('bugshot-guide-left-line');
  if (leftLine) {
    leftLine.style.top = `${centerY}px`;
    leftLine.style.left = '0';
    leftLine.style.width = `${rect.left}px`;
  }

  // Right line: element right to viewport right, at element center Y
  const rightLine = document.getElementById('bugshot-guide-right-line');
  if (rightLine) {
    rightLine.style.top = `${centerY}px`;
    rightLine.style.left = `${rect.right}px`;
    rightLine.style.width = `${vw - rect.right}px`;
  }

  // Top label
  const topLabel = document.getElementById('bugshot-guide-top');
  if (topLabel) {
    topLabel.textContent = `${top}px`;
    topLabel.style.left = `${centerX + 6}px`;
    topLabel.style.top = `${Math.max(4, rect.top / 2 - 8)}px`;
  }

  // Bottom label
  const bottomLabel = document.getElementById('bugshot-guide-bottom');
  if (bottomLabel) {
    bottomLabel.textContent = `${bottom}px`;
    bottomLabel.style.left = `${centerX + 6}px`;
    bottomLabel.style.top = `${rect.bottom + (vh - rect.bottom) / 2 - 8}px`;
  }

  // Left label
  const leftLabel = document.getElementById('bugshot-guide-left');
  if (leftLabel) {
    leftLabel.textContent = `${left}px`;
    leftLabel.style.top = `${centerY - 16}px`;
    leftLabel.style.left = `${Math.max(4, rect.left / 2 - 18)}px`;
  }

  // Right label
  const rightLabel = document.getElementById('bugshot-guide-right');
  if (rightLabel) {
    rightLabel.textContent = `${right}px`;
    rightLabel.style.top = `${centerY - 16}px`;
    rightLabel.style.left = `${rect.right + (vw - rect.right) / 2 - 18}px`;
  }
}

function updateInfoPanel(el: Element, rect: DOMRect) {
  const panel = document.getElementById('bugshot-info-panel');
  if (!panel) return;

  const styles = getComputedStyle(el);
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Gather info
  const tag = getTagString(el);
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  const x = Math.round(rect.left);
  const y = Math.round(rect.top);

  const bgColor = styles.backgroundColor;
  const textColor = styles.color;
  const borderColor = styles.borderColor;

  const fontFamily = styles.fontFamily.split(',')[0].replace(/["']/g, '').trim();
  const fontSize = styles.fontSize;
  const fontWeight = styles.fontWeight;

  // Color swatch helper
  const swatch = (color: string) => {
    if (color === 'rgba(0, 0, 0, 0)' || color === 'transparent') {
      return `<span style="display:inline-block;width:10px;height:10px;border:1px solid #475569;border-radius:2px;vertical-align:middle;margin-right:4px;background:repeating-conic-gradient(#666 0% 25%, #999 0% 50%) 50%/6px 6px;"></span>`;
    }
    return `<span style="display:inline-block;width:10px;height:10px;border:1px solid rgba(255,255,255,0.2);border-radius:2px;vertical-align:middle;margin-right:4px;background:${color};"></span>`;
  };

  // Build HTML
  panel.innerHTML = `
    <div style="font-weight:600;margin-bottom:6px;color:#e2e8f0;">${tag}</div>
    <div style="color:#94a3b8;margin-bottom:4px;">
      W: <span style="color:#60a5fa;">${w}px</span> × H: <span style="color:#60a5fa;">${h}px</span>
    </div>
    <div style="color:#94a3b8;margin-bottom:8px;">
      Position: X:<span style="color:#f472b6;">${x}px</span> Y:<span style="color:#f472b6;">${y}px</span>
    </div>
    <div style="margin-bottom:4px;">
      ${swatch(bgColor)} BG: <span style="color:#94a3b8;">${bgColor !== 'rgba(0, 0, 0, 0)' ? rgbToHex(bgColor) : 'transparent'}</span>
    </div>
    <div style="margin-bottom:4px;">
      ${swatch(textColor)} Text: <span style="color:#94a3b8;">${rgbToHex(textColor)}</span>
    </div>
    <div style="margin-bottom:8px;">
      ${swatch(borderColor)} Border: <span style="color:#94a3b8;">${rgbToHex(borderColor)}</span>
    </div>
    <div style="color:#64748b;font-size:10px;border-top:1px solid #334155;padding-top:6px;margin-top:4px;">
      Font: ${fontFamily}<br/>
      Size: ${fontSize} / Weight: ${fontWeight}
    </div>
  `;

  // Position panel (prefer bottom-right of element, fallback if offscreen)
  panel.style.display = 'block';
  let panelX = rect.right + 12;
  let panelY = rect.top;

  // Measure panel
  const panelRect = panel.getBoundingClientRect();

  // Adjust if offscreen
  if (panelX + panelRect.width > vw - 12) {
    panelX = rect.left - panelRect.width - 12;
  }
  if (panelX < 12) {
    panelX = 12;
  }
  if (panelY + panelRect.height > vh - 12) {
    panelY = vh - panelRect.height - 12;
  }
  if (panelY < 12) {
    panelY = 12;
  }

  panel.style.left = `${panelX}px`;
  panel.style.top = `${panelY}px`;
}

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

  // Create / destroy highlight overlay, guidelines, and info panel
  useEffect(() => {
    if (!isPicking) return;

    // Highlight box
    const highlight = document.createElement('div');
    highlight.id = 'bugshot-picker-highlight';
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

    // Guidelines
    const guidelines = createGuidelineElements();
    document.documentElement.appendChild(guidelines);

    // Info panel
    const infoPanel = createInfoPanel();
    document.documentElement.appendChild(infoPanel);

    return () => {
      highlight.remove();
      guidelines.remove();
      infoPanel.remove();
      highlightRef.current = null;
      document.documentElement.style.cursor = '';
    };
  }, [isPicking]);

  // Event listeners
  useEffect(() => {
    if (!isPicking) return;

    const isWidgetElement = (el: Element) =>
      el.id?.startsWith('bugshot-');

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

      // Update guidelines and info panel
      updateGuidelines(rect);
      updateInfoPanel(target, rect);
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
    overlay.id = 'bugshot-picked-highlight';
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

    // Throttled update to prevent excessive layout recalculations
    let rafId: number | null = null;
    const update = () => {
      // Skip updates when tab is hidden to save CPU
      if (document.visibilityState === 'hidden') return;

      if (rafId !== null) return; // Already scheduled
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const rect = pickedElement.getBoundingClientRect();
        overlay.style.top = rect.top + 'px';
        overlay.style.left = rect.left + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';
      });
    };
    update();

    // Track scroll / resize
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);

    // Use ResizeObserver for the picked element only (lightweight)
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(pickedElement);

    // MutationObserver: only watch the picked element itself, NOT subtree
    // This dramatically reduces CPU usage on heavy pages
    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(pickedElement, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    // Pause/resume observers when tab visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Tab hidden - disconnect observers to stop CPU usage
        resizeObserver.disconnect();
        mutationObserver.disconnect();
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      } else {
        // Tab visible - reconnect observers
        resizeObserver.observe(pickedElement);
        mutationObserver.observe(pickedElement, {
          attributes: true,
          attributeFilter: ['style', 'class'],
        });
        update(); // Update overlay position
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      overlay.remove();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [pickedElement]);

  const startPicking = useCallback(() => {
    setPickedElement(null);
    setIsPicking(true);
  }, []);

  const clearPicked = useCallback(() => {
    setPickedElement(null);
  }, []);

  const restorePickedElement = useCallback((selector: string) => {
    try {
      const element = document.querySelector(selector);
      if (element) {
        setPickedElement(element);
        return true;
      } else {
        console.warn('[ElementPicker] Could not find element with selector:', selector);
        return false;
      }
    } catch (error) {
      console.error('[ElementPicker] Invalid selector:', selector, error);
      return false;
    }
  }, []);

  // Allow external code to change the picked element (e.g., from breadcrumb navigation)
  const selectElement = useCallback((element: Element) => {
    setPickedElement(element);
  }, []);

  // ── Hover highlight for breadcrumb preview ──
  const hoverHighlightRef = useRef<HTMLDivElement | null>(null);

  const showHoverHighlight = useCallback((element: Element) => {
    if (!hoverHighlightRef.current) {
      const highlight = document.createElement('div');
      highlight.id = 'bugshot-hover-highlight';
      highlight.style.cssText = [
        'position:fixed',
        'z-index:2147483644',
        'pointer-events:none',
        'border:2px dashed #f59e0b',
        'background:rgba(245,158,11,0.08)',
        'border-radius:3px',
        'transition:top .1s,left .1s,width .1s,height .1s',
      ].join(';');
      document.documentElement.appendChild(highlight);
      hoverHighlightRef.current = highlight;
    }

    const rect = element.getBoundingClientRect();
    const hl = hoverHighlightRef.current;
    hl.style.display = 'block';
    hl.style.top = rect.top + 'px';
    hl.style.left = rect.left + 'px';
    hl.style.width = rect.width + 'px';
    hl.style.height = rect.height + 'px';
  }, []);

  const hideHoverHighlight = useCallback(() => {
    if (hoverHighlightRef.current) {
      hoverHighlightRef.current.style.display = 'none';
    }
  }, []);

  // Cleanup hover highlight on unmount
  useEffect(() => {
    return () => {
      if (hoverHighlightRef.current) {
        hoverHighlightRef.current.remove();
        hoverHighlightRef.current = null;
      }
    };
  }, []);

  return {
    isPicking,
    pickedElement,
    startPicking,
    clearPicked,
    restorePickedElement,
    selectElement,
    showHoverHighlight,
    hideHoverHighlight,
  };
}
