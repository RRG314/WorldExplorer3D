import crypto from 'node:crypto';
import {
  WEB_MERCATOR_MAX_LATITUDE,
  WEB_MERCATOR_RADIUS_METERS,
  clampWebMercatorLatitude,
  normalizeLongitude
} from '../../app/js/terrain/source-contract.js';
import {
  compileGroundArtifact
} from '../../app/js/terrain/ground-artifact.js?v=4';

export const USGS_3DEP_SAMPLES_URL =
  'https://elevation.nationalmap.gov/arcgis/rest/services/' +
  '3DEPElevation/ImageServer/getSamples';
export const GROUND_BUILD_PLAN_SCHEMA_VERSION = 1;
export const GROUND_RAW_SAMPLE_SCHEMA_VERSION = 1;
export const WEB_MERCATOR_WORLD_WIDTH_METERS =
  2 * Math.PI * WEB_MERCATOR_RADIUS_METERS;
export const WEB_MERCATOR_HALF_WORLD_METERS =
  WEB_MERCATOR_WORLD_WIDTH_METERS / 2;

function assertFinite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
}

function assertPositive(value, label) {
  assertFinite(value, label);
  if (value <= 0) throw new RangeError(`${label} must be positive`);
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function mercatorY(latitude) {
  const radians = clampWebMercatorLatitude(latitude) * Math.PI / 180;
  return WEB_MERCATOR_RADIUS_METERS *
    Math.log(Math.tan(Math.PI / 4 + radians / 2));
}

function geographicFromMercator(eastingMeters, northingMeters) {
  const longitude = normalizeLongitude(
    eastingMeters / WEB_MERCATOR_RADIUS_METERS * 180 / Math.PI
  );
  const latitude = (
    2 * Math.atan(Math.exp(
      northingMeters / WEB_MERCATOR_RADIUS_METERS
    )) - Math.PI / 2
  ) * 180 / Math.PI;
  return Object.freeze({ latitude, longitude });
}

function gridPart({
  id,
  westMeters,
  eastMeters,
  southMeters,
  northMeters,
  spacingMeters,
  maxSamples
}) {
  const minColumn = Math.floor(westMeters / spacingMeters);
  const maxColumn = Math.ceil(eastMeters / spacingMeters);
  const minRow = Math.floor(southMeters / spacingMeters);
  const maxRow = Math.ceil(northMeters / spacingMeters);
  const sampleCount =
    (maxColumn - minColumn + 1) * (maxRow - minRow + 1);
  if (sampleCount > maxSamples) {
    throw new RangeError(
      `ground grid part ${id} has ${sampleCount} samples; maximum is ${maxSamples}`
    );
  }
  const points = [];
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      const eastingMeters = column * spacingMeters;
      const northingMeters = row * spacingMeters;
      const geographic = geographicFromMercator(
        eastingMeters,
        northingMeters
      );
      points.push(Object.freeze({
        key: `${column}:${row}`,
        column,
        row,
        eastingMeters,
        northingMeters,
        latitude: geographic.latitude,
        longitude: geographic.longitude
      }));
    }
  }
  const southwest = geographicFromMercator(
    minColumn * spacingMeters,
    minRow * spacingMeters
  );
  const northeast = geographicFromMercator(
    maxColumn * spacingMeters,
    maxRow * spacingMeters
  );
  return Object.freeze({
    id,
    grid: Object.freeze({
      crs: 'EPSG:3857',
      spacingMeters,
      minColumn,
      maxColumn,
      minRow,
      maxRow,
      sampleCount
    }),
    coverage: Object.freeze({
      south: southwest.latitude,
      north: northeast.latitude,
      west: southwest.longitude,
      east: northeast.longitude
    }),
    points: Object.freeze(points)
  });
}

