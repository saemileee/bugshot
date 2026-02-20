import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';

interface FloatingWidgetProps {
  isOpen: boolean;
  onToggle: () => void;
  isRecording: boolean;
  children: ReactNode;
  footer?: ReactNode;
}

const MIN_W = 360;
const MIN_H = 320;
const DEFAULT_W = 420;
const DEFAULT_H = 560;

export function FloatingWidget({
  isOpen,
  onToggle,
  isRecording,
  children,
  footer,
}: FloatingWidgetProps) {
  const [btnPos, setBtnPos] = useState({ x: 20, y: 20 });
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // ── Button drag ──
  const handleBtnMouseDown = useCallback((e: React.MouseEvent) => {
    if (isOpen) return;
    isDragging.current = true;
    dragOffset.current = { x: e.clientX - btnPos.x, y: e.clientY - btnPos.y };
    e.preventDefault();
  }, [isOpen, btnPos]);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!isDragging.current) return;
      setBtnPos({
        x: Math.max(0, Math.min(window.innerWidth - 40, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOffset.current.y)),
      });
    };
    const up = () => { isDragging.current = false; };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
  }, []);

  // ── Panel resize (top-left handle) ──
  const handleResizeDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.w;
    const startH = size.h;

    const move = (ev: MouseEvent) => {
      const dw = startX - ev.clientX;
      const dh = startY - ev.clientY;
      setSize({
        w: Math.max(MIN_W, Math.min(900, startW + dw)),
        h: Math.max(MIN_H, Math.min(window.innerHeight - 80, startH + dh)),
      });
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }, [size]);

  return (
    <>
      {/* Floating trigger */}
      <div
        className="qa-trigger"
        style={{ right: btnPos.x, bottom: btnPos.y, left: 'auto', top: 'auto' }}
        onMouseDown={handleBtnMouseDown}
        onClick={() => { if (!isDragging.current) onToggle(); }}
        title="Design QA Helper"
      >
        {isRecording && (
          <div className="qa-recording-dot" style={{ position: 'absolute', top: 2, right: 2 }} />
        )}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
          <polyline points="10 17 15 12 10 7" />
          <line x1="15" y1="12" x2="3" y2="12" />
        </svg>
      </div>

      {/* Panel */}
      {isOpen && (
        <div
          className="qa-panel qa-slide-in"
          style={{
            right: btnPos.x,
            bottom: btnPos.y + 46,
            left: 'auto',
            top: 'auto',
            width: size.w,
            height: size.h,
          }}
        >
          {/* Resize handle (top-left) */}
          <div className="qa-resize-handle" onMouseDown={handleResizeDown} />

          {/* Header */}
          <div className="qa-panel-header">
            <h2>Design QA</h2>
            <button className="qa-panel-close" onClick={onToggle} title="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Scrollable body */}
          <div className="qa-panel-scroll">
            {children}
          </div>

          {/* Fixed footer */}
          {footer && (
            <div className="qa-panel-footer">
              {footer}
            </div>
          )}
        </div>
      )}
    </>
  );
}
