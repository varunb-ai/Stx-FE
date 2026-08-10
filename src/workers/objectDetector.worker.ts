/**
 * Object detection for proctoring, off the main thread.
 *
 * Runs COCO-SSD over frames handed in as ImageBitmaps and reports back what it
 * saw. Two reasons this is a worker rather than an interval on the main thread:
 * inference is tens of milliseconds per frame and would show up as jank in the
 * video preview and the editor, and it shares a thread with nothing, so a slow
 * frame delays only the next detection.
 *
 * Frames never leave the device. The model is served from this origin
 * (`/models/coco-ssd`), so no third party sees a request either.
 */

import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

/** COCO classes worth flagging, and how seriously to treat them. */
const PHONE_CLASSES = new Set(['cell phone']);
const DISTRACTION_CLASSES = new Set(['laptop', 'tv', 'book', 'remote', 'keyboard', 'tablet']);

export type DetectorRequest =
  | { type: 'init'; modelUrl: string }
  | { type: 'detect'; frame: ImageBitmap; minScore: number }
  | { type: 'dispose' };

export type DetectorResponse =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | {
      type: 'result';
      people: number;
      phones: { score: number }[];
      objects: { label: string; score: number }[];
    };

let model: cocoSsd.ObjectDetection | null = null;
let loading: Promise<void> | null = null;

async function init(modelUrl: string): Promise<void> {
  if (model) return;
  if (loading) return loading;

  loading = (async () => {
    try {
      await tf.setBackend('webgl');
    } catch {
      // Falls through to whatever backend registered; CPU is slow but works.
    }
    await tf.ready();
    // `modelUrl` points at this origin. Omitting it makes coco-ssd fetch from
    // Google's CDN, which would be a third-party request on every cold load.
    model = await cocoSsd.load({ base: 'lite_mobilenet_v2', modelUrl });
  })();

  return loading;
}

self.onmessage = async (event: MessageEvent<DetectorRequest>) => {
  const message = event.data;

  try {
    if (message.type === 'init') {
      await init(message.modelUrl);
      (self as unknown as Worker).postMessage({ type: 'ready' } satisfies DetectorResponse);
      return;
    }

    if (message.type === 'dispose') {
      model?.dispose?.();
      model = null;
      loading = null;
      return;
    }

    if (message.type === 'detect') {
      const { frame, minScore } = message;
      if (!model) {
        // Always close the bitmap: these are GPU-backed and leak otherwise.
        frame.close();
        return;
      }

      let predictions: cocoSsd.DetectedObject[] = [];
      // Via a tensor rather than handing the bitmap straight to coco-ssd: its
      // input types do not include ImageBitmap, and `fromPixels` does. The
      // tensor is disposed explicitly -- tfjs does not garbage-collect GPU
      // memory, so leaking one per frame would exhaust WebGL within minutes.
      let input: tf.Tensor3D | null = null;
      try {
        input = tf.browser.fromPixels(frame);
        predictions = await model.detect(input, 20, minScore);
      } finally {
        input?.dispose();
        frame.close();
      }

      const people = predictions.filter((p) => p.class === 'person' && p.score >= minScore).length;
      const phones = predictions
        .filter((p) => PHONE_CLASSES.has(p.class) && p.score >= minScore)
        .map((p) => ({ score: p.score }));
      const objects = predictions
        .filter((p) => DISTRACTION_CLASSES.has(p.class) && p.score >= minScore)
        .map((p) => ({ label: p.class, score: p.score }));

      (self as unknown as Worker).postMessage({
        type: 'result',
        people,
        phones,
        objects,
      } satisfies DetectorResponse);
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    } satisfies DetectorResponse);
  }
};
