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

const farNeedle = resolveFarBuildingMassing(
  { identity: 'bad-far-needle', properties: { height: 180, kind: 'building' } },
  [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 3, z: 8 }, { x: 0, z: 8 }],
  24,
  1
);
assert.equal(farNeedle, null, 'far-field massing must enforce the same sliver rejection');

const farTower = resolveFarBuildingMassing(
  { identity: 'mapped-tower', properties: { height: 80, kind: 'tower' } },
  [{ x: 0, z: 0 }, { x: 2.4, z: 0 }, { x: 2.4, z: 12 }, { x: 0, z: 12 }],
  28.8,
  1
);
assert.equal(farTower?.heightMeters, 80, 'mapped far-field towers must remain available');

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
  rejection
}, null, 2));
