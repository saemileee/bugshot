import { useEffect, useRef, useCallback, useState } from 'react';
import type { ExtensionMessage } from '@/shared/types/messages';

/**
 * Type-safe message request/response mapping.
 * Maps request message types to their expected response types.
 */
type MessageResponseMap = {
  CAPTURE_SCREENSHOT: Extract<ExtensionMessage, { type: 'SCREENSHOT_CAPTURED' }>;
  START_RECORDING: Extract<ExtensionMessage, { type: 'RECORDING_STARTED' }>;
  STOP_RECORDING: Extract<ExtensionMessage, { type: 'RECORDING_STOPPED' }>;
  CHECK_AUTH_STATUS: Extract<ExtensionMessage, { type: 'AUTH_STATUS' }>;
  FETCH_JIRA_PROJECTS: { projects: unknown[] };
  FETCH_JIRA_ISSUE_TYPES: { issueTypes: unknown[] };
  FETCH_JIRA_EPICS: { epics: unknown[] };
  FETCH_JIRA_ASSIGNEES: { assignees: unknown[] };
  FETCH_JIRA_PRIORITIES: { priorities: unknown[] };
  SEARCH_JIRA_ISSUES: { issues: unknown[] };
  SUBMIT_TO_JIRA: Extract<ExtensionMessage, { type: 'JIRA_SUBMIT_RESULT' }>;
  SUBMIT_TO_INTEGRATIONS: Extract<ExtensionMessage, { type: 'INTEGRATION_RESULTS' }>;
  GET_ELEMENT_STYLES: Extract<ExtensionMessage, { type: 'ELEMENT_STYLES_RESULT' }>;
};

type MessageType = ExtensionMessage['type'];
type ResponseFor<T extends MessageType> = T extends keyof MessageResponseMap
  ? MessageResponseMap[T]
  : ExtensionMessage;

/** Type for the sendMessage function - use this in component props */
export type SendMessageFn = <T extends ExtensionMessage>(message: T) => Promise<ResponseFor<T['type']>>;

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
          console.log('[useSWMessaging] Port message received:', msg.type);
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

  /**
   * Type-safe message sender that infers response type from request type.
   * Example: sendMessage({ type: 'CHECK_AUTH_STATUS' }) returns Promise<{ type: 'AUTH_STATUS', ... }>
   */
  const sendMessage = useCallback(<T extends ExtensionMessage>(
    message: T
  ): Promise<ResponseFor<T['type']>> => {
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
          resolve(response as ResponseFor<T['type']>);
        }
      });
    });
  }, []);

  return { port: portRef, sendMessage, isConnected };
}
