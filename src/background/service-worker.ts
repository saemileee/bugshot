import { initializeMessagingHub, cleanupCDPSession } from './messaging/hub';
import './recording/manager'; // Registers alarm listener for keepalive
import { getRecordingStatus, abortRecording } from './recording/manager';
import { STORAGE_KEYS, type DisplayMode } from '@/shared/constants';

initializeMessagingHub();

// KeepAlive alarm to prevent service worker from sleeping during long operations
const KEEPALIVE_ALARM = 'bugshot_keepalive';
let keepaliveActive = false;

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    // Alarm fired - this keeps the service worker alive
    // Do nothing, just the act of firing keeps it awake
  }
});

export function startKeepAlive() {
  if (!keepaliveActive) {
    keepaliveActive = true;
    // Create periodic alarm every 20 seconds to keep service worker alive
    chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 1 / 3 }); // 20 seconds
  }
}

export function stopKeepAlive() {
  if (keepaliveActive) {
    keepaliveActive = false;
    chrome.alarms.clear(KEEPALIVE_ALARM);
  }
}

// Clean up draft storage, CDP sessions, and recording when a tab is closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  // Clean up draft
  try {
    const draftKey = `bugshot_draft_${tabId}`;
    await chrome.storage.local.remove(draftKey);
  } catch (error) {
    console.warn('[BugShot] Failed to clean up draft for tab', tabId, error);
  }

  // Clean up CDP session (clear timeout and detach debugger)
  cleanupCDPSession(tabId);

  // Abort recording if this tab was recording (discard without saving)
  const recordingStatus = getRecordingStatus(tabId);
  if (recordingStatus.isRecording) {
    try {
      await abortRecording();
      console.warn('[BugShot] Recording aborted because tab', tabId, 'was closed');
    } catch (error) {
      console.warn('[BugShot] Failed to abort recording for closed tab', tabId, error);
    }
  }
});

// Update icon appearance (grayscale + translucent when disabled)
async function updateIcon(enabled: boolean) {
  const sizes = [16, 32] as const;
  const imageData: Record<string, ImageData> = {};

  for (const size of sizes) {
    const response = await fetch(chrome.runtime.getURL(`src/assets/icons/icon-${size}.png`));
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, size, size);

    if (!enabled) {
      const data = ctx.getImageData(0, 0, size, size);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        const gray = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
        px[i] = gray;
        px[i + 1] = gray;
        px[i + 2] = gray;
        px[i + 3] = px[i + 3] * 0.5;
      }
      imageData[size.toString()] = data;
    } else {
      imageData[size.toString()] = ctx.getImageData(0, 0, size, size);
    }
  }

  await chrome.action.setIcon({ imageData });
}

// Restore icon state on service worker startup
chrome.storage.local.get(STORAGE_KEYS.WIDGET_VISIBLE, (result) => {
  const visible = result[STORAGE_KEYS.WIDGET_VISIBLE] ?? true;
  updateIcon(visible);
});

// Note: sidePanel.open() requires a user gesture, so we cannot auto-open
// when display mode changes. The user must click the extension icon to open the panel.

// Ensure side panel is always enabled on service worker startup
// (fixes issue where setOptions({ enabled: false }) may have disabled it)
chrome.sidePanel.setOptions({ enabled: true }).catch(() => {
  // Ignore errors during startup
});

// Handle extension icon click based on display mode
chrome.action.onClicked.addListener(async (tab) => {
  const result = await chrome.storage.local.get([STORAGE_KEYS.DISPLAY_MODE, STORAGE_KEYS.WIDGET_VISIBLE]);
  const displayMode: DisplayMode = result[STORAGE_KEYS.DISPLAY_MODE] ?? 'widget';

  if (displayMode === 'panel') {
    // Open side panel for the current tab
    // Note: Closing must be done by user via panel UI (X button) or Chrome UI
    // Using setOptions({ enabled: false }) disables the panel globally and breaks Chrome menu
    if (tab.id) {
      try {
        await chrome.sidePanel.open({ tabId: tab.id });
      } catch (error) {
        console.warn('[BugShot] Failed to open side panel:', error);
      }
    }
  } else {
    // Toggle widget visibility (original behavior)
    const currentVisible = result[STORAGE_KEYS.WIDGET_VISIBLE] ?? true;
    const newVisible = !currentVisible;
    await chrome.storage.local.set({ [STORAGE_KEYS.WIDGET_VISIBLE]: newVisible });
    updateIcon(newVisible);
  }
});
