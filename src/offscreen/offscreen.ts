// Offscreen document for video recording via MediaRecorder
// This document has full DOM access and survives service worker suspension

import { convertWebmToMp4, type ConversionProgress } from './video-converter';

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let stream: MediaStream | null = null;

// Signal to service worker that offscreen document is ready
chrome.runtime.sendMessage({
  type: 'offscreen-ready',
  target: 'service-worker',
}).catch(() => {
  // Ignore errors if service worker is not ready yet
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  switch (message.type) {
    case 'start-recording':
      startRecording()
        .then(() => sendResponse({ success: true }))
        .catch((err: Error) => sendResponse({ success: false, error: err.message }));
      return true; // async

    case 'stop-recording':
      try {
        stopRecording();
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: (err as Error).message });
      }
      break;

    case 'abort-recording':
      try {
        abortRecording();
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: (err as Error).message });
      }
      break;

    case 'get-recording':
      getRecordingFromDB(message.recordingId).then(async (blob) => {
        if (!blob) {
          sendResponse({ dataUrl: null });
          return;
        }
        // Convert Blob to base64 data URL for serialization
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        sendResponse({ dataUrl });
      });
      return true; // async

    case 'delete-recording':
      deleteRecordingFromDB(message.recordingId)
        .then(() => sendResponse({ success: true }))
        .catch((err: Error) => sendResponse({ success: false, error: err.message }));
      return true; // async
  }
});

async function startRecording() {
  // Clean up any previous recording state
  if (recorder && recorder.state !== 'inactive') {
    recorder.stop();
  }
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  // Use getDisplayMedia — Default to entire screen
  stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      displaySurface: 'monitor', // Request entire screen as default
      frameRate: { ideal: 30, max: 60 },
    },
    audio: false,
    // @ts-ignore - Chrome-specific option
    preferCurrentTab: false,
  });

  const videoTrack = stream.getVideoTracks()[0];
  console.log('[Offscreen] Video track obtained:', videoTrack?.label, 'readyState:', videoTrack?.readyState);

  // Handle user clicking Chrome's "Stop sharing" button
  videoTrack?.addEventListener('ended', () => {
    console.warn('[Offscreen] Video track ended (user stopped sharing or track failed)');
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  });

  const mimeType = getSupportedMimeType();
  console.log('[Offscreen] Using mimeType:', mimeType);

  try {
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 1_500_000, // 1.5 Mbps (reduced from 2.5 Mbps for smaller file size)
    });
  } catch (err) {
    console.error('[Offscreen] MediaRecorder creation failed:', err);
    chrome.runtime.sendMessage({
      type: 'recording-error',
      target: 'service-worker',
      error: `MediaRecorder not supported: ${(err as Error).message}`,
    });
    stream.getTracks().forEach((track) => track.stop());
    throw err;
  }

  chunks = [];

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  recorder.onstop = async () => {
    console.log('[Offscreen] MediaRecorder stopped, chunks collected:', chunks.length, 'total size:', chunks.reduce((sum, c) => sum + c.size, 0), 'bytes');
    const webmBlob = new Blob(chunks, { type: recorder?.mimeType || 'video/webm' });
    chunks = [];

    stream?.getTracks().forEach((track) => track.stop());
    stream = null;

    // Check if recording has any data
    if (webmBlob.size === 0) {
      console.warn('[Offscreen] Recording was empty (0 bytes)');
      chrome.runtime.sendMessage({
        type: 'recording-error',
        target: 'service-worker',
        error: 'Recording contains no data. Please try again.',
      });
      return;
    }

    // Check if recording has any data
    if (webmBlob.size === 0) {
      console.warn('[Offscreen] Recording was empty (0 bytes), user likely canceled immediately');
      chrome.runtime.sendMessage({
        type: 'recording-error',
        target: 'service-worker',
        error: 'Recording was canceled or no data was captured',
      });
      return;
    }

    // Send progress updates
    const sendProgress = (progress: ConversionProgress) => {
      chrome.runtime.sendMessage({
        type: 'conversion-progress',
        target: 'service-worker',
        ...progress,
      });
    };

    // Convert webm to mp4
    let finalBlob: Blob;
    let mimeType: string;
    try {
      sendProgress({ stage: 'loading', progress: 0, message: 'Preparing converter...' });
      finalBlob = await convertWebmToMp4(webmBlob, sendProgress);
      mimeType = 'video/mp4';
    } catch (err) {
      console.warn('MP4 conversion failed, using webm:', err);
      finalBlob = webmBlob;
      mimeType = webmBlob.type;
    }

    const recordingId = await storeRecording(finalBlob);

    // Convert to data URL for preview (skip if > 10MB to prevent memory issues)
    // For larger videos, UI should show a placeholder and stream from IndexedDB when needed
    let dataUrl: string | undefined;
    if (finalBlob.size < 10_000_000) {
      dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(finalBlob);
      });
    }

    chrome.runtime.sendMessage({
      type: 'recording-complete',
      target: 'service-worker',
      recordingId,
      size: finalBlob.size,
      mimeType,
      dataUrl,
    });
  };

  recorder.onerror = (event) => {
    console.error('[Offscreen] MediaRecorder error:', event);
    const errorDetail = (event as any).error?.message || 'Unknown error';
    chrome.runtime.sendMessage({
      type: 'recording-error',
      target: 'service-worker',
      error: `Recording failed: ${errorDetail}`,
    });
  };

  recorder.onstart = () => {
    console.log('[Offscreen] MediaRecorder started successfully');
  };

  console.log('[Offscreen] Starting MediaRecorder...');
  try {
    recorder.start(1000);
  } catch (err) {
    console.error('[Offscreen] recorder.start() failed:', err);
    chrome.runtime.sendMessage({
      type: 'recording-error',
      target: 'service-worker',
      error: `Failed to start recording: ${(err as Error).message}`,
    });
    stream.getTracks().forEach((track) => track.stop());
    throw err;
  }
}

