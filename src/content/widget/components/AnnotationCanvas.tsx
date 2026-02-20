import { useEffect, useRef } from 'react';
import { useAnnotation, type AnnotationTool, type AnnotationColor } from '../hooks/useAnnotation';

interface AnnotationCanvasProps {
  imageSrc: string;
  onSave: (annotatedDataUrl: string) => void;
  onCancel: () => void;
}

const TOOLS: { id: AnnotationTool; icon: string; label: string }[] = [
  { id: 'arrow', icon: 'M5 12h14M12 5l7 7-7 7', label: 'Arrow' },
  { id: 'rectangle', icon: 'M3 3h18v18H3z', label: 'Rectangle' },
  { id: 'freehand', icon: 'M3 17c3-3 6 2 9 0s6-5 9-3', label: 'Freehand' },
  { id: 'text', icon: 'M4 7V4h16v3M9 20h6M12 4v16', label: 'Text' },
];

const COLORS: AnnotationColor[] = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b'];

export function AnnotationCanvas({ imageSrc, onSave, onCancel }: AnnotationCanvasProps) {
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const {
    tool,
    setTool,
    color,
    setColor,
    canvasRef,
    canUndo,
    undo,
    clearAll,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  } = useAnnotation();

  // Load the background image onto the hidden bg canvas
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const bgCanvas = bgCanvasRef.current;
      const drawCanvas = canvasRef.current;
      if (!bgCanvas || !drawCanvas) return;

      bgCanvas.width = img.width;
      bgCanvas.height = img.height;
      drawCanvas.width = img.width;
      drawCanvas.height = img.height;

      const ctx = bgCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
      }
    };
    img.src = imageSrc;
  }, [imageSrc, canvasRef]);

  const handleSave = () => {
    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = canvasRef.current;
    if (!bgCanvas || !drawCanvas) return;

    // Composite: background image + annotations
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = bgCanvas.width;
    outputCanvas.height = bgCanvas.height;
    const ctx = outputCanvas.getContext('2d')!;
    ctx.drawImage(bgCanvas, 0, 0);
    ctx.drawImage(drawCanvas, 0, 0);

    onSave(outputCanvas.toDataURL('image/png'));
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="qa-annotation-toolbar mb-2">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`qa-annotation-tool ${tool === t.id ? 'active' : ''}`}
            onClick={() => setTool(t.id)}
            title={t.label}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={t.icon} />
            </svg>
          </button>
        ))}

        <div className="qa-annotation-divider" />

        {COLORS.map((c) => (
          <button
            key={c}
            className={`qa-annotation-color ${color === c ? 'active' : ''}`}
            style={{ backgroundColor: c }}
            onClick={() => setColor(c)}
          />
        ))}

        <div className="qa-annotation-divider" />

        <button
          className="qa-annotation-tool"
          onClick={undo}
          disabled={!canUndo}
          title="Undo"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 00-9-9H3" />
          </svg>
        </button>

        <button
          className="qa-annotation-tool"
          onClick={clearAll}
          title="Clear All"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
          </svg>
        </button>
      </div>

      {/* Canvas area */}
      <div className="qa-screenshot-container" style={{ position: 'relative' }}>
        <canvas
          ref={bgCanvasRef}
          style={{
            width: '100%',
            display: 'block',
          }}
        />
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            cursor: tool === 'text' ? 'text' : 'crosshair',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mt-2">
        <button className="qa-btn qa-btn-primary flex-1" onClick={handleSave}>
          Save Annotation
        </button>
        <button className="qa-btn qa-btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
