// Offscreen document for video recording via MediaRecorder
// This document has full DOM access and survives service worker suspension

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let stream: MediaStream | null = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  switch (message.type) {
    case 'start-recording':
      startRecording(message.streamId);
      break;
    case 'stop-recording':
      stopRecording();
      break;
    case 'get-recording':
      getRecordingFromDB(message.recordingId).then((blob) => {
        sendResponse({ blob });
      });
      return true; // async
  }
});

async function startRecording(streamId: string) {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // @ts-expect-error: chromeMediaSource is a Chrome-specific constraint
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
    });

    recorder = new MediaRecorder(stream, {
      mimeType: getSupportedMimeType(),
      videoBitsPerSecond: 2_500_000, // 2.5 Mbps for reasonable file size
    });

    chunks = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: recorder?.mimeType || 'video/webm' });
      chunks = [];

      // Stop all tracks
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;

      // Store recording in IndexedDB
      const recordingId = await storeRecording(blob);

      // Notify service worker
      chrome.runtime.sendMessage({
        type: 'recording-complete',
        target: 'service-worker',
        recordingId,
        size: blob.size,
        mimeType: blob.type,
      });
    };

    recorder.onerror = (event) => {
      console.error('MediaRecorder error:', event);
      chrome.runtime.sendMessage({
        type: 'recording-error',
        target: 'service-worker',
        error: 'Recording failed',
      });
    };

    recorder.start(1000); // Collect data every second

    chrome.runtime.sendMessage({
      type: 'recording-started',
      target: 'service-worker',
    });
  } catch (err) {
    console.error('Failed to start recording:', err);
    chrome.runtime.sendMessage({
      type: 'recording-error',
      target: 'service-worker',
      error: (err as Error).message,
    });
  }
}

function stopRecording() {
  if (recorder && recorder.state !== 'inactive') {
    recorder.stop();
  }
}

function getSupportedMimeType(): string {
  const types = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return 'video/webm';
}

// IndexedDB helpers for storing recordings
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('design-qa-recordings', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('recordings')) {
        db.createObjectStore('recordings', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeRecording(blob: Blob): Promise<string> {
  const db = await openDB();
  const id = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('recordings', 'readwrite');
    const store = tx.objectStore('recordings');
    store.put({ id, blob, createdAt: Date.now() });
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

async function getRecordingFromDB(recordingId: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('recordings', 'readonly');
    const store = tx.objectStore('recordings');
    const request = store.get(recordingId);
    request.onsuccess = () => {
      resolve(request.result?.blob ?? null);
    };
    request.onerror = () => resolve(null);
  });
}
