import test from 'node:test';
import assert from 'node:assert/strict';
import { createAcceleratorExperimentClient } from '../app/js/campaign/accelerator-experiment-client.js';
import { createAcceleratorWorkerProcessor } from '../app/js/campaign/accelerator-worker-commands.js';
import {
  calculateAcceleratorExperiment,
  compactAcceleratorExperiment,
  validateAcceleratorExperiment,
} from '../app/js/campaign/accelerator-experiments.js';
import {
  ACCELERATOR_PROTOCOL,
  ACCELERATOR_SOURCE,
} from '../app/js/campaign/accelerator-studies.js';
const request = (method = 'bend', inputs = { fieldTesla: 1.5 }) => ({
  protocol: ACCELERATOR_PROTOCOL,
  requestId: 1,
  generation: 3,
  revision: 1,
  studyId: 'campaign',
  method,
  inputs,
});

test('the bounded seam rejects unsupported settings and altered saved readings instead of trusting a passed flag', () => {
  for (const [method, inputs] of [
    ['bend', { fieldTesla: Infinity }],
    ['bend', { fieldTesla: 1, passed: true }],
    ['focus', { k1: 100, k2: 1, alternating: true }],
    ['signals', { revealed: [1, 1], choice: 2 }],
    ['track', { selected: ['outside', 'B', 'H'] }],
    ['population', { cutGeV: 21, charge: 'same' }],
  ])
    assert.throws(() => calculateAcceleratorExperiment('campaign', method, inputs));
  const record = compactAcceleratorExperiment(
    calculateAcceleratorExperiment('campaign', 'bend', { fieldTesla: 1.5 })
  );
  assert.deepEqual(validateAcceleratorExperiment('campaign', 'bend', record), record);
  assert.throws(() =>
    validateAcceleratorExperiment('campaign', 'bend', { ...record, accepted: !record.accepted })
  );
  assert.throws(() =>
    validateAcceleratorExperiment('campaign', 'bend', {
      ...record,
      readings: { ...record.readings, radiusMeters: 999 },
    })
  );
});
test('recorded data stays lazy, a failed source request retries, and oversized payloads fail before interpretation', async () => {
  let fetches = 0;
  const processor = createAcceleratorWorkerProcessor({
    fetchImpl: async () => {
      fetches++;
      return new Response('unavailable', { status: 503 });
    },
  });
  await processor.run(request());
  assert.equal(fetches, 0);
  assert.equal(processor.snapshot().recordedDataRequested, false);
  for (let i = 0; i < 2; i++)
    await assert.rejects(processor.run(request('mass', { beta: 0 })), /unavailable/);
  assert.equal(fetches, 2);
  await assert.rejects(processor.run({ ...request(), requestId: -1 }), /invalid/);
  await assert.rejects(
    processor.run({ ...request(), inputs: { fieldTesla: 1, large: 'x'.repeat(9000) } }),
    /too large/
  );
  const oversized = createAcceleratorWorkerProcessor({
    fetchImpl: async () =>
      new Response('', { headers: { 'content-length': String(ACCELERATOR_SOURCE.dataBytes + 1) } }),
  });
  await assert.rejects(oversized.run(request('mass', { beta: 0 })), /byte budget/);
});
test('only the latest matching live revision can receive a worker result and disposal rejects pending work and terminates its worker', async () => {
  const workers = [];
  let revision = 1;
  const client = createAcceleratorExperimentClient({
    workerFactory: () => {
      const w = {
        messages: [],
        terminated: 0,
        postMessage(m) {
          this.messages.push(m);
        },
        terminate() {
          this.terminated++;
        },
      };
      workers.push(w);
      return w;
    },
    isCurrent: (scope) => !scope || scope.revision === revision,
  });
  const input = {
      studyId: 'campaign',
      method: 'bend',
      inputs: { fieldTesla: 1.5 },
      generation: 3,
      revision: 1,
    },
    first = client.run(input),
    rejected = assert.rejects(first, /newer/),
    second = client.run(input),
    worker = workers[0];
  await rejected;
  worker.onmessage({ data: { ...worker.messages[0], ok: true, result: 'old' } });
  assert.equal(client.snapshot().pending, true);
  revision = 2;
  worker.onmessage({ data: { ...worker.messages[1], ok: true, result: 'stale' } });
  await assert.rejects(second, /stale/);
  const third = client.run({ ...input, revision: 2 });
  client.dispose();
  await assert.rejects(third, /closed/);
  assert.equal(worker.terminated, 1);
  assert.throws(() => client.run(input), /changed/);
});
test('a full-length source with different bytes fails its pinned digest before JSON or recorded-event interpretation', async () => {
  const processor = createAcceleratorWorkerProcessor({
    fetchImpl: async () => new Response(new Uint8Array(ACCELERATOR_SOURCE.dataBytes)),
  });
  await assert.rejects(processor.run(request('mass', { beta: 0 })), /digest changed/);
  assert.equal(processor.snapshot().recordedDataRequested, false);
});
