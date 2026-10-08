import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegionBuild } from '../app/js/earth-core/region-build.js';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('a failed dependency drains and retires later buffers before the next region can start', async () => {
  const late = deferred(), started = deferred(), build = createRegionBuild();
  let disposed = 0, finished = false;
  const error = new Error('elevation rejected');
  const work = build.loadAll([
    { load: async () => { await started.promise; throw error; } },
    { load: async signal => { started.resolve(); await late.promise; assert.equal(signal.aborted, true); return { bytes: new Uint8Array(1024) }; },
      retire: value => { value.bytes = null; disposed++; } }
  ]).finally(() => { build.dispose(); finished = true; });
  const rejected = assert.rejects(work, value => value === error);
  await started.promise; await Promise.resolve(); await Promise.resolve();
  assert.equal(finished, false); late.resolve(); await rejected;
  assert.equal(disposed, 1); build.dispose(); assert.equal(disposed, 1);
});

test('parent cancellation drains a noncooperative provider and releases its late result', async () => {
  const parent = new AbortController(), build = createRegionBuild(parent.signal), late = deferred();
  let retired = 0;
  const work = build.loadAll([{ load: () => late.promise, retire: () => retired++ }]).finally(() => build.dispose());
  const rejected = assert.rejects(work, { name: 'AbortError' });
  parent.abort(); late.resolve({}); await rejected; assert.equal(retired, 1);
});

test('construction transfers only published resources and cleans all remaining inputs', async () => {
  const build = createRegionBuild(), retired = [];
  const source = build.own({ id: 'source' }, v => retired.push(v.id));
  const geometry = build.own({ id: 'geometry' }, v => retired.push(v.id));
  const mesh = build.own({ id: 'mesh', dispose() { retired.push(this.id); retired.push(geometry.id); } });
  build.transfer(geometry); build.transfer(mesh); build.dispose();
  assert.deepEqual(retired, [source.id]); mesh.dispose(); assert.deepEqual(retired, ['source', 'mesh', 'geometry']);
});

test('late adoption after closure is immediately retired and duplicate ownership is idempotent', () => {
  const build = createRegionBuild(); let calls = 0; const resource = { dispose() { calls++; } };
  build.own(resource); build.own(resource); build.dispose(); assert.equal(calls, 1);
  build.own({ dispose() { calls++; } }); assert.equal(calls, 2);
});

test('one broken disposer cannot strand the other construction resources', () => {
  const build = createRegionBuild(); let calls = 0;
  build.own({ dispose() { calls++; } }); build.own({ dispose() { throw Error('broken retirement'); } });
  assert.throws(() => build.dispose(), AggregateError); assert.equal(calls, 1); build.dispose();
});

test('already-cancelled builds do not start providers', async () => {
  const parent = new AbortController(); parent.abort(); const build = createRegionBuild(parent.signal);
  let starts = 0;
  await assert.rejects(build.loadAll([{ load() { starts++; } }]), { name: 'AbortError' });
  assert.equal(starts, 0); build.dispose();
});
