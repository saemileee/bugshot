import { useCallback, type MutableRefObject } from 'react';
import type { ExtensionMessage } from '@/shared/types/messages';

export function useScreenshot(portRef: MutableRefObject<chrome.runtime.Port | null>) {
  const captureFullPage = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      const port = portRef.current;
      if (!port) {
        reject(new Error('Not connected to service worker'));
        return;
      }

      // Hide widget so it doesn't appear in the screenshot
      const host = document.getElementById('design-qa-helper-root');
      if (host) host.style.display = 'none';

      // Double rAF to ensure the browser has painted the hidden state
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const show = () => {
            if (host) host.style.display = '';
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

          // Timeout after 5 seconds
          setTimeout(() => {
            port.onMessage.removeListener(handler);
            show();
            reject(new Error('Screenshot capture timed out'));
          }, 5000);
        });
      });
    });
  }, [portRef]);

  return { captureFullPage };
}
