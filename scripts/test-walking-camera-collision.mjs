import assert from 'node:assert/strict';
import { resolveThirdPersonCameraCollision } from '../app/js/walking/camera-collision.js';

const clear = resolveThirdPersonCameraCollision({
  anchor: { x: 0, y: 2, z: 0 },
  target: { x: 0, y: 3, z: -5 },
  checkBuildingCollision: () => ({ collision: false })
});
assert.equal(clear.collided, false);
assert.deepEqual({ x: clear.x, y: clear.y, z: clear.z }, { x: 0, y: 3, z: -5 });

const againstFacade = resolveThirdPersonCameraCollision({
  anchor: { x: 0, y: 2, z: 0 },
  target: { x: 0, y: 3, z: -5 },
  checkBuildingCollision: (_x, z) => ({ collision: z <= -2 })
});
assert.equal(againstFacade.collided, true);
assert.ok(againstFacade.z > -2, `camera must remain in front of the facade: ${JSON.stringify(againstFacade)}`);
assert.ok(againstFacade.ratio > 0.08 && againstFacade.ratio < 0.5);

const guardrailOnly = resolveThirdPersonCameraCollision({
  anchor: { x: 0, y: 2, z: 0 },
  target: { x: 0, y: 3, z: -5 },
  checkBuildingCollision: (_x, _z, _radius, options) => ({
    collision: options.acceptCollision({ building: { buildingType: 'bridge_guardrail' } })
  })
});
assert.equal(guardrailOnly.collided, false);

console.log(JSON.stringify({ ok: true, facadeOcclusionPrevented: true, guardrailExcluded: true }, null, 2));
