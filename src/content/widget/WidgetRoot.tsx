import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { FloatingWidget, type ToolbarTab } from "./components/FloatingWidget";
import { ChangesSummary } from "./components/ChangesSummary";
import { StyleEditor } from "./components/StyleEditor";
import { ElementBreadcrumb } from "./components/ElementBreadcrumb";
import { InlineScreenshotEditor } from "./components/InlineScreenshotEditor";
import { ManualDescription } from "./components/ManualDescription";
import { SubmitPanel } from "./components/SubmitPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { RegionSelector } from "./components/RegionSelector";
import { Button } from "./components/ui/button";
import { useSWMessaging } from "./hooks/useSWMessaging";
import { useElementPicker } from "./hooks/useElementPicker";
import { useContentCSSTracking } from "./hooks/useContentCSSTracking";
import { useScreenshot } from "./hooks/useScreenshot";
import { useDraftPersistence, clearDraft } from "./hooks/useDraftPersistence";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { CSSChange } from "@/shared/types/css-change";
import type { ExtensionMessage } from "@/shared/types/messages";
import { STORAGE_KEYS, type DisplayMode } from "@/shared/constants";

export type WidgetTab = "capture" | "describe" | "changes" | "submit";

export interface ScreenshotData {
  original: string;
  annotated?: string;
  filename: string;
  description?: string;
}

