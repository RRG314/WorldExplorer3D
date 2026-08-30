import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveChaseCameraTerrainCollision } from '../app/js/hud/chase-camera-terrain.js';
import {
  SOLID_WORLD_PACKS,
  visualHorizonRegions
} from '../app/js/planetary/solid-world-runtime.js';
import { resolvePlanetarySurfaceBoundary } from '../app/js/planetary/runtime/surface-boundary.js';

test('every solid world keeps vehicles inside its accepted surface while retaining free movement within it', () => {
  for (const pack of Object.values(SOLID_WORLD_PACKS)) {
    const manifest = pack.manifest;
    const placement = manifest.renderPlacement;
    const inside = resolvePlanetarySurfaceBoundary(pack.spawn, manifest, { inset: 180 });
    assert.equal(inside.clamped, false, `${pack.bodyId} spawn must remain freely traversable`);

    const beyondEast = resolvePlanetarySurfaceBoundary({
      x: placement.x + manifest.localBounds.maxX + 5_000,
      z: placement.z
    }, manifest, { inset: 180 });
    assert.equal(beyondEast.clamped, true, `${pack.bodyId} must stop before its east edge`);
    assert.equal(beyondEast.edge, 'east');
    assert.equal(beyondEast.x, placement.x + manifest.localBounds.maxX - 180);
  }
});

test('solid-world visual horizons cover every accepted edge and extend beyond the 30 km camera range', () => {
  for (const pack of Object.values(SOLID_WORLD_PACKS)) {
    const regions = visualHorizonRegions(pack.manifest);
    assert.deepEqual(regions.map((region) => region.id), ['north', 'south', 'west', 'east']);
    assert.ok(regions[0].minZ <= -45_000);
    assert.ok(regions[1].maxZ >= 45_000);
    assert.ok(regions[2].minX <= -45_000);
    assert.ok(regions[3].maxX >= 45_000);
    assert.ok(regions[0].maxZ > pack.manifest.localBounds.minZ);
    assert.ok(regions[1].minZ < pack.manifest.localBounds.maxZ);
  }
});

test('planetary chase-camera terrain collision stops the view before an intervening ridge', () => {
  const resolved = resolveChaseCameraTerrainCollision(
    { x: 0, y: 4, z: 0 },
    { x: 0, y: 4, z: -12, collided: false },
    (_x, z) => z < -4 && z > -8 ? 8 : 0,
    { clearance: 1.2, samples: 12 }
  );
  assert.equal(resolved.collided, true);
  assert.ok(resolved.z > -4);
  assert.equal(resolved.y, 4);
});
