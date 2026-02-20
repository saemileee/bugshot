import type { ExtensionMessage } from '@/shared/types/messages';

interface RecordingControlsProps {
  isRecording: boolean;
  onRecordingChange: (recording: boolean) => void;
  sendMessage: (msg: ExtensionMessage) => Promise<ExtensionMessage>;
}

export function RecordingControls({
  isRecording,
  onRecordingChange,
  sendMessage,
}: RecordingControlsProps) {
  const handleToggle = async () => {
    if (isRecording) {
      await sendMessage({ type: 'STOP_RECORDING' });
      onRecordingChange(false);
    } else {
      // Content scripts can't access chrome.tabs, so we send tabId: 0
      // and let the service worker resolve the active tab
      await sendMessage({ type: 'START_RECORDING', tabId: 0 });
      onRecordingChange(true);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        className={`qa-btn ${isRecording ? 'qa-btn-danger' : 'qa-btn-secondary'} flex-1`}
        onClick={handleToggle}
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
            Record Screen
          </span>
        )}
      </button>
      {isRecording && (
        <span className="text-xs text-red-500 font-medium">Recording...</span>
      )}
    </div>
  );
}
