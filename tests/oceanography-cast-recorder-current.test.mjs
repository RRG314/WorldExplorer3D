import test from 'node:test';
import assert from 'node:assert/strict';
import { createOceanographyCastRecorder } from '../app/js/campaign/oceanography-cast-recorder.js';
function cast() {
  let ms = 100000;
  const config = {
      runId: 'ocean-study-0001',
      variantId: 'campaign',
      stationId: 'shelf',
      voyageId: 'voyage1',
      shipId: 'ship1',
      subId: 'sub1'
    },
    position = { lat: -18.2861, lon: 147.7 },
    recorder = createOceanographyCastRecorder({ clock: () => ms, wallClock: () => ms }),
    sample = {
      ...config,
      position,
      active: true,
      moored: true,
      atInstrument: true,
      depthMeters: -1,
      recovered: false
    };
  recorder.start(config, sample);
  const tick = (dt = 0.1, patch = {}) => {
    ms += dt * 1000;
    Object.assign(sample, patch);
    recorder.tick(dt, sample);
  };
  function downcast() {
    for (let n = 0; n < 180 && !recorder.snapshot().measurementComplete; n++) {
      const target = recorder.snapshot().targetDepthMeters;
      tick(0.1, { depthMeters: Math.min(target, sample.depthMeters + 0.1) });
    }
    assert.equal(recorder.snapshot().measurementComplete, true);
  }
  function recover() {
    for (let n = 0; n < 90 && !recorder.snapshot().ready; n++) {
      tick(0.1, {
        depthMeters: Math.max(-1, sample.depthMeters - 0.1),
        recovered: sample.depthMeters < -0.85
      });
    }
  }
  return { recorder, sample, tick, downcast, recover };
}
test('normal active frames sample actual ordered depths, recover physically and freeze an isolated retryable result', () => {
  const c = cast();
  assert.throws(() => c.recorder.result(), /Complete and recover/);
  c.downcast();
  assert.equal(c.recorder.snapshot().ready, false);
  c.recover();
  const r = c.recorder.result();
  assert.equal(r.samples.length, 3);
  assert.ok(r.activeSeconds >= 6);
  assert.equal(r.units.practicalSalinity, 'unitless');
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(r.samples[i].depthMeters - [2, 4, 6][i]) < 0.04);
  r.samples[0].temperatureC = 100;
  assert.notEqual(c.recorder.result().samples[0].temperatureC, 100);
  const before = c.recorder.result();
  c.tick(0.1);
  assert.deepEqual(c.recorder.result(), before);
  c.recorder.dispose();
  assert.equal(c.recorder.snapshot(), null);
});
test('pause, hidden time and long frame gaps cannot substitute for active downcast effort', () => {
  const c = cast();
  c.tick(10, { paused: true });
  assert.equal(c.recorder.snapshot().activeSeconds, 0);
  c.tick(10, { paused: false, hidden: true });
  assert.equal(c.recorder.snapshot().activeSeconds, 0);
  c.tick(10, { hidden: false });
  assert.equal(c.recorder.snapshot().activeSeconds, 0.25);
  assert.ok(c.recorder.snapshot().excludedSeconds >= 29.7);
  c.downcast();
  c.recover();
  assert.equal(c.recorder.result().samples.length, 3);
});
test('vessel change, drifting off station or probe teleport invalidates a volatile cast without creating a result', () => {
  for (const patch of [
    { shipId: 'different' },
    { moored: false },
    { atInstrument: false },
    { shared: true },
    { position: { lat: -18.286, lon: 147.7 } },
    { depthMeters: 6 }
  ]) {
    const c = cast();
    c.tick(0.1, patch);
    assert.equal(c.recorder.snapshot().interrupted, true);
    assert.throws(() => c.recorder.result());
  }
});
