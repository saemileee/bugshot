/**
 * Shared Action Toolbar Component
 * Used by both widget (FloatingWidget) and side panel (SidePanelRoot)
 */

import { MousePointer2, Camera, Crop, Video, Square } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

export interface ActionToolbarProps {
  // States
  isPicking: boolean;
  isCapturing: boolean;
  isRecording: boolean;
  isDisabled?: boolean; // For preview mode, editing mode, etc.

  // Handlers
  onPickElement: () => void;
  onScreenshot: () => void;
  onRegionScreenshot: () => void;
  onRecordToggle: () => void;

  // Optional: for disabled state tooltip hints
  disabledReason?: string;

  // Variant: 'compact' for widget (icon only), 'full' for panel (icon + text)
  variant?: 'compact' | 'full';

  // Optional class for container
  className?: string;
}

export function ActionToolbar({
  isPicking,
  isCapturing,
  isRecording,
  isDisabled = false,
  onPickElement,
  onScreenshot,
  onRegionScreenshot,
  onRecordToggle,
  disabledReason,
  variant = 'full',
  className,
}: ActionToolbarProps) {
  const isCompact = variant === 'compact';

  const baseButtonClass = isCompact
    ? 'relative w-8 h-8 flex items-center justify-center rounded-lg border-none bg-transparent cursor-pointer text-slate-400 transition-all flex-shrink-0 hover:bg-slate-100 hover:text-slate-600'
    : 'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors';

  const disabledClass = isDisabled && !isRecording ? 'opacity-40 cursor-not-allowed' : '';

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {/* Pick Element */}
      <button
        onClick={isDisabled && !isPicking ? undefined : onPickElement}
        disabled={isDisabled && !isPicking}
        className={cn(
          baseButtonClass,
          disabledClass,
          isPicking && (isCompact ? 'bg-slate-100 text-slate-800' : 'bg-violet-100 text-violet-600'),
          !isCompact && !isPicking && 'text-slate-600 hover:bg-slate-200'
        )}
        title={isPicking ? 'Picking...' : disabledReason || 'Pick Element'}
      >
        {isPicking && isCompact ? (
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse-opacity" />
        ) : (
          <MousePointer2 className={isCompact ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
        )}
        {!isCompact && <span>Pick</span>}
      </button>

      {/* Full Screenshot */}
      <button
        onClick={isDisabled ? undefined : onScreenshot}
        disabled={isDisabled || isCapturing}
        className={cn(
          baseButtonClass,
          disabledClass,
          isCapturing && 'bg-slate-100 text-slate-800',
          !isCompact && !isCapturing && 'text-slate-600 hover:bg-slate-200 disabled:opacity-50'
        )}
        title={disabledReason || 'Full Page Screenshot'}
      >
        <Camera className={isCompact ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
        {!isCompact && <span>Full</span>}
      </button>

      {/* Region Screenshot */}
      <button
        onClick={isDisabled ? undefined : onRegionScreenshot}
        disabled={isDisabled || isCapturing}
        className={cn(
          baseButtonClass,
          disabledClass,
          !isCompact && 'text-slate-600 hover:bg-slate-200'
        )}
        title={disabledReason || 'Region Screenshot'}
      >
        <Crop className={isCompact ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
        {!isCompact && <span>Region</span>}
      </button>

      {/* Record */}
      <button
        onClick={isDisabled && !isRecording ? undefined : onRecordToggle}
        disabled={isDisabled && !isRecording}
        className={cn(
          baseButtonClass,
          isRecording && (isCompact
            ? 'bg-red-50 text-red-500 animate-pulse-opacity'
            : 'bg-red-100 text-red-600'),
          !isRecording && disabledClass,
          !isCompact && !isRecording && 'text-slate-600 hover:bg-slate-200'
        )}
        title={isRecording ? 'Stop Recording' : disabledReason || 'Record Screen'}
      >
        {isRecording ? (
          <Square className={cn(isCompact ? 'w-3 h-3' : 'w-3.5 h-3.5', 'fill-current')} />
        ) : (
          <Video className={isCompact ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
        )}
        {!isCompact && <span>{isRecording ? 'Stop' : 'Record'}</span>}
      </button>
    </div>
  );
}
