import assert from 'node:assert/strict';
import { placeStateMatchesLocation } from '../app/js/weather/place-resolver.js';

assert.equal(
  placeStateMatchesLocation({ lat: 39.2904, lon: -76.6122 }, { lat: 30, lon: -40 }),
  false,
  'a previous city must not label a new open-ocean location'
);
assert.equal(
  placeStateMatchesLocation({ lat: 39.0968, lon: -120.0324 }, { lat: 39.11, lon: -120.04 }),
  true,
  'nearby actor movement must retain the resolved regional label'
);
assert.equal(placeStateMatchesLocation(null, { lat: 30, lon: -40 }), false);

console.log('HUD place-location authority passed');
