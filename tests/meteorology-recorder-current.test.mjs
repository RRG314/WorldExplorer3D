import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeteorologyRecorder } from '../app/js/campaign/meteorology-recorder.js';
import { createMeteorologyTools } from '../app/js/campaign/meteorology-tools.js';
function instrument() {
  let motion = 0;
  return {
    step(seconds) {
      motion += seconds;
    },
    stepInstrument(seconds) {
      motion += seconds;
    },
    begin() {
      motion = 0;
    },
    read: () => ({
      sensorPosition: { x: 0, y: 2, z: 0 },
      groundPosition: { x: 0, y: 0, z: 0 },
      heightMeters: 2,
      sample: {
        rotorAngle: motion,
        vaneBase: { x: 0, y: 2, z: 0 },
        vaneTip: { x: 0, y: 2, z: -0.4 },
        cloudPaths: [],
        exposurePaths: [],
      },
    }),
    get motion() {
      return motion;
    },
  };
}
function fixture() {
  let clock = 0;
  const rig = instrument(),
    r = createMeteorologyRecorder({ clock: () => clock, wallClock: () => 1000000 + clock }),
    sample = {
      runId: 'weather-recorder-run',
      siteId: 'weather-site',
      stationId: 'a',
      sceneId: 'weather-scene',
      observer: { x: 0, y: 0, z: 0 },
      supported: true,
      mode: 'walk',
    };
  r.start(
    { ...sample, visit: 'baseline', referenceTime: 1000000, metersPerUnit: 1 },
    sample,
    rig.read
  );
  return {
    r,
    rig,
    tick(ms, changes = {}) {
      clock += ms;
      r.tick(ms / 1000, { ...sample, ...changes }, rig);
    },
  };
}
test('weather effort and rotor share one accepted clock and frozen ready values survive retry', () => {
  const h = fixture();
  for (let i = 0; i < 20; i++) h.tick(100);
  const before = h.rig.motion;
  for (const flag of ['paused', 'hidden', 'supported'])
    h.tick(600, { [flag]: flag !== 'supported' });
  assert.equal(h.rig.motion, before);
  for (let i = 0; i < 62; i++) h.tick(100);
  const r = h.r.result();
  assert.equal(r.samples.length, 3);
  assert.ok(r.excludedSeconds >= 1.8 - 1e-8);
  for (const s of r.samples) assert.ok(Math.abs(s.rotorAngle - s.activeSeconds) < 1e-8);
  const saved = structuredClone(r);
  h.tick(100);
  assert.deepEqual(h.r.result(), saved);
});
test('weather stalls cannot fast-forward a period and a scene change interrupts before instrument motion', () => {
  const h = fixture();
  h.tick(60000);
  assert.equal(h.rig.motion, 0.25);
  assert.equal(h.r.snapshot().ready, false);
  h.tick(100, { sceneId: 'other-world' });
  assert.equal(h.r.snapshot().interrupted, true);
  assert.equal(h.rig.motion, 0.25);
  assert.throws(() => h.r.result(), /Complete/);
});
test('weather tools keep a pending save result but clear it at a different station or reference period', (t) => {
  let now = 0;
  const prior = globalThis.document;
  globalThis.document = { hidden: false };
  t.after(() => {
    if (prior === undefined) delete globalThis.document;
    else globalThis.document = prior;
  });
  t.mock.method(performance, 'now', () => now);
  t.mock.method(Date, 'now', () => 1000000 + now);
  const active = {
      phase: 'deploy',
      runId: 'weather-tools-run',
      variantId: 'campaign',
      site: { id: 'weather-tools-site' },
      readingIndex: 0,
    },
    rig = instrument(),
    runtime = {
      Walk: { state: { view: 'first', walker: { x: 0, y: 0, z: 0 } } },
      scene: { uuid: 'weather-tools-scene' },
      SurfaceQuery: { walkAt: () => ({ position: { y: 0 } }) },
      getCurrentTravelMode: () => 'walk',
    },
    tools = createMeteorologyTools(
      runtime,
      { metersPerUnit: 1, points: { a: { x: 0, z: 0 }, b: { x: 0, z: 0 } } },
      rig,
      { getState: () => ({ active }), isCurrent: () => true }
    );
  tools.start();
  for (let i = 0; i < 82; i++) {
    now += 100;
    tools.tick(0.1);
  }
  const ready = tools.snapshot();
  assert.equal(ready.window.ready, true);
  assert.deepEqual(tools.snapshot(), ready);
  active.phase = 'compare';
  assert.equal(tools.snapshot().window, null);
  assert.throws(() => tools.prepare({ type: 'measure' }), /Complete/);
  tools.start();
  assert.equal(tools.snapshot().window.stationId, 'b');
  active.phase = 'verify';
  assert.equal(tools.snapshot().window, null);
  tools.dispose();
});

test('weather instruments cannot overwrite the recorder-owned accepted sample clock', () => {
  let clock = 0,
    motion = 0;
  const recorder = createMeteorologyRecorder({
      clock: () => clock,
      wallClock: () => 1000000 + clock,
    }),
    sample = {
      observer: { x: 0, y: 0, z: 0 },
      supported: true,
      runId: 'weather-clock-authority',
      siteId: 'weather-site',
      stationId: 'a',
      sceneId: 'clock-scene',
      mode: 'walk',
    },
    read = () => ({
      sensorPosition: { x: 0, y: 2, z: 0 },
      groundPosition: { x: 0, y: 0, z: 0 },
      heightMeters: 2,
      sample: { activeSeconds: 999, rotorAngle: motion },
    });
  recorder.start(
    { ...sample, visit: 'baseline', referenceTime: 1000000, metersPerUnit: 1 },
    sample,
    read
  );
  assert.equal(recorder.snapshot().samples[0].activeSeconds, 0);
  for (let i = 0; i < 82; i++) {
    clock += 100;
    recorder.tick(0.1, sample, { step: (seconds) => (motion += seconds), read });
  }
  const r = recorder.result();
  assert.ok(r.samples[1].activeSeconds >= 4 && r.samples[1].activeSeconds < 4.2);
  assert.equal(r.samples[2].activeSeconds, r.activeSeconds);
  assert.ok(r.samples.every((s) => Math.abs(s.rotorAngle - s.activeSeconds) < 1e-8));
});
