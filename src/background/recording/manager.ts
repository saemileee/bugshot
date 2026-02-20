// Video recording manager
// Uses offscreen document with getDisplayMedia (no activeTab requirement)

let isRecording = false;
let recordingTabId: number | null = null;

export async function startRecording(tabId: number): Promise<void> {
  if (isRecording) {
    throw new Error('Already recording');
  }

  // Resolve actual tab ID for state tracking
  let targetTabId = tabId;
  if (targetTabId === 0) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    targetTabId = activeTab?.id ?? 0;
  }

  // Ensure offscreen document exists
  await ensureOffscreenDocument();

  // Tell offscreen document to start recording via getDisplayMedia
  const result: { success: boolean; error?: string } = await chrome.runtime.sendMessage({
    type: 'start-recording',
    target: 'offscreen',
  });

  if (!result?.success) {
    throw new Error(result?.error || 'Failed to start recording');
  }

  isRecording = true;
  recordingTabId = targetTabId;

  // Keep service worker alive during recording with alarms
  await chrome.alarms.create('recording-keepalive', { periodInMinutes: 0.4 });
}

export async function stopRecording(): Promise<void> {
  if (!isRecording) return;

  try {
    await chrome.runtime.sendMessage({
      type: 'stop-recording',
      target: 'offscreen',
    });
  } catch (err) {
    console.warn('Failed to send stop-recording to offscreen:', err);
  }

  isRecording = false;
  recordingTabId = null;

  try {
    await chrome.alarms.clear('recording-keepalive');
  } catch { /* ignore */ }
}

export function getRecordingState(): { isRecording: boolean; tabId: number | null } {
  return { isRecording, tabId: recordingTabId };
}

/**
 * Ensure offscreen document exists. Returns true if newly created.
 */
async function ensureOffscreenDocument(): Promise<boolean> {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });

  if (existingContexts.length > 0) return false;

  await chrome.offscreen.createDocument({
    url: 'src/offscreen/offscreen.html',
    reasons: [chrome.offscreen.Reason.DISPLAY_MEDIA],
    justification: 'Screen recording via getDisplayMedia for Design QA',
  });

  return true;
}

/**
 * Retrieve a recording as a Blob from the offscreen document's IndexedDB.
 * Uses base64 string for serialization since Blob can't pass through sendMessage.
 */
export async function getRecordingBlob(recordingId: string): Promise<Blob | null> {
  const wasCreated = await ensureOffscreenDocument();

  // If we just created the offscreen document, wait for its script to load
  // and register the message listener. Without this, the message arrives
  // before the listener is ready and gets silently dropped.
  if (wasCreated) {
    await new Promise((r) => setTimeout(r, 600));
  }

  return new Promise((resolve) => {
    // Timeout: if offscreen doesn't respond within 15s, give up
    const timeout = setTimeout(() => {
      console.warn('getRecordingBlob timed out for', recordingId);
      resolve(null);
    }, 15_000);

    chrome.runtime.sendMessage(
      {
        type: 'get-recording',
        target: 'offscreen',
        recordingId,
      },
      (response) => {
        clearTimeout(timeout);

        if (chrome.runtime.lastError) {
          console.warn('getRecordingBlob error:', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        if (response?.dataUrl) {
          try {
            const [header, b64] = (response.dataUrl as string).split(',');
            const mime = header.match(/:(.*?);/)?.[1] || 'video/webm';
            const bytes = atob(b64);
            const arr = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
            resolve(new Blob([arr], { type: mime }));
          } catch (err) {
            console.warn('getRecordingBlob base64 decode failed:', err);
            resolve(null);
          }
        } else {
          console.warn('getRecordingBlob: no dataUrl in response for', recordingId);
          resolve(null);
        }
      },
    );
  });
}

// Handle alarms to keep service worker alive during recording
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'recording-keepalive') {
    if (!isRecording) {
      chrome.alarms.clear('recording-keepalive');
    }
  }
});
