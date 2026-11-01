import { parentPort } from 'node:worker_threads';

// Adapt Node's message port to the existing browser worker entry point.
globalThis.self = {
  postMessage: (message, transfer) => parentPort.postMessage(message, transfer)
};
await import('../../app/js/terrain/transport-detail-worker.js');
parentPort.on('message', data => self.onmessage({ data }));
