import { useState } from 'react';
import { AnnotationCanvas } from './AnnotationCanvas';
import type { ScreenshotData } from '../WidgetRoot';

interface ScreenshotCaptureProps {
  screenshots: ScreenshotData[];
  onUpdated: (index: number, data: ScreenshotData) => void;
  onRemove: (index: number) => void;
}

export function ScreenshotCapture({
  screenshots,
  onUpdated,
  onRemove,
}: ScreenshotCaptureProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

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

  if (screenshots.length === 0) {
    return (
      <div className="qa-empty-hint">
        Use the toolbar to capture screenshots
      </div>
    );
  }

  return (
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
    </div>
  );
}