export function createGroundBuildPlan(options = {}) {
  const districtId = String(options.districtId || '').trim();
  if (!districtId) throw new TypeError('districtId is required');
  const centerLatitude = Number(options.centerLatitude);
  const centerLongitude = normalizeLongitude(Number(options.centerLongitude));
  const widthMeters = Number(options.widthMeters);
  const heightMeters = Number(options.heightMeters);
  const spacingMeters = Number(options.spacingMeters);
  const maxSamples = Number(options.maxSamples ?? 250000);
  assertFinite(centerLatitude, 'centerLatitude');
  if (centerLatitude < -WEB_MERCATOR_MAX_LATITUDE ||
      centerLatitude > WEB_MERCATOR_MAX_LATITUDE) {
    throw new RangeError('centerLatitude is outside Web Mercator coverage');
  }
  assertPositive(widthMeters, 'widthMeters');
  assertPositive(heightMeters, 'heightMeters');
  assertPositive(spacingMeters, 'spacingMeters');
  if (!Number.isInteger(maxSamples) || maxSamples <= 0) {
    throw new RangeError('maxSamples must be a positive integer');
  }
  if (widthMeters >= WEB_MERCATOR_WORLD_WIDTH_METERS) {
    throw new RangeError('widthMeters must be smaller than the Web Mercator world');
  }

  const centerX = centerLongitude * Math.PI / 180 *
    WEB_MERCATOR_RADIUS_METERS;
  const centerY = mercatorY(centerLatitude);
  const west = centerX - widthMeters / 2;
  const east = centerX + widthMeters / 2;
  const south = centerY - heightMeters / 2;
  const north = centerY + heightMeters / 2;
  if (south < -WEB_MERCATOR_HALF_WORLD_METERS ||
      north > WEB_MERCATOR_HALF_WORLD_METERS) {
    throw new RangeError('requested height exceeds Web Mercator latitude coverage');
  }

  const ranges = [];
  if (west < -WEB_MERCATOR_HALF_WORLD_METERS) {
    ranges.push({
      westMeters: west + WEB_MERCATOR_WORLD_WIDTH_METERS,
      eastMeters: WEB_MERCATOR_HALF_WORLD_METERS
    });
    ranges.push({
      westMeters: -WEB_MERCATOR_HALF_WORLD_METERS,
      eastMeters: east
    });
  } else if (east > WEB_MERCATOR_HALF_WORLD_METERS) {
    ranges.push({
      westMeters: west,
      eastMeters: WEB_MERCATOR_HALF_WORLD_METERS
    });
    ranges.push({
      westMeters: -WEB_MERCATOR_HALF_WORLD_METERS,
      eastMeters: east - WEB_MERCATOR_WORLD_WIDTH_METERS
    });
  } else {
    ranges.push({ westMeters: west, eastMeters: east });
  }

  const parts = ranges.map((range, index) => gridPart({
    id: ranges.length === 1 ? districtId : `${districtId}-part-${index + 1}`,
    ...range,
    southMeters: south,
    northMeters: north,
    spacingMeters,
    maxSamples
  }));
  const sampleCount = parts.reduce((total, part) =>
    total + part.grid.sampleCount, 0);
  if (sampleCount > maxSamples) {
    throw new RangeError(
      `ground grid has ${sampleCount} samples; maximum is ${maxSamples}`
    );
  }
  return Object.freeze({
    schemaVersion: GROUND_BUILD_PLAN_SCHEMA_VERSION,
    districtId,
    providerId: null,
    sourceHorizontalFrame: null,
    sourceVerticalDatum: null,
    targetVerticalDatum: 'EGM2008',
    center: Object.freeze({
      latitude: centerLatitude,
      longitude: centerLongitude
    }),
    requestedExtentMeters: Object.freeze({ widthMeters, heightMeters }),
    spacingMeters,
    maxSamples,
    crossesAntimeridian: parts.length > 1,
    partCount: parts.length,
    sampleCount,
    parts: Object.freeze(parts)
  });
}

export function chunkGroundPoints(points, batchSize = 5) {
  if (!Array.isArray(points)) throw new TypeError('points must be an array');
  if (!Number.isInteger(batchSize) || batchSize <= 0 || batchSize > 5) {
    throw new RangeError('batchSize must be an integer from 1 through 5');
  }
  const chunks = [];
  for (let index = 0; index < points.length; index += batchSize) {
    chunks.push(Object.freeze(points.slice(index, index + batchSize)));
  }
  return Object.freeze(chunks);
}

