import { useEffect, useRef, useState, useCallback } from 'react';
import type { ScreenshotData } from '../WidgetRoot';
import type { CSSChange } from '@/shared/types/css-change';
import type { ToolbarTab } from '../components/FloatingWidget';

export interface DraftState {
  screenshots: ScreenshotData[];
  description: string;
  changes: CSSChange[];
  recordingId: string | null;
  recordingDataUrl: string | null;
  recordingSize: number | null;
  recordingMimeType: string | null;
  editNote: string;
  activeTab: ToolbarTab;
  showPreview: boolean;
  isRecording: boolean; // Track recording state for proper UI sync after tab switch
  timestamp: number;
  url: string; // Store URL to help with debugging
  // Note: Picked element restoration is disabled due to reliability issues
}

const DRAFT_KEY_PREFIX = 'bugshot_draft_';
const AUTOSAVE_DELAY_MS = 500; // Reduced for better sync

/**
 * Get draft key for the current tab
 */
export function getDraftKey(tabId: number | null): string {
  return `${DRAFT_KEY_PREFIX}${tabId ?? 'unknown'}`;
}

/**
 * Hook to persist and restore draft state across widget/panel and tab visibility changes.
 *
 * Each tab has its own independent draft storage (keyed by tabId).
 * Both widget and side panel use the same storage key for the same tab.
 * Changes are synced in real-time via storage.onChanged listener.
 */
