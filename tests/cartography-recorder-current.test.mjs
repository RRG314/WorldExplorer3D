import test from 'node:test';
import assert from 'node:assert/strict';
import { createCartographyRecorder } from '../app/js/campaign/cartography-recorder.js';
const position = (x) => ({ lat: 39, lon: -76 + x / 111000 / Math.cos((39 * Math.PI) / 180) });
test('walking recorder excludes pause and hidden time, freezes a failed-save-ready result and rejects teleportation', () => {
  let clock = 1000,
    wall = 100000;
  const r = createCartographyRecorder({ clock: () => clock, wallClock: () => wall }),
    config = {
      runId: 'route-test',
      siteId: 'site',
      legIndex: 0,
      sceneId: 'scene',
      destination: position(10),
    },
    sample = (x) => ({
      runId: 'route-test',
      siteId: 'site',
      legIndex: 0,
      sceneId: 'scene',
      position: position(x),
      heightMeters: 0,
      surfaceKind: 'footway',
      supported: true,
      mode: 'walk',
      liveGps: false,
      paused: false,
      hidden: false,
    });
  r.start(config, sample(0));
  const tick = (s, ms = 200) => {
    clock += ms;
    wall += ms;
    r.tick(ms / 1000, s);
  };
  tick({ ...sample(0), paused: true }, 5000);
  tick({ ...sample(0), hidden: true }, 2000);
  assert.equal(r.snapshot().activeSeconds, 0);
  assert.equal(r.snapshot().excludedSeconds, 7);
  for (let x = 0.2; x <= 10; x += 0.2) tick(sample(x));
  const ready = r.prepare();
  assert.equal(ready.ready, true);
  tick(sample(20));
  assert.deepEqual(r.prepare(), ready);
  assert.ok(ready.samples.length < 30);
  r.clear();
  r.start(config, sample(0));
  tick(sample(30));
  assert.equal(r.snapshot().interrupted, true);
  assert.throws(() => r.prepare(), /Restart/);
  r.dispose();
  assert.equal(r.snapshot(), null);
});
test('unsupported surfaces and changed run identities interrupt only the unfinished leg', () => {
  let clock = 0;
  const r = createCartographyRecorder({ clock: () => clock, wallClock: () => 100000 }),
    s = {
      runId: 'test-run',
      siteId: 'test-site',
      legIndex: 0,
      sceneId: 'scene',
      position: position(0),
      heightMeters: 0,
      surfaceKind: 'road',
      supported: true,
      mode: 'walk',
    },
    config = {
      runId: s.runId,
      siteId: s.siteId,
      legIndex: 0,
      sceneId: s.sceneId,
      destination: position(10),
    };
  r.start(config, s);
  clock = 200;
  r.tick(0.2, { ...s, supported: false });
  assert.equal(r.snapshot().interrupted, true);
  r.start(config, s);
  clock = 400;
  r.tick(0.2, { ...s, legIndex: 1 });
  assert.equal(r.snapshot().interrupted, true);
});
