import { AnnotationCanvas } from './AnnotationCanvas';
import type { ScreenshotData } from '../WidgetRoot';

interface ScreenshotCaptureProps {
  screenshots: ScreenshotData[];
  editingIndex: number | null;
  onEditingChange: (index: number | null) => void;
  onUpdated: (index: number, data: ScreenshotData) => void;
  onRemove: (index: number) => void;
}

export function ScreenshotCapture({
  screenshots,
  editingIndex,
  onEditingChange,
  onUpdated,
  onRemove,
}: ScreenshotCaptureProps) {

  const handleAnnotationSave = (annotatedDataUrl: string) => {
    if (editingIndex === null) return;
    const existing = screenshots[editingIndex];
    onUpdated(editingIndex, {
      ...existing,
      annotated: annotatedDataUrl,
      filename: existing.filename.replace('.png', '-annotated.png'),
    });
    onEditingChange(null);
  };

  // Annotation mode
  if (editingIndex !== null && screenshots[editingIndex]) {
    return (
      <AnnotationCanvas
        imageSrc={screenshots[editingIndex].annotated || screenshots[editingIndex].original}
        onSave={handleAnnotationSave}
        onCancel={() => onEditingChange(null)}
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
              onClick={() => onEditingChange(i)}
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
