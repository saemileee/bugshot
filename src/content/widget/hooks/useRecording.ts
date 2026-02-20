// Video recording hook - Phase 4 full implementation
// Stub for Phase 2 UI integration

import { useCallback } from 'react';
import type { ExtensionMessage } from '@/shared/types/messages';

export function useRecording(
  sendMessage: (msg: ExtensionMessage) => Promise<ExtensionMessage>,
) {
  const startRecording = useCallback(async () => {
    const tab = await chrome.tabs?.query?.({ active: true, currentWindow: true });
    const tabId = tab?.[0]?.id;
    if (!tabId) return;
    await sendMessage({ type: 'START_RECORDING', tabId });
  }, [sendMessage]);

  const stopRecording = useCallback(async () => {
    await sendMessage({ type: 'STOP_RECORDING' });
  }, [sendMessage]);

  return { startRecording, stopRecording };
}
