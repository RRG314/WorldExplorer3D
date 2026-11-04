import { BRIGHT_STARS } from '../sky/catalog.js?v=1';
import { siderealTime, toDays } from '../astro.js?v=1';

export const ASTRONOMY_SOURCE = Object.freeze({
  id: 'hyg-v4-bright-subset',
  catalog: 'HYG v4.0 · bundled 700-star subset',
  url: 'https://github.com/astronexus/HYG-Database',
  sha256: '8e3ff9e67445e558a759b117910850cff1b1d4d492f45f715c2ee2db3d869bac',
  epoch: 'J2000 positions; proper motion, precession and refraction not applied',
  license: 'CC-BY-SA-4.0',
  methodUrl:
    'https://aavso.org/sites/default/files/publications_files/ccd_photometry_guide/CCDPhotometryGuide.pdf',
});
// Virtual 8-bit counts with fixed training gain, not calibrated magnitudes.
// The catalog supplies positions/relative flux. Seeded Gaussian shot/read-noise
// approximation supplies synthetic pixels; these are not observed photons.
export const DETECTOR = Object.freeze({
  size: 64,
  fieldDegrees: 4,
  psfSigma: 1.15,
  bias: 12,
  darkRate: 1,
  readNoise: 3,
  nominalTargetRate: 350,
  aperture: 4,
  annulusInner: 6,
  annulusOuter: 10,
});
const rad = Math.PI / 180,
  clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export function astronomyStar(hip) {
  const row = BRIGHT_STARS.find((s) => s.hip === hip);
  if (!row || ![row.ra, row.dec, row.mag].every(Number.isFinite))
    throw Error('Choose a star in the bundled catalog.');
  return { hip: row.hip, name: row.name, raHours: row.ra, decDegrees: row.dec, magnitude: row.mag };
}
export function astronomyDirection(star, location, at) {
  if (
    ![star?.raHours, star?.decDegrees, star?.magnitude, location?.lat, location?.lon, at].every(
      Number.isFinite
    ) ||
    Math.abs(location.lat) > 90 ||
    Math.abs(location.lon) > 180 ||
    Math.abs(star.decDegrees) > 90 ||
    star.raHours < 0 ||
    star.raHours >= 24 ||
    !Number.isFinite(new Date(at).valueOf())
  )
    throw Error('The catalog position, observing location or session time is unavailable.');
  const latitude = location.lat * rad,
    declination = star.decDegrees * rad,
    hourAngle = siderealTime(toDays(new Date(at)), -location.lon * rad) - star.raHours * 15 * rad;
  const east = -Math.cos(declination) * Math.sin(hourAngle),
    up =
      Math.sin(latitude) * Math.sin(declination) +
      Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle),
    north =
      Math.cos(latitude) * Math.sin(declination) -
      Math.sin(latitude) * Math.cos(declination) * Math.cos(hourAngle);
  return {
    x: east,
    y: up,
    z: -north,
    azimuth: (((Math.atan2(east, north) / rad) % 360) + 360) % 360,
    altitude: Math.asin(clamp(up, -1, 1)) / rad,
  };
}
export function chooseAstronomyTarget(location, at) {
  const choices = BRIGHT_STARS.filter((s) => s.mag <= 2)
    .map((s) => {
      const star = astronomyStar(s.hip);
      return { star, direction: astronomyDirection(star, location, at) };
    })
    .filter((s) => s.direction.altitude >= 25 && s.direction.altitude <= 80)
    .sort((a, b) => a.star.magnitude - b.star.magnitude);
  if (!choices.length)
    throw Error('No supported bright target is above the instrument horizon for this session.');
  return choices[0];
}
export function astronomyAxis(azimuth, altitude) {
  if (![azimuth, altitude].every(Number.isFinite) || altitude < -90 || altitude > 90)
    throw Error('The telescope pointing is unavailable.');
  const a = azimuth * rad,
    h = altitude * rad;
  return { x: Math.sin(a) * Math.cos(h), y: Math.sin(h), z: -Math.cos(a) * Math.cos(h) };
}
export function astronomySeparation(a, b) {
  return Math.acos(clamp(dot(a, b), -1, 1)) / rad;
}
export function detectorProjection(direction, pointing) {
  const axis = astronomyAxis(pointing.azimuth, pointing.altitude),
    a = pointing.azimuth * rad,
    h = pointing.altitude * rad,
    right = { x: Math.cos(a), y: 0, z: Math.sin(a) },
    up = { x: -Math.sin(a) * Math.sin(h), y: Math.cos(h), z: Math.cos(a) * Math.sin(h) },
    forward = dot(direction, axis),
    focal = DETECTOR.size / 2 / Math.tan((DETECTOR.fieldDegrees * rad) / 2),
    mid = (DETECTOR.size - 1) / 2;
  if (forward <= 0) return null;
  return {
    x: mid + (dot(direction, right) / forward) * focal,
    y: mid - (dot(direction, up) / forward) * focal,
  };
}
function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) + 0.5) / 4294967296;
  };
}
export function syntheticDetectorFrame({
  target,
  location,
  referenceTime,
  pointing,
  seconds,
  seed,
  shutter = 'open',
  hotPixel = false,
}) {
  if (
    !Number.isFinite(seconds) ||
    seconds < 0.5 ||
    seconds > 8 ||
    !Number.isInteger(seed) ||
    seed <= 0 ||
    seed > 0xffffffff ||
    !['open', 'closed'].includes(shutter)
  )
    throw Error('Choose a bounded exposure and retain its noise seed.');
  const canonical = astronomyStar(target?.hip);
  if (Object.keys(canonical).some((k) => canonical[k] !== target[k]))
    throw Error('The target must retain its exact catalog row.');
  const targetPixel = detectorProjection(
    astronomyDirection(target, location, referenceTime),
    pointing
  );
  const sources =
    shutter === 'open'
      ? BRIGHT_STARS.map((s) => {
          const star = astronomyStar(s.hip),
            p = detectorProjection(astronomyDirection(star, location, referenceTime), pointing);
          return p && p.x >= -8 && p.x < 72 && p.y >= -8 && p.y < 72
            ? {
                ...p,
                rate:
                  DETECTOR.nominalTargetRate * 10 ** (-0.4 * (star.magnitude - target.magnitude)),
              }
            : null;
        }).filter(Boolean)
      : [];
  const rng = generator(seed),
    pixels = [],
    normal = () => Math.sqrt(-2 * Math.log(rng())) * Math.cos(2 * Math.PI * rng()),
    sigma2 = DETECTOR.psfSigma ** 2;
  for (let y = 0; y < DETECTOR.size; y++)
    for (let x = 0; x < DETECTOR.size; x++) {
      let expected = DETECTOR.bias + DETECTOR.darkRate * seconds;
      for (const s of sources)
        expected +=
          ((s.rate * seconds) / (2 * Math.PI * sigma2)) *
          Math.exp(-((x - s.x) ** 2 + (y - s.y) ** 2) / (2 * sigma2));
      pixels.push(
        hotPixel && x === 45 && y === 24
          ? 255
          : clamp(
              Math.round(
                expected +
                  normal() *
                    Math.sqrt(Math.max(0, expected - DETECTOR.bias) + DETECTOR.readNoise ** 2)
              ),
              0,
              255
            )
      );
    }
  return {
    protocol: 'catalog-synthetic-detector-v1',
    truthType: 'synthetic-instrument-image',
    width: 64,
    height: 64,
    seconds,
    seed,
    shutter,
    hotPixel,
    pointing: { ...pointing },
    targetPixel,
    pixels,
  };
}
export function apertureMeasurement(frame, center = frame?.targetPixel) {
  if (
    !frame ||
    frame.width !== 64 ||
    frame.height !== 64 ||
    !Array.isArray(frame.pixels) ||
    frame.pixels.length !== 4096 ||
    !frame.pixels.every((v) => Number.isInteger(v) && v >= 0 && v <= 255) ||
    ![center?.x, center?.y, frame.seconds].every(Number.isFinite) ||
    frame.seconds <= 0 ||
    center.x < 10 ||
    center.y < 10 ||
    center.x > 53 ||
    center.y > 53
  )
    throw Error('Keep a complete detector image and a measurable target away from its edge.');
  const signal = [],
    sky = [];
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const r = Math.hypot(x - center.x, y - center.y),
        p = { x, y, value: frame.pixels[y * 64 + x] };
      if (r <= DETECTOR.aperture) signal.push(p);
      else if (r >= DETECTOR.annulusInner && r <= DETECTOR.annulusOuter) sky.push(p);
    }
  const background = sky.reduce((n, p) => n + p.value, 0) / sky.length,
    net = signal.reduce((n, p) => n + p.value - background, 0),
    weight = signal.reduce((n, p) => n + Math.max(0, p.value - background), 0),
    variance =
      signal.reduce(
        (n, p) => n + Math.max(0, p.value - DETECTOR.bias) + DETECTOR.readNoise ** 2,
        0
      ) +
      (signal.length ** 2 / sky.length) *
        (Math.max(0, background - DETECTOR.bias) + DETECTOR.readNoise ** 2);
  return {
    aperturePixels: signal.length,
    skyPixels: sky.length,
    background,
    net,
    rate: net / frame.seconds,
    uncertainty: Math.sqrt(variance) / frame.seconds,
    peak: Math.max(...signal.map((p) => p.value)),
    clipped: signal.some((p) => p.value === 255),
    centroid: weight
      ? {
          x: signal.reduce((n, p) => n + p.x * Math.max(0, p.value - background), 0) / weight,
          y: signal.reduce((n, p) => n + p.y * Math.max(0, p.value - background), 0) / weight,
        }
      : null,
  };
}
// Bounded scientific pixels remain ordinary data in the existing field history.
// They are not camera photographs or another media/database owner.
export function encodeDetectorFrame(frame) {
  if (
    frame?.width !== 64 ||
    frame?.height !== 64 ||
    !Array.isArray(frame.pixels) ||
    frame.pixels.length !== 4096 ||
    !frame.pixels.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)
  )
    throw Error('Retain the complete unsigned detector buffer.');
  const { pixels, ...metadata } = frame;
  return { ...metadata, encoding: 'base64-u8', pixelsBase64: btoa(String.fromCharCode(...pixels)) };
}
export function decodeDetectorFrame(record) {
  if (
    record?.encoding !== 'base64-u8' ||
    record.width !== 64 ||
    record.height !== 64 ||
    typeof record.pixelsBase64 !== 'string' ||
    record.pixelsBase64.length !== 5464 ||
    !/^[A-Za-z0-9+/]+==$/.test(record.pixelsBase64)
  )
    throw Error('The saved detector buffer is incomplete.');
  const binary = atob(record.pixelsBase64);
  if (binary.length !== 4096 || btoa(binary) !== record.pixelsBase64)
    throw Error('The saved detector encoding is unavailable.');
  const { pixelsBase64, encoding, ...metadata } = record;
  return { ...metadata, pixels: Array.from(binary, (c) => c.charCodeAt(0)) };
}
