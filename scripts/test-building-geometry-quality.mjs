import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  assessTallBuildingFootprint,
  isImplausibleTallBuildingFootprint
} from '../app/js/world/building-geometry-quality.js';
import { resolveFarBuildingMassing } from '../app/js/terrain/far-building-massing.js';

assert.equal(
  isImplausibleTallBuildingFootprint({
    heightMeters: 150,
    widthMeters: 3,
    depthMeters: 8,
    footprintAreaMeters: 24
  }),
  true,
  'a tiny footprint must not be extruded into a skyscraper needle'
);

assert.equal(
  isImplausibleTallBuildingFootprint({
    heightMeters: 200,
    widthMeters: 24,
    depthMeters: 30,
    footprintAreaMeters: 640
  }),
  false,
  'a plausible narrow skyscraper must remain visible'
);

assert.equal(
  isImplausibleTallBuildingFootprint({
    heightMeters: 80,
    widthMeters: 2.4,
    depthMeters: 12,
    footprintAreaMeters: 28,
    intentionalVerticalStructure: true
  }),
  false,
  'mapped towers and other intentional vertical structures must be preserved'
);

assert.equal(
  isImplausibleTallBuildingFootprint({
    heightMeters: 12,
    widthMeters: 2,
    depthMeters: 14,
    footprintAreaMeters: 28
  }),
  false,
  'ordinary low-rise narrow footprints must not be removed'
);

const rejection = assessTallBuildingFootprint({
  heightMeters: 180,
  widthMeters: 4,
  depthMeters: 10,
  footprintAreaMeters: 40
});
assert.equal(rejection.reason, 'implausible-tall-sliver');
assert.ok(rejection.requiredSpanMeters > rejection.minSpanMeters);

const plausibleFarBuilding = {
  identity: 'overture:building:quality-fixture',
  properties: { kind: 'office', height: 42 }
};
const plausibleFootprint = [
  { x: 0, z: 0 },
  { x: 24, z: 0 },
  { x: 24, z: 20 },
  { x: 0, z: 20 }
];
const farMassingA = resolveFarBuildingMassing(plausibleFarBuilding, plausibleFootprint, 480, 1);
const farMassingB = resolveFarBuildingMassing(plausibleFarBuilding, plausibleFootprint, 480, 1);
assert.deepEqual(farMassingA, farMassingB, 'far massing must be deterministic for a stable source identity');
assert.equal(farMassingA?.heightMeters, 42, 'far massing must preserve a valid mapped height');

const rejectedFarSliver = resolveFarBuildingMassing({
  identity: 'overture:building:sliver-fixture',
  properties: { kind: 'office', height: 180 }
}, [
  { x: 0, z: 0 },
  { x: 3, z: 0 },
  { x: 3, z: 10 },
  { x: 0, z: 10 }
], 30, 1);
assert.equal(rejectedFarSliver, null, 'far massing must reject the same implausible tall slivers as detailed buildings');

const buildingPassSource = await fs.readFile(
  new URL('../app/js/world/load-building-pass.js', import.meta.url),
  'utf8'
);
assert.doesNotMatch(
  buildingPassSource,
  /tieredMassing|createTieredBuildingGeometry|insetFootprintForUpperMass/,
  'mapped building footprints must not be procedurally reshaped into invented tiers'
);

console.log(JSON.stringify({
  ok: true,
  contract: 'building-geometry-quality',
  rejection,
  farMassing: farMassingA
}, null, 2));
