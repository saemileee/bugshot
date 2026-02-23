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

  // Only render annotation mode
  if (editingIndex !== null && screenshots[editingIndex]) {
    return (
      <AnnotationCanvas
        imageSrc={screenshots[editingIndex].annotated || screenshots[editingIndex].original}
        onSave={handleAnnotationSave}
        onCancel={() => onEditingChange(null)}
      />
    );
  }

  return null;
}
