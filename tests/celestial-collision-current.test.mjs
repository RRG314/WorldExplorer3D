import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveCelestialSceneCollision,
  segmentSphereContact
} from '../app/js/space/celestial-collision.js';

test('swept celestial collision catches a craft that crosses a whole planet between frames', () => {
  const contact = segmentSphereContact(
    { x: -100, y: 0, z: 0 },
    { x: 100, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    25
  );
  assert.equal(contact.hit, true);
  assert.equal(contact.startedInside, false);
  assert.ok(Math.abs(contact.t - 0.375) < 1e-12);

  const resolved = resolveCelestialSceneCollision(
    { x: -100, y: 0, z: 0 },
    { x: 100, y: 0, z: 0 },
    [{ bodyId: 'sun', name: 'Sun', position: { x: 0, y: 0, z: 0 }, radius: 25 }],
    { clearance: 6, padding: 0.1 }
  );
  assert.equal(resolved.collided, true);
  assert.equal(resolved.bodyId, 'sun');
  assert.ok(Math.abs(resolved.position.x + 31.1) < 1e-9);
  assert.equal(resolved.position.y, 0);
  assert.equal(resolved.position.z, 0);
});

test('celestial collision restores a craft that begins inside a body and ignores safe travel', () => {
  const recovered = resolveCelestialSceneCollision(
    { x: 0, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 },
    [{ bodyId: 'mercury', name: 'Mercury', position: { x: 0, y: 0, z: 0 }, radius: 10 }],
    { clearance: 2 }
  );
  assert.equal(recovered.collided, true);
  assert.equal(recovered.startedInside, true);
  assert.ok(recovered.position.x > 12);

  const safe = resolveCelestialSceneCollision(
    { x: -20, y: 20, z: 0 },
    { x: 20, y: 20, z: 0 },
    [{ bodyId: 'mercury', name: 'Mercury', position: { x: 0, y: 0, z: 0 }, radius: 10 }],
    { clearance: 2 }
  );
  assert.equal(safe.collided, false);
  assert.deepEqual(safe.position, { x: 20, y: 20, z: 0 });
});
