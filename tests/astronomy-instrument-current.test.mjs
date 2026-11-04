import test from 'node:test';
import assert from 'node:assert/strict';
import {
  astronomyStar,
  astronomyDirection,
  astronomyAxis,
  astronomySeparation,
  chooseAstronomyTarget,
  detectorProjection,
  syntheticDetectorFrame,
  apertureMeasurement,
  ASTRONOMY_SOURCE,
} from '../app/js/campaign/astronomy-instrument.js';
const location = { lat: 39.3173, lon: -76.64044 },
  referenceTime = Date.parse('2026-11-03T02:00:00Z'),
  { star: target, direction } = chooseAstronomyTarget(location, referenceTime),
  pointing = { azimuth: direction.azimuth, altitude: direction.altitude };
const frame = (options = {}) =>
  syntheticDetectorFrame({
    target,
    location,
    referenceTime,
    pointing,
    seconds: 2,
    seed: 54321,
    ...options,
  });
test('the instrument retains real bundled HYG rows, declared epoch and existing observer/time sky frame', () => {
  assert.equal(target.name, 'Vega');
  assert.equal(target.hip, 91262);
  assert.equal(target.raHours, 18.61564);
  assert.match(ASTRONOMY_SOURCE.epoch, /proper motion/);
  assert.ok(direction.altitude > 30 && direction.altitude < 36);
  assert.ok(direction.azimuth > 290 && direction.azimuth < 300);
  assert.ok(
    astronomySeparation(direction, astronomyDirection(target, location, referenceTime + 3600000)) >
      5
  );
  assert.ok(astronomySeparation(astronomyAxis(359.9, 30), astronomyAxis(0.1, 30)) < 0.2);
  assert.throws(() => astronomyStar(-1));
  assert.throws(() => astronomyDirection(target, location, 1e100));
  assert.throws(() => astronomyDirection(target, { lat: 91, lon: 0 }, referenceTime));
});
test('actual pointing projects the catalog target into detector coordinates and dither moves sky positions', () => {
  const p = detectorProjection(direction, pointing),
    moved = detectorProjection(direction, { ...pointing, azimuth: pointing.azimuth + 0.3 });
  assert.ok(Math.abs(p.x - 31.5) < 1e-8 && Math.abs(p.y - 31.5) < 1e-8);
  assert.ok(moved.x < p.x - 3);
  assert.equal(
    detectorProjection({ x: -direction.x, y: -direction.y, z: -direction.z }, pointing),
    null
  );
});
test('synthetic pixels are reproducible from saved settings and seed while independent noise changes', () => {
  assert.deepEqual(frame(), frame());
  assert.notDeepEqual(frame().pixels, frame({ seed: 123456 }).pixels);
  assert.equal(frame().pixels.length, 4096);
  assert.equal(frame().truthType, 'synthetic-instrument-image');
  assert.throws(() => frame({ target: { ...target, raHours: target.raHours + 1 } }));
  assert.throws(() => frame({ seed: 0 }));
  assert.throws(() => frame({ seconds: 100 }));
});
test('aperture/annulus measurements retain noise, closed-shutter control and fatal clipping separately', () => {
  const science = apertureMeasurement(frame()),
    repeat = apertureMeasurement(frame({ seed: 123456 })),
    dark = apertureMeasurement(frame({ shutter: 'closed' })),
    long = apertureMeasurement(frame({ seconds: 8 }));
  assert.equal(science.clipped, false);
  assert.equal(long.clipped, true);
  assert.equal(long.peak, 255);
  assert.ok(science.rate > 300 && science.rate < 400);
  assert.ok(science.uncertainty > 0);
  assert.ok(science.skyPixels > science.aperturePixels);
  assert.ok(
    Math.abs(science.rate - repeat.rate) < 3 * Math.hypot(science.uncertainty, repeat.uncertainty)
  );
  assert.ok(Math.abs(dark.net) < science.net / 5);
  assert.ok(science.centroid);
});
test('a detector hot pixel stays fixed in dark/dither frames while the sky target shifts', () => {
  const original = frame({ hotPixel: true }),
    dither = frame({ hotPixel: true, pointing: { ...pointing, azimuth: pointing.azimuth + 0.3 } }),
    dark = frame({ hotPixel: true, shutter: 'closed' }),
    index = 24 * 64 + 45;
  assert.equal(original.pixels[index], 255);
  assert.equal(dither.pixels[index], 255);
  assert.equal(dark.pixels[index], 255);
  assert.ok(apertureMeasurement(dither).centroid.x < apertureMeasurement(original).centroid.x - 3);
});
test('incomplete raw detector images and unusable apertures are rejected', () => {
  const f = frame();
  assert.throws(() => apertureMeasurement({ ...f, pixels: f.pixels.slice(1) }));
  assert.throws(() => apertureMeasurement({ ...f, pixels: [NaN, ...f.pixels.slice(1)] }));
  assert.throws(() => apertureMeasurement(f, { x: 0, y: 0 }));
});

test('bounded detector bytes round-trip exactly and reject truncation or noncanonical padding', async () => {
  const { encodeDetectorFrame, decodeDetectorFrame } = await import(
      '../app/js/campaign/astronomy-instrument.js'
    ),
    f = frame(),
    before = structuredClone(f),
    encoded = encodeDetectorFrame(f);
  assert.equal(encoded.pixelsBase64.length, 5464);
  assert.equal(Object.hasOwn(encoded, 'pixels'), false);
  assert.deepEqual(decodeDetectorFrame(encoded), f);
  assert.deepEqual(f, before);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
    index = alphabet.indexOf(encoded.pixelsBase64.at(-3)),
    noncanonical = encoded.pixelsBase64.slice(0, -3) + alphabet[index + 1] + '==';
  assert.throws(() => decodeDetectorFrame({ ...encoded, pixelsBase64: noncanonical }));
  assert.throws(() =>
    decodeDetectorFrame({ ...encoded, pixelsBase64: encoded.pixelsBase64.slice(4) })
  );
  assert.throws(() => decodeDetectorFrame({ ...encoded, encoding: 'future' }));
  assert.throws(() => encodeDetectorFrame({ ...f, pixels: [-1, ...f.pixels.slice(1)] }));
});
