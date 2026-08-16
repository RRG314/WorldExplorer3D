import assert from 'node:assert/strict';
import {
  createSelectionRestoreCommand,
  createWorldLoadRequest,
  isWorldLoadRequestActive
} from '../app/js/earth-core/world-load-request.js';
import {
  captureEarthLoadIntent,
  restoreEarthLoadIntent
} from '../app/js/runtime/on-demand-earth.js';

const sourceSelection = {
  key: 'custom',
  name: 'Sydney, Australia',
  lat: -33.8688,
  lon: 151.2093,
  arrivalMode: 'walk'
};
const request = createWorldLoadRequest(sourceSelection, 7);
assert.ok(request, 'valid selected location should create a request');
assert.equal(request.id, 'world-load:7:-33.8688000:151.2093000:custom');
assert.ok(Object.isFrozen(request));
assert.ok(Object.isFrozen(request.location));
assert.ok(Object.isFrozen(request.selection));

sourceSelection.name = 'Mutated old title selection';
sourceSelection.lat = 39.2904;
assert.equal(request.name, 'Sydney, Australia');
assert.deepEqual(request.location, { lat: -33.8688, lon: 151.2093 });

assert.deepEqual(createSelectionRestoreCommand(request), {
  method: 'setCustomLocation',
  selection: request.selection,
  options: { transient: false, syncInputs: false }
});

const presetRequest = createWorldLoadRequest({
  key: 'london', name: 'London', lat: 51.5074, lon: -0.1278
}, 8);
assert.deepEqual(createSelectionRestoreCommand(presetRequest), {
  method: 'selectPresetLocation',
  key: 'london'
});

const sameLocation = (left, right) =>
  Math.abs(Number(left?.lat) - Number(right?.lat)) < 1e-9 &&
  Math.abs(Number(left?.lon) - Number(right?.lon)) < 1e-9;
assert.equal(isWorldLoadRequestActive(request, {
  activeSequence: 7,
  activeLocation: { lat: -33.8688, lon: 151.2093 },
  sameLocation,
  suppressed: false
}), true);
assert.equal(isWorldLoadRequestActive(request, {
  activeSequence: 8,
  activeLocation: request.location,
  sameLocation
}), false, 'a superseded sequence must not remain active');
assert.equal(isWorldLoadRequestActive(request, {
  activeSequence: 7,
  activeLocation: request.location,
  sameLocation,
  suppressed: true
}), false, 'a suppressed Earth scene must not remain active');
assert.equal(isWorldLoadRequestActive(request, {
  activeSequence: 7,
  activeLocation: { lat: 39.2904, lon: -76.6122 },
  sameLocation
}), false, 'a different location must not match the request');

assert.equal(createWorldLoadRequest(null, 1), null);
assert.equal(createWorldLoadRequest({ key: 'bad', lat: 91, lon: 0 }, 1), null);
assert.equal(createWorldLoadRequest({ key: 'bad', lat: 0, lon: 'invalid' }, 1), null);
assert.equal(createWorldLoadRequest({ key: 'bad', lat: 0, lon: 0 }, 0), null);

const lazySelectionState = {
  key: 'baltimore',
  name: 'Baltimore',
  lat: 39.2904,
  lon: -76.6122
};
const lazyAppCtx = {
  resolveLocationSelection: () => lazySelectionState,
  selectPresetLocation(key) {
    lazySelectionState.key = key;
    lazySelectionState.name = key === 'baltimore' ? 'Baltimore' : 'Monaco';
    lazySelectionState.lat = key === 'baltimore' ? 39.2904 : 43.7384;
    lazySelectionState.lon = key === 'baltimore' ? -76.6122 : 7.4246;
    return true;
  },
  setCustomLocation(selection) {
    Object.assign(lazySelectionState, selection);
    return true;
  }
};
const capturedLazyIntent = captureEarthLoadIntent(lazyAppCtx);
lazyAppCtx.selectPresetLocation('monaco');
assert.equal(capturedLazyIntent.key, 'baltimore');
assert.equal(capturedLazyIntent.lat, 39.2904);
assert.equal(restoreEarthLoadIntent(lazyAppCtx, capturedLazyIntent), true);
assert.equal(lazySelectionState.key, 'baltimore');
assert.equal(lazySelectionState.lon, -76.6122);

console.log(JSON.stringify({
  ok: true,
  contract: 'immutable-world-load-request',
  behaviors: [
    'selection-snapshot-is-immutable',
    'lazy-runtime-request-boundary-is-immutable',
    'custom-and-preset-restoration-commands',
    'sequence-and-location-cancellation',
    'suppressed-scene-rejection',
    'invalid-input-rejection'
  ]
}, null, 2));
