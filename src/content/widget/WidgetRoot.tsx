import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { FloatingWidget, type ToolbarTab } from "./components/FloatingWidget";
import { ChangesSummary } from "./components/ChangesSummary";
import { StyleEditor } from "./components/StyleEditor";
import { ScreenshotCapture } from "./components/ScreenshotCapture";
import { ManualDescription } from "./components/ManualDescription";
import { SubmitPanel } from "./components/SubmitPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { Button } from "./components/ui/button";
import { useSWMessaging } from "./hooks/useSWMessaging";
import { useElementPicker } from "./hooks/useElementPicker";
import { useContentCSSTracking } from "./hooks/useContentCSSTracking";
import { useScreenshot } from "./hooks/useScreenshot";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { CSSChange } from "@/shared/types/css-change";
import type { ExtensionMessage } from "@/shared/types/messages";
import { STORAGE_KEYS } from "@/shared/constants";

export type WidgetTab = "capture" | "describe" | "changes" | "submit";

export interface ScreenshotData {
  original: string;
  annotated?: string;
  filename: string;
}

export function WidgetRoot() {
  // ── Widget visibility (persisted) ──
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Load persisted visibility
    chrome.storage.local.get(STORAGE_KEYS.WIDGET_VISIBLE, (result) => {
      const stored = result[STORAGE_KEYS.WIDGET_VISIBLE];
      if (stored !== undefined) setVisible(stored);
    });

    // Listen for storage changes (reliable across all tabs)
    const onChanged = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === "local" && STORAGE_KEYS.WIDGET_VISIBLE in changes) {
        setVisible(changes[STORAGE_KEYS.WIDGET_VISIBLE].newValue ?? true);
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  // ── UI state ──
  const [activeTab, setActiveTab] = useState<ToolbarTab>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  // ── Data state ──
  const [screenshots, setScreenshots] = useState<ScreenshotData[]>([]);
  const [annotatingIndex, setAnnotatingIndex] = useState<number | null>(null);
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

  // ── Port message handler ──
  const handlePortMessage = useCallback((msg: ExtensionMessage) => {
    if (msg.type === "RECORDING_COMPLETE") {
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
  const { captureFullPage, captureElement } = useScreenshot(port);

  const beforeScreenshotRef = useRef<string | null>(null);

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

  // ── Clear picked element when widget becomes invisible ──
  useEffect(() => {
    if (!visible) {
      picker.clearPicked();
      tracking.reset();
      setActiveTab(null);
    }
  }, [visible, picker, tracking]);

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

      captureElement(picker.pickedElement)
        .then((dataUrl) => {
          beforeScreenshotRef.current = dataUrl;
        })
        .catch(() => {
          beforeScreenshotRef.current = null;
        });
    }
  }, [picker.pickedElement, tracking.captureBefore, captureElement]);

  // ── Toolbar actions ──
  const handleStartPicking = useCallback(() => {
    // If annotating, cancel annotation first
    if (annotatingIndex !== null) {
      setAnnotatingIndex(null);
    }
    beforeScreenshotRef.current = null;
    tracking.reset();
    picker.clearPicked();
    picker.startPicking();
  }, [tracking, picker, annotatingIndex]);

  const handleToolbarScreenshot = useCallback(async () => {
    setIsCapturing(true);
    try {
      const dataUrl = await captureFullPage();
      const filename = `screenshot-${Date.now()}.png`;
      setScreenshots((prev) => [...prev, { original: dataUrl, filename }]);
      setActiveTab("changes");
    } catch (err) {
      console.error("Screenshot failed:", err);
    } finally {
      setIsCapturing(false);
    }
  }, [captureFullPage]);

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

    let afterScreenshot: string | null = null;
    if (el) {
      try {
        afterScreenshot = await captureElement(el);
      } catch {
        /* ignore */
      }
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
  }, [tracking, picker, captureElement, editNote]);

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
    setAnnotatingIndex(null);
    setDescription("");
    setChanges([]);
    setRecordingId(null);
    setRecordingDataUrl(null);
    setRecordingSize(null);
    setRecordingMimeType(null);
    setIsConverting(false);
    setConversionProgress(null);
    setShowPreview(false);
  }, []);

  // ── Derived ──
  const editingSelector =
    isEditing && tracking.status.state === "before_captured"
      ? tracking.status.selector
      : "";

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
      return (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setShowPreview(true)}
        >
          Review Issue
          <ArrowRight className="w-3 h-3" />
        </Button>
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
            videoRecordingId={recordingId}
            videoDataUrl={recordingDataUrl}
            videoMimeType={recordingMimeType}
            isPreview
          />
        );
      }

      return (
        <>
          {/* ── Editing bar (selector display) ── */}
          {isEditing && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-violet-50 border-b border-violet-100">
              <code className="flex-1 text-[11px] font-mono text-violet-700 overflow-hidden text-ellipsis whitespace-nowrap">
                {editingSelector}
              </code>
            </div>
          )}

          {/* ── Editing mode: Style Editor ── */}
          {isEditing && picker.pickedElement && (
            <section className="flex-1 flex flex-col min-h-0">
              <StyleEditor
                element={picker.pickedElement}
                selector={editingSelector}
              />
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
                            onClick={() => {
                              setRecordingId(null);
                              setRecordingDataUrl(null);
                              setRecordingSize(null);
                            }}
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

                    {/* Screenshots */}
                    {screenshots.map((ss, i) => (
                      <div
                        key={i}
                        className="border border-gray-200 rounded-lg overflow-hidden"
                      >
                        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                          <span className="text-xs font-medium text-gray-700">
                            Screenshot {i + 1}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              className="inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-500 bg-transparent border-none rounded cursor-pointer transition-colors hover:bg-gray-100 hover:text-gray-700"
                              onClick={() => setAnnotatingIndex(i)}
                            >
                              Annotate
                            </button>
                            <button
                              className="flex items-center justify-center w-6 h-6 p-0 border-none bg-transparent cursor-pointer text-gray-400 hover:text-red-500"
                              onClick={() => handleRemoveScreenshot(i)}
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
                        </div>
                        <img
                          className="w-full block"
                          src={ss.annotated || ss.original}
                          alt={`Screenshot ${i + 1}`}
                        />
                      </div>
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

                  {/* Annotation mode */}
                  {annotatingIndex !== null && screenshots[annotatingIndex] && (
                    <div className="mt-3">
                      <ScreenshotCapture
                        screenshots={screenshots}
                        editingIndex={annotatingIndex}
                        onEditingChange={setAnnotatingIndex}
                        onUpdated={handleScreenshotUpdated}
                        onRemove={handleRemoveScreenshot}
                      />
                    </div>
                  )}
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

  if (!visible) return null;

  return (
    <FloatingWidget
      activeTab={activeTab}
      onTabChange={handleTabChange}
      isRecording={isRecording}
      isPicking={picker.isPicking}
      isCapturing={isCapturing}
      isPreviewMode={showPreview}
      isEditing={isEditing}
      hasContent={hasContent}
      onPickElement={handleStartPicking}
      onScreenshot={handleToolbarScreenshot}
      onRecordToggle={handleToolbarRecord}
      footer={footerContent}
    >
      {panelContent}
    </FloatingWidget>
  );
}
