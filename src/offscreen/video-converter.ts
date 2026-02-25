// Video converter using ffmpeg.wasm
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let isLoading = false;

export type ConversionProgress = {
  stage: 'loading' | 'converting' | 'done' | 'error';
  progress: number; // 0-100
  message: string;
};

export type ProgressCallback = (progress: ConversionProgress) => void;

let loadingPromise: Promise<FFmpeg> | null = null;

async function loadFFmpeg(onProgress: ProgressCallback): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) {
    return ffmpeg;
  }

  // If already loading, return existing promise instead of polling
  if (isLoading && loadingPromise) {
    return loadingPromise;
  }

  isLoading = true;
  onProgress({ stage: 'loading', progress: 0, message: 'Loading converter...' });

  loadingPromise = (async () => {
    try {
      ffmpeg = new FFmpeg();

    ffmpeg.on('progress', ({ progress }) => {
      onProgress({
        stage: 'converting',
        progress: Math.round(progress * 100),
        message: `Converting: ${Math.round(progress * 100)}%`,
      });
    });

    // Load ffmpeg core from CDN
    await ffmpeg.load({
      coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
      wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
    });

      onProgress({ stage: 'loading', progress: 100, message: 'Converter ready' });
      return ffmpeg;
    } finally {
      isLoading = false;
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

export async function convertWebmToMp4(
  webmBlob: Blob,
  onProgress: ProgressCallback
): Promise<Blob> {
  try {
    const ff = await loadFFmpeg(onProgress);

    onProgress({ stage: 'converting', progress: 0, message: 'Preparing...' });

    // Write input file
    const inputData = await fetchFile(webmBlob);
    await ff.writeFile('input.webm', inputData);

    onProgress({ stage: 'converting', progress: 10, message: 'Converting...' });

    // Convert to mp4
    // -c:v libx264 for H.264 codec (widely supported)
    // -preset ultrafast for speed over compression
    // -crf 23 for reasonable quality
    await ff.exec([
      '-i', 'input.webm',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      'output.mp4',
    ]);

    // Read output
    const data = await ff.readFile('output.mp4');
    // Copy to a new ArrayBuffer to avoid SharedArrayBuffer issues
    const uint8Array = new Uint8Array(data as Uint8Array);
    const mp4Blob = new Blob([uint8Array.buffer], { type: 'video/mp4' });

    // Cleanup
    await ff.deleteFile('input.webm');
    await ff.deleteFile('output.mp4');

    onProgress({ stage: 'done', progress: 100, message: 'Conversion complete' });

    return mp4Blob;
  } catch (error) {
    onProgress({
      stage: 'error',
      progress: 0,
      message: `Conversion failed: ${(error as Error).message}`,
    });
    throw error;
  }
}
