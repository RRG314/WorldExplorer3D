import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BUILDING_EXTERIOR_FAMILIES,
  DETAIL_MODULES,
  DOOR_STYLES,
  MATERIAL_VARIANTS,
  STOREFRONT_STYLES,
  WINDOW_STYLES,
  buildingExteriorCatalogSnapshot,
  selectBuildingExteriorProfile
} from '../app/js/world/building-exterior-catalog.js';

function profile(overrides = {}) {
  return selectBuildingExteriorProfile({
    buildingIdentity: 'osm:way:12345',
    buildingSeed: 8675309,
    buildingType: 'yes',
    heightMeters: 12,
    levels: 4,
    footprintWidth: 15,
    footprintDepth: 20,
    footprintArea: 300,
    denseUrban: true,
    location: { countryCode: 'US', name: 'Baltimore' },
    tags: {},
    qualityTier: 'balanced',
    ...overrides
  });
}

test('catalog provides the required breadth without per-building assets', () => {
  const snapshot = buildingExteriorCatalogSnapshot();
  assert.ok(snapshot.familyCount >= 20);
  assert.ok(snapshot.materialCount >= 20);
  assert.ok(snapshot.windowCount >= 10);
  assert.ok(snapshot.doorCount >= 10);
  assert.ok(snapshot.storefrontCount >= 8);
  assert.ok(snapshot.detailModuleCount >= 6);
  assert.equal(snapshot.familyCount, Object.keys(BUILDING_EXTERIOR_FAMILIES).length);
  assert.equal(snapshot.materialCount, Object.keys(MATERIAL_VARIANTS).length);
  assert.equal(snapshot.windowCount, Object.keys(WINDOW_STYLES).length);
  assert.equal(snapshot.doorCount, Object.keys(DOOR_STYLES).length);
  assert.equal(snapshot.storefrontCount, Object.keys(STOREFRONT_STYLES).length - 1);
  assert.equal(snapshot.detailModuleCount, DETAIL_MODULES.length);
});

test('the same stable building identity produces the same exterior', () => {
  assert.deepEqual(profile(), profile());
});

test('signed hash combinations never produce an undefined family', () => {
  for (const buildingSeed of [-2147483648, -998877665, -1, 0x7fffffff, 0xffffffff]) {
    const selected = profile({ buildingSeed, buildingIdentity: `signed:${buildingSeed}` });
    assert.equal(typeof selected.familyId, 'string');
    assert.ok(BUILDING_EXTERIOR_FAMILIES[selected.familyId]);
  }
});

test('semantic building families select appropriate exterior systems', () => {
  assert.equal(profile({ tags: { building: 'terrace' }, buildingType: 'terrace', footprintWidth: 6 }).familyId, 'narrow_urban_rowhouse');
  assert.equal(profile({ tags: { building: 'hospital', amenity: 'hospital' }, buildingType: 'hospital' }).familyId, 'hospital_medical');
  assert.match(profile({ tags: { building: 'warehouse' }, buildingType: 'warehouse', footprintArea: 1400 }).familyId, /distribution_loading|warehouse/);
  assert.equal(profile({ tags: { building: 'retail', shop: 'convenience' }, buildingType: 'retail', footprintArea: 1100 }).familyId, 'standalone_retail');
  assert.equal(profile({ tags: { building: 'parking' }, buildingType: 'parking' }).familyId, 'parking_structure');
});

test('quality tiers remove expensive geometry details without changing core identity', () => {
  const quality = profile({ qualityTier: 'quality', buildingIdentity: 'same-building' });
  const low = profile({ qualityTier: 'low', buildingIdentity: 'same-building' });
  assert.equal(low.familyId, quality.familyId);
  assert.equal(low.materialId, quality.materialId);
  assert.equal(low.windowStyle, quality.windowStyle);
  assert.equal(low.doorStyle, quality.doorStyle);
  assert.deepEqual(low.details, []);
  assert.ok(quality.details.length >= low.details.length);
});

test('selection stays representative and labels generated appearance honestly', () => {
  const families = new Set();
  const materials = new Set();
  const windows = new Set();
  const doors = new Set();
  const semanticSamples = [
    { buildingType: 'terrace', tags: { building: 'terrace' }, footprintWidth: 6 },
    { buildingType: 'apartments', tags: { building: 'apartments' }, levels: 8, heightMeters: 26 },
    { buildingType: 'retail', tags: { building: 'retail', shop: 'supermarket' }, footprintArea: 1200 },
    { buildingType: 'office', tags: { building: 'office', office: 'company' }, levels: 16, heightMeters: 55 },
    { buildingType: 'warehouse', tags: { building: 'warehouse' }, footprintArea: 1500 },
    { buildingType: 'hospital', tags: { building: 'hospital', amenity: 'hospital' } }
  ];
  for (let seed = 1; seed <= 96; seed += 1) {
    const selected = profile({
      ...semanticSamples[seed % semanticSamples.length],
      buildingIdentity: `sample:${seed}`,
      buildingSeed: seed * 2654435761
    });
    families.add(selected.familyId);
    materials.add(selected.materialId);
    windows.add(selected.windowStyle);
    doors.add(selected.doorStyle);
    assert.equal(selected.sourceClaim, 'generated-visual-representation');
  }
  assert.ok(families.size >= 6);
  assert.ok(materials.size >= 10);
  assert.ok(windows.size >= 8);
  assert.ok(doors.size >= 7);
});
