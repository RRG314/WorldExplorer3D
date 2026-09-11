import {
  TERRARIUM_SOURCE_FACTS,
  TERRARIUM_TILE_SIZE,
  WEB_MERCATOR_MAX_LATITUDE,
  geographicToXyzTile,
  webMercatorGroundResolutionMeters
} from './source-contract.js?v=2';

export const TERRAIN_SAMPLE_SCHEMA_VERSION = 1;
export const TERRAIN_SAMPLE_STATUSES = Object.freeze([
  'available',
  'pending',
  'failed',
  'outside-coverage'
]);

const TERRAIN_SAMPLE_STATUS_SET = new Set(TERRAIN_SAMPLE_STATUSES);

function freezeLocation(latitude, longitude) {
  return Object.freeze({ latitude, longitude });
}

function freezeTileAddress(tilePoint) {
  const pixelX = tilePoint.xFraction * (TERRARIUM_TILE_SIZE - 1);
  const pixelY = tilePoint.yFraction * (TERRARIUM_TILE_SIZE - 1);
  return Object.freeze({
    scheme: 'XYZ',
    z: tilePoint.z,
    x: tilePoint.x,
    y: tilePoint.y,
    key: `${tilePoint.z}/${tilePoint.x}/${tilePoint.y}`,
    u: tilePoint.xFraction,
    v: tilePoint.yFraction,
    pixelX,
    pixelY
  });
}

function freezeProvenance(sourceFacts) {
  return Object.freeze({
    dataset: sourceFacts.dataset,
    product: sourceFacts.product,
    representation: sourceFacts.representation,
    projection: sourceFacts.projection,
    verticalDatum: sourceFacts.verticalDatum,
    runtimeClassification: sourceFacts.runtimeClassification
  });
}

function assertGeographicCoordinate(latitude, longitude) {
  if (!Number.isFinite(latitude)) {
    throw new TypeError('latitude must be a finite number');
  }
  if (!Number.isFinite(longitude)) {
    throw new TypeError('longitude must be a finite number');
  }
  if (latitude < -90 || latitude > 90) {
    throw new RangeError('latitude must be from -90 through 90 degrees');
  }
}

function sampleUnavailable({
  status,
  reason,
  latitude,
  longitude,
  tileAddress,
  sourceFacts,
  attempts = 0
}) {
  if (!TERRAIN_SAMPLE_STATUS_SET.has(status) || status === 'available') {
    throw new TypeError('unavailable terrain sample status is invalid');
  }
  return Object.freeze({
    type: 'TerrainSourceSample',
    schemaVersion: TERRAIN_SAMPLE_SCHEMA_VERSION,
    status,
    available: false,
    reason: String(reason || 'unavailable'),
    location: freezeLocation(latitude, longitude),
    tile: tileAddress,
    elevationMeters: null,
    confidence: 0,
    attempts: Math.max(0, Number(attempts) || 0),
    provenance: freezeProvenance(sourceFacts)
  });
}

function sampleAvailable({
  elevationMeters,
  latitude,
  longitude,
  tileAddress,
  sourceFacts,
  attempts
}) {
  if (!Number.isFinite(elevationMeters)) {
    return sampleUnavailable({
      status: 'failed',
      reason: 'invalid-elevation-value',
      latitude,
      longitude,
      tileAddress,
      sourceFacts,
      attempts
    });
  }
  return Object.freeze({
    type: 'TerrainSourceSample',
    schemaVersion: TERRAIN_SAMPLE_SCHEMA_VERSION,
    status: 'available',
    available: true,
    reason: null,
    location: freezeLocation(latitude, longitude),
    tile: tileAddress,
    elevationMeters,
    confidence: 0.35,
    attempts: Math.max(0, Number(attempts) || 0),
    deliveryResolutionMeters:
      webMercatorGroundResolutionMeters(latitude, tileAddress.z),
    effectiveSourceResolution: sourceFacts.effectiveSourceResolution,
    provenance: freezeProvenance(sourceFacts)
  });
}

export function bilinearElevationMeters(
  elevationValues,
  width,
  height,
  u,
  v
) {
  if (!elevationValues || typeof elevationValues.length !== 'number') {
    throw new TypeError('elevation values are required');
  }
  if (!Number.isInteger(width) || width <= 0) {
    throw new RangeError('width must be a positive integer');
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new RangeError('height must be a positive integer');
  }
  if (elevationValues.length < width * height) {
    throw new RangeError('elevation values do not cover the declared grid');
  }
  if (!Number.isFinite(u) || !Number.isFinite(v)) {
    throw new TypeError('sample coordinates must be finite');
  }

  const x = Math.max(0, Math.min(width - 1, u * (width - 1)));
  const y = Math.max(0, Math.min(height - 1, v * (height - 1)));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const xBlend = x - x0;
  const yBlend = y - y0;
  const northWest = Number(elevationValues[y0 * width + x0]);
  const northEast = Number(elevationValues[y0 * width + x1]);
  const southWest = Number(elevationValues[y1 * width + x0]);
  const southEast = Number(elevationValues[y1 * width + x1]);
  if (![northWest, northEast, southWest, southEast].every(Number.isFinite)) {
    return null;
  }
  const north = northWest + (northEast - northWest) * xBlend;
  const south = southWest + (southEast - southWest) * xBlend;
  return north + (south - north) * yBlend;
}

export function adaptTerrariumTileSample(options = {}) {
  const latitude = Number(options.latitude);
  const longitude = Number(options.longitude);
  const zoom = Number(options.zoom);
  const sourceFacts = options.sourceFacts || TERRARIUM_SOURCE_FACTS;
  assertGeographicCoordinate(latitude, longitude);

  if (Math.abs(latitude) > WEB_MERCATOR_MAX_LATITUDE) {
    return sampleUnavailable({
      status: 'outside-coverage',
      reason: 'outside-web-mercator-coverage',
      latitude,
      longitude,
      tileAddress: null,
      sourceFacts
    });
  }

  const tilePoint = geographicToXyzTile(latitude, longitude, zoom);
  const tileAddress = freezeTileAddress(tilePoint);
  const tile = options.tile;
  if (!tile || tile.evicted === true) {
    return sampleUnavailable({
      status: 'pending',
      reason: tile?.evicted === true ? 'tile-evicted' : 'tile-not-requested',
      latitude,
      longitude,
      tileAddress,
      sourceFacts
    });
  }
  if (tile.failed === true) {
    return sampleUnavailable({
      status: 'failed',
      reason: tile.lastError || 'tile-request-failed',
      latitude,
      longitude,
      tileAddress,
      sourceFacts,
      attempts: tile.attempts
    });
  }
  if (tile.loaded !== true || !tile.elev) {
    return sampleUnavailable({
      status: 'pending',
      reason: tile.loading === true ? 'tile-loading' : 'tile-not-ready',
      latitude,
      longitude,
      tileAddress,
      sourceFacts,
      attempts: tile.attempts
    });
  }

  let elevationMeters = bilinearElevationMeters(
    tile.elev,
    Number(tile.w) || TERRARIUM_TILE_SIZE,
    Number(tile.h) || TERRARIUM_TILE_SIZE,
    tilePoint.xFraction,
    tilePoint.yFraction
  );
  if (
    Number.isFinite(elevationMeters) &&
    typeof options.clampElevationMeters === 'function'
  ) {
    elevationMeters = options.clampElevationMeters(elevationMeters);
  }
  return sampleAvailable({
    elevationMeters,
    latitude,
    longitude,
    tileAddress,
    sourceFacts,
    attempts: tile.attempts
  });
}
