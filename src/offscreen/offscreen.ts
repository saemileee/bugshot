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

  // Use getDisplayMedia — Chrome shows a tab/screen picker dialog
  stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false,
  });

  // Handle user clicking Chrome's "Stop sharing" button
  stream.getVideoTracks()[0]?.addEventListener('ended', () => {
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  });

  recorder = new MediaRecorder(stream, {
    mimeType: getSupportedMimeType(),
    videoBitsPerSecond: 1_500_000, // 1.5 Mbps (reduced from 2.5 Mbps for smaller file size)
  });

  chunks = [];

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  recorder.onstop = async () => {
    const webmBlob = new Blob(chunks, { type: recorder?.mimeType || 'video/webm' });
    chunks = [];

    stream?.getTracks().forEach((track) => track.stop());
    stream = null;

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
    console.error('MediaRecorder error:', event);
    chrome.runtime.sendMessage({
      type: 'recording-error',
      target: 'service-worker',
      error: 'Recording failed during capture',
    });
  };

  recorder.start(1000);
}

function stopRecording() {
  if (recorder && recorder.state !== 'inactive') {
    recorder.stop();
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
    console.log('[Offscreen] Opening IndexedDB...');
    const request = indexedDB.open('bugshot-recordings', 1);
    request.onupgradeneeded = () => {
      console.log('[Offscreen] DB upgrade needed, creating object store');
      const db = request.result;
      if (!db.objectStoreNames.contains('recordings')) {
        db.createObjectStore('recordings', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      console.log('[Offscreen] IndexedDB opened successfully');
      resolve(request.result);
    };
    request.onerror = () => {
      console.error('[Offscreen] IndexedDB open failed:', request.error);
      reject(request.error);
    };
  });
}

async function storeRecording(blob: Blob): Promise<string> {
  console.log('[Offscreen] storeRecording called, blob size:', blob.size);
  const db = await openDB();
  console.log('[Offscreen] DB opened successfully');
  const id = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('recordings', 'readwrite');
    const store = tx.objectStore('recordings');
    store.put({ id, blob, createdAt: Date.now() });
    tx.oncomplete = () => {
      console.log('[Offscreen] Recording stored:', id);
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
