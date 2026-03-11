import { useCallback, type MutableRefObject } from 'react';
import type { ExtensionMessage } from '@/shared/types/messages';
import { cropScreenshotToRect, cropScreenshotToRegion } from '@/shared/utils/screenshot';

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

// Guard against concurrent captures
let widgetCaptureInProgress = false;

export function useScreenshot(portRef: MutableRefObject<chrome.runtime.Port | null>) {
  /** Capture the visible tab (hides widget, waits for paint, captures, restores). */
  const captureRaw = useCallback((): Promise<string> => {
    // Prevent concurrent captures
    if (widgetCaptureInProgress) {
      console.warn('[useScreenshot] Capture already in progress, skipping');
      return Promise.reject(new Error('Capture already in progress'));
    }
    widgetCaptureInProgress = true;

    return new Promise((resolve, reject) => {
      const port = portRef.current;
      if (!port) {
        widgetCaptureInProgress = false;
        reject(new Error('Not connected'));
        return;
      }

      // Hide all BugShot UI elements and save original styles
      // Use querySelectorAll to find all elements with bugshot- prefix
      const bugshotElements = document.querySelectorAll('[id^="bugshot-"]');
      const elementsToHide: Array<{ el: HTMLElement; original: { display: string; visibility: string } }> =
        Array.from(bugshotElements)
          .filter((el): el is HTMLElement => el instanceof HTMLElement)
          .map((el) => ({ el, original: { display: el.style.display, visibility: el.style.visibility } }));

      // Use both display:none and visibility:hidden for extra safety
      elementsToHide.forEach(({ el }) => {
        el.style.display = 'none';
        el.style.visibility = 'hidden';
      });

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const show = () => {
            elementsToHide.forEach(({ el, original }) => {
              el.style.display = original.display;
              el.style.visibility = original.visibility;
            });
          };

          const handler = (message: ExtensionMessage) => {
            if (message.type === 'SCREENSHOT_CAPTURED') {
              port.onMessage.removeListener(handler);
              show();
              widgetCaptureInProgress = false;
              resolve(message.dataUrl);
            } else if (message.type === 'SCREENSHOT_ERROR') {
              port.onMessage.removeListener(handler);
              show();
              widgetCaptureInProgress = false;
              reject(new Error(message.error || 'Screenshot capture failed'));
            }
          };

          port.onMessage.addListener(handler);
          port.postMessage({ type: 'CAPTURE_SCREENSHOT', tabId: 0 });

          setTimeout(() => {
            port.onMessage.removeListener(handler);
            show();
            widgetCaptureInProgress = false;
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

    // Disable hover state before capturing to get "resting" appearance
    const restoreHover = disableHoverState(el);

    return captureRaw()
      .then((dataUrl) => {
        // Restore hover state after capture
        restoreHover();
        // Use shared cropping utility
        return cropScreenshotToRect(dataUrl, {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        });
      })
      .catch((err) => {
        // Ensure hover state is restored even on error
        restoreHover();
        throw err;
      });
  }, [captureRaw]);

  /** Capture a specific region of the page. */
  const captureRegion = useCallback((region: { x: number; y: number; width: number; height: number }): Promise<string> => {
    return captureRaw().then((dataUrl) => {
      // Use shared cropping utility (no padding for explicit region selection)
      return cropScreenshotToRegion(dataUrl, region);
    });
  }, [captureRaw]);

  return { captureFullPage, captureElement, captureRegion };
}
