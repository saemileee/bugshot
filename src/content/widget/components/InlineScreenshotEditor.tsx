import { useState, useEffect, useRef, useCallback } from 'react';
import { useAnnotation, type AnnotationTool, type AnnotationColor } from '../hooks/useAnnotation';
import { cn } from '@/shared/utils/cn';
import { Undo, Trash2, Check, X, Pencil } from 'lucide-react';
import type { ScreenshotData } from '../WidgetRoot';

interface InlineScreenshotEditorProps {
  screenshot: ScreenshotData;
  index: number;
  onUpdate: (index: number, data: ScreenshotData) => void;
  onRemove: (index: number) => void;
}

const TOOLS: { id: AnnotationTool; icon: string; label: string }[] = [
  { id: 'arrow', icon: 'M5 12h14M12 5l7 7-7 7', label: 'Arrow' },
  { id: 'rectangle', icon: 'M3 3h18v18H3z', label: 'Rectangle' },
  { id: 'freehand', icon: 'M3 17c3-3 6 2 9 0s6-5 9-3', label: 'Freehand' },
  { id: 'text', icon: 'M4 7V4h16v3M9 20h6M12 4v16', label: 'Text' },
];

const COLORS: AnnotationColor[] = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b'];

export function InlineScreenshotEditor({
  screenshot,
  index,
  onUpdate,
  onRemove,
}: InlineScreenshotEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

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
    resetCanvas,
  } = useAnnotation();

  const imageSrc = screenshot.annotated || screenshot.original;

  // Load image when editing starts
  useEffect(() => {
    if (!isEditing) return;

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
  }, [isEditing, imageSrc, canvasRef]);

  const handleSave = useCallback(() => {
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

    const annotatedDataUrl = outputCanvas.toDataURL('image/png');

    onUpdate(index, {
      ...screenshot,
      annotated: annotatedDataUrl,
      filename: screenshot.filename.replace('.png', '-annotated.png'),
    });

    setIsEditing(false);
    resetCanvas();
  }, [canvasRef, index, screenshot, onUpdate, resetCanvas]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    resetCanvas();
  }, [resetCanvas]);

  const handleStartEdit = useCallback(() => {
    setIsEditing(true);
  }, []);

  return (
    <div ref={containerRef} className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-medium text-gray-700">
          Screenshot {index + 1}
        </span>
        <div className="flex items-center gap-1">
          {!isEditing && (
            <>
              <button
                className="inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-500 bg-transparent border-none rounded cursor-pointer transition-colors hover:bg-gray-100 hover:text-gray-700"
                onClick={handleStartEdit}
              >
                <Pencil className="w-3 h-3" />
                Annotate
              </button>
              <button
                className="flex items-center justify-center w-6 h-6 p-0 border-none bg-transparent cursor-pointer text-gray-400 hover:text-red-500"
                onClick={() => onRemove(index)}
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
            </>
          )}
          {isEditing && (
            <>
              <button
                className="inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] font-medium text-green-600 bg-green-50 border-none rounded cursor-pointer transition-colors hover:bg-green-100"
                onClick={handleSave}
              >
                <Check className="w-3 h-3" />
                Save
              </button>
              <button
                className="inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-500 bg-transparent border-none rounded cursor-pointer transition-colors hover:bg-gray-100"
                onClick={handleCancel}
              >
                <X className="w-3 h-3" />
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Annotation toolbar (only when editing) */}
      {isEditing && (
        <div className="flex items-center gap-1 p-2 bg-gray-800">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={cn(
                'w-6 h-6 flex items-center justify-center rounded cursor-pointer bg-transparent border-none text-slate-400',
                'hover:bg-gray-700 hover:text-slate-200',
                tool === t.id && 'bg-blue-600 text-white'
              )}
              onClick={() => setTool(t.id)}
              title={t.label}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={t.icon} />
              </svg>
            </button>
          ))}

          <div className="w-px h-4 bg-gray-600 mx-1" />

          {COLORS.map((c) => (
            <button
              key={c}
              className={cn(
                'w-4 h-4 rounded-full cursor-pointer border-2 border-transparent',
                color === c && 'border-white'
              )}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            />
          ))}

          <div className="w-px h-4 bg-gray-600 mx-1" />

          <button
            className={cn(
              'w-6 h-6 flex items-center justify-center rounded cursor-pointer bg-transparent border-none text-slate-400',
              'hover:bg-gray-700 hover:text-slate-200',
              !canUndo && 'opacity-50 cursor-not-allowed'
            )}
            onClick={undo}
            disabled={!canUndo}
            title="Undo"
          >
            <Undo className="w-3.5 h-3.5" />
          </button>

          <button
            className={cn(
              'w-6 h-6 flex items-center justify-center rounded cursor-pointer bg-transparent border-none text-slate-400',
              'hover:bg-gray-700 hover:text-slate-200'
            )}
            onClick={clearAll}
            title="Clear All"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Image / Canvas */}
      {isEditing ? (
        <div className="relative bg-gray-100">
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
      ) : (
        <img
          className="w-full block cursor-pointer"
          src={imageSrc}
          alt={`Screenshot ${index + 1}`}
          onClick={handleStartEdit}
          title="Click to annotate"
        />
      )}
    </div>
  );
}
