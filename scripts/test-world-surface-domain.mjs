import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  isPolarCryosphereLocation,
  resolveWorldSurfaceDomain
} from '../app/js/earth-core/world-surface-domain.js';
import {
  createLocalEnuFrame,
  geographicToLocalEnu,
  localEnuToGeographic
} from '../app/js/terrain/source-contract.js';
import { polarCryosphereWorldYAt } from '../app/js/terrain/polar-cryosphere-surface.js';
import { classifyBiomeProfile } from '../app/js/earth-core/biome-profile.js';

const polarSurfaceSource = fs.readFileSync(
  new URL('../app/js/terrain/polar-cryosphere-surface.js', import.meta.url),
  'utf8'
);
assert.match(
  polarSurfaceSource,
  /pendingTerrainTile = false/,
  'The cryosphere mesh must retire the green loading placeholder before gameplay.'
);

assert.equal(isPolarCryosphereLocation({ lat: 90, lon: 0 }), true);
assert.equal(isPolarCryosphereLocation({ lat: 85.99, lon: 0 }), false);

const northPole = resolveWorldSurfaceDomain({
  location: { lat: 90, lon: 0, name: 'North Pole' },
  mappedWaterKind: 'open_ocean',
  requestedArrivalMode: 'boat'
});
assert.equal(northPole.kind, 'cryosphere');
assert.equal(northPole.subtype, 'sea_ice');
assert.equal(northPole.groundMode, 'polar-cryosphere-local');
assert.equal(northPole.walkable, true);
assert.equal(northPole.supportsBoatArrival, false);

const southPole = resolveWorldSurfaceDomain({ location: { lat: -90, lon: 0 } });
assert.equal(southPole.kind, 'cryosphere');
assert.equal(southPole.subtype, 'ice_sheet');

const openOcean = resolveWorldSurfaceDomain({
  location: { lat: 0, lon: -30 },
  mappedWaterKind: 'open_ocean'
});
assert.equal(openOcean.kind, 'ocean');
assert.equal(openOcean.groundMode, 'open-ocean-surface-only');

const city = resolveWorldSurfaceDomain({ location: { lat: 39.2904, lon: -76.6122 } });
assert.equal(city.kind, 'land');

assert.equal(classifyBiomeProfile({
  latitude: -3.46,
  signals: { vegetated: 0.82, water: 0.08 }
}).id, 'tropical-rainforest');
assert.equal(classifyBiomeProfile({
  latitude: 26,
  signals: { vegetated: 0.01, water: 0, arid: 0.7 }
}).id, 'hot-desert');
assert.equal(classifyBiomeProfile({
  latitude: 72,
  signals: { vegetated: 0.15 }
}).id, 'tundra');

const frame = createLocalEnuFrame({ latitude: 90, longitude: 0 });
const poleEast = geographicToLocalEnu(frame, {
  latitude: 89.99,
  longitude: 90,
  heightMeters: 0
});
const poleWest = geographicToLocalEnu(frame, {
  latitude: 89.99,
  longitude: -90,
  heightMeters: 0
});
assert.ok(poleEast.eastMeters > 1000, 'eastward polar coordinates must retain horizontal separation');
assert.ok(poleWest.eastMeters < -1000, 'westward polar coordinates must retain horizontal separation');
const roundTrip = localEnuToGeographic(frame, {
  eastMeters: poleEast.eastMeters,
  northMeters: poleEast.northMeters,
  upMeters: poleEast.upMeters
});
assert.ok(Math.abs(roundTrip.latitude - 89.99) < 1e-7);
assert.ok(Math.abs(roundTrip.longitude - 90) < 1e-7);

for (const latitude of [90, -90]) {
  for (const [x, z] of [[0, 0], [1200, -700], [-8000, 4000]]) {
    assert.ok(Number.isFinite(polarCryosphereWorldYAt(x, z, {
      latitude,
      worldUnitsPerMeter: 1 / 1.11
    })));
  }
}

console.log(JSON.stringify({
  ok: true,
  contract: 'world-surface-domain',
  northPole,
  southPole,
  polarSeparationMeters: poleEast.eastMeters - poleWest.eastMeters
}, null, 2));
