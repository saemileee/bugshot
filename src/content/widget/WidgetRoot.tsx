import { useState, useCallback, useEffect } from 'react';
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

  const { port, sendMessage } = useSWMessaging();
  const picker = useElementPicker();
  const tracking = useContentCSSTracking();

  const isEditing = tracking.status.state === 'before_captured';

  // Picker ↔ panel management
  useEffect(() => {
    if (picker.isPicking) setIsOpen(false);
  }, [picker.isPicking]);

  useEffect(() => {
    if (picker.pickedElement) {
      tracking.captureBefore(picker.pickedElement);
      setIsOpen(true);
    }
  }, [picker.pickedElement, tracking.captureBefore]);

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
    tracking.reset();
    picker.clearPicked();
    picker.startPicking();
  }, [tracking, picker]);

  const handleCaptureAfter = useCallback(() => {
    const change = tracking.captureAfter();
    if (change) setChanges((prev) => [...prev, change]);
  }, [tracking]);

  const handleResetCapture = useCallback(() => {
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
  }, []);

  return (
    <FloatingWidget
      isOpen={isOpen}
      onToggle={() => setIsOpen((p) => !p)}
      isRecording={isRecording}
    >
      {/* ── Section: CSS Changes ── */}
      <section className="qa-section">
        <h3 className="qa-section-title">CSS Changes</h3>
        <ChangesSummary
          changes={changes}
          captureStatus={tracking.status}
          isPicking={picker.isPicking}
          onStartPicking={handleStartPicking}
          onCaptureAfter={handleCaptureAfter}
          onResetCapture={handleResetCapture}
          onRemoveChange={handleRemoveChange}
          onClearChanges={handleClearChanges}
        />
      </section>

      {/* ── Section: Style Editor (visible when editing) ── */}
      {isEditing && picker.pickedElement && (
        <>
          <hr className="qa-divider" />
          <section className="qa-section qa-section-styles">
            <h3 className="qa-section-title">Styles</h3>
            <StyleEditor
              element={picker.pickedElement}
              selector={
                tracking.status.state === 'before_captured'
                  ? tracking.status.selector
                  : ''
              }
            />
          </section>
        </>
      )}

      <hr className="qa-divider" />

      {/* ── Section: Screenshots ── */}
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

      {/* ── Section: Notes ── */}
      <section className="qa-section">
        <h3 className="qa-section-title">Notes</h3>
        <ManualDescription
          description={description}
          onDescriptionChange={setDescription}
        />
      </section>

      <hr className="qa-divider" />

      {/* ── Section: Submit ── */}
      <section className="qa-section">
        <SubmitPanel
          screenshots={screenshots}
          description={description}
          changes={changes}
          sendMessage={sendMessage}
          onSuccess={handleSubmitSuccess}
        />
      </section>
    </FloatingWidget>
  );
}
