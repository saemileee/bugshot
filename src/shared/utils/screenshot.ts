/**
 * Shared screenshot utilities for cropping screenshots to element/region bounds.
 * Used by both widget (useScreenshot.ts) and side panel (sidepanel-bridge.ts).
 */

export const CROP_PADDING = 12;

export interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Crop a screenshot data URL to a specific rect.
 * Handles device pixel ratio scaling and bounds clamping.
 *
 * @param dataUrl - Full page screenshot as data URL
 * @param rect - The rect to crop to (in CSS pixels)
 * @param padding - Padding around the rect (default: CROP_PADDING)
 * @returns Cropped screenshot as data URL, or original if cropping fails
 */
export function cropScreenshotToRect(
  dataUrl: string,
  rect: CropRect,
  padding: number = CROP_PADDING
): Promise<string> {
  const dpr = window.devicePixelRatio || 1;

  return new Promise<string>((resolve) => {
    const img = new Image();

    img.onload = () => {
      // Source coordinates (in the captured image, which is at dpr scale)
      const sx = Math.max(0, Math.round((rect.left - padding) * dpr));
      const sy = Math.max(0, Math.round((rect.top - padding) * dpr));
      const sw = Math.min(img.width - sx, Math.round((rect.width + padding * 2) * dpr));
      const sh = Math.min(img.height - sy, Math.round((rect.height + padding * 2) * dpr));

      // Ensure we have valid dimensions
      if (sw <= 0 || sh <= 0) {
        console.warn('[Screenshot] Invalid crop dimensions, returning original');
        resolve(dataUrl);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.warn('[Screenshot] Failed to get canvas context, returning original');
        resolve(dataUrl);
        return;
      }

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => {
      console.warn('[Screenshot] Failed to load image for cropping, returning original');
      resolve(dataUrl);
    };

    img.src = dataUrl;
  });
}

/**
 * Crop a screenshot data URL to a specific region.
 * Similar to cropScreenshotToRect but without padding.
 *
 * @param dataUrl - Full page screenshot as data URL
 * @param region - The region to crop to (in CSS pixels)
 * @returns Cropped screenshot as data URL, or original if cropping fails
 */
export function cropScreenshotToRegion(
  dataUrl: string,
  region: { x: number; y: number; width: number; height: number }
): Promise<string> {
  return cropScreenshotToRect(
    dataUrl,
    { left: region.x, top: region.y, width: region.width, height: region.height },
    0 // No padding for explicit region selection
  );
}
