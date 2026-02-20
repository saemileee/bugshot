import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';

export type ToolbarTab = 'changes' | 'settings' | null;

interface FloatingWidgetProps {
  activeTab: ToolbarTab;
  onTabChange: (tab: ToolbarTab) => void;
  isRecording: boolean;
  isPicking: boolean;
  isCapturing?: boolean;
  hasContent: boolean;
  onPickElement: () => void;
  onScreenshot: () => void;
  onRecordToggle: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

const MIN_W = 360;
const DEFAULT_W = 400;
const PANEL_H = 600;

export function FloatingWidget({
  activeTab,
  onTabChange,
  isRecording,
  isPicking,
  isCapturing,
  hasContent,
  onPickElement,
  onScreenshot,
  onRecordToggle,
  children,
  footer,
}: FloatingWidgetProps) {
  // Bar: centered bottom, draggable
  const [barPos, setBarPos] = useState(() => ({
    left: Math.round((window.innerWidth - 300) / 2),
    bottom: 20,
  }));
  // Panel: right side, draggable
  const [panelPos, setPanelPos] = useState(() => ({
    right: 12,
    top: Math.max(12, Math.round((window.innerHeight - PANEL_H) / 2)),
  }));
  const [panelW, setPanelW] = useState(DEFAULT_W);
  const [panelH, setPanelH] = useState(PANEL_H);
  const isDragging = useRef<'bar' | 'panel' | false>(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const isPanelOpen = activeTab !== null;

  // ── Toolbar drag ──
  const handleBarMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.qa-bar-btn')) return;
    isDragging.current = 'bar';
    dragOffset.current = { x: e.clientX - barPos.left, y: e.clientY + barPos.bottom };
    e.preventDefault();
  }, [barPos]);

  // ── Panel drag ──
  const handlePanelDragDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = 'panel';
    dragOffset.current = { x: e.clientX + panelPos.right, y: e.clientY - panelPos.top };
    e.preventDefault();
  }, [panelPos]);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (isDragging.current === 'bar') {
        setBarPos({
          left: Math.max(0, Math.min(window.innerWidth - 200, e.clientX - dragOffset.current.x)),
          bottom: Math.max(0, Math.min(window.innerHeight - 44, dragOffset.current.y - e.clientY)),
        });
      } else if (isDragging.current === 'panel') {
        setPanelPos({
          right: Math.max(0, Math.min(window.innerWidth - MIN_W, dragOffset.current.x - e.clientX)),
          top: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.current.y)),
        });
      }
    };
    const up = () => { isDragging.current = false; };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
  }, []);

  // ── Panel resize (bottom-left corner) ──
  const handleResizeDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = panelW;
    const startH = panelH;

    const move = (ev: MouseEvent) => {
      setPanelW(Math.max(MIN_W, Math.min(700, startW + (startX - ev.clientX))));
      setPanelH(Math.max(300, Math.min(window.innerHeight - 40, startH + (ev.clientY - startY))));
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }, [panelW, panelH]);

  const handleTabClick = useCallback((tab: ToolbarTab) => {
    onTabChange(activeTab === tab ? null : tab);
  }, [activeTab, onTabChange]);

  return (
    <>
      {/* ── Y-axis Panel (draggable) ── */}
      {isPanelOpen && (
        <div
          className="qa-panel qa-slide-in"
          style={{
            right: panelPos.right,
            top: panelPos.top,
            width: panelW,
            height: panelH,
          }}
        >
          {/* Drag handle */}
          <div className="qa-panel-drag" onMouseDown={handlePanelDragDown}>
            <svg width="24" height="4" viewBox="0 0 24 4" fill="currentColor" opacity="0.3">
              <rect x="0" y="0" width="24" height="1.5" rx="1" />
              <rect x="0" y="3" width="24" height="1.5" rx="1" />
            </svg>
          </div>

          <div className="qa-panel-scroll">
            {children}
          </div>

          {footer && (
            <div className="qa-panel-footer">
              {footer}
            </div>
          )}

          {/* Resize handle (bottom-left) */}
          <div className="qa-resize-handle" onMouseDown={handleResizeDown} />
        </div>
      )}

      {/* ── X-axis Toolbar (always visible) ── */}
      <div
        className="qa-bar"
        style={{ left: barPos.left, bottom: barPos.bottom }}
        onMouseDown={handleBarMouseDown}
      >
        {/* Drag grip */}
        <div className="qa-bar-grip">
          <svg width="6" height="14" viewBox="0 0 6 14" fill="currentColor">
            <circle cx="1.5" cy="1.5" r="1" /><circle cx="4.5" cy="1.5" r="1" />
            <circle cx="1.5" cy="5" r="1" /><circle cx="4.5" cy="5" r="1" />
            <circle cx="1.5" cy="8.5" r="1" /><circle cx="4.5" cy="8.5" r="1" />
            <circle cx="1.5" cy="12" r="1" /><circle cx="4.5" cy="12" r="1" />
          </svg>
        </div>

        <div className="qa-bar-divider" />

        {/* Pick Element */}
        <button
          className={`qa-bar-btn ${isPicking ? 'active' : ''}`}
          onClick={onPickElement}
          title={isPicking ? 'Picking...' : 'Pick Element'}
        >
          {isPicking ? (
            <span className="qa-bar-dot" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
              <path d="M13 13l6 6" />
            </svg>
          )}
        </button>

        {/* Screenshot */}
        <button
          className={`qa-bar-btn ${isCapturing ? 'active' : ''}`}
          onClick={onScreenshot}
          disabled={isCapturing}
          title="Take Screenshot"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </button>

        {/* Record */}
        <button
          className={`qa-bar-btn ${isRecording ? 'recording' : ''}`}
          onClick={onRecordToggle}
          title={isRecording ? 'Stop Recording' : 'Record Screen'}
        >
          {isRecording ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="4" fill="currentColor" />
            </svg>
          )}
        </button>

        <div className="qa-bar-divider" />

        {/* Changes tab */}
        <button
          className={`qa-bar-btn ${activeTab === 'changes' ? 'active' : ''}`}
          onClick={() => handleTabClick('changes')}
          title="Changes"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" />
          </svg>
          {hasContent && <span className="qa-bar-badge" />}
        </button>

        {/* Settings tab */}
        <button
          className={`qa-bar-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => handleTabClick('settings')}
          title="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </>
  );
}
