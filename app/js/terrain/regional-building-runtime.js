import { RegionalBuildingDescriptors } from './regional-building-descriptors.js';

export async function createRegionalBuildingWorker(options, { signal, workerFactory, deadlineMs = 30000 } = {}) {
  signal?.throwIfAborted();
  const url = globalThis.__WORLD_EXPLORER_PRODUCTION__?.regionalBuildingWorkerUrl || new URL('./regional-building-worker.js', import.meta.url);
  const worker = workerFactory ? workerFactory(url) : new Worker(url, { type: 'module' });
  let pending = null, disposed = false, sequence = 0;
  function dispose(reason = new DOMException('Regional building compilation cancelled', 'AbortError')) {
    if (disposed) return;
    disposed = true; worker.terminate(); signal?.removeEventListener('abort', abort);
    pending?.reject(reason); pending = null;
    worker.onmessage = worker.onerror = worker.onmessageerror = null;
  }
  const abort = () => dispose(signal.reason || new DOMException('Regional building compilation cancelled', 'AbortError'));
  const request = (message, transfer = []) => new Promise((resolve, reject) => {
    if (disposed || pending) { reject(new Error('Regional compiler unavailable or busy')); return; }
    const id = ++sequence;
    const timer = setTimeout(() => dispose(new Error('Regional building compilation exceeded its deadline')), deadlineMs);
    pending = { id, resolve: result => { clearTimeout(timer); pending = null; resolve(result); },
      reject: error => { clearTimeout(timer); pending = null; reject(error); } };
    try { worker.postMessage({ ...message, id }, transfer); } catch (error) { dispose(error); }
  });
  worker.onmessage = ({ data }) => {
    if (!pending || data.id !== pending.id) return;
    if (data.error) dispose(new Error(data.error)); else pending.resolve(data.result);
  };
  worker.onerror = event => dispose(new Error(event.message || 'Regional building worker failed'));
  worker.onmessageerror = () => dispose(new Error('Regional building worker packet could not be decoded'));
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  try { await request({ type: 'start', options }); } catch (error) { dispose(error); throw error; }
  return {
    dispose,
    async addTile(tile) {
      // Shared source bytes belong to the cache/road reader. Transfer one owned
      // copy, then await acknowledgement before admitting the next tile.
      const bytes = tile.bytes.slice();
      return request({ type: 'tile', tile: { z: tile.z, x: tile.x, y: tile.y, bytes } }, [bytes.buffer]);
    },
    async finish() {
      try {
        const packet = await request({ type: 'finish' });
        const { data, rings, ...stats } = packet;
        return { ...stats, buildings: new RegionalBuildingDescriptors({ data, rings }) };
      } finally { dispose(); }
    }
  };
}
