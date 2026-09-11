// Pure terrain-source math. This module intentionally has no renderer, DOM,
// network, cache, or mutable application-state dependencies.

export const WEB_MERCATOR_MAX_LATITUDE = 85.0511287798066;
export const WEB_MERCATOR_RADIUS_METERS = 6378137;
export const TERRARIUM_TILE_SIZE = 256;

export const TERRARIUM_SOURCE_FACTS = Object.freeze({
  dataset: 'Mapzen Terrain Tiles',
  product: 'Terrarium PNG',
  representation: 'mixed-source terrain composite',
  projection: 'EPSG:3857',
  tileScheme: 'XYZ',
  tileSizePixels: TERRARIUM_TILE_SIZE,
  elevationUnit: 'metre',
  encodingIncrementMeters: 1 / 256,
  deliveryGrid:
    'z15 PNG pixels are a resampled delivery grid, not the native source resolution',
  effectiveSourceResolution:
    'generally 30 m SRTM globally; 3 m or 10 m 3DEP in supported United States regions; coarser fill sources exist',
  verticalDatum: 'mixed-source; not yet proven uniform for Terrarium output',
  coverage: 'global',
  voidValue: null,
  runtimeClassification: 'legacy-ground-fallback-only',
  failurePolicy: 'unavailable or invalid data must not be converted to zero elevation',
  sourceResolutionDocument: 'https://www.mapzen.com/blog/terrain-tile-service/',
  attributionDocument: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
  registryDocument: 'https://registry.opendata.aws/terrain-tiles/'
});

const WGS84_SEMI_MAJOR_AXIS_METERS = 6378137;
const WGS84_FLATTENING = 1 / 298.257223563;
const WGS84_ECCENTRICITY_SQUARED =
  WGS84_FLATTENING * (2 - WGS84_FLATTENING);

function assertFinite(value, label) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
}

function assertZoom(zoom) {
  if (!Number.isInteger(zoom) || zoom < 0 || zoom > 30) {
    throw new RangeError('zoom must be an integer from 0 through 30');
  }
}

function degreesToRadians(value) {
  return value * Math.PI / 180;
}

function radiansToDegrees(value) {
  return value * 180 / Math.PI;
}

export function normalizeLongitude(longitude) {
  assertFinite(longitude, 'longitude');
  const wrapped = ((longitude + 180) % 360 + 360) % 360 - 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

export function clampWebMercatorLatitude(latitude) {
  assertFinite(latitude, 'latitude');
  return Math.max(
    -WEB_MERCATOR_MAX_LATITUDE,
    Math.min(WEB_MERCATOR_MAX_LATITUDE, latitude)
  );
}

export function geographicToWebMercatorMeters(latitude, longitude) {
  const boundedLatitude = clampWebMercatorLatitude(latitude);
  const wrappedLongitude = normalizeLongitude(longitude);
  const latitudeRadians = degreesToRadians(boundedLatitude);
  return Object.freeze({
    eastingMeters:
      WEB_MERCATOR_RADIUS_METERS * degreesToRadians(wrappedLongitude),
    northingMeters:
      WEB_MERCATOR_RADIUS_METERS *
      Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2)),
    boundedLatitude,
    wrappedLongitude
  });
}

export function geographicToXyzTile(latitude, longitude, zoom) {
  assertZoom(zoom);
  const boundedLatitude = clampWebMercatorLatitude(latitude);
  const wrappedLongitude = normalizeLongitude(longitude);
  const latitudeRadians = degreesToRadians(boundedLatitude);
  const tileCount = 2 ** zoom;
  const xFloat = (wrappedLongitude + 180) / 360 * tileCount;
  const rawYFloat = (
    1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI
  ) / 2 * tileCount;
  const upperFloatBound = tileCount - Number.EPSILON * Math.max(1, tileCount);
  const yFloat = Math.max(0, Math.min(upperFloatBound, rawYFloat));
  const x = Math.floor(xFloat);
  const y = Math.floor(yFloat);

  return Object.freeze({
    z: zoom,
    x,
    y,
    xFraction: xFloat - x,
    yFraction: yFloat - y,
    boundedLatitude,
    wrappedLongitude
  });
}

export function xyzTileBounds(x, y, zoom) {
  assertZoom(zoom);
  const tileCount = 2 ** zoom;
  if (!Number.isInteger(x) || x < 0 || x >= tileCount) {
    throw new RangeError(`x must be an integer from 0 through ${tileCount - 1}`);
  }
  if (!Number.isInteger(y) || y < 0 || y >= tileCount) {
    throw new RangeError(`y must be an integer from 0 through ${tileCount - 1}`);
  }

  const west = x / tileCount * 360 - 180;
  const east = (x + 1) / tileCount * 360 - 180;
  const northRadians = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / tileCount)));
  const southRadians = Math.atan(
    Math.sinh(Math.PI * (1 - 2 * (y + 1) / tileCount))
  );

  return Object.freeze({
    west,
    east,
    north: radiansToDegrees(northRadians),
    south: radiansToDegrees(southRadians)
  });
}

export function webMercatorGroundResolutionMeters(
  latitude,
  zoom,
  tileSizePixels = TERRARIUM_TILE_SIZE
) {
  assertZoom(zoom);
  if (!Number.isInteger(tileSizePixels) || tileSizePixels <= 0) {
    throw new RangeError('tileSizePixels must be a positive integer');
  }
  const boundedLatitude = clampWebMercatorLatitude(latitude);
  return (
    Math.cos(degreesToRadians(boundedLatitude)) *
    2 * Math.PI * WEB_MERCATOR_RADIUS_METERS /
    (tileSizePixels * 2 ** zoom)
  );
}

