import assert from 'node:assert/strict';
import test from 'node:test';

import {
  planetaryBlockRenderCoordinates,
  planetaryBlockStorageCoordinates
} from '../app/js/block-builder/world-coordinates.js';
import {
  APOLLO11_SURFACE_REGION,
  CALORIS_PLANITIA_SURFACE_REGION,
  createPlanetarySurfaceAuthority,
  listPlanetarySurfaceRegions,
  MAXWELL_MONTES_SURFACE_REGION,
  OLYMPUS_MONS_SURFACE_REGION
} from '../app/js/planetary/runtime/surface-authority.js';
import {
  activePlanetaryBodyId,
  planetarySurfaceYAtRenderXZ,
  samplePlanetarySurfaceAtRenderXZ
} from '../app/js/planetary/runtime/surface-query.js';

function readyPayload(region, sampler) {
  return {
    sampleHeight: sampler,
    readyAssetIds: region.assets.map((asset) => asset.id)
  };
}

test('all planetary gameplay queries sample the accepted authority in render coordinates', async () => {
  const authority = createPlanetarySurfaceAuthority();
  await authority.prepare(
    APOLLO11_SURFACE_REGION.regionId,
    () => readyPayload(APOLLO11_SURFACE_REGION, (x, z) => x * 0.2 - z * 0.05)
  );
  const appContext = { onMoon: true, onMars: false, planetarySurfaceAuthority: authority };
  const renderX = APOLLO11_SURFACE_REGION.renderPlacement.x + 20;
  const renderZ = APOLLO11_SURFACE_REGION.renderPlacement.z - 10;
  const sample = samplePlanetarySurfaceAtRenderXZ(appContext, renderX, renderZ);

  assert.equal(activePlanetaryBodyId(appContext), 'moon');
  assert.equal(sample.status, 'available');
  assert.deepEqual(sample.local, { x: 20, y: 4.5, z: -10 });
  assert.equal(
    planetarySurfaceYAtRenderXZ(appContext, renderX, renderZ),
    APOLLO11_SURFACE_REGION.renderPlacement.y + 4.5
  );
});

test('a stale accepted surface cannot answer for the currently active body', async () => {
  const authority = createPlanetarySurfaceAuthority();
  await authority.prepare(
    APOLLO11_SURFACE_REGION.regionId,
    () => readyPayload(APOLLO11_SURFACE_REGION, () => 1)
  );
  const appContext = { onMoon: false, onMars: true, planetarySurfaceAuthority: authority };
  const sample = samplePlanetarySurfaceAtRenderXZ(appContext, 0, 0);
  assert.equal(sample.status, 'unavailable');
  assert.equal(sample.reason, 'surface-body-mismatch');
  assert.equal(planetarySurfaceYAtRenderXZ(appContext, 0, 0), null);
});

test('every published solid world round-trips blocks through body-local storage', () => {
  for (const region of listPlanetarySurfaceRegions()) {
    const renderGrid = { gx: 211, gy: -98.5, gz: -944 };
    const stored = planetaryBlockStorageCoordinates(renderGrid, region.renderPlacement);
    const restored = planetaryBlockRenderCoordinates(stored, region.renderPlacement);
    assert.deepEqual(restored, renderGrid);
    assert.equal(Object.isFrozen(stored), true);
  }
});

test('generic solid worlds use their active accepted surface instead of Earth', async () => {
  for (const region of listPlanetarySurfaceRegions().filter((entry) => !['moon', 'mars'].includes(entry.bodyId))) {
    const authority = createPlanetarySurfaceAuthority();
    await authority.prepare(region.regionId, () => readyPayload(region, (x, z) => x * 0.03 + z * 0.02));
    const appContext = {
      onMoon: false,
      onMars: false,
      activePlanetaryBodyId: region.bodyId,
      planetarySurfaceAuthority: authority
    };
    const x = region.renderPlacement.x + 12;
    const z = region.renderPlacement.z - 8;
    assert.equal(activePlanetaryBodyId(appContext), region.bodyId);
    assert.equal(samplePlanetarySurfaceAtRenderXZ(appContext, x, z).status, 'available');
    assert.ok(Math.abs(
      planetarySurfaceYAtRenderXZ(appContext, x, z) - (region.renderPlacement.y + 0.2)
    ) < 1e-9);
  }
});

test('body-local block coordinates remain stable if a future render origin changes', () => {
  const firstPlacement = { x: -746.899043, y: -100, z: -3575.209986 };
  const movedPlacement = { x: 10000.25, y: 800, z: -2500.75 };
  const originalRender = { gx: 200, gy: -95.5, gz: -950 };
  const stored = planetaryBlockStorageCoordinates(originalRender, firstPlacement);
  const rebasedRender = planetaryBlockRenderCoordinates(stored, movedPlacement);

  assert.deepEqual(
    planetaryBlockStorageCoordinates(rebasedRender, movedPlacement),
    stored,
    'saved body-local identity must not depend on a later floating/render origin'
  );
});

test('surface queries reject unknown or unloaded state rather than falling back to Earth', () => {
  assert.deepEqual(
    samplePlanetarySurfaceAtRenderXZ({ onMoon: true }, 0, 0),
    { status: 'unavailable', reason: 'no-accepted-planetary-surface' }
  );
  assert.throws(
    () => samplePlanetarySurfaceAtRenderXZ({ onMoon: true }, Number.NaN, 0),
    /must be finite/
  );
});