export function WidgetRoot() {
  // Note: Widget visibility is handled by content-script.ts which mounts/unmounts
  // this entire component. No need to track visibility state here.

  // ── UI state ──
  const [activeTab, setActiveTab] = useState<ToolbarTab>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSelectingRegion, setIsSelectingRegion] = useState(false);

  // ── Data state ──
  const [screenshots, setScreenshots] = useState<ScreenshotData[]>([]);
  const [description, setDescription] = useState("");
  const [changes, setChanges] = useState<CSSChange[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState<{
    progress: number;
    message: string;
  } | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recordingDataUrl, setRecordingDataUrl] = useState<string | null>(null);
  const [recordingSize, setRecordingSize] = useState<number | null>(null);
  const [recordingMimeType, setRecordingMimeType] = useState<string | null>(
    null
  );
  const [editNote, setEditNote] = useState("");
  const [recordError, setRecordError] = useState<string | null>(null);
  const [hasConnectedPlatform, setHasConnectedPlatform] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Ref to track current recording ID for cleanup
  const recordingIdRef = useRef<string | null>(null);
  recordingIdRef.current = recordingId;

  // ── Port message handler ──
  const handlePortMessage = useCallback((msg: ExtensionMessage) => {
    if (msg.type === "RECORDING_COMPLETE") {
      // Delete old recording if exists (new recording replaces it)
      const oldRecordingId = recordingIdRef.current;
      if (oldRecordingId && oldRecordingId !== msg.recordingId) {
        // Fire and forget - delete old recording from IndexedDB
        chrome.runtime.sendMessage({
          type: "DELETE_RECORDING",
          recordingId: oldRecordingId,
        }).catch(() => { /* ignore */ });
      }

      setRecordingId(msg.recordingId);
      setRecordingDataUrl(msg.dataUrl ?? null);
      setRecordingSize(msg.size ?? null);
      setRecordingMimeType(msg.mimeType ?? null);
      setIsRecording(false);
      setIsConverting(false);
      setConversionProgress(null);
      setActiveTab("changes");
    }
    if (msg.type === "RECORDING_ERROR") {
      setIsRecording(false);
      setIsConverting(false);
      setConversionProgress(null);
      setRecordError(msg.error);
    }
    if (msg.type === "CONVERSION_PROGRESS") {
      if (msg.stage === "loading" || msg.stage === "converting") {
        setIsConverting(true);
        setConversionProgress({ progress: msg.progress, message: msg.message });
      } else if (msg.stage === "error") {
        setIsConverting(false);
        setConversionProgress(null);
      }
    }
  }, []);

  const { port, sendMessage } = useSWMessaging(handlePortMessage);
  const picker = useElementPicker();
  const tracking = useContentCSSTracking();
  const { captureFullPage, captureElement, captureRegion } = useScreenshot(port);

  const beforeScreenshotRef = useRef<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);

  // Helper: Scroll element into view and capture screenshot
  const captureElementWithScroll = useCallback(async (element: Element): Promise<string | null> => {
    try {
      // Check if element is in viewport
      const rect = element.getBoundingClientRect();
      const isInViewport = (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth
      );

      // Scroll into view if needed
      if (!isInViewport) {
        element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
        // Wait for layout recalculation
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Capture screenshot
      const dataUrl = await captureElement(element);
      setScreenshotError(null);
      return dataUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Screenshot capture failed';
      console.error('[Screenshot] Capture failed:', message);
      setScreenshotError('Failed to capture screenshot. Element may be off-screen or hidden.');
      return null;
    }
  }, [captureElement]);

  // ── Draft persistence (restore on mount, save on unmount/state change) ──
  // Note: Picked element restoration is disabled due to reliability issues
  useDraftPersistence({
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
    onRestore: (draft) => {
      setScreenshots(draft.screenshots);
      setDescription(draft.description);
      setChanges(draft.changes);
      setRecordingId(draft.recordingId);
      setRecordingDataUrl(draft.recordingDataUrl);
      setRecordingSize(draft.recordingSize);
      setRecordingMimeType(draft.recordingMimeType);
      setEditNote(draft.editNote);
      setActiveTab(draft.activeTab);
      setShowPreview(draft.showPreview);
    },
  });

  // ── Helper to delete recording from IndexedDB ──
  const deleteRecordingFromDB = useCallback(async (recId: string) => {
    try {
      await sendMessage({
        type: "DELETE_RECORDING",
        recordingId: recId,
      });
    } catch {
      // Ignore errors - recording will be cleaned up by 24h auto-cleanup
    }
  }, [sendMessage]);

  // ── Clear video recording (also deletes from IndexedDB) ──
  const handleClearRecording = useCallback(() => {
    if (recordingId) {
      deleteRecordingFromDB(recordingId);
    }
    setRecordingId(null);
    setRecordingDataUrl(null);
    setRecordingSize(null);
    setRecordingMimeType(null);
  }, [recordingId, deleteRecordingFromDB]);

  // ── Clear all draft data ──
  const handleClearAll = useCallback(() => {
    // Delete recording from IndexedDB if present
    if (recordingId) {
      deleteRecordingFromDB(recordingId);
    }
    // Clear all React state
    setScreenshots([]);
    setDescription("");
    setChanges([]);
    setRecordingId(null);
    setRecordingDataUrl(null);
    setRecordingSize(null);
    setRecordingMimeType(null);
    setIsConverting(false);
    setConversionProgress(null);
    setShowPreview(false);
    setEditNote("");
    beforeScreenshotRef.current = null;
    tracking.reset();
    picker.clearPicked();
    // Clear saved draft from storage
    clearDraft();
  }, [recordingId, deleteRecordingFromDB, tracking, picker]);

  // Helper function to check platform connection status from storage
  const checkPlatformStatus = useCallback(async () => {
    setCheckingAuth(true);
    try {
      // Read directly from storage instead of API call
      const result = await chrome.storage.sync.get(STORAGE_KEYS.INTEGRATIONS);
      const configs = result[STORAGE_KEYS.INTEGRATIONS] || {};

      // Check if any integration is enabled
      const hasConnected = Object.values(configs).some(
        (config: any) => config?.enabled === true
      );

      setHasConnectedPlatform(hasConnected);

      if (!hasConnected) {
        console.warn("[WidgetRoot] No connected platforms found. User must configure integrations in Settings.");
      }
    } catch (error) {
      console.warn("[WidgetRoot] Failed to read integrations from storage:", error);
      setHasConnectedPlatform(false);
    }
    setCheckingAuth(false);
  }, []);

  // ── Check for connected platforms on mount ──
  // Reads directly from storage to avoid unnecessary API calls on every tab switch
  useEffect(() => {
    checkPlatformStatus();
  }, [checkPlatformStatus]);

  // ── Check recording status on mount (restore after tab switch) ──
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' }, (response) => {
      if (response?.isRecording) {
        setIsRecording(true);
      }
    });
  }, []);

  // ── Listen for storage changes (real-time platform connection updates) ──
  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      // Skip if tab is hidden to avoid redundant IPC calls from background tabs
      if (document.visibilityState === 'hidden') return;

      // Listen for changes in both sync and local storage
      if (areaName === "sync" || areaName === "local") {
        // Check if integration-related keys changed
        if (changes["integrations"] || changes["jiraCredentials"]) {
          checkPlatformStatus();
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [checkPlatformStatus]);

  // ── Cleanup on unmount (widget deactivated) ──
  // Note: We DON'T delete recordings on unmount anymore because draft state
  // is now persisted across tab visibility changes. Recordings are only deleted when:
  // 1. User explicitly clears them (handleClearRecording)
  // 2. User clears all drafts (handleClearAll)
  // 3. New recording replaces old one (handlePortMessage)
  // 4. After 24h auto-cleanup (background worker)

  const isEditing = tracking.status.state === "before_captured";
  const hasContent =
    screenshots.length > 0 ||
    !!description.trim() ||
    changes.length > 0 ||
    !!recordingId;

  // ── Picker → close panel ──
  useEffect(() => {
    if (picker.isPicking) setActiveTab(null);
  }, [picker.isPicking]);

  // Note: Cleanup when widget becomes invisible is now handled by content-script.ts
  // unmounting the entire React tree. No need for visibility-based cleanup here.

  // ── Handle tab change (clear picked element when panel closes) ──
  const handleTabChange = useCallback(
    (tab: ToolbarTab) => {
      if (tab === null && picker.pickedElement) {
        picker.clearPicked();
        tracking.reset();
      }
      setActiveTab(tab);
    },
    [picker, tracking]
  );

  // ── Element picked → open changes panel in editing mode ──
  useEffect(() => {
    if (picker.pickedElement) {
      tracking.captureBefore(picker.pickedElement);
      setActiveTab("changes");

      // Capture "before" screenshot with auto-scroll
      captureElementWithScroll(picker.pickedElement)
        .then((dataUrl) => {
          beforeScreenshotRef.current = dataUrl;
        });
    }
  }, [picker.pickedElement, tracking.captureBefore, captureElementWithScroll]);

  // ── Monitor picked element for removal from DOM ──
  useEffect(() => {
    const element = picker.pickedElement;
    if (!element) return;

    const observer = new MutationObserver(() => {
      // Check if element is still in DOM
      if (!document.contains(element)) {
        console.warn('[WidgetRoot] Picked element was removed from DOM');
        setScreenshotError('Element was removed from the page. Please pick a new element.');
        beforeScreenshotRef.current = null;
        tracking.reset();
        picker.clearPicked();
        observer.disconnect();
      }
    });

    // Observe DOM for element removal (watch parent to reduce CPU overhead on complex SPAs)
    const observeTarget = element.parentElement || document.body;
    observer.observe(observeTarget, {
      childList: true,
      subtree: true, // Watch descendants to catch nested removals
    });

    return () => {
      observer.disconnect();
    };
  }, [picker.pickedElement, tracking, picker]);

  // ── Toolbar actions ──
  const handleStartPicking = useCallback(() => {
    beforeScreenshotRef.current = null;
    tracking.reset();
    picker.clearPicked();
    picker.startPicking();
  }, [tracking, picker]);

  // ── Breadcrumb navigation: select a different element ──
  // Note: We only call selectElement here. The useEffect watching pickedElement
  // will automatically handle tracking.captureBefore and screenshot capture.
  const handleBreadcrumbSelect = useCallback((element: Element) => {
    picker.selectElement(element);
  }, [picker]);

  const handleToolbarScreenshot = useCallback(async () => {
    setIsCapturing(true);
    try {
      const dataUrl = await captureFullPage();
      const filename = `screenshot-${Date.now()}.png`;
      setScreenshots((prev) => [...prev, { original: dataUrl, filename }]);
      setActiveTab("changes");
      setScreenshotError(null);
    } catch (err) {
      console.error("Screenshot failed:", err);
      setScreenshotError('Failed to capture full page screenshot. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  }, [captureFullPage]);

  const handleToolbarRegionScreenshot = useCallback(() => {
    // Start region selection mode
    setIsSelectingRegion(true);
  }, []);

  const handleRegionSelected = useCallback(async (region: { x: number; y: number; width: number; height: number }) => {
    setIsSelectingRegion(false);
    setIsCapturing(true);
    try {
      const dataUrl = await captureRegion(region);
      const filename = `screenshot-region-${Date.now()}.png`;
      setScreenshots((prev) => [...prev, { original: dataUrl, filename }]);
      setActiveTab("changes");
      setScreenshotError(null);
    } catch (err) {
      console.error("Region screenshot failed:", err);
      setScreenshotError('Failed to capture region screenshot. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  }, [captureRegion]);

  const handleRegionCancel = useCallback(() => {
    setIsSelectingRegion(false);
  }, []);

  // ── Switch to Side Panel Mode ──
  const handleSwitchToPanel = useCallback(async () => {
    try {
      // Save display mode to storage
      await chrome.storage.local.set({
        [STORAGE_KEYS.DISPLAY_MODE]: 'panel' as DisplayMode,
      });

      // Request service worker to open side panel
      const response = await chrome.runtime.sendMessage({ type: 'GET_TAB_ID' });
      if (response?.tabId) {
        // Service worker will handle opening the side panel
        // Widget will be hidden via storage change listener in content-script.ts
      }
    } catch (error) {
      console.warn('[WidgetRoot] Failed to switch to panel mode:', error);
    }
  }, []);

  const handleToolbarRecord = useCallback(async () => {
    setRecordError(null);
    try {
      if (isRecording) {
        setIsRecording(false);
        await sendMessage({ type: "STOP_RECORDING" });
      } else {
        const response = await sendMessage({
          type: "START_RECORDING",
          tabId: 0,
        });
        if (response && "error" in response) {
          const msg = (response as { error: string }).error;
          console.error("Recording failed:", msg);
          setRecordError(msg);
        } else {
          setIsRecording(true);
        }
      }
    } catch (err) {
      const msg = (err as Error).message || "Recording failed";
      console.error("Recording error:", msg);
      setRecordError(msg);
      setIsRecording(false);
    }
  }, [isRecording, sendMessage]);

  // ── CSS change actions ──
  const handleCaptureAfter = useCallback(async () => {
    const el = picker.pickedElement;
    const note = editNote.trim();

    // Capture "after" screenshot with auto-scroll
    let afterScreenshot: string | null = null;
    if (el) {
      afterScreenshot = await captureElementWithScroll(el);
    }

    const change = tracking.captureAfter();
    if (change) {
      change.screenshotBefore = beforeScreenshotRef.current ?? undefined;
      change.screenshotAfter = afterScreenshot ?? undefined;
      if (note) change.description = note;
      setChanges((prev) => [...prev, change]);
    } else if (note) {
      const selector =
        tracking.status.state === "before_captured"
          ? tracking.status.selector
          : el?.tagName.toLowerCase() || "element";
      const noteChange: CSSChange = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        selector,
        elementDescription: selector,
        url: window.location.href,
        properties: [],
        description: note,
        screenshotBefore: beforeScreenshotRef.current ?? undefined,
        status: "pending",
      };
      setChanges((prev) => [...prev, noteChange]);
    }

    // Clear selection after capture
    setEditNote("");
    beforeScreenshotRef.current = null;
    tracking.reset();
    picker.clearPicked();
  }, [tracking, picker, captureElementWithScroll, editNote]);

  const handleResetCapture = useCallback(() => {
    beforeScreenshotRef.current = null;
    setEditNote("");
    tracking.reset();
    picker.clearPicked();
  }, [tracking, picker]);

  const handleRemoveChange = useCallback((id: string) => {
    setChanges((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // ── Screenshot list actions ──
  const handleScreenshotUpdated = useCallback(
    (index: number, data: ScreenshotData) => {
      setScreenshots((prev) => {
        const u = [...prev];
        u[index] = data;
        return u;
      });
    },
    []
  );
  const handleRemoveScreenshot = useCallback((index: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Submit ──
  const handleSubmitSuccess = useCallback(() => {
    setScreenshots([]);
    setDescription("");
    setChanges([]);
    setRecordingId(null);
    setRecordingDataUrl(null);
    setRecordingSize(null);
    setRecordingMimeType(null);
    setIsConverting(false);
    setConversionProgress(null);
    setShowPreview(false);
    // Clear saved draft from storage after successful submission
    clearDraft();
  }, []);

  // ── Footer content (only for changes tab, memoized to avoid unnecessary re-renders) ──
  const footerContent = useMemo(() => {
    if (activeTab !== "changes") return null;

    if (isEditing) {
      return (
        <div className="flex flex-col gap-3">
          <textarea
            className="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 resize-none outline-none placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Describe what should change..."
            spellCheck={false}
            rows={2}
          />
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" onClick={handleResetCapture}>
              <ArrowLeft className="w-3 h-3" />
              Previous
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={handleCaptureAfter}
            >
              Confirm Style & Write Issue
              <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
        </div>
      );
    }

    if (showPreview) return null;

    if (hasContent) {
      // Show warning if no platform is connected
      if (!hasConnectedPlatform && !checkingAuth) {
        return (
          <div className="space-y-2">
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-50 text-amber-700 text-xs border border-amber-200">
              <svg
                className="w-4 h-4 flex-shrink-0 mt-0.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div className="flex-1">
                <div className="font-medium mb-1">No platform connected</div>
                <div>Connect to Jira, GitHub, or Webhook in Settings to create issues.</div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="text-gray-500 hover:text-red-500"
                onClick={handleClearAll}
              >
                Clear All
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setActiveTab("settings")}
              >
                Open Settings
                <ArrowRight className="w-3 h-3" />
              </Button>
            </div>
          </div>
        );
      }

      return (
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="text-gray-500 hover:text-red-500"
            onClick={handleClearAll}
          >
            Clear All
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setShowPreview(true)}
            disabled={checkingAuth}
          >
            {checkingAuth ? "Checking..." : "Review Issue"}
            <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      );
    }

    return null;
  }, [
    activeTab,
    isEditing,
    editNote,
    showPreview,
    hasContent,
    handleResetCapture,
    handleCaptureAfter,
    handleClearAll,
  ]);

  // ── Panel content based on active tab ──
  const panelContent = (() => {
    if (activeTab === "settings") {
      return <SettingsPanel />;
    }

    // Changes tab (including preview mode and editing mode)
    if (activeTab === "changes") {
      if (showPreview) {
        return (
          <SubmitPanel
            screenshots={screenshots}
            description={description}
            changes={changes}
            sendMessage={sendMessage}
            onSuccess={handleSubmitSuccess}
            onBack={() => setShowPreview(false)}
            onGoToSettings={() => {
              setShowPreview(false);
              setActiveTab("settings");
            }}
            videoRecordingId={recordingId}
            videoDataUrl={recordingDataUrl}
            videoMimeType={recordingMimeType}
            hasConnectedPlatform={hasConnectedPlatform}
            isPreview
          />
        );
      }

      return (
        <>
          {/* ── Editing bar (element breadcrumb navigation) ── */}
          {isEditing && picker.pickedElement && (
            <div className="px-3 py-2 bg-violet-50 border-b border-violet-100">
              <ElementBreadcrumb
                element={picker.pickedElement}
                onSelectElement={handleBreadcrumbSelect}
                onHoverElement={picker.showHoverHighlight}
                onHoverEnd={picker.hideHoverHighlight}
              />
            </div>
          )}

          {/* ── Screenshot error notification ── */}
          {screenshotError && (
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-200">
              <div className="flex items-center gap-2 text-xs text-amber-700">
                <svg
                  className="w-4 h-4 flex-shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span className="flex-1">{screenshotError}</span>
                <button
                  className="flex items-center justify-center w-5 h-5 p-0 border-none bg-transparent cursor-pointer text-amber-500 hover:text-amber-700"
                  onClick={() => setScreenshotError(null)}
                  title="Dismiss"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* ── Editing mode: Style Editor ── */}
          {isEditing && picker.pickedElement && (
            <section className="flex-1 flex flex-col min-h-0">
              <StyleEditor element={picker.pickedElement} />
            </section>
          )}

          {/* ── Normal mode ── */}
          {!isEditing && (
            <div className="flex-1 overflow-y-auto">
              {/* CSS Changes Section */}
              <div className="px-4 py-4">
                <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-3">
                  <span className="text-slate-400">[</span>CSS Changes
                  <span className="text-slate-400">]</span>
                  {changes.length > 0 && (
                    <span className="text-xs font-medium text-violet-600">
                      {changes.length}
                    </span>
                  )}
                </h3>
                <ChangesSummary
                  changes={changes}
                  captureStatus={tracking.status}
                  onRemoveChange={handleRemoveChange}
                />
              </div>

              {/* Media Section (Screenshots + Video) */}
              <div className="px-4 py-4 border-t border-slate-100">
                <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-3">
                  <span className="text-slate-400">[</span>Media
                  <span className="text-slate-400">]</span>
                  {(screenshots.length > 0 || recordingId) && (
                    <span className="text-xs font-medium text-violet-600">
                      {screenshots.length + (recordingId ? 1 : 0)}
                    </span>
                  )}
                </h3>
                <div className="px-4 py-3">
                  {/* Recording status/errors */}
                  {recordError && (
                    <div className="flex items-center gap-2 p-2.5 mb-2 rounded-md bg-red-50 text-red-700 text-xs">
                      <span className="flex-1">
                        Recording error: {recordError}
                      </span>
                      <button
                        className="flex items-center justify-center w-5 h-5 p-0 border-none bg-transparent cursor-pointer text-red-400 hover:text-red-600"
                        onClick={() => setRecordError(null)}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {isRecording && (
                    <div className="flex items-center gap-2 p-2.5 mb-2 rounded-md bg-red-50 text-red-700 text-xs">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse-opacity" />
                      <span>Recording in progress...</span>
                    </div>
                  )}
                  {isConverting && conversionProgress && (
                    <div className="flex items-center gap-2 p-2.5 mb-2 rounded-md bg-blue-50 text-blue-700 text-xs">
                      <div className="flex-1">
                        <div className="mb-1">{conversionProgress.message}</div>
                        <div className="w-full h-1.5 bg-blue-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: `${conversionProgress.progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Media list container */}
                  <div className="flex flex-col gap-3">
                    {/* Video recording */}
                    {recordingId && !isRecording && recordingDataUrl && (
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                          <span className="text-xs font-medium text-gray-700">
                            Video
                            {recordingSize != null && (
                              <span className="ml-1.5 text-[10px] text-gray-400">
                                {recordingSize < 1_000_000
                                  ? `${Math.round(recordingSize / 1024)}KB`
                                  : `${(recordingSize / 1_000_000).toFixed(
                                      1
                                    )}MB`}
                              </span>
                            )}
                          </span>
                          <button
                            className="flex items-center justify-center w-6 h-6 p-0 border-none bg-transparent cursor-pointer text-gray-400 hover:text-red-500"
                            onClick={handleClearRecording}
                            title="Remove"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                        <video
                          className="w-full block"
                          src={recordingDataUrl}
                          controls
                          playsInline
                        />
                      </div>
                    )}

                    {/* Screenshots - Inline Editor */}
                    {screenshots.map((ss, i) => (
                      <InlineScreenshotEditor
                        key={i}
                        screenshot={ss}
                        index={i}
                        onUpdate={handleScreenshotUpdated}
                        onRemove={handleRemoveScreenshot}
                      />
                    ))}

                    {/* Empty state */}
                    {!recordingId &&
                      screenshots.length === 0 &&
                      !isRecording &&
                      !isConverting && (
                        <div className="text-center py-4 text-gray-400 text-xs">
                          Use toolbar to capture screenshots or record video
                        </div>
                      )}
                  </div>

                </div>
              </div>

              {/* Notes Section */}
              <div className="px-4 py-4 border-t border-slate-100">
                <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-3">
                  <span className="text-slate-400">[</span>Notes
                  <span className="text-slate-400">]</span>
                </h3>
                <ManualDescription
                  description={description}
                  onDescriptionChange={setDescription}
                />
              </div>
            </div>
          )}
        </>
      );
    }

    return null;
  })();

  return (
    <>
      <FloatingWidget
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isRecording={isRecording}
        isPicking={picker.isPicking}
        isCapturing={isCapturing}
        isPreviewMode={showPreview}
        isEditing={isEditing}
        hasContent={hasContent}
        hasRecording={!!recordingId}
        onPickElement={handleStartPicking}
        onScreenshot={handleToolbarScreenshot}
        onRegionScreenshot={handleToolbarRegionScreenshot}
        onRecordToggle={handleToolbarRecord}
        onSwitchToPanel={handleSwitchToPanel}
        footer={footerContent}
      >
        {panelContent}
      </FloatingWidget>

      {/* Region selection overlay */}
      {isSelectingRegion && (
        <RegionSelector
          onRegionSelected={handleRegionSelected}
          onCancel={handleRegionCancel}
        />
      )}
    </>
  );
}