function isNavd88(value) {
  return /NAVD\s*88|North American Vertical Datum of 1988/i.test(
    String(value || '')
  );
}

export async function fetchUsgs3depSamples({
  points,
  fetchImpl = globalThis.fetch,
  endpoint = USGS_3DEP_SAMPLES_URL
} = {}) {
  if (!Array.isArray(points) || points.length === 0) {
    throw new TypeError('at least one point is required');
  }
  if (points.length > 1000) {
    throw new RangeError('USGS sample batch cannot exceed 1000 points');
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('fetch implementation is required');
  }
  const geometry = {
    points: points.map((point) => [
      Number(point.longitude),
      Number(point.latitude)
    ]),
    spatialReference: { wkid: 4326 }
  };
  const body = new URLSearchParams({
    f: 'json',
    geometryType: 'esriGeometryMultipoint',
    geometry: JSON.stringify(geometry),
    returnFirstValueOnly: 'true',
    outFields: '*'
  });
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!response?.ok) {
    throw new Error(`USGS 3DEP samples failed with HTTP ${response?.status || 0}`);
  }
  const payload = await response.json();
  if (!Array.isArray(payload.samples) ||
      payload.samples.length !== points.length) {
    throw new Error(
      `USGS 3DEP returned ${payload.samples?.length || 0} of ${points.length} samples`
    );
  }
  return Object.freeze(payload.samples.map((sample, index) => {
    const point = points[index];
    const elevationMeters = Number(sample?.value);
    const latitude = Number(sample?.location?.y);
    const longitude = Number(sample?.location?.x);
    const verticalDatum = sample?.attributes?.VerticalDatum;
    const sourceResolutionMeters = Number(sample.resolution);
    const sourceRelease = String(sample?.attributes?.URL || '');
    if (!Number.isFinite(elevationMeters) ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        !Number.isFinite(sourceResolutionMeters) ||
        sourceResolutionMeters <= 0) {
      throw new Error(`USGS 3DEP sample ${point.key} is unavailable`);
    }
    if (Math.abs(latitude - point.latitude) > 1e-8 ||
        Math.abs(normalizeLongitude(longitude - point.longitude)) > 1e-8) {
      throw new Error(`USGS 3DEP sample order mismatch at ${point.key}`);
    }
    if (!isNavd88(verticalDatum)) {
      throw new Error(
        `USGS 3DEP sample ${point.key} has unsupported vertical datum: ` +
        String(verticalDatum || 'missing')
      );
    }
    if (!sourceRelease) {
      throw new Error(`USGS 3DEP sample ${point.key} has no source release`);
    }
    return Object.freeze({
      schemaVersion: GROUND_RAW_SAMPLE_SCHEMA_VERSION,
      key: point.key,
      column: point.column,
      row: point.row,
      latitude,
      longitude: normalizeLongitude(longitude),
      rawElevationMeters: elevationMeters,
      sourceHorizontalFrame: 'NAD83',
      sourceVerticalDatum: 'NAVD88',
      sourceResolutionMeters,
      rasterId: String(sample.rasterId ?? ''),
      sourceProduct: String(sample?.attributes?.ProductName || 'USGS_3DEP'),
      sourceTitle: String(sample?.attributes?.title || ''),
      sourceRelease,
      acquisitionStartDate: String(sample?.attributes?.StartDate || ''),
      acquisitionEndDate: String(sample?.attributes?.EndDate || '')
    });
  }));
}

