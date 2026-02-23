import { useState, useCallback, useEffect, useRef } from 'react';
import { FloatingWidget, type ToolbarTab } from './components/FloatingWidget';
import { ChangesSummary } from './components/ChangesSummary';
import { StyleEditor } from './components/StyleEditor';
import { ScreenshotCapture } from './components/ScreenshotCapture';
import { ManualDescription } from './components/ManualDescription';
import { SubmitPanel } from './components/SubmitPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { useSWMessaging } from './hooks/useSWMessaging';
import { useElementPicker } from './hooks/useElementPicker';
import { useContentCSSTracking } from './hooks/useContentCSSTracking';
import { useScreenshot } from './hooks/useScreenshot';
import type { CSSChange } from '@/shared/types/css-change';
import type { ExtensionMessage } from '@/shared/types/messages';
import { STORAGE_KEYS } from '@/shared/constants';

export type WidgetTab = 'capture' | 'describe' | 'changes' | 'submit';

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
      area: string,
    ) => {
      if (area === 'local' && STORAGE_KEYS.WIDGET_VISIBLE in changes) {
        setVisible(changes[STORAGE_KEYS.WIDGET_VISIBLE].newValue ?? true);
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  // ── UI state ──
  const [activeTab, setActiveTab] = useState<ToolbarTab>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  // ── Data state ──
  const [screenshots, setScreenshots] = useState<ScreenshotData[]>([]);
  const [annotatingIndex, setAnnotatingIndex] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [changes, setChanges] = useState<CSSChange[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState<{ progress: number; message: string } | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recordingDataUrl, setRecordingDataUrl] = useState<string | null>(null);
  const [recordingSize, setRecordingSize] = useState<number | null>(null);
  const [recordingMimeType, setRecordingMimeType] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');
  const [recordError, setRecordError] = useState<string | null>(null);

  // ── Port message handler ──
  const handlePortMessage = useCallback((msg: ExtensionMessage) => {
    if (msg.type === 'RECORDING_COMPLETE') {
      setRecordingId(msg.recordingId);
      setRecordingDataUrl(msg.dataUrl ?? null);
      setRecordingSize(msg.size ?? null);
      setRecordingMimeType(msg.mimeType ?? null);
      setIsRecording(false);
      setIsConverting(false);
      setConversionProgress(null);
      setActiveTab('changes');
    }
    if (msg.type === 'RECORDING_ERROR') {
      setIsRecording(false);
      setIsConverting(false);
      setConversionProgress(null);
      setRecordError(msg.error);
    }
    if (msg.type === 'CONVERSION_PROGRESS') {
      if (msg.stage === 'loading' || msg.stage === 'converting') {
        setIsConverting(true);
        setConversionProgress({ progress: msg.progress, message: msg.message });
      } else if (msg.stage === 'error') {
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

  const isEditing = tracking.status.state === 'before_captured';
  const hasContent = screenshots.length > 0 || !!description.trim() || changes.length > 0 || !!recordingId;

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
  const handleTabChange = useCallback((tab: ToolbarTab) => {
    if (tab === null && picker.pickedElement) {
      picker.clearPicked();
      tracking.reset();
    }
    setActiveTab(tab);
  }, [picker, tracking]);

  // ── Element picked → open changes panel in editing mode ──
  useEffect(() => {
    if (picker.pickedElement) {
      tracking.captureBefore(picker.pickedElement);
      setActiveTab('changes');

      captureElement(picker.pickedElement)
        .then((dataUrl) => { beforeScreenshotRef.current = dataUrl; })
        .catch(() => { beforeScreenshotRef.current = null; });
    }
  }, [picker.pickedElement, tracking.captureBefore, captureElement]);

  // ── Auto-open notes when description exists ──
  useEffect(() => {
    if (description.trim()) setNotesOpen(true);
  }, [description]);

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
      setActiveTab('changes');
    } catch (err) {
      console.error('Screenshot failed:', err);
    } finally {
      setIsCapturing(false);
    }
  }, [captureFullPage]);

  const handleToolbarRecord = useCallback(async () => {
    setRecordError(null);
    try {
      if (isRecording) {
        setIsRecording(false);
        await sendMessage({ type: 'STOP_RECORDING' });
      } else {
        const response = await sendMessage({ type: 'START_RECORDING', tabId: 0 });
        if (response && 'error' in response) {
          const msg = (response as { error: string }).error;
          console.error('Recording failed:', msg);
          setRecordError(msg);
        } else {
          setIsRecording(true);
        }
      }
    } catch (err) {
      const msg = (err as Error).message || 'Recording failed';
      console.error('Recording error:', msg);
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
      try { afterScreenshot = await captureElement(el); } catch { /* ignore */ }
    }

    const change = tracking.captureAfter();
    if (change) {
      change.screenshotBefore = beforeScreenshotRef.current ?? undefined;
      change.screenshotAfter = afterScreenshot ?? undefined;
      if (note) change.description = note;
      setChanges((prev) => [...prev, change]);
    } else if (note) {
      const selector = tracking.status.state === 'before_captured'
        ? tracking.status.selector
        : el?.tagName.toLowerCase() || 'element';
      const noteChange: CSSChange = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        selector,
        elementDescription: selector,
        url: window.location.href,
        properties: [],
        description: note,
        screenshotBefore: beforeScreenshotRef.current ?? undefined,
        status: 'pending',
      };
      setChanges((prev) => [...prev, noteChange]);
      tracking.reset();
    }

    setEditNote('');
    beforeScreenshotRef.current = null;
  }, [tracking, picker.pickedElement, captureElement, editNote]);

  const handleResetCapture = useCallback(() => {
    beforeScreenshotRef.current = null;
    setEditNote('');
    tracking.reset();
    picker.clearPicked();
  }, [tracking, picker]);

  const handleRemoveChange = useCallback((id: string) => {
    setChanges((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleClearChanges = useCallback(() => setChanges([]), []);

  // ── Screenshot list actions ──
  const handleScreenshotUpdated = useCallback((index: number, data: ScreenshotData) => {
    setScreenshots((prev) => { const u = [...prev]; u[index] = data; return u; });
  }, []);
  const handleRemoveScreenshot = useCallback((index: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Submit ──
  const handleSubmitSuccess = useCallback(() => {
    setScreenshots([]);
    setAnnotatingIndex(null);
    setDescription('');
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
  const editingSelector = isEditing && tracking.status.state === 'before_captured'
    ? tracking.status.selector
    : '';

  // ── Footer content (only for changes tab) ──
  const footerContent = (() => {
    if (activeTab !== 'changes') return null;

    if (isEditing) {
      return (
        <div className="qa-footer-editing">
          <textarea
            className="qa-textarea"
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            placeholder="Describe what should change..."
            spellCheck={false}
            rows={2}
          />
          <div className="qa-footer-actions">
            <button className="qa-btn qa-btn-ghost" onClick={handleResetCapture}>
              Cancel
            </button>
            <button className="qa-btn qa-btn-success qa-footer-primary" onClick={handleCaptureAfter}>
              Capture Changes
            </button>
          </div>
        </div>
      );
    }

    if (showPreview) return null;

    if (hasContent) {
      return (
        <div className="qa-footer-actions">
          <button
            className="qa-btn qa-btn-success qa-footer-primary"
            onClick={() => setShowPreview(true)}
          >
            Review & Submit
          </button>
        </div>
      );
    }

    return null;
  })();

  // ── Panel content based on active tab ──
  const panelContent = (() => {
    if (activeTab === 'settings') {
      return <SettingsPanel />;
    }

    // Changes tab (including preview mode and editing mode)
    if (activeTab === 'changes') {
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
          {/* ── Editing bar ── */}
          {isEditing && (
            <div className="qa-editing-bar">
              <span className="qa-editing-bar-label">Editing</span>
              <code className="qa-editing-bar-selector">{editingSelector}</code>
            </div>
          )}

          {/* ── Editing mode: Styles + Describe ── */}
          {isEditing && picker.pickedElement && (
            <section className="qa-section qa-section-styles">
              <h3 className="qa-section-title">Styles</h3>
              <StyleEditor
                element={picker.pickedElement}
                selector={editingSelector}
              />
            </section>
          )}


          {/* ── Normal mode ── */}
          {!isEditing && (
            <>
              <section className="qa-section">
                {changes.length > 0 && <h3 className="qa-section-title">CSS Changes</h3>}
                <ChangesSummary
                  changes={changes}
                  captureStatus={tracking.status}
                  onRemoveChange={handleRemoveChange}
                  onClearChanges={handleClearChanges}
                />
              </section>

              <hr className="qa-divider" />

              <section className="qa-section">
                <h3 className="qa-section-title">
                  Screenshots
                  {screenshots.length > 0 && (
                    <span className="qa-section-count">{screenshots.length}</span>
                  )}
                </h3>
                <ScreenshotCapture
                  screenshots={screenshots}
                  editingIndex={annotatingIndex}
                  onEditingChange={setAnnotatingIndex}
                  onUpdated={handleScreenshotUpdated}
                  onRemove={handleRemoveScreenshot}
                />
                {(recordingId || isRecording || isConverting || recordError) && (
                  <div style={{ marginTop: 12 }}>
                    {recordError && (
                      <div className="qa-status qa-status-error">
                        <span style={{ flex: 1 }}>Recording error: {recordError}</span>
                        <button
                          className="qa-btn qa-btn-ghost"
                          onClick={() => setRecordError(null)}
                          style={{ padding: '0 4px', fontSize: 11 }}
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                    {isRecording && (
                      <div className="qa-status qa-status-error">
                        <span className="qa-recording-dot" />
                        <span>Recording in progress...</span>
                      </div>
                    )}
                    {isConverting && conversionProgress && (
                      <div className="qa-status qa-status-info">
                        <div style={{ flex: 1 }}>
                          <div style={{ marginBottom: 4 }}>{conversionProgress.message}</div>
                          <div style={{ height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                width: `${conversionProgress.progress}%`,
                                background: '#3b82f6',
                                borderRadius: 2,
                                transition: 'width 0.3s',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    {recordingId && !isRecording && (
                      <div className="qa-recording-card">
                        <div className="qa-recording-header">
                          <span style={{ flex: 1, fontWeight: 500 }}>
                            Screen recording
                            {recordingSize != null && (
                              <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 6 }}>
                                {recordingSize < 1_000_000
                                  ? `${Math.round(recordingSize / 1024)}KB`
                                  : `${(recordingSize / 1_000_000).toFixed(1)}MB`}
                              </span>
                            )}
                          </span>
                          <button
                            className="qa-btn qa-btn-ghost"
                            onClick={() => {
                              setRecordingId(null);
                              setRecordingDataUrl(null);
                              setRecordingSize(null);
                            }}
                            style={{ padding: '0 4px', fontSize: 11 }}
                          >
                            Remove
                          </button>
                        </div>
                        {recordingDataUrl && (
                          <video
                            className="qa-recording-preview"
                            src={recordingDataUrl}
                            controls
                            playsInline
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>

              <hr className="qa-divider" />

              <section className="qa-section">
                <button
                  className="qa-section-toggle"
                  onClick={() => setNotesOpen((p) => !p)}
                >
                  <h3 className="qa-section-title" style={{ marginBottom: 0 }}>Notes</h3>
                  <span className={`qa-section-chevron ${notesOpen ? 'open' : ''}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </button>
                {notesOpen && (
                  <div style={{ marginTop: 8 }}>
                    <ManualDescription
                      description={description}
                      onDescriptionChange={setDescription}
                    />
                  </div>
                )}
              </section>
            </>
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
