import { useEffect, useRef } from 'react';
import { useAnnotation, type AnnotationTool, type AnnotationColor } from '../hooks/useAnnotation';
import { cn } from '@/shared/utils/cn';
import { Button } from './ui/button';
import { Undo, Trash2 } from 'lucide-react';

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
      <div className="flex items-center gap-1 p-2 bg-gray-800 rounded-md mb-2">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={cn(
              'w-7 h-7 flex items-center justify-center rounded cursor-pointer bg-transparent border-none text-slate-400',
              'hover:bg-gray-700 hover:text-slate-200',
              tool === t.id && 'bg-blue-600 text-white'
            )}
            onClick={() => setTool(t.id)}
            title={t.label}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={t.icon} />
            </svg>
          </button>
        ))}

        <div className="w-px h-5 bg-gray-600 mx-0.5" />

        {COLORS.map((c) => (
          <button
            key={c}
            className={cn(
              'w-5 h-5 rounded-full cursor-pointer border-2 border-transparent',
              color === c && 'border-white'
            )}
            style={{ backgroundColor: c }}
            onClick={() => setColor(c)}
          />
        ))}

        <div className="w-px h-5 bg-gray-600 mx-0.5" />

        <button
          className={cn(
            'w-7 h-7 flex items-center justify-center rounded cursor-pointer bg-transparent border-none text-slate-400',
            'hover:bg-gray-700 hover:text-slate-200',
            !canUndo && 'opacity-50 cursor-not-allowed'
          )}
          onClick={undo}
          disabled={!canUndo}
          title="Undo"
        >
          <Undo className="w-4 h-4" />
        </button>

        <button
          className={cn(
            'w-7 h-7 flex items-center justify-center rounded cursor-pointer bg-transparent border-none text-slate-400',
            'hover:bg-gray-700 hover:text-slate-200'
          )}
          onClick={clearAll}
          title="Clear All"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Canvas area */}
      <div className="relative border border-gray-200 rounded-md overflow-hidden bg-gray-50">
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
        <Button variant="default" className="flex-1" onClick={handleSave}>
          Save Annotation
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
