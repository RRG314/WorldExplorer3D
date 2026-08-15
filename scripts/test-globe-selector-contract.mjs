import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LOCS } from '../app/js/config.js';
import { createGlobeSelectorLaunch } from '../app/js/ui/globe-selector/launch.js';
import {
  getMenuFavoriteCities,
  parseReverseAddress,
  resolveCoordinateSurfaceEvidence
} from '../app/js/ui/globe-selector/helpers.js';

const expectedV3Cities = {
  baltimore: [39.2904, -76.6122],
  hollywood: [34.0928, -118.3287],
  newyork: [40.7580, -73.9855],
  miami: [25.7617, -80.1918],
  tokyo: [35.6762, 139.6503],
  monaco: [43.7384, 7.4246],
  nurburgring: [50.3356, 6.9475],
  lasvegas: [36.1699, -115.1398],
  london: [51.5074, -0.1278],
  paris: [48.8566, 2.3522],
  dubai: [25.2048, 55.2708],
  sanfrancisco: [37.7749, -122.4194],
  losangeles: [34.0522, -118.2437],
  chicago: [41.8781, -87.6298],
  seattle: [47.6062, -122.3321]
};

assert.deepEqual(Object.keys(LOCS), Object.keys(expectedV3Cities));
for (const [key, [lat, lon]] of Object.entries(expectedV3Cities)) {
  assert.equal(LOCS[key].lat, lat, `${key} latitude changed`);
  assert.equal(LOCS[key].lon, lon, `${key} longitude changed`);
}
assert.equal(getMenuFavoriteCities(LOCS).length, 15);

let receivedSelection = null;
const launch = createGlobeSelectorLaunch({
  applyCoordinateSelection: () => true,
  close() {},
  getSelection: () => ({ lat: LOCS.tokyo.lat, lon: LOCS.tokyo.lon, name: LOCS.tokyo.name }),
  hasDirtyCoordinates: () => false,
  isOpen: () => true,
  onStartHere(selection) {
    receivedSelection = selection;
    return true;
  },
  prepareSelection() {},
  setShortcutButtonsBusy() {},
  setStartButtonBusy() {},
  setStatus() {}
});
assert.equal(await launch.startHere(), true);
assert.deepEqual(receivedSelection, {
  lat: LOCS.tokyo.lat,
  lon: LOCS.tokyo.lon,
  name: LOCS.tokyo.name
});

assert.equal(parseReverseAddress({ type: 'sea', display_name: 'North Atlantic Ocean' }).waterKind, 'open_ocean');
assert.equal(parseReverseAddress({ address: { lake: 'Lake Erie' } }).waterKind, 'lake');
assert.equal(parseReverseAddress({
  category: 'boundary',
  type: 'administrative',
  name: 'Watertown',
  display_name: 'Watertown, Jefferson County, New York'
}).waterKind, null);

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => new Response(
    "GetFeatureInfo results:\nvalue_list = '284'",
    { status: 200, headers: { 'content-type': 'text/plain' } }
  );
  const africaLand = await resolveCoordinateSurfaceEvidence(7.8939, -4.9369, {
    category: 'boundary',
    type: 'administrative',
    display_name: 'Gbêkê, Vallée du Bandama, Côte d’Ivoire'
  });
  assert.equal(africaLand.kind, 'land');
  assert.equal(africaLand.elevationMeters, 284);

  globalThis.fetch = async () => new Response(
    "GetFeatureInfo results:\nvalue_list = '-4300'",
    { status: 200, headers: { 'content-type': 'text/plain' } }
  );
  const verifiedOcean = await resolveCoordinateSurfaceEvidence(0, -140, {});
  assert.equal(verifiedOcean.kind, 'open_ocean');

  let polarFetches = 0;
  globalThis.fetch = async () => {
    polarFetches += 1;
    throw new Error('polar classification must not call GEBCO');
  };
  const polar = await resolveCoordinateSurfaceEvidence(90, 0, {});
  assert.equal(polar.kind, 'cryosphere');
  assert.equal(polarFetches, 0);
} finally {
  globalThis.fetch = originalFetch;
}

const sceneSource = fs.readFileSync(new URL('../app/js/ui/globe-selector/scene.js', import.meta.url), 'utf8');
assert.match(sceneSource, /earth_atmos_2048\.jpg/);
assert.doesNotMatch(sceneSource, /createGlobeDetailTiles|detailTiles|World_Imagery/);
assert.equal(fs.existsSync(new URL('../app/js/ui/globe-selector/detail-tiles.js', import.meta.url)), false);

console.log(JSON.stringify({
  ok: true,
  featuredCities: Object.keys(expectedV3Cities).length,
  coordinateAuthority: 'selected-coordinates-through-launch',
  browserActivationOwner: 'test-globe-selector-browser',
  globeImagery: 'original-earth-texture-only',
  oceanLaunchOwner: 'test-globe-selector-browser'
}, null, 2));
