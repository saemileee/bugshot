import { useEffect, useRef, useCallback, useState } from 'react';
import type { ExtensionMessage } from '@/shared/types/messages';

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 1000;

export function useSWMessaging(onPortMessage?: (msg: ExtensionMessage) => void) {
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const callbackRef = useRef(onPortMessage);
  const reconnectAttempts = useRef(0);
  const [isConnected, setIsConnected] = useState(false);
  callbackRef.current = onPortMessage;

  useEffect(() => {
    let isMounted = true;

    function connect() {
      try {
        // Check if extension context is still valid
        if (!chrome.runtime?.id) {
          console.warn('[BugShot] Extension context invalidated');
          return;
        }

        const port = chrome.runtime.connect({ name: 'content-widget' });
        portRef.current = port;
        reconnectAttempts.current = 0;
        if (isMounted) setIsConnected(true);

        port.onMessage.addListener((msg: ExtensionMessage) => {
          callbackRef.current?.(msg);
        });

        port.onDisconnect.addListener(() => {
          portRef.current = null;
          if (isMounted) setIsConnected(false);

          // Check for extension context invalidation
          if (chrome.runtime.lastError?.message?.includes('Extension context invalidated')) {
            console.warn('[BugShot] Extension context invalidated, cannot reconnect');
            return;
          }

          // Try to reconnect if still mounted and not exceeding max attempts
          if (isMounted && reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts.current++;
            setTimeout(connect, RECONNECT_DELAY);
          }
        });
      } catch (error) {
        console.warn('[BugShot] Failed to connect to service worker:', error);
        // Try to reconnect
        if (isMounted && reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts.current++;
          setTimeout(connect, RECONNECT_DELAY);
        }
      }
    }

    connect();

    return () => {
      isMounted = false;
      if (portRef.current) {
        try {
          portRef.current.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }
    };
  }, []);

  const sendMessage = useCallback((message: ExtensionMessage): Promise<ExtensionMessage> => {
    return new Promise((resolve, reject) => {
      // Check if extension context is still valid
      if (!chrome.runtime?.id) {
        reject(new Error('Extension context invalidated'));
        return;
      }

      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response as ExtensionMessage);
        }
      });
    });
  }, []);

  return { port: portRef, sendMessage, isConnected };
}