function stopRecording() {
  if (recorder && recorder.state !== 'inactive') {
    recorder.stop();
  }
}

function abortRecording() {
  // Stop recording without saving
  if (recorder && recorder.state !== 'inactive') {
    // Clear chunks to prevent saving
    chunks = [];
    recorder.stop();
  }
  // Clean up stream
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
}

function getSupportedMimeType(): string {
  // Try mp4 first (Safari supports, Chrome usually doesn't)
  // Then fall back to webm
  const types = [
    'video/mp4;codecs=h264',
    'video/mp4',
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
    const request = indexedDB.open('bugshot-recordings', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('recordings')) {
        db.createObjectStore('recordings', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      console.error('[Offscreen] IndexedDB open failed:', request.error);
      reject(request.error);
    };
  });
}

async function storeRecording(blob: Blob): Promise<string> {
  const db = await openDB();
  const id = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('recordings', 'readwrite');
    const store = tx.objectStore('recordings');
    store.put({ id, blob, createdAt: Date.now() });
    tx.oncomplete = () => {
      resolve(id);
    };
    tx.onerror = () => {
      console.error('[Offscreen] Failed to store recording:', tx.error);
      reject(tx.error);
    };
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

/**
 * Delete a recording from IndexedDB.
 * Should be called after submission or when user discards the recording.
 */
async function deleteRecordingFromDB(recordingId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recordings', 'readwrite');
    const store = tx.objectStore('recordings');
    store.delete(recordingId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Clean up old recordings (older than 24 hours).
 * This prevents IndexedDB from growing indefinitely.
 */
async function cleanupOldRecordings(): Promise<void> {
  const db = await openDB();
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

  return new Promise((resolve) => {
    const tx = db.transaction('recordings', 'readwrite');
    const store = tx.objectStore('recordings');
    const request = store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const record = cursor.value as { id: string; createdAt: number };
        if (record.createdAt < oneDayAgo) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve(); // Don't fail on cleanup errors
  });
}

// Run cleanup on document load
cleanupOldRecordings().catch(console.warn);
