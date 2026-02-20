import { useEffect, useRef, useCallback } from 'react';
import type { ExtensionMessage } from '@/shared/types/messages';

export function useSWMessaging(onPortMessage?: (msg: ExtensionMessage) => void) {
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const callbackRef = useRef(onPortMessage);
  callbackRef.current = onPortMessage;

  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'content-widget' });
    portRef.current = port;

    port.onMessage.addListener((msg: ExtensionMessage) => {
      callbackRef.current?.(msg);
    });

    port.onDisconnect.addListener(() => {
      portRef.current = null;
    });

    return () => {
      port.disconnect();
    };
  }, []);

  const sendMessage = useCallback((message: ExtensionMessage): Promise<ExtensionMessage> => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response as ExtensionMessage);
        }
      });
    });
  }, []);

  return { port: portRef, sendMessage };
}
