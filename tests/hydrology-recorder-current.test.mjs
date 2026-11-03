import test from 'node:test';
import assert from 'node:assert/strict';
import { createHydrologyRecorder } from '../app/js/campaign/hydrology-recorder.js';
function fixture(kind = 'measure') {
  let clock = 0,
    wall = 1000000,
    motion = 0,
    clearView = true;
  const recorder = createHydrologyRecorder({ clock: () => clock, wallClock: () => wall }),
    sample = {
      observer: { x: 0, y: 0, z: 0 },
      runId: 'hydrology-recorder-test',
      siteId: 'virtual-hydro-site',
      stationId: 'a',
      sceneId: 'scene-a',
      supported: true,
      mode: 'walk',
    };
  recorder.start({ ...sample, kind, metersPerUnit: 1 }, sample);
  const instrument = {
    step(dt) {
      motion += dt;
    },
    read() {
      return kind === 'trace'
        ? { clearView, position: { x: motion * 0.2, y: 1, z: 0 } }
        : {
            section: {
              left: { x: 0, y: 0.9, z: -0.45 },
              right: { x: 0, y: 0.9, z: 0.45 },
              surface: { x: 0, y: 0.9, z: 0 },
              bed: { x: 0, y: 0.65, z: 0 },
            },
            lanes: [0.11, 0.15, 0.13].map((v, i) => ({
              start: { x: 0, y: 0.9, z: i * 0.2 },
              end: { x: 1, y: 0.9, z: i * 0.2 },
              progress: motion * v,
            })),
            paths: Array.from({ length: 9 }, (_, i) => ({
              index: i,
              from: { x: 0, y: 1, z: i * 0.02 },
              to: { x: 0.25, y: 1, z: i * 0.02 },
              blocked: i < 3,
              ...(i < 3 ? { hitMeters: 0.1 } : {}),
            })),
          };
    },
  };
  function tick(ms, changes = {}) {
    clock += ms;
    wall += ms;
    recorder.tick(ms / 1000, { ...sample, ...changes }, instrument);
  }
  return {
    recorder,
    tick,
    setView(value) {
      clearView = value;
    },
    get motion() {
      return motion;
    },
  };
}
test('flow floats and elapsed effort share the accepted clock; pause/hidden/unsupported time cannot move the instrument', () => {
  const h = fixture();
  for (let i = 0; i < 20; i++) h.tick(100);
  const before = h.motion;
  h.tick(600, { paused: true });
  h.tick(600, { hidden: true });
  h.tick(600, { supported: false });
  assert.equal(h.motion, before);
  assert.ok(h.recorder.snapshot().excludedSeconds >= 1.8 - 1e-6);
  for (let i = 0; i < 80; i++) h.tick(100);
  const r = h.recorder.result();
  assert.ok(r.activeSeconds > 9);
  assert.equal(r.optical.length, 3);
  assert.ok(Math.abs(r.widthMeters - 0.9) < 1e-8);
  assert.ok(Math.abs(r.lanes[0].finishedAt - 1 / 0.11) < 1e-8);
  const frozen = structuredClone(r);
  h.tick(100);
  assert.deepEqual(h.recorder.result(), frozen);
});
test('a huge dt cannot complete a reading and an identity change interrupts before stale motion', () => {
  const h = fixture();
  h.tick(60000);
  assert.equal(h.recorder.snapshot().activeSeconds, 0.25);
  assert.equal(h.motion, 0.25);
  h.tick(100, { sceneId: 'scene-b' });
  assert.equal(h.recorder.snapshot().interrupted, true);
  assert.equal(h.motion, 0.25);
  assert.throws(() => h.recorder.result(), /Complete/);
});
test('visible trace requires actual moving positions, excludes paused effort and stops at a supported result', () => {
  const h = fixture('trace');
  for (let i = 0; i < 10; i++) h.tick(100);
  h.tick(1000, { paused: true });
  assert.equal(h.recorder.snapshot().ready, false);
  for (let i = 0; i < 12; i++) h.tick(100);
  const r = h.recorder.result();
  assert.equal(r.clearView, true);
  assert.ok(r.to.x - r.from.x >= 0.15);
  assert.ok(r.completedAt > r.startedAt);
});

test('an obscured trace waits without advancing its float or its effort', () => {
  const h = fixture('trace');
  h.setView(false);
  for (let i = 0; i < 30; i++) h.tick(100);
  assert.equal(h.motion, 0);
  assert.equal(h.recorder.snapshot().activeSeconds, 0);
  h.setView(true);
  for (let i = 0; i < 22; i++) h.tick(100);
  assert.equal(h.recorder.result().clearView, true);
});

import { createHydrologyTools } from '../app/js/campaign/hydrology-tools.js';
test('tools retain a ready trace for retry but cannot reuse it as the next same-station flow measurement', (t) => {
  let now = 0,
    motion = 0,
    kind;
  const priorDocument = globalThis.document;
  globalThis.document = { hidden: false };
  t.after(() => {
    if (priorDocument === undefined) delete globalThis.document;
    else globalThis.document = priorDocument;
  });
  t.mock.method(performance, 'now', () => now);
  t.mock.method(Date, 'now', () => 1000000 + now);
  const active = {
    phase: 'trace',
    runId: 'water-tool-run',
    site: { id: 'virtual-tools' },
    variantId: 'campaign',
    readingIndex: 0,
  };
  const runtime = {
    Walk: { state: { view: 'first', walker: { x: 0, y: 0, z: 0 } } },
    scene: { uuid: 'water-tools-scene' },
    SurfaceQuery: { walkAt: () => ({ position: { y: 0 } }) },
    getCurrentTravelMode: () => 'walk',
  };
  const presentation = {
    begin(value) {
      kind = value;
      motion = 0;
    },
    stepInstrument(seconds) {
      motion += seconds;
    },
    read: () => ({ clearView: true, position: { x: motion * 0.2, y: 1, z: 0 } }),
  };
  const tools = createHydrologyTools(
    runtime,
    { metersPerUnit: 1, points: { a: { x: 0, z: 0 } } },
    presentation,
    { getState: () => ({ active }), isCurrent: () => true }
  );
  tools.start();
  for (let i = 0; i < 22; i++) {
    now += 100;
    tools.tick(0.1);
  }
  const ready = tools.snapshot();
  assert.equal(ready.window.ready, true);
  assert.deepEqual(
    tools.snapshot(),
    ready,
    'an unchanged state preserves the ready result for save retry'
  );
  active.phase = 'measure';
  assert.equal(
    tools.snapshot().window,
    null,
    'a trace is not a flow reading, even at the same bank'
  );
  assert.throws(() => tools.prepare({ type: 'measure' }), /Complete/);
  tools.start();
  assert.equal(kind, 'measure');
  assert.equal(tools.snapshot().window.kind, 'measure');
  tools.dispose();
});