export function useDraftPersistence({
  screenshots,
  description,
  changes,
  recordingId,
  recordingDataUrl,
  recordingSize,
  recordingMimeType,
  editNote,
  activeTab,
  showPreview,
  isRecording,
  onRestore,
  externalTabId, // Optional: for side panel to pass the current tab ID
}: {
  screenshots: ScreenshotData[];
  description: string;
  changes: CSSChange[];
  recordingId: string | null;
  recordingDataUrl: string | null;
  recordingSize: number | null;
  recordingMimeType: string | null;
  editNote: string;
  activeTab: ToolbarTab;
  showPreview: boolean;
  isRecording: boolean;
  onRestore: (state: Omit<DraftState, 'timestamp' | 'url' | 'isRecording'>) => void;
  externalTabId?: number | null;
}) {
  const autosaveTimerRef = useRef<number | null>(null);
  const isRestoringRef = useRef(false);
  const hasRestoredRef = useRef(false);
  const lastSavedTimestampRef = useRef<number>(0); // To avoid restoring our own saves
  const [tabId, setTabId] = useState<number | null>(externalTabId ?? null);

  // ── Get current tab ID on mount (for widget mode) ──
  useEffect(() => {
    if (externalTabId !== undefined) {
      // Side panel mode: use provided tabId
      setTabId(externalTabId);
      return;
    }

    // Widget mode: get tabId from service worker
    chrome.runtime.sendMessage({ type: 'GET_TAB_ID' }, (response) => {
      if (response?.tabId) {
        setTabId(response.tabId);
      } else {
        console.warn('[DraftPersistence] Failed to get tab ID');
      }
    });
  }, [externalTabId]);

  // ── Restore draft on mount or tab change ──
  useEffect(() => {
    if (tabId === null) return;

    // Reset restoration state when tabId changes (for side panel tab switching)
    hasRestoredRef.current = false;
    isRestoringRef.current = true;

    const draftKey = getDraftKey(tabId);
    chrome.storage.local.get(draftKey).then((result) => {
      const draft = result[draftKey] as DraftState | undefined;
      if (draft) {
        console.log('[DraftPersistence] Restoring draft:', {
          tabId,
          screenshots: draft.screenshots.length,
          changes: draft.changes.length,
          hasRecording: !!draft.recordingId,
        });

        lastSavedTimestampRef.current = draft.timestamp;

        try {
          onRestore({
            screenshots: draft.screenshots,
            description: draft.description,
            changes: draft.changes,
            recordingId: draft.recordingId,
            recordingDataUrl: draft.recordingDataUrl,
            recordingSize: draft.recordingSize,
            recordingMimeType: draft.recordingMimeType,
            editNote: draft.editNote,
            activeTab: draft.activeTab,
            showPreview: draft.showPreview,
          });
        } catch (error) {
          console.error('[DraftPersistence] Restoration failed:', error);
        }
      }

      hasRestoredRef.current = true;
      requestAnimationFrame(() => {
        isRestoringRef.current = false;
      });
    }).catch((error) => {
      console.warn('[DraftPersistence] Failed to restore draft:', error);
      isRestoringRef.current = false;
      hasRestoredRef.current = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  // ── Listen for external storage changes (sync between widget/panel) ──
  useEffect(() => {
    if (tabId === null) return;

    const draftKey = getDraftKey(tabId);

    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      if (!changes[draftKey]) return;
      if (isRestoringRef.current) return;

      const newDraft = changes[draftKey].newValue as DraftState | undefined;
      if (!newDraft) return;

      // Skip if this is our own save (check timestamp)
      if (newDraft.timestamp === lastSavedTimestampRef.current) return;
      // Skip if the change is older than what we last saved
      if (newDraft.timestamp < lastSavedTimestampRef.current) return;

      console.log('[DraftPersistence] External change detected, syncing...');
      lastSavedTimestampRef.current = newDraft.timestamp;
      isRestoringRef.current = true;

      try {
        onRestore({
          screenshots: newDraft.screenshots,
          description: newDraft.description,
          changes: newDraft.changes,
          recordingId: newDraft.recordingId,
          recordingDataUrl: newDraft.recordingDataUrl,
          recordingSize: newDraft.recordingSize,
          recordingMimeType: newDraft.recordingMimeType,
          editNote: newDraft.editNote,
          activeTab: newDraft.activeTab,
          showPreview: newDraft.showPreview,
        });
      } catch (error) {
        console.error('[DraftPersistence] Sync failed:', error);
      }

      requestAnimationFrame(() => {
        isRestoringRef.current = false;
      });
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [tabId, onRestore]);

  // ── Save draft function ──
  const saveDraft = useCallback(() => {
    if (tabId === null || !hasRestoredRef.current) return;

    const hasContent =
      screenshots.length > 0 ||
      description.trim().length > 0 ||
      changes.length > 0 ||
      recordingId !== null ||
      editNote.trim().length > 0;

    const draftKey = getDraftKey(tabId);

    if (!hasContent) {
      chrome.storage.local.remove(draftKey).catch(() => {});
      return;
    }

    const timestamp = Date.now();
    lastSavedTimestampRef.current = timestamp;

    const draft: DraftState = {
      screenshots,
      description,
      changes,
      recordingId,
      recordingDataUrl,
      recordingSize,
      recordingMimeType,
      editNote,
      activeTab,
      showPreview,
      isRecording,
      timestamp,
      url: typeof window !== 'undefined' ? window.location.href : '',
    };

    chrome.storage.local.set({ [draftKey]: draft }).catch((error) => {
      console.warn('[DraftPersistence] Failed to save draft:', error);
    });
  }, [
    tabId,
    screenshots,
    description,
    changes,
    recordingId,
    recordingDataUrl,
    recordingSize,
    recordingMimeType,
    editNote,
    activeTab,
    showPreview,
    isRecording,
  ]);

  // ── Auto-save draft when state changes (debounced) ──
  useEffect(() => {
    if (tabId === null || isRestoringRef.current || !hasRestoredRef.current) return;

    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      saveDraft();
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [saveDraft, tabId]);

  // ── Save draft immediately on unmount ──
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      // Save synchronously on unmount
      saveDraft();
    };
  }, [saveDraft]);

  return { tabId };
}

/**
 * Helper function to clear saved draft from storage for the current tab.
 * Call this after successful submission or manual "Clear All".
 */
export async function clearDraft(tabId?: number): Promise<void> {
  try {
    let targetTabId = tabId;
    if (targetTabId === undefined) {
      const response = await chrome.runtime.sendMessage({ type: 'GET_TAB_ID' });
      if (!response?.tabId) {
        console.warn('[DraftPersistence] Cannot clear draft: failed to get tab ID');
        return;
      }
      targetTabId = response.tabId;
    }

    const draftKey = getDraftKey(targetTabId!);
    await chrome.storage.local.remove(draftKey);
  } catch (error) {
    console.warn('[DraftPersistence] Failed to clear draft:', error);
  }
}

/**
 * Helper function to clear draft for a specific tab (called by background script).
 * Used when a tab is closed to clean up its draft storage.
 */
export async function clearDraftForTab(tabId: number): Promise<void> {
  try {
    const draftKey = getDraftKey(tabId);
    await chrome.storage.local.remove(draftKey);
  } catch (error) {
    console.warn('[DraftPersistence] Failed to clear draft for tab', tabId, error);
  }
}
