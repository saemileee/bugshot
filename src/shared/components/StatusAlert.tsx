/**
 * Shared Status Alert Component
 * Used by both widget and side panel for status messages
 */

import { X, MousePointer2 } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

export type AlertVariant = 'error' | 'warning' | 'info' | 'recording' | 'converting' | 'picking';

interface StatusAlertProps {
  variant: AlertVariant;
  message: string;
  onDismiss?: () => void;
  onCancel?: () => void; // For picking mode cancel
  progress?: number; // For converting progress bar
  className?: string;
}

const variantStyles: Record<AlertVariant, { bg: string; text: string; border: string }> = {
  error: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-100' },
  warning: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100' },
  info: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-100' },
  recording: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-100' },
  converting: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-100' },
  picking: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-100' },
};

export function StatusAlert({
  variant,
  message,
  onDismiss,
  onCancel,
  progress,
  className,
}: StatusAlertProps) {
  const styles = variantStyles[variant];

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-2 text-xs border-b',
        styles.bg,
        styles.text,
        styles.border,
        className
      )}
    >
      {/* Icon for specific variants */}
      {variant === 'recording' && (
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse-opacity flex-shrink-0" />
      )}
      {variant === 'picking' && (
        <MousePointer2 className="w-3.5 h-3.5 flex-shrink-0" />
      )}

      {/* Message */}
      <span className="flex-1">{message}</span>

      {/* Progress bar for converting */}
      {variant === 'converting' && progress !== undefined && (
        <div className="w-full">
          <div className="mb-1">{message}</div>
          <div className="w-full h-1.5 bg-blue-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Cancel button for picking */}
      {variant === 'picking' && onCancel && (
        <button
          onClick={onCancel}
          className="ml-auto text-violet-500 hover:text-violet-700 text-xs"
        >
          Cancel
        </button>
      )}

      {/* Dismiss button */}
      {onDismiss && variant !== 'picking' && variant !== 'converting' && (
        <button
          onClick={onDismiss}
          className={cn(
            'p-1 rounded transition-colors flex-shrink-0',
            variant === 'error' && 'hover:bg-red-100',
            variant === 'warning' && 'hover:bg-amber-100',
            variant === 'info' && 'hover:bg-blue-100'
          )}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * Convenience components for common alert types
 */
export function RecordingAlert() {
  return <StatusAlert variant="recording" message="Recording in progress..." />;
}

export function PickingAlert({ onCancel }: { onCancel: () => void }) {
  return (
    <StatusAlert
      variant="picking"
      message="Click on an element in the page to select it..."
      onCancel={onCancel}
    />
  );
}

export function ConvertingAlert({ progress, message }: { progress: number; message: string }) {
  return <StatusAlert variant="converting" message={message} progress={progress} />;
}

export function ErrorAlert({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return <StatusAlert variant="error" message={message} onDismiss={onDismiss} />;
}

export function WarningAlert({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return <StatusAlert variant="warning" message={message} onDismiss={onDismiss} />;
}
