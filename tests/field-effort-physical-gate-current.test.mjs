import test from 'node:test';
import assert from 'node:assert/strict';
import { createFieldEffortRecorder } from '../app/js/campaign/field-effort-recorder.js';
test('reaching a receiving station cannot finish a measured route until its physical apparatus also accepts the load', () => {
  let time = 0,
    onPan = false;
  const r = createFieldEffortRecorder({ clock: () => time, wallClock: () => 100000 + time });
  r.start(
    {
      runId: 'carrier-physical-gate',
      habitatId: 'receiving-pan',
      method: 'carrier',
      seconds: 0.5,
      metersPerUnit: 1,
      sensor: true,
      gates: [{ id: 'pan', x: 0, z: 0, radiusMeters: 1.6, accept: () => onPan }],
    },
    { x: 0, z: 0 }
  );
  const sample = { position: { x: 0, z: 0 }, walking: true, supported: true, sensorAligned: true };
  for (let i = 0; i < 4; i++) {
    time += 200;
    r.tick(0.2, sample);
  }
  assert.ok(r.snapshot().activeSeconds >= 0.5);
  assert.equal(r.snapshot().complete, false);
  assert.deepEqual(r.snapshot().routeGates, []);
  onPan = true;
  time += 200;
  r.tick(0.2, { ...sample, paused: true });
  assert.equal(r.snapshot().complete, false);
  time += 200;
  r.tick(0.2, sample);
  assert.equal(r.snapshot().complete, true);
  assert.deepEqual(r.snapshot().routeGates, ['pan']);
  r.dispose();
});