export async function normalizeGroundSamples({
  rawSamples,
  normalizeSample,
  maximumUncertaintyMeters = 1
} = {}) {
  if (!Array.isArray(rawSamples) || rawSamples.length === 0) {
    throw new TypeError('rawSamples are required');
  }
  if (typeof normalizeSample !== 'function') {
    throw new TypeError('a verified datum normalizer is required');
  }
  assertPositive(maximumUncertaintyMeters, 'maximumUncertaintyMeters');
  const normalized = [];
  for (const raw of rawSamples) {
    const result = await normalizeSample(raw);
    const elevationMeters = Number(result?.groundElevationMeters);
    const uncertaintyMeters = Number(result?.uncertaintyMeters);
    if (String(result?.verticalDatum || '') !== 'EGM2008') {
      throw new Error(`normalizer did not produce EGM2008 for ${raw.key}`);
    }
    if (String(result?.horizontalFrame || '') !== 'WGS84_G1674') {
      throw new Error(
        `normalizer did not produce WGS84_G1674 coordinates for ${raw.key}`
      );
    }
    if (!Number.isFinite(elevationMeters)) {
      throw new Error(`normalizer produced no elevation for ${raw.key}`);
    }
    if (!Number.isFinite(uncertaintyMeters) ||
        uncertaintyMeters < 0 ||
        uncertaintyMeters > maximumUncertaintyMeters) {
      throw new Error(`normalizer uncertainty exceeds policy for ${raw.key}`);
    }
    normalized.push(Object.freeze({
      column: raw.column,
      row: raw.row,
      available: true,
      rawElevationMeters: raw.rawElevationMeters,
      groundElevationMeters: elevationMeters,
      confidence: Math.max(
        0.75,
        Math.min(1, 1 - uncertaintyMeters / maximumUncertaintyMeters * 0.25)
      ),
      correctionReason: 'vertical-datum-normalization',
      provenance:
        `USGS_3DEP:${raw.rasterId}:NAD83/NAVD88>` +
        `WGS84_G1674/EGM2008:` +
        String(result.method || 'verified-normalizer'),
      normalizationUncertaintyMeters: uncertaintyMeters
    }));
  }
  return Object.freeze(normalized);
}

export function createGroundArtifactBundle({
  artifactId,
  part,
  sourceRelease,
  normalizedSamples,
  licenseAttested = true,
  providerId = 'usgs-3dep-best-available',
  correctionAttested = false,
  sourceEvidence = null,
  attribution = null,
  compactArtifact = false
} = {}) {
  if (!part?.grid || !part?.coverage) {
    throw new TypeError('a ground build plan part is required');
  }
  const artifact = {
    schemaVersion: 1,
    artifactId: String(artifactId || part.id),
    districtId: part.id,
    providerId: String(providerId),
    sourceRelease: String(sourceRelease || ''),
    verticalDatum: 'EGM2008',
    coverage: part.coverage,
    minimumConfidence: 0.75,
    grid: part.grid,
    samples: normalizedSamples
  };
  const artifactText = compactArtifact
    ? `${JSON.stringify(artifact)}\n`
    : canonicalJson(artifact);
  const manifest = {
    schemaVersion: 1,
    artifactId: artifact.artifactId,
    providerId: artifact.providerId,
    sourceRelease: artifact.sourceRelease,
    contentSha256: sha256(artifactText),
    spacingMeters: part.grid.spacingMeters,
    coverage: part.coverage,
    verticalDatum: artifact.verticalDatum,
    complete: normalizedSamples.length === part.grid.sampleCount,
    missingSampleCount: Math.max(
      0,
      part.grid.sampleCount - normalizedSamples.length
    ),
    licenseAttested,
    correctionAttested,
    ...(sourceEvidence ? { sourceEvidence } : {}),
    ...(attribution ? { attribution } : {})
  };
  const compiled = compileGroundArtifact({ manifest, artifact });
  if (compiled.status !== 'accepted') {
    throw new Error(
      `ground artifact ${artifact.artifactId} rejected: ` +
      `${compiled.reason}/${compiled.diagnostics?.modelReason || 'unknown'}`
    );
  }
  return Object.freeze({
    artifact: Object.freeze(artifact),
    artifactText,
    manifest: Object.freeze(manifest),
    manifestText: canonicalJson(manifest),
    compiled
  });
}
