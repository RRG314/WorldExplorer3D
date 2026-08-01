import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LOCS } from '../app/js/config.js';
import { createGlobeSelectorLaunch } from '../app/js/ui/globe-selector/launch.js';
import { detailZoomForDistance, patchRadiusForZoom } from '../app/js/ui/globe-selector/detail-tiles.js';
import { getMenuFavoriteCities } from '../app/js/ui/globe-selector/helpers.js';

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

assert.equal(detailZoomForDistance(2.8), 0);
assert.equal(detailZoomForDistance(1.6), 4);
assert.equal(detailZoomForDistance(1.3), 6);
assert.equal(detailZoomForDistance(1.15), 8);
assert.equal(detailZoomForDistance(1.05), 9);
assert.equal(patchRadiusForZoom(4), 1);
assert.equal(patchRadiusForZoom(8), 2);
assert.equal(patchRadiusForZoom(9), 2);

const selectorSource = fs.readFileSync(new URL('../app/js/ui/globe-selector.js', import.meta.url), 'utf8');
const sceneSource = fs.readFileSync(new URL('../app/js/ui/globe-selector/scene.js', import.meta.url), 'utf8');
const titleSource = fs.readFileSync(new URL('../app/js/ui/title-screen.js', import.meta.url), 'utf8');
assert.match(selectorSource, /onOceanShortcut\(\{ \.\.\.selected \}\)/);
assert.match(sceneSource, /addEventListener\('dblclick'/);
assert.match(titleSource, /await globeSelector\?\.startHere\?\.\(\)/);
assert.match(titleSource, /startOceanMode\(\{\s*launchSite:/);

console.log(JSON.stringify({
  ok: true,
  featuredCities: Object.keys(expectedV3Cities).length,
  coordinateAuthority: 'selected-coordinates-through-launch',
  globeActivation: 'double-click',
  globeDetailZooms: [4, 6, 8, 9],
  oceanLaunch: 'selected-coordinate-launch-site'
}, null, 2));
