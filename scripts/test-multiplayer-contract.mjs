import assert from 'node:assert/strict';

import {
  WEEKLY_CITY_ROTATION,
  getWeeklyFeaturedCity
} from '../app/js/multiplayer/featured-city-model.js';
import {
  FRAME_LOCATION_TOLERANCE_DEGREES,
  areMultiplayerFramesCompatible
} from '../app/js/multiplayer/ghosts.js';

assert.equal(WEEKLY_CITY_ROTATION.length, 15);
assert.ok(WEEKLY_CITY_ROTATION.every((entry) => entry.kind === 'earth'), 'featured cities must be Earth locations');
assert.equal(new Set(WEEKLY_CITY_ROTATION.map((entry) => entry.city)).size, WEEKLY_CITY_ROTATION.length);
const weekly = getWeeklyFeaturedCity(new Date('2026-08-14T12:00:00Z'));
assert.ok(weekly.city && weekly.cityKey && weekly.kind === 'earth');

const nyFrame = { kind: 'earth', locLat: 40.7128, locLon: -74.006 };
assert.equal(areMultiplayerFramesCompatible(nyFrame, { ...nyFrame }), true);
assert.equal(areMultiplayerFramesCompatible(nyFrame, {
  kind: 'earth',
  locLat: nyFrame.locLat + FRAME_LOCATION_TOLERANCE_DEGREES / 2,
  locLon: nyFrame.locLon
}), true);
assert.equal(areMultiplayerFramesCompatible(nyFrame, { kind: 'earth', locLat: 39.2904, locLon: -76.6122 }), false);
assert.equal(areMultiplayerFramesCompatible(nyFrame, { kind: 'space', locLat: 40.7128, locLon: -74.006 }), false);
assert.equal(areMultiplayerFramesCompatible(nyFrame, null), false);

console.log(JSON.stringify({
  ok: true,
  featuredCityAuthority: weekly,
  featuredCityCount: WEEKLY_CITY_ROTATION.length,
  frameIsolation: true
}, null, 2));
