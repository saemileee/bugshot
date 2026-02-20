// Video recording manager
// Orchestrates offscreen document creation and tabCapture stream

let isRecording = false;
let recordingTabId: number | null = null;

export async function startRecording(tabId: number): Promise<void> {
  if (isRecording) {
    throw new Error('Already recording');
  }

  // Resolve actual tab ID if 0 was passed (from content script)
  let targetTabId = tabId;
  if (targetTabId === 0) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) throw new Error('No active tab found');
    targetTabId = activeTab.id;
  }

  // Ensure offscreen document exists
  await ensureOffscreenDocument();

  // Get a media stream ID for the tab
  const streamId = await new Promise<string>((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId(
      { targetTabId },
      (id) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(id);
        }
      },
    );
  });

  // Tell offscreen document to start recording
  await chrome.runtime.sendMessage({
    type: 'start-recording',
    target: 'offscreen',
    streamId,
  });

  isRecording = true;
  recordingTabId = targetTabId;

  // Keep service worker alive during recording with alarms
  await chrome.alarms.create('recording-keepalive', { periodInMinutes: 0.4 });
}

export async function stopRecording(): Promise<void> {
  if (!isRecording) return;

  await chrome.runtime.sendMessage({
    type: 'stop-recording',
    target: 'offscreen',
  });

  isRecording = false;
  recordingTabId = null;

  await chrome.alarms.clear('recording-keepalive');
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
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Screen recording for Design QA',
  });
}

// Retrieve a recording blob from the offscreen document's IndexedDB
export async function getRecordingBlob(recordingId: string): Promise<Blob | null> {
  // We need to ask the offscreen document to fetch from its IndexedDB
  // Since offscreen and service worker share the same origin, we can use
  // chrome.runtime.sendMessage to request the blob
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
    // Simply waking up the service worker is enough
  }
});
