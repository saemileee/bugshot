import { useEffect, useRef, useState } from 'react';
import type { ScreenshotData } from '../WidgetRoot';
import type { CSSChange, ElementStyleSnapshot } from '@/shared/types/css-change';
import type { ToolbarTab } from '../components/FloatingWidget';

interface DraftState {
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
  timestamp: number;
  url: string; // Store URL to help with debugging
  // Picked element state for restoration
  pickedElementSelector: string | null;
  beforeSnapshot: ElementStyleSnapshot | null;
  beforeScreenshot: string | null;
}

const DRAFT_KEY_PREFIX = 'bugshot_draft_';
const AUTOSAVE_DELAY_MS = 1000; // Debounce autosave by 1 second

/**
 * Get draft key for the current tab
 */
function getDraftKey(tabId: number | null): string {
  return `${DRAFT_KEY_PREFIX}${tabId ?? 'unknown'}`;
}

/**
 * Hook to persist and restore draft state across tab visibility changes.
 *
 * Each tab has its own independent draft storage (keyed by tabId).
 * When widget unmounts (tab becomes hidden), draft is saved to chrome.storage.local.
 * When widget mounts (tab becomes visible), draft is restored if it exists.
 *
 * Draft is cleared on:
 * - Tab is closed (handled by background script)
 * - Successful issue submission
 * - Manual "Clear All" action
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
  pickedElementSelector,
  beforeSnapshot,
  beforeScreenshot,
  onRestore,
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
  pickedElementSelector: string | null;
  beforeSnapshot: ElementStyleSnapshot | null;
  beforeScreenshot: string | null;
  onRestore: (state: Omit<DraftState, 'timestamp' | 'url'>) => void;
}) {
  const autosaveTimerRef = useRef<number | null>(null);
  const isRestoringRef = useRef(false);
  const hasRestoredRef = useRef(false); // Track if restoration completed
  const [tabId, setTabId] = useState<number | null>(null);

  // ── Get current tab ID on mount ──
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_TAB_ID' }, (response) => {
      if (response?.tabId) {
        setTabId(response.tabId);
      } else {
        console.warn('[DraftPersistence] Failed to get tab ID');
      }
    });
  }, []);

  // ── Restore draft on mount (after tabId is loaded) ──
  useEffect(() => {
    if (tabId === null || hasRestoredRef.current) return; // Wait for tabId, restore only once

    let mounted = true;
    isRestoringRef.current = true;

    const draftKey = getDraftKey(tabId);
    chrome.storage.local.get(draftKey).then((result) => {
      if (!mounted || hasRestoredRef.current) return;

      const draft = result[draftKey] as DraftState | undefined;
      if (draft) {
        console.log('[DraftPersistence] Restoring draft from storage:', {
          tabId,
          screenshots: draft.screenshots.length,
          changes: draft.changes.length,
          hasRecording: !!draft.recordingId,
          savedAt: new Date(draft.timestamp).toLocaleTimeString(),
          url: draft.url,
        });

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
            pickedElementSelector: draft.pickedElementSelector,
            beforeSnapshot: draft.beforeSnapshot,
            beforeScreenshot: draft.beforeScreenshot,
          });
          hasRestoredRef.current = true;
        } catch (error) {
          console.error('[DraftPersistence] Restoration failed:', error);
        }
      } else {
        hasRestoredRef.current = true; // No draft to restore, mark as done
      }

      // Allow autosave after next render cycle
      requestAnimationFrame(() => {
        isRestoringRef.current = false;
      });
    }).catch((error) => {
      console.warn('[DraftPersistence] Failed to restore draft:', error);
      isRestoringRef.current = false;
      hasRestoredRef.current = true;
    });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]); // onRestore는 dependency에서 제거 (무한 루프 방지)

  // ── Auto-save draft when state changes (debounced) ──
  useEffect(() => {
    if (tabId === null) return; // Wait for tabId
    // Skip autosave until restoration is complete
    if (isRestoringRef.current || !hasRestoredRef.current) return;

    // Clear any pending autosave
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    // Schedule new autosave
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;

      // Check if there's any content worth saving
      const hasContent =
        screenshots.length > 0 ||
        description.trim().length > 0 ||
        changes.length > 0 ||
        recordingId !== null ||
        editNote.trim().length > 0;

      const draftKey = getDraftKey(tabId);

      if (!hasContent) {
        // No content - clear any existing draft
        chrome.storage.local.remove(draftKey).catch(() => {
          // Ignore errors
        });
        return;
      }

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
        pickedElementSelector,
        beforeSnapshot,
        beforeScreenshot,
        timestamp: Date.now(),
        url: window.location.href,
      };

      chrome.storage.local.set({ [draftKey]: draft }).catch((error) => {
        console.warn('[DraftPersistence] Failed to save draft:', error);
      });
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
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
    pickedElementSelector,
    beforeSnapshot,
    beforeScreenshot,
  ]);

  // ── Save draft immediately on unmount ──
  useEffect(() => {
    return () => {
      if (tabId === null || !hasRestoredRef.current) return; // Can't save without tabId or before restoration

      // Cancel any pending autosave
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }

      // Save immediately on unmount (tab becoming hidden)
      const hasContent =
        screenshots.length > 0 ||
        description.trim().length > 0 ||
        changes.length > 0 ||
        recordingId !== null ||
        editNote.trim().length > 0;

      const draftKey = getDraftKey(tabId);

      if (hasContent) {
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
          pickedElementSelector,
          beforeSnapshot,
          beforeScreenshot,
          timestamp: Date.now(),
          url: window.location.href,
        };

        // Use synchronous storage API during unmount to ensure it completes
        try {
          chrome.storage.local.set({ [draftKey]: draft });
        } catch (error) {
          console.warn('[DraftPersistence] Failed to save draft on unmount:', error);
        }
      } else {
        // No content - clear draft
        try {
          chrome.storage.local.remove(draftKey);
        } catch {
          // Ignore errors
        }
      }
    };
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
    pickedElementSelector,
    beforeSnapshot,
    beforeScreenshot,
  ]);
}

/**
 * Helper function to clear saved draft from storage for the current tab.
 * Call this after successful submission or manual "Clear All".
 */
export async function clearDraft(): Promise<void> {
  try {
    // Get current tab ID
    const response = await chrome.runtime.sendMessage({ type: 'GET_TAB_ID' });
    if (!response?.tabId) {
      console.warn('[DraftPersistence] Cannot clear draft: failed to get tab ID');
      return;
    }

    const draftKey = getDraftKey(response.tabId);
    await chrome.storage.local.remove(draftKey);
    console.log('[DraftPersistence] Draft cleared from storage for tab', response.tabId);
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
    console.log('[DraftPersistence] Draft cleared for closed tab', tabId);
  } catch (error) {
    console.warn('[DraftPersistence] Failed to clear draft for tab', tabId, error);
  }
}