export function decodeTerrariumRgb(red, green, blue) {
  for (const [value, label] of [
    [red, 'red'],
    [green, 'green'],
    [blue, 'blue']
  ]) {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new RangeError(`${label} must be an integer from 0 through 255`);
    }
  }
  return red * 256 + green + blue / 256 - 32768;
}

export function geodeticToEcef({
  latitude,
  longitude,
  heightMeters = 0
}) {
  assertFinite(latitude, 'latitude');
  assertFinite(longitude, 'longitude');
  assertFinite(heightMeters, 'heightMeters');
  if (latitude < -90 || latitude > 90) {
    throw new RangeError('latitude must be from -90 through 90 degrees');
  }

  const latitudeRadians = degreesToRadians(latitude);
  const longitudeRadians = degreesToRadians(normalizeLongitude(longitude));
  const sinLatitude = Math.sin(latitudeRadians);
  const cosLatitude = Math.cos(latitudeRadians);
  const primeVerticalRadius = WGS84_SEMI_MAJOR_AXIS_METERS /
    Math.sqrt(1 - WGS84_ECCENTRICITY_SQUARED * sinLatitude ** 2);

  return Object.freeze({
    x: (primeVerticalRadius + heightMeters) *
      cosLatitude * Math.cos(longitudeRadians),
    y: (primeVerticalRadius + heightMeters) *
      cosLatitude * Math.sin(longitudeRadians),
    z: (
      primeVerticalRadius * (1 - WGS84_ECCENTRICITY_SQUARED) +
      heightMeters
    ) * sinLatitude
  });
}

export function ecefToGeodetic({ x, y, z }) {
  assertFinite(x, 'x');
  assertFinite(y, 'y');
  assertFinite(z, 'z');
  const longitudeRadians = Math.atan2(y, x);
  const distanceFromAxis = Math.hypot(x, y);

  if (distanceFromAxis < 1e-9) {
    const semiMinorAxis =
      WGS84_SEMI_MAJOR_AXIS_METERS * (1 - WGS84_FLATTENING);
    return Object.freeze({
      latitude: z >= 0 ? 90 : -90,
      longitude: 0,
      heightMeters: Math.abs(z) - semiMinorAxis
    });
  }

  let latitudeRadians = Math.atan2(
    z,
    distanceFromAxis * (1 - WGS84_ECCENTRICITY_SQUARED)
  );
  let heightMeters = 0;

  for (let iteration = 0; iteration < 10; iteration += 1) {
    const sinLatitude = Math.sin(latitudeRadians);
    const primeVerticalRadius = WGS84_SEMI_MAJOR_AXIS_METERS /
      Math.sqrt(1 - WGS84_ECCENTRICITY_SQUARED * sinLatitude ** 2);
    heightMeters = distanceFromAxis / Math.cos(latitudeRadians) -
      primeVerticalRadius;
    const nextLatitude = Math.atan2(
      z,
      distanceFromAxis * (
        1 - WGS84_ECCENTRICITY_SQUARED *
        primeVerticalRadius / (primeVerticalRadius + heightMeters)
      )
    );
    if (Math.abs(nextLatitude - latitudeRadians) < 1e-14) {
      latitudeRadians = nextLatitude;
      break;
    }
    latitudeRadians = nextLatitude;
  }

  return Object.freeze({
    latitude: radiansToDegrees(latitudeRadians),
    longitude: normalizeLongitude(radiansToDegrees(longitudeRadians)),
    heightMeters
  });
}

export function createLocalEnuFrame({
  latitude,
  longitude,
  heightMeters = 0
}) {
  const originEcef = geodeticToEcef({ latitude, longitude, heightMeters });
  const originLatitude = degreesToRadians(latitude);
  const originLongitude = degreesToRadians(normalizeLongitude(longitude));

  return Object.freeze({
    latitude,
    longitude: normalizeLongitude(longitude),
    heightMeters,
    originEcef,
    sinLatitude: Math.sin(originLatitude),
    cosLatitude: Math.cos(originLatitude),
    sinLongitude: Math.sin(originLongitude),
    cosLongitude: Math.cos(originLongitude)
  });
}

export function geographicToLocalEnu(frame, geographic) {
  const point = geodeticToEcef(geographic);
  const dx = point.x - frame.originEcef.x;
  const dy = point.y - frame.originEcef.y;
  const dz = point.z - frame.originEcef.z;

  return Object.freeze({
    eastMeters: -frame.sinLongitude * dx + frame.cosLongitude * dy,
    northMeters:
      -frame.sinLatitude * frame.cosLongitude * dx -
      frame.sinLatitude * frame.sinLongitude * dy +
      frame.cosLatitude * dz,
    upMeters:
      frame.cosLatitude * frame.cosLongitude * dx +
      frame.cosLatitude * frame.sinLongitude * dy +
      frame.sinLatitude * dz
  });
}

export function localEnuToGeographic(
  frame,
  { eastMeters, northMeters, upMeters }
) {
  assertFinite(eastMeters, 'eastMeters');
  assertFinite(northMeters, 'northMeters');
  assertFinite(upMeters, 'upMeters');

  const dx =
    -frame.sinLongitude * eastMeters -
    frame.sinLatitude * frame.cosLongitude * northMeters +
    frame.cosLatitude * frame.cosLongitude * upMeters;
  const dy =
    frame.cosLongitude * eastMeters -
    frame.sinLatitude * frame.sinLongitude * northMeters +
    frame.cosLatitude * frame.sinLongitude * upMeters;
  const dz =
    frame.cosLatitude * northMeters +
    frame.sinLatitude * upMeters;

  return ecefToGeodetic({
    x: frame.originEcef.x + dx,
    y: frame.originEcef.y + dy,
    z: frame.originEcef.z + dz
  });
}
