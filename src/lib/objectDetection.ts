/**
 * Drives the object-detection worker for proctoring.
 *
 * Everything here degrades to "no object detection" rather than failing the
 * interview: the worker may be unavailable, WebGL may be blocked, the model may
 * not load on a slow connection. Face detection continues regardless, and a
 * candidate is never blocked because a model did not download.
 */

import type { DetectorResponse } from '@/workers/objectDetector.worker';

/** Served from this origin; see public/models/coco-ssd. */
const MODEL_URL = '/models/coco-ssd/model.json';

/** Below this the model's guesses are not worth acting on. */
const DEFAULT_MIN_SCORE = 0.55;

export type ObjectDetectionSignals = {
  people: number;
  phones: { score: number }[];
  objects: { label: string; score: number }[];
};

export type ObjectDetectorHandle = {
  /** Runs one frame. Resolves to null when detection is unavailable or busy. */
  detect: (video: HTMLVideoElement) => Promise<ObjectDetectionSignals | null>;
  dispose: () => void;
  readonly ready: boolean;
};

export function isObjectDetectionSupported(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof createImageBitmap === 'function' &&
    typeof OffscreenCanvas !== 'undefined'
  );
}

export async function createObjectDetector(
  options: { minScore?: number; onError?: (message: string) => void } = {},
): Promise<ObjectDetectorHandle | null> {
  if (!isObjectDetectionSupported()) return null;

  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;

  let worker: Worker;
  try {
    worker = new Worker(new URL('../workers/objectDetector.worker.ts', import.meta.url), {
      type: 'module',
    });
  } catch (err) {
    options.onError?.(err instanceof Error ? err.message : String(err));
    return null;
  }

  let ready = false;
  let disposed = false;
  // One frame in flight at a time. Queueing frames behind a slow model builds a
  // backlog that only ever gets worse, and stale frames are worthless anyway.
  let pending: ((value: ObjectDetectionSignals | null) => void) | null = null;

  const readyPromise = new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 30_000);

    worker.onmessage = (event: MessageEvent<DetectorResponse>) => {
      const message = event.data;

      if (message.type === 'ready') {
        ready = true;
        clearTimeout(timeout);
        resolve(true);
        return;
      }

      if (message.type === 'error') {
        options.onError?.(message.message);
        clearTimeout(timeout);
        pending?.(null);
        pending = null;
        resolve(ready);
        return;
      }

      if (message.type === 'result') {
        pending?.({ people: message.people, phones: message.phones, objects: message.objects });
        pending = null;
      }
    };

    worker.onerror = (event) => {
      options.onError?.(event.message || 'object detector worker failed');
      clearTimeout(timeout);
      pending?.(null);
      pending = null;
      resolve(false);
    };
  });

  worker.postMessage({ type: 'init', modelUrl: MODEL_URL });

  const started = await readyPromise;
  if (!started || disposed) {
    worker.terminate();
    return null;
  }

  return {
    get ready() {
      return ready && !disposed;
    },

    async detect(video: HTMLVideoElement) {
      if (!ready || disposed || pending) return null;
      if (video.readyState < 2 || !video.videoWidth) return null;

      let bitmap: ImageBitmap;
      try {
        // Downscaled here rather than in the worker: a smaller bitmap is
        // cheaper to transfer and cheaper to infer over, and the model's input
        // is 300x300 regardless.
        bitmap = await createImageBitmap(video, { resizeWidth: 320, resizeQuality: 'low' } as any);
      } catch {
        return null;
      }

      return new Promise<ObjectDetectionSignals | null>((resolve) => {
        pending = resolve;
        try {
          worker.postMessage({ type: 'detect', frame: bitmap, minScore }, [bitmap]);
        } catch {
          pending = null;
          bitmap.close();
          resolve(null);
        }
        // Never leave a caller hanging on a worker that stopped answering.
        setTimeout(() => {
          if (pending === resolve) {
            pending = null;
            resolve(null);
          }
        }, 5_000);
      });
    },

    dispose() {
      disposed = true;
      try {
        worker.postMessage({ type: 'dispose' });
      } catch {
        // ignore
      }
      worker.terminate();
    },
  };
}
