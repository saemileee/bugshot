import { useState, useEffect, useRef, useCallback } from 'react';
import type { CSSChange } from '@/shared/types/css-change';
import type { ExtensionMessage, JiraSubmissionPayload } from '@/shared/types/messages';

interface SubmitResult {
  success: boolean;
  issueKey?: string;
  error?: string;
}

export function usePanelMessaging() {
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);

  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'devtools-panel' });
    portRef.current = port;

    port.postMessage({
      type: 'INIT_CSS_TRACKING',
      tabId: chrome.devtools.inspectedWindow.tabId,
    });

    port.onMessage.addListener((message) => {
      if (message.type === 'INSPECT_ELEMENT' && message.selector) {
        const escaped = message.selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        chrome.devtools.inspectedWindow.eval(
          `(function() { var el = document.querySelector('${escaped}'); if (el) inspect(el); })()`,
        );
      }
    });

    port.onDisconnect.addListener(() => {
      portRef.current = null;
    });

    return () => {
      port.disconnect();
    };
  }, []);

  const syncChangesToWidget = useCallback((changes: CSSChange[]) => {
    portRef.current?.postMessage({
      type: 'SYNC_CHANGES',
      changes,
    });
  }, []);

  const submitToJira = useCallback(async (changes: CSSChange[], notes: string) => {
    setIsSubmitting(true);
    setSubmitResult(null);

    // Get the current page info via inspectedWindow.eval
    const pageInfo = await new Promise<{ url: string; title: string }>((resolve) => {
      chrome.devtools.inspectedWindow.eval(
        `({ url: window.location.href, title: document.title })`,
        (result: unknown) => {
          const info = result as { url: string; title: string } | null;
          resolve(info || { url: '', title: '' });
        },
      );
    });

    const payload: JiraSubmissionPayload = {
      changes,
      manualNotes: notes,
      screenshots: [],
      pageUrl: pageInfo.url,
      pageTitle: pageInfo.title,
    };

    try {
      const response: ExtensionMessage = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'SUBMIT_TO_JIRA', payload } as ExtensionMessage,
          (resp) => resolve(resp as ExtensionMessage),
        );
      });

      if (response.type === 'JIRA_SUBMIT_RESULT') {
        setSubmitResult({
          success: response.success,
          issueKey: response.issueKey,
          error: response.error,
        });
      }
    } catch (err) {
      setSubmitResult({ success: false, error: (err as Error).message });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setSubmitResult(null), 5000);
    }
  }, []);

  return { submitToJira, syncChangesToWidget, isSubmitting, submitResult };
}
