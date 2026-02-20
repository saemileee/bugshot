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
  // Chrome will show a tab/screen picker dialog to the user
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

async function ensureOffscreenDocument(): Promise<void> {
  // Check if offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });

  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: 'src/offscreen/offscreen.html',
    reasons: [chrome.offscreen.Reason.DISPLAY_MEDIA],
    justification: 'Screen recording via getDisplayMedia for Design QA',
  });
}

// Retrieve a recording blob from the offscreen document's IndexedDB
export async function getRecordingBlob(recordingId: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: 'get-recording',
        target: 'offscreen',
        recordingId,
      },
      (response) => {
        if (response?.blob) {
          resolve(response.blob as Blob);
        } else {
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
