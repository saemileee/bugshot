import { useState, useCallback, useEffect, useRef } from 'react';

interface RegionSelectorProps {
  onRegionSelected: (region: { x: number; y: number; width: number; height: number }) => void;
  onCancel: () => void;
}

export function RegionSelector({ onRegionSelected, onCancel }: RegionSelectorProps) {
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // Calculate selection rectangle
  const getSelectionRect = useCallback(() => {
    if (!startPos || !currentPos) return null;

    const x = Math.min(startPos.x, currentPos.x);
    const y = Math.min(startPos.y, currentPos.y);
    const width = Math.abs(currentPos.x - startPos.x);
    const height = Math.abs(currentPos.y - startPos.y);

    return { x, y, width, height };
  }, [startPos, currentPos]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start selection on left click
    if (e.button !== 0) return;

    setStartPos({ x: e.clientX, y: e.clientY });
    setCurrentPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!startPos) return;

    // Throttle with RAF to prevent excessive re-renders
    if (rafIdRef.current !== null) return;

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      setCurrentPos({ x: e.clientX, y: e.clientY });
    });
  }, [startPos]);

  const handleMouseUp = useCallback(() => {
    if (!startPos || !currentPos) return;

    const rect = getSelectionRect();
    if (rect && rect.width > 10 && rect.height > 10) {
      // Only complete if selection is large enough (prevent accidental clicks)
      onRegionSelected(rect);
    } else {
      // Too small, treat as cancel
      onCancel();
    }
  }, [startPos, currentPos, getSelectionRect, onRegionSelected, onCancel]);

  // Attach mouse listeners when selection starts
  useEffect(() => {
    if (!startPos) return;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [startPos, handleMouseMove, handleMouseUp]);

  // Handle ESC key to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const selectionRect = getSelectionRect();

  return (
    <div
      className="fixed inset-0 z-[100000] cursor-crosshair"
      onMouseDown={handleMouseDown}
      style={{ pointerEvents: 'auto' }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Selection rectangle */}
      {selectionRect && selectionRect.width > 0 && selectionRect.height > 0 && (
        <>
          {/* Clear selected area */}
          <div
            className="absolute bg-transparent border-2 border-blue-500"
            style={{
              left: selectionRect.x,
              top: selectionRect.y,
              width: selectionRect.width,
              height: selectionRect.height,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)',
            }}
          />

          {/* Dimension label */}
          <div
            className="absolute bg-blue-500 text-white text-xs px-2 py-1 rounded pointer-events-none"
            style={{
              left: selectionRect.x,
              top: Math.max(0, selectionRect.y - 28),
            }}
          >
            {Math.round(selectionRect.width)} × {Math.round(selectionRect.height)}
          </div>
        </>
      )}

      {/* Instructions */}
      {!startPos && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg text-sm text-slate-700 pointer-events-none">
          드래그하여 영역을 선택하세요 • ESC로 취소
        </div>
      )}
    </div>
  );
}
