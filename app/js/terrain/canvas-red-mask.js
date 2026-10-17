import {yieldToMainThread} from '../world/cooperative-scheduling.js?v=1';

async function readOnMainThread(canvas, context, current, yieldWork) {
  const red = new Uint8Array(canvas.width * canvas.height);
  for (let y = 0; y < canvas.height; y += 256) {
    if (!current()) return null;
    const height = Math.min(256, canvas.height - y);
    const rgba = context.getImageData(0, y, canvas.width, height).data;
    for (let source = 0; source < rgba.length; source += 4) red[y * canvas.width + source / 4] = rgba[source];
    if (y + height < canvas.height) await yieldWork();
  }
  return current() ? red : null;
}

export async function readCanvasRedMask(canvas, context, {
  current = () => true, yieldWork = yieldToMainThread,
  bitmapFactory = globalThis.createImageBitmap?.bind(globalThis),
  workerFactory = typeof Worker === 'function' && typeof OffscreenCanvas === 'function'
    ? url => new Worker(url, {type:'module'}) : null,
  deadlineMs = 10000
} = {}) {
  if (!current()) return null;
  if (!bitmapFactory || !workerFactory) return readOnMainThread(canvas, context, current, yieldWork);
  let bitmap, worker;
  try {
    bitmap = await bitmapFactory(canvas);
    if (!current()) return null;
    const url = globalThis.__WORLD_EXPLORER_PRODUCTION__?.canvasRedMaskWorkerUrl || new URL('./canvas-red-mask-worker.js', import.meta.url);
    worker = workerFactory(url);
    const red = await new Promise((resolve, reject) => {
      const finish = (error, value) => {
        clearTimeout(timer);
        worker.onmessage = worker.onerror = worker.onmessageerror = null;
        if (error) reject(error); else resolve(value);
      };
      const timer = setTimeout(() => finish(Error('Canvas readback exceeded its deadline')), deadlineMs);
      worker.onmessage = ({data}) => {
        if (!(data?.red instanceof Uint8Array) || data.red.length !== canvas.width * canvas.height) {
          finish(Error(data?.error || 'Invalid canvas mask packet')); return;
        }
        finish(null, data.red);
      };
      worker.onerror = () => finish(Error('Canvas readback worker failed'));
      worker.onmessageerror = () => finish(Error('Canvas readback packet could not be decoded'));
      try { worker.postMessage(bitmap, [bitmap]); } catch (error) { finish(error); }
    });
    return current() ? red : null;
  } catch {
    // Retain the original cooperative path on unsupported/failed worker APIs.
    // No publication or geometry changes before the complete mask is available.
    worker?.terminate(); worker = null;
    return current() ? readOnMainThread(canvas, context, current, yieldWork) : null;
  } finally {
    bitmap?.close(); worker?.terminate();
  }
}
