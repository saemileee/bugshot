import { useState, useRef, useCallback } from 'react';

export type AnnotationTool = 'arrow' | 'rectangle' | 'freehand' | 'text';
export type AnnotationColor = '#ef4444' | '#3b82f6' | '#22c55e' | '#f59e0b';

interface DrawState {
  isDrawing: boolean;
  startX: number;
  startY: number;
}

export function useAnnotation() {
  const [tool, setTool] = useState<AnnotationTool>('arrow');
  const [color, setColor] = useState<AnnotationColor>('#ef4444');
  const [strokeWidth] = useState(3);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawStateRef = useRef<DrawState>({ isDrawing: false, startX: 0, startY: 0 });
  const historyRef = useRef<ImageData[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  const saveToHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    historyRef.current.push(imageData);
    setCanUndo(true);
  }, []);

  const undo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    historyRef.current.pop(); // Remove current state
    if (historyRef.current.length > 0) {
      ctx.putImageData(historyRef.current[historyRef.current.length - 1], 0, 0);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setCanUndo(false);
    }
  }, []);

  const clearAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    historyRef.current = [];
    setCanUndo(false);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    saveToHistory();
    drawStateRef.current = { isDrawing: true, startX: x, startY: y };

    if (tool === 'freehand') {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  }, [tool, saveToHistory]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !drawStateRef.current.isDrawing) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (tool === 'freehand') {
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (tool === 'rectangle' || tool === 'arrow') {
      // For rectangle/arrow, redraw from history on each move
      if (historyRef.current.length > 0) {
        ctx.putImageData(historyRef.current[historyRef.current.length - 1], 0, 0);
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';

      const { startX, startY } = drawStateRef.current;

      if (tool === 'rectangle') {
        ctx.strokeRect(startX, startY, x - startX, y - startY);
      } else if (tool === 'arrow') {
        drawArrow(ctx, startX, startY, x, y, color, strokeWidth);
      }
    }
  }, [tool, color, strokeWidth]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !drawStateRef.current.isDrawing) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (tool === 'text') {
      const text = prompt('Enter text:');
      if (text) {
        saveToHistory();
        ctx.font = `bold ${16 * scaleX}px sans-serif`;
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
      }
    }

    drawStateRef.current.isDrawing = false;

    // Save final state after drawing
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    historyRef.current[historyRef.current.length - 1] = imageData;
  }, [tool, color, saveToHistory]);

  return {
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
  };
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  width: number,
) {
  const headLength = 15;
  const angle = Math.atan2(toY - fromY, toX - fromX);

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;

  // Line
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headLength * Math.cos(angle - Math.PI / 6),
    toY - headLength * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    toX - headLength * Math.cos(angle + Math.PI / 6),
    toY - headLength * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
}
