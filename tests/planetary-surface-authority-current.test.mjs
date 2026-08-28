import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APOLLO11_SURFACE_REGION,
  createPlanetarySurfaceAuthority,
  createSurfaceRegionManifest,
  listPlanetarySurfaceRegions,
  OLYMPUS_MONS_SURFACE_REGION
} from '../app/js/planetary/runtime/surface-authority.js';

function readyPayload(region, sampleHeight = (x, z) => x * 0.1 + z * 0.01) {
  return {
    sampleHeight,
    readyAssetIds: region.assets.map((asset) => asset.id)
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('reviewed Moon and Mars regions have isolated stable addresses and complete provenance', () => {
  const regions = listPlanetarySurfaceRegions();
  assert.deepEqual(regions.map((region) => region.regionId), [
    'apollo-11-tranquility-base',
    'mars-olympus-mons'
  ]);
  for (const region of regions) {
    assert.equal(region.address.bodyId, region.bodyId);
    assert.equal(region.address.regionId, region.regionId);
    assert.match(region.addressKey, new RegExp(`:${region.bodyId}:`));
    assert.ok(region.source.url.startsWith('https://'));
    assert.ok(region.source.provider);
    assert.ok(region.source.attribution);
    assert.ok(region.source.rights);
    assert.ok(region.source.processing);
    assert.deepEqual(region.assets.map((asset) => asset.role), ['height', 'albedo']);
    assert.ok(region.assets.every((asset) => asset.sourceProduct && asset.url.startsWith('/app/assets/')));
    assert.equal(Object.isFrozen(region), true);
  }
  assert.notEqual(APOLLO11_SURFACE_REGION.addressKey, OLYMPUS_MONS_SURFACE_REGION.addressKey);
});

test('solid-surface manifests fail closed for a giant planet', () => {
  assert.throws(() => createSurfaceRegionManifest({
    regionId: 'fake-jupiter-ground',
    bodyId: 'jupiter',
    truthClass: 'modeled',
    address: {
      latitudeDeg: 0,
      longitudeDegPositiveEast: 0,
      heightM: 0,
      scopeType: 'world',
      scopeId: 'public'
    },
    coordinateSystem: 'invalid',
    verticalDatum: 'invalid',
    metersPerUnit: 1,
    localBounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 },
    source: { title: 'invalid', url: 'https://example.invalid', provider: 'invalid' },
    assets: [{ id: 'fake-height', role: 'height', url: '/fake', sourceProduct: 'fake' }]
  }), /cannot own a solid-surface world address/);
});

test('a candidate remains unpublished until its required assets and sampler are accepted', async () => {
  const clock = { value: 1000 };
  const authority = createPlanetarySurfaceAuthority({ now: () => clock.value });
  const load = deferred();
  const pending = authority.prepare(APOLLO11_SURFACE_REGION.regionId, () => load.promise);

  assert.equal(authority.snapshot().status, 'loading');
  assert.equal(authority.snapshot().active, null);
  assert.deepEqual(authority.sampleAtLocalXZ(0, 0), {
    status: 'unavailable',
    reason: 'no-accepted-surface'
  });

  load.resolve(readyPayload(APOLLO11_SURFACE_REGION));
  const accepted = await pending;
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.active.acceptedAtMs, 1000);
  assert.deepEqual(accepted.active.readyAssetIds, APOLLO11_SURFACE_REGION.assets.map((asset) => asset.id));
});

test('accepted samples carry identity, provenance, local height, and render placement', async () => {
  const authority = createPlanetarySurfaceAuthority({ now: () => 7 });
  await authority.prepare(
    APOLLO11_SURFACE_REGION.regionId,
    () => readyPayload(APOLLO11_SURFACE_REGION, (x, z) => x + z)
  );
  const sample = authority.sampleAtLocalXZ(10, -4, {
    bodyId: 'moon',
    regionId: APOLLO11_SURFACE_REGION.regionId
  });
  assert.equal(sample.status, 'available');
  assert.equal(sample.local.y, 6);
  assert.equal(sample.render.x, 10 + APOLLO11_SURFACE_REGION.renderPlacement.x);
  assert.equal(sample.render.y, 6 + APOLLO11_SURFACE_REGION.renderPlacement.y);
  assert.equal(sample.render.z, -4 + APOLLO11_SURFACE_REGION.renderPlacement.z);
  assert.equal(sample.addressKey, APOLLO11_SURFACE_REGION.addressKey);
  assert.equal(sample.source.url, APOLLO11_SURFACE_REGION.source.url);
});

