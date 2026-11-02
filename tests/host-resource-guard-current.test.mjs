import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostResourceGuard} from '../scripts/verification/host-resource-guard.mjs';

const GiB = 1024 ** 3;

test('disk pressure stops the supplied owned task once and retains the measured cause', async () => {
  let state = {freeBytes: 8 * GiB, swapBytes: GiB};
  const stops = [], records = [];
  const guard = createHostResourceGuard({
    readState: async () => state,
    stopOwnedTask: async reason => { stops.push(reason); },
    record: async record => { records.push(record); }
  });
  try {
    await guard.start();
    assert.equal(await guard.poll(), null);
    state = {freeBytes: GiB, swapBytes: GiB};
    await Promise.all([guard.poll(), guard.poll()]);
    await guard.poll();
    assert.equal(stops.length, 1);
    assert.equal(stops[0].reason, 'disk-headroom');
    assert.equal(stops[0].state.freeBytes, GiB);
    assert.equal(records.at(-1).type, 'resource-stop');
  } finally { guard.dispose(); }
});

test('swap growth is measured against the observed baseline, including pre-existing swap', async () => {
  let state = {freeBytes: 12 * GiB, swapBytes: 6 * GiB};
  const stops = [];
  const guard = createHostResourceGuard({readState: async () => state, stopOwnedTask: async cause => { stops.push(cause); }});
  try {
    await guard.start();
    state = {freeBytes: 10 * GiB, swapBytes: 8 * GiB};
    assert.equal(await guard.poll(), null);
    state = {freeBytes: 9 * GiB, swapBytes: 11 * GiB};
    await guard.poll();
    assert.equal(stops.length, 1);
    assert.equal(stops[0].reason, 'swap-growth');
  } finally { guard.dispose(); }
});

test('a host without launch headroom is rejected before any task starts', async () => {
  let stopped = false;
  const guard = createHostResourceGuard({
    readState: async () => ({freeBytes: GiB, swapBytes: 0}),
    stopOwnedTask: async () => { stopped = true; }
  });
  await assert.rejects(guard.start(), /free disk before launching/);
  assert.equal(stopped, false);
  guard.dispose();
});

test('a failed sample or full evidence disk cannot leave an unhandled monitor failure', async () => {
  let sampling = false, stopped = 0;
  const guard = createHostResourceGuard({
    readState: async () => {
      if (sampling) throw new Error('Host measurement unavailable');
      return {freeBytes: 8 * GiB, swapBytes: 0};
    },
    stopOwnedTask: async () => { stopped++; },
    record: async event => { if (event.type === 'resource-stop') throw new Error('Evidence disk full'); }
  });
  try {
    await guard.start();
    sampling = true;
    const result = await guard.poll();
    assert.equal(stopped, 1);
    assert.equal(result.reason, 'resource-monitor-failed');
    assert.equal(result.recordError, 'Evidence disk full');
  } finally { guard.dispose(); }
});
