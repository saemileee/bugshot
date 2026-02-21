import { initializeMessagingHub } from './messaging/hub';
import './recording/manager'; // Registers alarm listener for keepalive
import { STORAGE_KEYS } from '@/shared/constants';

initializeMessagingHub();

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

// Toggle widget visibility when extension icon is clicked
chrome.action.onClicked.addListener(async () => {
  const result = await chrome.storage.local.get(STORAGE_KEYS.WIDGET_VISIBLE);
  const currentVisible = result[STORAGE_KEYS.WIDGET_VISIBLE] ?? true;
  const newVisible = !currentVisible;

  await chrome.storage.local.set({ [STORAGE_KEYS.WIDGET_VISIBLE]: newVisible });
  updateIcon(newVisible);
});
