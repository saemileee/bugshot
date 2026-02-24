import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';
import { MousePointer, Camera, Circle, Square, LayoutGrid, Settings } from 'lucide-react';

export type ToolbarTab = 'changes' | 'settings' | null;

interface FloatingWidgetProps {
  activeTab: ToolbarTab;
  onTabChange: (tab: ToolbarTab) => void;
  isRecording: boolean;
  isPicking: boolean;
  isCapturing?: boolean;
  isPreviewMode?: boolean;
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
  isPreviewMode,
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
  const [panelFlash, setPanelFlash] = useState(false);
  const isDragging = useRef<'bar' | 'panel' | false>(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const isPanelOpen = activeTab !== null;

  // Flash panel when toolbar action is blocked in preview mode
  const flashPanel = useCallback(() => {
    setPanelFlash(true);
    setTimeout(() => setPanelFlash(false), 600);
  }, []);

  // ── Toolbar drag ──
  const handleBarMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-bar-btn]')) return;
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

  // Hide panel while recording (but keep toolbar visible for stop button)
  const showPanel = isPanelOpen && !isRecording;

  return (
    <>
      {/* ── Y-axis Panel (draggable) ── */}
      {showPanel && (
        <div
          className={cn(
            'fixed z-[99999] bg-white rounded-xl overflow-hidden pointer-events-auto flex flex-col',
            'shadow-[0_4px_24px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)]',
            'animate-slide-in',
            panelFlash && 'animate-panel-flash'
          )}
          style={{
            right: panelPos.right,
            top: panelPos.top,
            width: panelW,
            height: panelH,
          }}
        >
          {/* Drag handle */}
          <div
            className="flex-shrink-0 flex items-center justify-center h-[18px] cursor-grab active:cursor-grabbing select-none"
            onMouseDown={handlePanelDragDown}
          >
            <svg width="24" height="4" viewBox="0 0 24 4" fill="currentColor" className="opacity-30">
              <rect x="0" y="0" width="24" height="1.5" rx="1" />
              <rect x="0" y="3" width="24" height="1.5" rx="1" />
            </svg>
          </div>

          <div className="flex-1 overflow-y-auto flex flex-col">
            {children}
          </div>

          {footer && (
            <div className="flex-shrink-0 border-t border-slate-100 px-4 py-3 bg-[#fafbfc]">
              {footer}
            </div>
          )}

          {/* Resize handle (bottom-left) */}
          <div
            className="absolute bottom-0 left-0 w-4 h-4 z-10 cursor-nesw-resize after:absolute after:bottom-1 after:left-1 after:w-2 after:h-2 after:opacity-50 hover:after:opacity-100"
            style={{
              backgroundImage: 'linear-gradient(225deg, transparent 3px, #cbd5e1 3px, #cbd5e1 4px, transparent 4px)',
              backgroundSize: '5px 5px',
            }}
            onMouseDown={handleResizeDown}
          />
        </div>
      )}

      {/* ── X-axis Toolbar (always visible) ── */}
      <div
        className="fixed z-[99999] flex items-center gap-0.5 p-1 bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)] pointer-events-auto select-none"
        style={{ left: barPos.left, bottom: barPos.bottom }}
        onMouseDown={handleBarMouseDown}
      >
        {/* Drag grip */}
        <div className="flex items-center justify-center w-3.5 h-8 text-slate-300 cursor-grab active:cursor-grabbing flex-shrink-0">
          <svg width="6" height="14" viewBox="0 0 6 14" fill="currentColor">
            <circle cx="1.5" cy="1.5" r="1" /><circle cx="4.5" cy="1.5" r="1" />
            <circle cx="1.5" cy="5" r="1" /><circle cx="4.5" cy="5" r="1" />
            <circle cx="1.5" cy="8.5" r="1" /><circle cx="4.5" cy="8.5" r="1" />
            <circle cx="1.5" cy="12" r="1" /><circle cx="4.5" cy="12" r="1" />
          </svg>
        </div>

        <div className="w-px h-5 bg-slate-200 mx-0.5 flex-shrink-0" />

        {/* Pick Element */}
        <button
          data-bar-btn
          className={cn(
            'relative w-8 h-8 flex items-center justify-center rounded-lg border-none bg-transparent cursor-pointer text-slate-400 transition-all flex-shrink-0',
            'hover:bg-slate-100 hover:text-slate-600',
            isPicking && 'bg-slate-100 text-slate-800',
            isPreviewMode && 'opacity-40 cursor-not-allowed'
          )}
          onClick={isPreviewMode ? flashPanel : onPickElement}
          title={isPicking ? 'Picking...' : isPreviewMode ? 'Exit preview to pick elements' : 'Pick Element'}
        >
          {isPicking ? (
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse-opacity" />
          ) : (
            <MousePointer className="w-4 h-4" />
          )}
        </button>

        {/* Screenshot */}
        <button
          data-bar-btn
          className={cn(
            'relative w-8 h-8 flex items-center justify-center rounded-lg border-none bg-transparent cursor-pointer text-slate-400 transition-all flex-shrink-0',
            'hover:bg-slate-100 hover:text-slate-600',
            isCapturing && 'bg-slate-100 text-slate-800',
            isPreviewMode && 'opacity-40 cursor-not-allowed'
          )}
          onClick={isPreviewMode ? flashPanel : onScreenshot}
          disabled={isCapturing}
          title={isPreviewMode ? 'Exit preview to take screenshots' : 'Take Screenshot'}
        >
          <Camera className="w-4 h-4" />
        </button>

        {/* Record */}
        <button
          data-bar-btn
          className={cn(
            'relative w-8 h-8 flex items-center justify-center rounded-lg border-none bg-transparent cursor-pointer text-slate-400 transition-all flex-shrink-0',
            'hover:bg-slate-100 hover:text-slate-600',
            isRecording && 'bg-red-50 text-red-500 animate-pulse-opacity',
            isPreviewMode && !isRecording && 'opacity-40 cursor-not-allowed'
          )}
          onClick={isPreviewMode && !isRecording ? flashPanel : onRecordToggle}
          title={isRecording ? 'Stop Recording' : isPreviewMode ? 'Exit preview to record' : 'Record Screen'}
        >
          {isRecording ? (
            <Square className="w-4 h-4 fill-current" />
          ) : (
            <Circle className="w-4 h-4" />
          )}
        </button>

        <div className="w-px h-5 bg-slate-200 mx-0.5 flex-shrink-0" />

        {/* Changes tab */}
        <button
          data-bar-btn
          className={cn(
            'relative w-8 h-8 flex items-center justify-center rounded-lg border-none bg-transparent cursor-pointer text-slate-400 transition-all flex-shrink-0',
            'hover:bg-slate-100 hover:text-slate-600',
            activeTab === 'changes' && 'bg-slate-100 text-slate-800'
          )}
          onClick={() => handleTabClick('changes')}
          title="Changes"
        >
          <LayoutGrid className="w-4 h-4" />
          {hasContent && (
            <span className="absolute top-1 right-1 w-[7px] h-[7px] rounded-full bg-blue-500 border-[1.5px] border-white" />
          )}
        </button>

        {/* Settings tab */}
        <button
          data-bar-btn
          className={cn(
            'relative w-8 h-8 flex items-center justify-center rounded-lg border-none bg-transparent cursor-pointer text-slate-400 transition-all flex-shrink-0',
            'hover:bg-slate-100 hover:text-slate-600',
            activeTab === 'settings' && 'bg-slate-100 text-slate-800'
          )}
          onClick={() => handleTabClick('settings')}
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </>
  );
}
