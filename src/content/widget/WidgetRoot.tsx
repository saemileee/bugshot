import { useState, useCallback, useEffect, useRef } from 'react';
import { FloatingWidget } from './components/FloatingWidget';
import { ChangesSummary } from './components/ChangesSummary';
import { StyleEditor } from './components/StyleEditor';
import { ScreenshotCapture } from './components/ScreenshotCapture';
import { ManualDescription } from './components/ManualDescription';
import { SubmitPanel } from './components/SubmitPanel';
import { RecordingControls } from './components/RecordingControls';
import { useSWMessaging } from './hooks/useSWMessaging';
import { useElementPicker } from './hooks/useElementPicker';
import { useContentCSSTracking } from './hooks/useContentCSSTracking';
import { useScreenshot } from './hooks/useScreenshot';
import type { CSSChange } from '@/shared/types/css-change';

export type WidgetTab = 'capture' | 'describe' | 'changes' | 'submit';

export interface ScreenshotData {
  original: string;
  annotated?: string;
  filename: string;
}

export function WidgetRoot() {
  const [isOpen, setIsOpen] = useState(false);
  const [screenshots, setScreenshots] = useState<ScreenshotData[]>([]);
  const [description, setDescription] = useState('');
  const [changes, setChanges] = useState<CSSChange[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const { port, sendMessage } = useSWMessaging();
  const picker = useElementPicker();
  const tracking = useContentCSSTracking();
  const { captureElement } = useScreenshot(port);

  const beforeScreenshotRef = useRef<string | null>(null);
  const [editNote, setEditNote] = useState('');

  const isEditing = tracking.status.state === 'before_captured';
  const hasContent = screenshots.length > 0 || description.trim() || changes.length > 0;

  // Picker -> panel management
  useEffect(() => {
    if (picker.isPicking) setIsOpen(false);
  }, [picker.isPicking]);

  // When element is picked: capture CSS before + element screenshot (as-is)
  useEffect(() => {
    if (picker.pickedElement) {
      tracking.captureBefore(picker.pickedElement);
      setIsOpen(true);

      // Auto-capture before screenshot
      captureElement(picker.pickedElement)
        .then((dataUrl) => { beforeScreenshotRef.current = dataUrl; })
        .catch(() => { beforeScreenshotRef.current = null; });
    }
  }, [picker.pickedElement, tracking.captureBefore, captureElement]);

  // When capture starts, tell DevTools to inspect the element
  useEffect(() => {
    if (tracking.status.state === 'before_captured' && port.current) {
      port.current.postMessage({
        type: 'INSPECT_ELEMENT',
        selector: tracking.status.selector,
      });
    }
  }, [tracking.status, port]);

  // ── Actions ──
  const handleStartPicking = useCallback(() => {
    beforeScreenshotRef.current = null;
    tracking.reset();
    picker.clearPicked();
    picker.startPicking();
  }, [tracking, picker]);

  const handleCaptureAfter = useCallback(async () => {
    const el = picker.pickedElement;
    const note = editNote.trim();

    // Capture after screenshot (only if there might be CSS changes)
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
      // No CSS diff but has description -> save as note-only change
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

  // Screenshots
  const handleScreenshotCaptured = useCallback((data: ScreenshotData) => {
    setScreenshots((prev) => [...prev, data]);
  }, []);
  const handleScreenshotUpdated = useCallback((index: number, data: ScreenshotData) => {
    setScreenshots((prev) => { const u = [...prev]; u[index] = data; return u; });
  }, []);
  const handleRemoveScreenshot = useCallback((index: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Submit
  const handleSubmitSuccess = useCallback(() => {
    setScreenshots([]);
    setDescription('');
    setChanges([]);
    setShowPreview(false);
  }, []);

  // Auto-open notes when description exists
  useEffect(() => {
    if (description.trim()) setNotesOpen(true);
  }, [description]);

  // ── Editing selector for header bar ──
  const editingSelector = isEditing && tracking.status.state === 'before_captured'
    ? tracking.status.selector
    : '';

  // ── Footer content ──
  const footerContent = (() => {
    if (isEditing) {
      return (
        <div className="qa-footer-actions">
          <button className="qa-btn qa-btn-ghost" onClick={handleResetCapture}>
            Cancel
          </button>
          <button className="qa-btn qa-btn-success qa-footer-primary" onClick={handleCaptureAfter}>
            Capture Changes
          </button>
        </div>
      );
    }

    if (showPreview) return null; // Preview mode handles its own buttons

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

  // ── Preview mode (full panel takeover) ──
  if (showPreview) {
    return (
      <FloatingWidget
        isOpen={isOpen}
        onToggle={() => setIsOpen((p) => !p)}
        isRecording={isRecording}
      >
        <SubmitPanel
          screenshots={screenshots}
          description={description}
          changes={changes}
          sendMessage={sendMessage}
          onSuccess={handleSubmitSuccess}
          onBack={() => setShowPreview(false)}
          isPreview
        />
      </FloatingWidget>
    );
  }

  return (
    <FloatingWidget
      isOpen={isOpen}
      onToggle={() => setIsOpen((p) => !p)}
      isRecording={isRecording}
      footer={footerContent}
    >
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

      {isEditing && (
        <section className="qa-section">
          <h3 className="qa-section-title">Describe Change</h3>
          <textarea
            className="qa-textarea"
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            placeholder="Can't edit via styles? Describe what should change..."
            spellCheck={false}
          />
        </section>
      )}

      {/* ── Normal mode: Changes + Screenshots + Notes ── */}
      {!isEditing && (
        <>
          {/* CSS Changes */}
          <section className="qa-section">
            {changes.length > 0 && <h3 className="qa-section-title">CSS Changes</h3>}
            <ChangesSummary
              changes={changes}
              captureStatus={tracking.status}
              isPicking={picker.isPicking}
              onStartPicking={handleStartPicking}
              onRemoveChange={handleRemoveChange}
              onClearChanges={handleClearChanges}
            />
          </section>

          <hr className="qa-divider" />

          {/* Screenshots */}
          <section className="qa-section">
            <h3 className="qa-section-title">Screenshots</h3>
            <ScreenshotCapture
              screenshots={screenshots}
              onCaptured={handleScreenshotCaptured}
              onUpdated={handleScreenshotUpdated}
              onRemove={handleRemoveScreenshot}
              port={port}
            />
            <div style={{ marginTop: 12 }}>
              <RecordingControls
                isRecording={isRecording}
                onRecordingChange={setIsRecording}
                sendMessage={sendMessage}
              />
            </div>
          </section>

          <hr className="qa-divider" />

          {/* Notes (collapsible) */}
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
    </FloatingWidget>
  );
}
