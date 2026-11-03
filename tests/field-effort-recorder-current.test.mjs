import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFieldEffortRecorder,
  createFieldMotionRecorder
} from '../app/js/campaign/field-effort-recorder.js';
function instrument(extra = {}) {
  let time = 0;
  const recorder = createFieldEffortRecorder({ clock: () => time, wallClock: () => 1000 + time });
  recorder.start(
    {
      runId: 'effort-run-0001',
      habitatId: 'a',
      method: 'watch',
      seconds: 1,
      metersPerUnit: 1,
      stationary: true,
      ...extra
    },
    { x: 0, z: 0 }
  );
  return {
    recorder,
    tick(sample = {}, ms = 100, dt = ms / 1000) {
      time += ms;
      recorder.tick(dt, {
        position: { x: 0, z: 0 },
        walking: true,
        supported: true,
        paused: false,
        hidden: false,
        ...sample
      });
      return recorder.snapshot();
    }
  };
}
const animal = {
  id: 'research-wildlife:effort-run-0001:a:animal',
  taxon: 'woodland-fox',
  source: 'visible-animal',
  visible: true
};
test('pauses and hidden frames do not create effort or sightings; a visible individual is counted once', () => {
  const h = instrument();
  for (let i = 0; i < 10; i++) h.tick({ paused: true, observations: [animal] });
  for (let i = 0; i < 10; i++) h.tick({ hidden: true, observations: [animal] });
  assert.equal(h.recorder.snapshot().activeSeconds, 0);
  assert.equal(h.recorder.snapshot().observations.length, 0);
  for (let i = 0; i < 10; i++) h.tick({ observations: [animal] });
  const r = h.recorder.snapshot();
  assert.equal(r.complete, true);
  assert.equal(r.activeSeconds, 1);
  assert.equal(r.observations.length, 1);
  assert.equal(r.observations[0].detections, 1);
  assert.ok(r.endedAt - r.startedAt >= 3000);
  assert.ok(r.excludedSeconds >= 1.99);
});
test('movement invalidates a stationary watch; unsupported ground contributes no effort', () => {
  const h = instrument();
  h.tick({ supported: false });
  assert.equal(h.recorder.snapshot().activeSeconds, 0);
  h.tick({ position: { x: 1, z: 0 } });
  assert.equal(h.recorder.snapshot().interrupted, true);
  for (let i = 0; i < 20; i++) h.tick({ position: { x: 1, z: 0 } });
  assert.equal(h.recorder.snapshot().complete, false);
});
test('a walking protocol needs ordered physical gates and keeps actual distance/duration', () => {
  const h = instrument({
    stationary: false,
    method: 'transect',
    gates: [
      { id: 'start', x: 0, z: 0, radiusMeters: 0.3 },
      { id: 'finish', x: 0, z: 5.4, radiusMeters: 0.3 }
    ],
    contains: (p) => Math.abs(p.x) < 0.6 && p.z >= -0.5 && p.z <= 5.9
  });
  for (let i = 0; i < 12; i++) h.tick();
  assert.equal(h.recorder.snapshot().complete, false);
  for (let i = 1; i <= 11; i++) h.tick({ position: { x: 0, z: Math.min(5.4, i * 0.5) } });
  const r = h.recorder.snapshot();
  assert.equal(r.complete, true);
  assert.deepEqual(r.routeGates, ['start', 'finish']);
  assert.ok(r.distanceMeters >= 5 && r.distanceMeters <= 5.5);
  assert.ok(r.activeSeconds > 1);
});
test('a long blocked frame cannot synthesize a complete observation window', () => {
  const h = instrument({ seconds: 10 });
  h.tick({}, 60000, 60);
  const r = h.recorder.snapshot();
  assert.equal(r.complete, false);
  assert.equal(r.activeSeconds, 0.25);
  assert.ok(r.excludedSeconds >= 59.75);
});
test('mounted sensor events require alignment and unique actual motion triggers', () => {
  const h = instrument({
      stationary: false,
      sensor: true,
      trackDistance: false,
      method: 'trail-camera'
    }),
    trigger = { ...animal, source: 'virtual-motion-trigger', visible: false, triggerKey: 'first' };
  for (let i = 0; i < 10; i++) h.tick({ sensorAligned: false, observations: [trigger] });
  assert.equal(h.recorder.snapshot().activeSeconds, 0);
  for (let i = 0; i < 5; i++) h.tick({ sensorAligned: true, observations: [trigger] });
  for (let i = 0; i < 5; i++)
    h.tick({ sensorAligned: true, observations: [{ ...trigger, triggerKey: 'second' }] });
  const r = h.recorder.snapshot();
  assert.equal(r.complete, true);
  assert.equal(r.observations.length, 1);
  assert.equal(r.observations[0].detections, 2);
  assert.equal(r.sensor.aligned, true);
});

test('sensor cooldown follows active effort equally across fast and stalled frames', () => {
  const collect = (wallPause) => {
    const recorder = createFieldMotionRecorder(),
      keys = [];
    for (let tick = 0; tick <= 100; tick++) {
      const key = recorder.observe('animal', { x: tick * 0.02, z: 0 }, true, tick * 0.1);
      if (key) keys.push(key);
      if (wallPause)
        for (let pause = 0; pause < 4; pause++)
          assert.equal(
            recorder.observe('animal', { x: tick * 0.02, z: 0 }, true, tick * 0.1),
            null
          );
    }
    return keys;
  };
  assert.deepEqual(collect(true), collect(false));
  assert.equal(collect(false).length, 6);
});
test('motion needs both displacement and a clear detection, with a fresh epoch after restart', () => {
  const recorder = createFieldMotionRecorder();
  assert.equal(recorder.observe('animal', { x: 0, z: 0 }, true, 0), null);
  assert.equal(recorder.observe('animal', { x: 0.1, z: 0 }, false, 0.1), null);
  assert.equal(recorder.observe('animal', { x: 0.1, z: 0 }, true, 0.2), null);
  assert.equal(recorder.observe('animal', { x: 0.2, z: 0 }, true, 0.3), 'animal:1');
  assert.equal(recorder.observe('animal', { x: 0.3, z: 0 }, true, 0.4), null);
  recorder.clear();
  assert.equal(recorder.observe('animal', { x: 0, z: 0 }, true, 0), null);
  assert.equal(recorder.observe('animal', { x: 0.1, z: 0 }, true, 0.1), 'animal:1');
});
