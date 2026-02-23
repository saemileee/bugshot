import { useCallback, type MutableRefObject } from 'react';
import type { ExtensionMessage } from '@/shared/types/messages';

const CROP_PADDING = 12;

/**
 * Temporarily disable pointer-events on an element and its ancestors
 * to force the browser to clear :hover state.
 * Returns a cleanup function to restore original values.
 */
function disableHoverState(el: Element): () => void {
  const elementsToRestore: Array<{ el: HTMLElement; original: string }> = [];

  // Disable pointer-events on the element and ancestors up to body
  let current: Element | null = el;
  while (current && current !== document.body) {
    const htmlEl = current as HTMLElement;
    if (htmlEl.style) {
      elementsToRestore.push({
        el: htmlEl,
        original: htmlEl.style.pointerEvents,
      });
      htmlEl.style.pointerEvents = 'none';
    }
    current = current.parentElement;
  }

  return () => {
    // Restore original pointer-events values
    for (const { el: htmlEl, original } of elementsToRestore) {
      htmlEl.style.pointerEvents = original;
    }
  };
}

export function useScreenshot(portRef: MutableRefObject<chrome.runtime.Port | null>) {
  /** Capture the visible tab (hides widget, waits for paint, captures, restores). */
  const captureRaw = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      const port = portRef.current;
      if (!port) { reject(new Error('Not connected')); return; }

      // Hide all BugShot UI elements and save original display values
      const elementsToHide: Array<{ el: HTMLElement; originalDisplay: string }> = [
        document.getElementById('bugshot-root'),
        document.getElementById('bugshot-picked-highlight'),
        document.getElementById('bugshot-picker-highlight'),
        document.getElementById('bugshot-picker-label'),
      ]
        .filter((el): el is HTMLElement => el !== null)
        .map((el) => ({ el, originalDisplay: el.style.display }));

      elementsToHide.forEach(({ el }) => { el.style.display = 'none'; });

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const show = () => {
            elementsToHide.forEach(({ el, originalDisplay }) => {
              el.style.display = originalDisplay;
            });
          };

          const handler = (message: ExtensionMessage) => {
            if (message.type === 'SCREENSHOT_CAPTURED') {
              port.onMessage.removeListener(handler);
              show();
              resolve(message.dataUrl);
            }
          };

          port.onMessage.addListener(handler);
          port.postMessage({ type: 'CAPTURE_SCREENSHOT', tabId: 0 });

          setTimeout(() => {
            port.onMessage.removeListener(handler);
            show();
            reject(new Error('Screenshot capture timed out'));
          }, 5000);
        });
      });
    });
  }, [portRef]);

  /** Capture the full visible page. */
  const captureFullPage = useCallback((): Promise<string> => {
    return captureRaw();
  }, [captureRaw]);

  /** Capture only the bounding rect of a specific element (cropped from full page). */
  const captureElement = useCallback((el: Element): Promise<string> => {
    const rect = el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Disable hover state before capturing to get "resting" appearance
    const restoreHover = disableHoverState(el);

    return captureRaw()
      .then((dataUrl) => {
        // Restore hover state after capture
        restoreHover();
        return new Promise<string>((resolve) => {
          const img = new Image();
          img.onload = () => {
            // Source coordinates (in the captured image, which is at dpr scale)
            const sx = Math.max(0, Math.round((rect.left - CROP_PADDING) * dpr));
            const sy = Math.max(0, Math.round((rect.top - CROP_PADDING) * dpr));
            const sw = Math.min(img.width - sx, Math.round((rect.width + CROP_PADDING * 2) * dpr));
            const sh = Math.min(img.height - sy, Math.round((rect.height + CROP_PADDING * 2) * dpr));

            const canvas = document.createElement('canvas');
            canvas.width = sw;
            canvas.height = sh;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
            resolve(canvas.toDataURL('image/png'));
          };
          img.onerror = () => resolve(dataUrl); // fallback to full page
          img.src = dataUrl;
        });
      })
      .catch((err) => {
        // Ensure hover state is restored even on error
        restoreHover();
        throw err;
      });
  }, [captureRaw]);

  return { captureFullPage, captureElement };
}
