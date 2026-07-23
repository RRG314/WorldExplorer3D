import assert from 'node:assert/strict';
import { commitWorldLocationAuthority } from '../app/js/world/load-location-authority.js';

const calls = [];
const appCtx = {
  LOC: { lat: 39.2904, lon: -76.6122 },
  customLoc: { lat: 39.2904, lon: -76.6122, name: 'Baltimore' },
  livePlaceState: {
    lat: 30,
    lon: -40,
    display: 'Baltimore, Maryland, United States',
    resolutionSource: 'selection-fallback'
  },
  setCustomLocation(location, options) {
    calls.push({ location, options });
    this.customLoc = { ...location };
    return true;
  },
  selectPresetLocation(key) {
    calls.push({ key });
    return true;
  }
};

assert.equal(commitWorldLocationAuthority(appCtx, {
  key: 'custom',
  lat: 30,
  lon: -40,
  name: 'North Atlantic Ocean',
  arrivalMode: 'boat'
}), true);
assert.deepEqual(appCtx.LOC, { lat: 30, lon: -40 });
assert.equal(appCtx.customLoc.name, 'North Atlantic Ocean');
assert.equal(appCtx.livePlaceState.display, 'North Atlantic Ocean');
assert.equal(calls[0].options.syncInputs, false);

assert.equal(commitWorldLocationAuthority(appCtx, {
  key: 'baltimore',
  lat: 39.2904,
  lon: -76.6122,
  name: 'Baltimore'
}), true);
assert.deepEqual(calls.at(-1), { key: 'baltimore' });
assert.equal(commitWorldLocationAuthority(appCtx, { key: 'custom', lat: NaN, lon: 0 }), false);

console.log('World-load location authority passed');