test('body, region, and bounds mismatches never leak another world surface', async () => {
  const authority = createPlanetarySurfaceAuthority();
  await authority.prepare(APOLLO11_SURFACE_REGION.regionId, () => readyPayload(APOLLO11_SURFACE_REGION));
  assert.equal(authority.sampleAtLocalXZ(0, 0, { bodyId: 'mars' }).reason, 'surface-body-mismatch');
  assert.equal(authority.sampleAtLocalXZ(0, 0, { regionId: 'mars-olympus-mons' }).reason, 'surface-region-mismatch');
  assert.equal(
    authority.sampleAtLocalXZ(APOLLO11_SURFACE_REGION.localBounds.maxX + 1, 0).reason,
    'outside-accepted-surface'
  );
});

test('an incomplete replacement is rejected while the accepted surface stays queryable', async () => {
  const authority = createPlanetarySurfaceAuthority();
  await authority.prepare(APOLLO11_SURFACE_REGION.regionId, () => readyPayload(APOLLO11_SURFACE_REGION, () => 42));
  const rejected = await authority.prepare(OLYMPUS_MONS_SURFACE_REGION.regionId, () => ({
    sampleHeight: () => 9,
    readyAssetIds: [OLYMPUS_MONS_SURFACE_REGION.assets[0].id]
  }));
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.reason, 'required-surface-assets-not-ready');
  assert.equal(rejected.active.regionId, APOLLO11_SURFACE_REGION.regionId);
  assert.equal(authority.sampleAtLocalXZ(0, 0, { bodyId: 'moon' }).local.y, 42);
});

test('a newer region request supersedes a late older candidate without publishing it', async () => {
  const authority = createPlanetarySurfaceAuthority();
  const slow = deferred();
  const moonPending = authority.prepare(APOLLO11_SURFACE_REGION.regionId, () => slow.promise);
  const marsAccepted = await authority.prepare(
    OLYMPUS_MONS_SURFACE_REGION.regionId,
    () => readyPayload(OLYMPUS_MONS_SURFACE_REGION, () => 11)
  );
  slow.resolve(readyPayload(APOLLO11_SURFACE_REGION, () => 99));
  const moonResult = await moonPending;

  assert.equal(marsAccepted.status, 'accepted');
  assert.equal(moonResult.status, 'superseded');
  assert.equal(authority.sampleAtLocalXZ(0, 0, { bodyId: 'mars' }).local.y, 11);
  assert.equal(authority.sampleAtLocalXZ(0, 0, { bodyId: 'moon' }).reason, 'surface-body-mismatch');
});

test('loaded regions can be activated and rolled back without reloading assets', async () => {
  let moonLoads = 0;
  let marsLoads = 0;
  const authority = createPlanetarySurfaceAuthority();
  await authority.prepare(APOLLO11_SURFACE_REGION.regionId, () => {
    moonLoads += 1;
    return readyPayload(APOLLO11_SURFACE_REGION, () => 1);
  });
  await authority.prepare(OLYMPUS_MONS_SURFACE_REGION.regionId, () => {
    marsLoads += 1;
    return readyPayload(OLYMPUS_MONS_SURFACE_REGION, () => 2);
  });

  assert.equal(authority.activate(APOLLO11_SURFACE_REGION.regionId).active.bodyId, 'moon');
  assert.equal(authority.sampleAtLocalXZ(0, 0, { bodyId: 'moon' }).local.y, 1);
  assert.equal(authority.rollback().active.bodyId, 'mars');
  assert.equal(authority.sampleAtLocalXZ(0, 0, { bodyId: 'mars' }).local.y, 2);
  assert.deepEqual({ moonLoads, marsLoads }, { moonLoads: 1, marsLoads: 1 });
});

test('activating a known but unloaded region fails without displacing the active publication', async () => {
  const authority = createPlanetarySurfaceAuthority();
  await authority.prepare(APOLLO11_SURFACE_REGION.regionId, () => readyPayload(APOLLO11_SURFACE_REGION, () => 3));
  const result = authority.activate(OLYMPUS_MONS_SURFACE_REGION.regionId);
  assert.equal(result.status, 'rejected');
  assert.equal(result.reason, 'surface-region-not-loaded');
  assert.equal(result.active.bodyId, 'moon');
  assert.equal(authority.sampleAtLocalXZ(0, 0, { bodyId: 'moon' }).local.y, 3);
});
