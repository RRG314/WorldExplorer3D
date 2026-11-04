import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarineObservationRecorder } from '../app/js/campaign/marine-observation-recorder.js';
function fixture(kind = 'surface', method = 'surface-watch-v1') {
  let tick = 0,
    wall = 100000;
  const api = createMarineObservationRecorder({ clock: () => tick, wallClock: () => wall }),
    config = {
      runId: 'marine-window-1',
      voyageId: 'v1',
      subId: 's1',
      kind,
      method,
      seconds: 8,
      metersPerUnit: 1,
      ...(kind === 'follow' ? { individualId: 'fish-1' } : {}),
    },
    sample = {
      supported: true,
      voyageId: 'v1',
      subId: 's1',
      position: { x: 0, y: -1, z: 0 },
      speedMetersPerSecond: 0,
      context: {
        depthMeters: 1,
        light: { truthType: 'scene-lighting', relative: 1 },
        current: { truthType: 'unavailable' },
      },
      observations: [],
    };
  return {
    api,
    config,
    sample,
    step(seconds, changes = {}) {
      for (let left = seconds; left > 0; left -= 0.1) {
        tick += 100;
        wall += 100;
        api.tick(0.1, { ...sample, ...changes });
      }
    },
  };
}
test('surface non-detection needs explicit effort, excludes paused time and freezes a ready result for retry', () => {
  const f = fixture();
  f.api.start(f.config, f.sample);
  f.step(4);
  f.step(2, { paused: true });
  f.step(4.2);
  const result = f.api.result();
  assert.ok(result.activeSeconds >= 8 && result.activeSeconds < 8.2);
  assert.ok(Math.abs(result.excludedSeconds - 2) < 0.11);
  assert.equal(result.observations.length, 0);
  f.step(3);
  assert.deepEqual(f.api.result(), result);
  assert.equal(result.contexts.length, 3);
});
test('an arbitrary large dt cannot manufacture active effort and identity changes interrupt', () => {
  const f = fixture();
  f.api.start(f.config, f.sample);
  f.api.tick(100, f.sample);
  assert.equal(f.api.snapshot().activeSeconds, 0);
  f.step(1, { voyageId: 'other' });
  assert.equal(f.api.snapshot().interrupted, true);
  assert.throws(() => f.api.result(), /Complete/);
});
test('stationary displacement invalidates the unfinished watch', () => {
  const f = fixture();
  f.api.start(f.config, f.sample);
  f.step(1);
  f.step(0.2, { position: { x: 2.1, y: -1, z: 0 } });
  assert.equal(f.api.snapshot().interrupted, true);
});
test('following requires the same visible licensed individual and actual changing positions', () => {
  const f = fixture('follow', 'individual-follow-v1');
  const animal = {
    truthType: 'simulated-licensed-animal',
    visible: true,
    lineClear: true,
    individualId: 'fish-1',
    speciesId: 'virtual-fish',
    position: { x: 0, y: -1, z: 8 },
    distanceMeters: 8,
    minimumDistanceMeters: 5,
  };
  f.sample.observations = [animal];
  f.api.start(f.config, f.sample);
  f.step(9);
  assert.equal(f.api.snapshot().ready, false, 'Stationary model cannot count as a behavior path');
  for (let i = 0; i < 4; i++) {
    animal.position.x += 2;
    f.step(3);
  }
  // Waiting cannot complete a sequence; later real movement can, without a stuck timer.
  assert.equal(f.api.result().observations.length, 1);
  assert.ok(f.api.result().trajectory.length >= 3);
});
test('the transect cannot finish by waiting or wiggling without crossing its two gates', () => {
  const f = fixture('habitat', 'habitat-transect-v1');
  f.config.gates = [
    { x: 0, y: -1, z: 0 },
    { x: 15, y: -1, z: 0 },
  ];
  f.api.start(f.config, f.sample);
  f.step(9);
  assert.equal(f.api.snapshot().ready, false);
  for (let i = 1; i <= 15; i++) f.step(0.2, { position: { x: i, y: -1, z: 0 } });
  assert.equal(f.api.result().gateIndex, 2);
});

test('unlicensed, occluded or too-close individuals never add follow effort', () => {
  const f = fixture('follow', 'individual-follow-v1'),
    animal = {
      truthType: 'simulated-licensed-animal',
      visible: true,
      lineClear: true,
      individualId: 'fish-1',
      speciesId: 'virtual-fish',
      position: { x: 0, y: -1, z: 8 },
      distanceMeters: 8,
      minimumDistanceMeters: 5,
    };
  f.api.start(f.config, f.sample);
  for (const invalid of [
    { ...animal, visible: false },
    { ...animal, visualState: 'generated', truthType: 'generated' },
    { ...animal, distanceMeters: 2 },
    { ...animal, lineClear: false },
  ])
    f.step(2, { observations: [invalid] });
  assert.equal(f.api.snapshot().activeSeconds, 0);
  assert.equal(f.api.snapshot().observations.length, 0);
});

test('a recreated scene cannot join two partial individual watches even on the same vessel', () => {
  const f = fixture();
  f.config.sceneId = 'scene-a';
  f.sample.sceneId = 'scene-a';
  f.api.start(f.config, f.sample);
  f.step(2);
  f.step(1, { sceneId: 'scene-b' });
  assert.equal(f.api.snapshot().interrupted, true);
  assert.throws(() => f.api.result(), /Complete/);
});
