import assert from 'node:assert/strict';
import { constrainTunnelCameraXZ } from '../app/js/camera/tunnel-corridor.js';

const curvedTunnel = {
  pts: [
    { x: 0, z: 0 },
    { x: 0, z: 10 },
    { x: 4, z: 18 },
    { x: 12, z: 22 },
    { x: 22, z: 22 }
  ]
};

const desiredAcrossWall = { x: -6, z: 16 };
const constrained = constrainTunnelCameraXZ(
  curvedTunnel,
  desiredAcrossWall.x,
  desiredAcrossWall.z,
  10,
  21
);
assert.equal(constrained.applied, true);
assert.ok(constrained.segmentIndex >= 0 && constrained.segmentIndex < curvedTunnel.pts.length - 1);
assert.ok(constrained.correctionDistance > 1, 'fixture should require a material wall-crossing correction');

const doubledBackTunnel = {
  pts: [
    { x: 0, z: 0 },
    { x: 0, z: 10 },
    { x: 0, z: 20 },
    { x: 1, z: 30 },
    ...Array.from({ length: 70 }, (_, index) => ({ x: 100 + index, z: 100 })),
    { x: 1, z: 31 },
    { x: 1, z: 21 },
    { x: 1, z: 11 },
    { x: 1, z: 1 }
  ]
};
const localBore = constrainTunnelCameraXZ(doubledBackTunnel, 0.9, 12, 0, 14, { segmentWindow: 4 });
assert.ok(localBore.segmentIndex <= 3, 'camera must remain on the actor’s local bore');
assert.ok(Math.abs(localBore.x) < 0.01, 'camera must not jump to the adjacent return bore');

const invalid = constrainTunnelCameraXZ(null, 3, 4, 0, 0);
assert.equal(invalid.applied, false);
assert.deepEqual({ x: invalid.x, z: invalid.z }, { x: 3, z: 4 });

console.log('Tunnel camera corridor contract passed');
