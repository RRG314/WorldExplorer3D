import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MINING_YARD,
  miningPlaces,
  miningYardAdmission,
} from '../app/js/campaign/mining-places.js';

test('the fictional yard fails closed without land-use geometry and excludes mapped homes, parks and protected areas', () => {
  const site = {
      id: 'admission-quarry-case',
      location: { lat: MINING_YARD.lat, lon: MINING_YARD.lon },
    },
    qualified = { site, points: { a: { x: 0, z: 0 }, b: { x: 4, z: 0 } } },
    polygon = [
      { x: -1, z: -1 },
      { x: 1, z: -1 },
      { x: 1, z: 1 },
      { x: -1, z: 1 },
    ],
    runtime = { landuses: [], pointInPolygon: (x, z) => Math.abs(x) <= 1 && Math.abs(z) <= 1 };
  assert.throws(() => miningYardAdmission({}, qualified));
  assert.throws(() => miningYardAdmission({ ...runtime, pointInPolygon: null }, qualified));
  for (const type of ['residential', 'park', 'protected', 'nature_reserve', 'cemetery'])
    assert.throws(() =>
      miningYardAdmission({ ...runtime, landuses: [{ type, pts: polygon }] }, qualified)
    );
  assert.equal(miningYardAdmission(runtime, qualified).siteId, site.id);
  assert.throws(() =>
    miningYardAdmission(runtime, { ...qualified, site: { ...site, location: { lat: 0, lon: 0 } } })
  );
});

test('Continue and completed review travel to the actual saved clearing while preserving the street reference in the record', () => {
  const site = {
      name: 'Retained quarry',
      location: { lat: MINING_YARD.lat, lon: MINING_YARD.lon },
      locationContext: { lat: 39.27, lon: -76.59 },
    },
    active = { phase: 'assay', variantId: 'campaign', site },
    profile = {
      researchCareers: {
        mining: { active, records: { campaign: { ...active, phase: 'complete' } } },
      },
    },
    before = structuredClone(profile);
  assert.equal(miningPlaces({ profile })[0].lon, site.location.lon);
  profile.researchCareers.mining.active = { ...active, phase: 'complete' };
  assert.equal(miningPlaces({ profile })[0].lon, site.location.lon);
  assert.deepEqual(site.locationContext, before.researchCareers.mining.active.site.locationContext);
  assert.equal(miningPlaces()[0].id, MINING_YARD.id);
});
