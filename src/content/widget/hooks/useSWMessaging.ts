import { useEffect, useRef, useCallback } from 'react';
import type { ExtensionMessage } from '@/shared/types/messages';

export function useSWMessaging() {
  const portRef = useRef<chrome.runtime.Port | null>(null);

  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'content-widget' });
    portRef.current = port;

    port.onDisconnect.addListener(() => {
      portRef.current = null;
    });

    return () => {
      port.disconnect();
    };
  }, []);

  const sendMessage = useCallback((message: ExtensionMessage): Promise<ExtensionMessage> => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response as ExtensionMessage);
      });
    });
  }, []);

  return { port: portRef, sendMessage };
}
