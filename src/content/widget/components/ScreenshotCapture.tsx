import { useState, type MutableRefObject } from 'react';
import { useScreenshot } from '../hooks/useScreenshot';
import { AnnotationCanvas } from './AnnotationCanvas';
import type { ScreenshotData } from '../WidgetRoot';

interface ScreenshotCaptureProps {
  screenshots: ScreenshotData[];
  onCaptured: (data: ScreenshotData) => void;
  onUpdated: (index: number, data: ScreenshotData) => void;
  onRemove: (index: number) => void;
  port: MutableRefObject<chrome.runtime.Port | null>;
}

export function ScreenshotCapture({
  screenshots,
  onCaptured,
  onUpdated,
  onRemove,
  port,
}: ScreenshotCaptureProps) {
  const { captureFullPage } = useScreenshot(port);
  const [isCapturing, setIsCapturing] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const handleCapture = async () => {
    setIsCapturing(true);
    try {
      const dataUrl = await captureFullPage();
      const filename = `screenshot-${Date.now()}.png`;
      onCaptured({ original: dataUrl, filename });
    } catch (err) {
      console.error('Screenshot failed:', err);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleAnnotationSave = (annotatedDataUrl: string) => {
    if (editingIndex === null) return;
    const existing = screenshots[editingIndex];
    onUpdated(editingIndex, {
      ...existing,
      annotated: annotatedDataUrl,
      filename: existing.filename.replace('.png', '-annotated.png'),
    });
    setEditingIndex(null);
  };

  // Annotation mode
  if (editingIndex !== null && screenshots[editingIndex]) {
    return (
      <AnnotationCanvas
        imageSrc={screenshots[editingIndex].annotated || screenshots[editingIndex].original}
        onSave={handleAnnotationSave}
        onCancel={() => setEditingIndex(null)}
      />
    );
  }

  return (
    <div>
      <button
        className="qa-btn qa-btn-primary qa-btn-block qa-btn-lg mb-3"
        onClick={handleCapture}
        disabled={isCapturing}
      >
        {isCapturing ? 'Capturing...' : 'Take Screenshot'}
      </button>

      {screenshots.length === 0 ? (
        <div className="qa-screenshot-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span className="text-xs">Capture a screenshot to start</span>
        </div>
      ) : (
        <div className="space-y-2">
          {screenshots.map((ss, i) => (
            <div key={i} className="qa-screenshot-container">
              <img src={ss.annotated || ss.original} alt={`Screenshot ${i + 1}`} />
              <div
                className="flex gap-1 p-1.5"
                style={{ background: 'rgba(0,0,0,0.03)' }}
              >
                <button
                  className="qa-btn qa-btn-secondary flex-1"
                  onClick={() => setEditingIndex(i)}
                >
                  Annotate
                </button>
                <button
                  className="qa-btn qa-btn-danger"
                  onClick={() => onRemove(i)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <button
            className="qa-btn qa-btn-secondary qa-btn-block"
            onClick={handleCapture}
            disabled={isCapturing}
          >
            + Add Another Screenshot
          </button>
        </div>
      )}
    </div>
  );
}
