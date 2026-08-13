import assert from 'node:assert/strict';
import {
  GEOLOCATION_OPTIONS,
  clampDetectedCoords,
  geolocationErrorMessage,
  requestCurrentPosition
} from '../app/js/ui/title-screen/geolocation.js';

assert.deepEqual(clampDetectedCoords(94, 541), { lat: 90, lon: -179 });
assert.deepEqual(clampDetectedCoords(-94, -541), { lat: -90, lon: 179 });
assert.match(geolocationErrorMessage({ code: 1 }), /denied/i);
assert.match(geolocationErrorMessage({ code: 2 }), /determine/i);
assert.match(geolocationErrorMessage({ code: 3 }), /timed out/i);

let receivedOptions = null;
const position = await requestCurrentPosition({
  getCurrentPosition(success, _failure, options) {
    receivedOptions = options;
    success({ coords: { latitude: 39.2904, longitude: -76.6122 } });
  }
});
assert.deepEqual(position, { lat: 39.2904, lon: -76.6122 });
assert.deepEqual(receivedOptions, GEOLOCATION_OPTIONS);

await assert.rejects(
  requestCurrentPosition(null),
  (error) => /not supported/i.test(String(error?.userMessage || ''))
);
await assert.rejects(
  requestCurrentPosition({
    getCurrentPosition(_success, failure) {
      failure({ code: 3 });
    }
  }),
  (error) => /timed out/i.test(String(error?.userMessage || ''))
);

console.log(JSON.stringify({
  ok: true,
  contract: 'title-geolocation-browser-adapter',
  options: GEOLOCATION_OPTIONS,
  verified: ['coordinate-normalization', 'success', 'unsupported', 'timeout']
}, null, 2));
