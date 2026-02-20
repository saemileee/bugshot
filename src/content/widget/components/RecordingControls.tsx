import { useState } from 'react';
import type { ExtensionMessage } from '@/shared/types/messages';

interface RecordingControlsProps {
  isRecording: boolean;
  onRecordingChange: (recording: boolean) => void;
  sendMessage: (msg: ExtensionMessage) => Promise<ExtensionMessage>;
  recordingId: string | null;
  onRemoveRecording: () => void;
}

export function RecordingControls({
  isRecording,
  onRecordingChange,
  sendMessage,
  recordingId,
  onRemoveRecording,
}: RecordingControlsProps) {
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const handleToggle = async () => {
    setError(null);
    setIsBusy(true);

    try {
      if (isRecording) {
        onRecordingChange(false);
        await sendMessage({ type: 'STOP_RECORDING' });
      } else {
        const response = await sendMessage({ type: 'START_RECORDING', tabId: 0 });
        if (response && 'error' in response) {
          setError((response as { error: string }).error);
        } else {
          onRecordingChange(true);
        }
      }
    } catch (err) {
      setError((err as Error).message || 'Recording failed');
      onRecordingChange(false);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          className={`qa-btn ${isRecording ? 'qa-btn-danger' : 'qa-btn-secondary'} flex-1`}
          onClick={handleToggle}
          disabled={isBusy}
        >
          {isRecording ? (
            <span className="flex items-center justify-center gap-1.5">
              <span className="qa-recording-dot" />
              Stop Recording
            </span>
          ) : (
            <span className="flex items-center justify-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="4" fill="currentColor" />
              </svg>
              {isBusy ? 'Starting...' : 'Record Screen'}
            </span>
          )}
        </button>
        {isRecording && (
          <span className="text-xs text-red-500 font-medium">Recording...</span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="qa-status qa-status-error" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}

      {/* Attached recording indicator */}
      {recordingId && !isRecording && (
        <div className="qa-status qa-status-success" style={{ marginTop: 8 }}>
          <span style={{ flex: 1 }}>Screen recording attached</span>
          <button
            className="qa-btn qa-btn-ghost"
            onClick={onRemoveRecording}
            style={{ padding: '0 4px', fontSize: 11 }}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
