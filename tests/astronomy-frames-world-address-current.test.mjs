import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bodyFixedToLocalTangent,
  bodyFixedToPlanetocentric,
  createLocalTangentFrame,
  createRenderFrame,
  localTangentToBodyFixed,
  normalizePositiveEastLongitudeDeg,
  physicalToRender,
  planetocentricToBodyFixed,
  renderToPhysical
} from '../app/js/astronomy/frames.js';
import {
  createWorldAddress,
  migrateLegacyEarthLocation,
  parseWorldAddress,
  serializeWorldAddress,
  worldAddressKey,
  worldAddressesShareRegion
} from '../app/js/planetary/runtime/world-address.js';

const close = (actual, expected, tolerance, message) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
};

test('positive-east longitude has one stable zero-to-360 convention', () => {
  assert.equal(normalizePositiveEastLongitudeDeg(0), 0);
  assert.equal(normalizePositiveEastLongitudeDeg(360), 0);
  close(normalizePositiveEastLongitudeDeg(-76.6122), 283.3878, 1e-12, 'west longitude to positive east');
  assert.equal(normalizePositiveEastLongitudeDeg(721), 1);
});

test('planetocentric and body-fixed positions round trip on Moon and Mars', () => {
  for (const input of [
    { bodyId: 'moon', latitudeDeg: 0.6741, longitudeDegPositiveEast: 23.4729, heightM: 12.5 },
    { bodyId: 'mars', latitudeDeg: 18.65, longitudeDegPositiveEast: 226.2, heightM: 21_900 }
  ]) {
    const fixed = planetocentricToBodyFixed(input.bodyId, input);
    const roundTrip = bodyFixedToPlanetocentric(input.bodyId, fixed);
    close(roundTrip.latitudeDeg, input.latitudeDeg, 1e-9, `${input.bodyId} latitude`);
    close(roundTrip.longitudeDegPositiveEast, input.longitudeDegPositiveEast, 1e-9, `${input.bodyId} longitude`);
    close(roundTrip.heightM, input.heightM, 1e-6, `${input.bodyId} height`);
  }
});

test('local East Up North conversion round trips without scene coordinates', () => {
  const frame = createLocalTangentFrame('moon', {
    latitudeDeg: 0.6741,
    longitudeDegPositiveEast: 23.4729,
    heightM: 0
  });
  const local = { eastM: 1250.25, upM: 18.5, northM: -840.75 };
  const fixed = localTangentToBodyFixed(frame, local);
  const roundTrip = bodyFixedToLocalTangent(frame, fixed);
  close(roundTrip.eastM, local.eastM, 1e-9, 'east');
  close(roundTrip.upM, local.upM, 1e-9, 'up');
  close(roundTrip.northM, local.northM, 1e-9, 'north');
  assert.match(frame.id, /^local-tangent:moon:/);
  assert.match(frame.parentFrameId, /^body-fixed:moon:/);
});

test('render frame scaling and floating origin round trip physical meters', () => {
  const frame = createRenderFrame({
    id: 'render:test:moon',
    parentFrameId: 'body-fixed:moon:MOON_ME_DE421',
    timestampS: 1234,
    metersPerUnit: 25,
    originM: { x: 1_000_000, y: -2_000_000, z: 500_000 }
  });
  const physical = { x: 1_000_250, y: -1_999_500, z: 499_875 };
  const render = physicalToRender(frame, physical);
  assert.deepEqual(render, { frameId: 'render:test:moon', x: 10, y: 20, z: -5 });
  assert.deepEqual(renderToPhysical(frame, render), {
    frameId: 'body-fixed:moon:MOON_ME_DE421',
    ...physical
  });
});

test('world addresses serialize deterministically and preserve body-fixed identity', () => {
  const address = createWorldAddress({
    bodyId: 'moon',
    latitudeDeg: 0.6741,
    longitudeDegPositiveEast: 23.4729,
    heightM: 4.126,
    regionId: 'apollo-11-tranquility',
    scopeType: 'player',
    scopeId: 'player-local-test'
  });
  const parsed = parseWorldAddress(serializeWorldAddress(address));
  assert.deepEqual(parsed, address);
  assert.equal(parsed.heightM, 4.13);
  assert.match(parsed.bodyFixedFrameId, /^body-fixed:moon:/);
  assert.equal(worldAddressKey(parsed), worldAddressKey(address));
  assert.doesNotMatch(worldAddressKey(address), /render/);
});

test('world address keys isolate bodies regions and scopes', () => {
  const base = {
    latitudeDeg: 10,
    longitudeDegPositiveEast: 20,
    heightM: 0,
    regionId: 'survey-region',
    scopeType: 'room',
    scopeId: 'room-1'
  };
  const moon = createWorldAddress({ ...base, bodyId: 'moon' });
  const mars = createWorldAddress({ ...base, bodyId: 'mars' });
  const otherRegion = createWorldAddress({ ...base, bodyId: 'moon', regionId: 'other-region' });
  const otherRoom = createWorldAddress({ ...base, bodyId: 'moon', scopeId: 'room-2' });
  assert.notEqual(worldAddressKey(moon), worldAddressKey(mars));
  assert.notEqual(worldAddressKey(moon), worldAddressKey(otherRegion));
  assert.notEqual(worldAddressKey(moon), worldAddressKey(otherRoom));
  assert.equal(worldAddressesShareRegion(moon, parseWorldAddress(serializeWorldAddress(moon))), true);
  assert.equal(worldAddressesShareRegion(moon, otherRegion), false);
  assert.equal(worldAddressesShareRegion(moon, mars), false);
});

test('legacy Earth latitude and west longitude migrate read-only to positive east', () => {
  const migrated = migrateLegacyEarthLocation(
    { lat: 39.2904, lon: -76.6122 },
    { regionId: 'baltimore-existing', scopeType: 'local', scopeId: 'legacy-earth' }
  );
  assert.equal(migrated.bodyId, 'earth');
  assert.equal(migrated.latitudeDeg, 39.2904);
  assert.equal(migrated.longitudeDegPositiveEast, 283.3878);
  assert.equal(migrated.regionId, 'baltimore-existing');
  assert.equal(migrated.scopeId, 'legacy-earth');
});

test('giant planets cannot receive fake solid-surface addresses', () => {
  for (const bodyId of ['jupiter', 'saturn', 'uranus', 'neptune']) {
    assert.throws(() => createWorldAddress({
      bodyId,
      latitudeDeg: 0,
      longitudeDegPositiveEast: 0,
      regionId: 'fake-ground',
      scopeType: 'local',
      scopeId: 'local'
    }), /cannot own a solid-surface world address/);
  }
});

test('cross-body local conversion is rejected', () => {
  const frame = createLocalTangentFrame('moon', {
    latitudeDeg: 0,
    longitudeDegPositiveEast: 0,
    heightM: 0
  });
  const marsPosition = planetocentricToBodyFixed('mars', {
    latitudeDeg: 0,
    longitudeDegPositiveEast: 0,
    heightM: 0
  });
  assert.throws(() => bodyFixedToLocalTangent(frame, marsPosition), /another body/);
});
