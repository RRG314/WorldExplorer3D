const WATER_BODY_SCHEMA_VERSION = 1;

const WATER_BODY_SHAPE = Object.freeze({
  AREA: 'area',
  WATERWAY: 'waterway'
});

const WATER_KIND = Object.freeze({
  OPEN_OCEAN: 'open_ocean',
  COASTAL: 'coastal',
  HARBOR: 'harbor',
  CHANNEL: 'channel',
  LAKE: 'lake'
});

const WATER_SURFACE_DATUM = Object.freeze({
  id: 'earth-surface-world-y',
  units: 'world-y'
});

function finiteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeWaterKind(value) {
  const kind = String(value || '').trim().toLowerCase();
  if (kind.includes('ocean') || kind === 'sea') return WATER_KIND.OPEN_OCEAN;
  if (kind.includes('coast')) return WATER_KIND.COASTAL;
  if (kind.includes('harbour') || kind.includes('harbor') || kind.includes('marina')) return WATER_KIND.HARBOR;
  if (kind.includes('river') || kind.includes('canal') || kind.includes('channel')) return WATER_KIND.CHANNEL;
  if (kind.includes('lake') || kind.includes('reservoir') || kind.includes('pond')) return WATER_KIND.LAKE;
  return null;
}

function waterKindLabel(kind) {
  const normalized = normalizeWaterKind(kind) || WATER_KIND.LAKE;
  if (normalized === WATER_KIND.OPEN_OCEAN) return 'Open Water';
  if (normalized === WATER_KIND.COASTAL) return 'Coastal Water';
  if (normalized === WATER_KIND.HARBOR) return 'Harbor Water';
  if (normalized === WATER_KIND.CHANNEL) return 'Channel Water';
  return 'Lake Water';
}

function polygonMetrics(points = []) {
  if (!Array.isArray(points) || points.length < 3) {
    return { area: 0, centerX: 0, centerZ: 0, span: 0, minSpan: 0, avgWidth: 0, bounds: null };
  }
  let area2 = 0;
  let centerX = 0;
  let centerZ = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    const cross = point.x * next.z - next.x * point.z;
    area2 += cross;
    centerX += (point.x + next.x) * cross;
    centerZ += (point.z + next.z) * cross;
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  const area = Math.abs(area2 * 0.5);
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const span = Math.max(spanX, spanZ);
  return {
    area,
    centerX: area2 ? centerX / (3 * area2) : (minX + maxX) * 0.5,
    centerZ: area2 ? centerZ / (3 * area2) : (minZ + maxZ) * 0.5,
    span,
    minSpan: Math.min(spanX, spanZ),
    avgWidth: area / Math.max(1, span),
    bounds: { minX, maxX, minZ, maxZ }
  };
}

function polylineLength(points = []) {
  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    length += Math.hypot(points[index + 1].x - points[index].x, points[index + 1].z - points[index].z);
  }
  return length;
}

function classifyAreaKind(options, metrics) {
  const explicit = normalizeWaterKind(options.kindHint || options.waterKind || options.layer);
  if (explicit === WATER_KIND.OPEN_OCEAN || explicit === WATER_KIND.LAKE) return explicit;
  const surfaceY = finiteNumber(options.surfaceY);
  if (surfaceY !== null && surfaceY > 12) return WATER_KIND.LAKE;
  if (explicit) return explicit;
  if (metrics.area > 900000 || (metrics.span > 1500 && metrics.avgWidth > 120) || (metrics.span > 900 && metrics.avgWidth > 180)) {
    return WATER_KIND.OPEN_OCEAN;
  }
  if (metrics.area > 240000 || metrics.span > 650 || metrics.avgWidth > 70 || metrics.minSpan > 85) return WATER_KIND.COASTAL;
  if (metrics.area > 70000 || metrics.span > 260 || metrics.avgWidth > 28 || metrics.minSpan > 34) return WATER_KIND.HARBOR;
  return WATER_KIND.LAKE;
}

function classifyWaterwayKind(options, length) {
  const explicit = normalizeWaterKind(options.kindHint || options.waterKind || options.type);
  if (explicit) return explicit;
  const width = finiteNumber(options.width, 0);
  if (width >= 80 || length >= 1600) return WATER_KIND.COASTAL;
  if (width >= 28 || length >= 480) return WATER_KIND.CHANNEL;
  return WATER_KIND.HARBOR;
}

function waterSurfaceBaseElevation(heights) {
  if (!Array.isArray(heights) || heights.length === 0) return 0;
  const finite = heights.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (finite.length === 0) return 0;
  const bathymetry = finite.filter((value) => value < -1);
  const positive = finite.filter((value) => value > 1);
  if (bathymetry.length / finite.length < 0.2 && positive.length / finite.length >= 0.55) {
    return positive[Math.floor((positive.length - 1) * 0.15)];
  }
  const min = finite[0];
  const representative = Math.min(finite[Math.floor((finite.length - 1) * 0.12)], min + 0.1);
  return representative < -1 ? 0 : representative;
}

function normalizeWaterBody(options = {}) {
  const shape = options.shape === WATER_BODY_SHAPE.WATERWAY ? WATER_BODY_SHAPE.WATERWAY : WATER_BODY_SHAPE.AREA;
  const points = Array.isArray(options.pts) ? options.pts : [];
  const metrics = shape === WATER_BODY_SHAPE.AREA ? polygonMetrics(points) : null;
  const length = shape === WATER_BODY_SHAPE.WATERWAY ? polylineLength(points) : 0;
  const kind = shape === WATER_BODY_SHAPE.AREA ? classifyAreaKind(options, metrics) : classifyWaterwayKind(options, length);
  const bounds = options.bounds || metrics?.bounds || null;
  const sourceFeatureId = options.sourceFeatureId || options.id || null;
  const surfaceY = finiteNumber(options.surfaceY);
  const navigable = options.navigable !== false && (
    shape === WATER_BODY_SHAPE.AREA || finiteNumber(options.width, 0) >= 12 || options.navigable === true
  );
  return {
    ...options,
    waterSchemaVersion: WATER_BODY_SCHEMA_VERSION,
    shape,
    type: shape === WATER_BODY_SHAPE.AREA ? 'water' : String(options.type || 'waterway'),
    pts: points,
    area: finiteNumber(options.area, metrics?.area || 0),
    centerX: finiteNumber(options.centerX, metrics?.centerX || 0),
    centerZ: finiteNumber(options.centerZ, metrics?.centerZ || 0),
    bounds,
    ...(bounds || {}),
    width: shape === WATER_BODY_SHAPE.WATERWAY ? finiteNumber(options.width, 0) : options.width,
    length: shape === WATER_BODY_SHAPE.WATERWAY ? length : options.length,
    surfaceY,
    waterKind: kind,
    kind,
    label: waterKindLabel(kind),
    navigable,
    shorelineModel: shape === WATER_BODY_SHAPE.AREA ? 'polygon-boundary' : 'centerline-width',
    depthConfidence: options.depthConfidence || 'unknown',
    datum: {
      ...WATER_SURFACE_DATUM,
      method: options.datumMethod || (surfaceY === null ? 'terrain-profile' : 'dem-water-surface'),
      confidence: finiteNumber(options.datumConfidence, surfaceY === null ? 0.55 : 0.82)
    },
    sourceFeatureId,
    provenance: {
      dataset: options.geometrySource || options.dataset || 'unknown',
      featureId: sourceFeatureId,
      tileKey: options.tileKey || null,
      layer: options.layer || null
    }
  };
}

function resolveWaterBodySurfaceY(body, x, z, options = {}) {
  const source = body?.source || body || {};
  if (source.shape === WATER_BODY_SHAPE.WATERWAY || body?.shape === WATER_BODY_SHAPE.WATERWAY) {
    const profileY = options.sampleWaterwayProfile?.(source.surfaceProfile, x, z);
    if (Number.isFinite(profileY)) return profileY;
  }
  if (Number.isFinite(source.surfaceY)) return Number(source.surfaceY);
  if (Number.isFinite(body?.surfaceY)) return Number(body.surfaceY);
  const terrainY = options.terrainHeightAt?.(x, z);
  const kind = normalizeWaterKind(source.waterKind || body?.waterKind);
  if ((kind === WATER_KIND.OPEN_OCEAN || kind === WATER_KIND.COASTAL) && Number(terrainY) < -1) return 0.08;
  return Number.isFinite(terrainY) ? terrainY + finiteNumber(options.waterwayBias, 0.14) : 0;
}

function reconcileWaterBodySurface(body, surfaceY, options = {}) {
  if (!body || typeof body !== 'object') return body;
  const layer = options.layer || body.layer || body.provenance?.layer || null;
  const kindHint = options.kindHint ?? (layer === 'ocean' ? WATER_KIND.OPEN_OCEAN : body.kindHint || null);
  const normalized = normalizeWaterBody({
    ...body,
    waterKind: null,
    kind: null,
    label: null,
    surfaceY,
    kindHint,
    datumMethod: options.datumMethod || 'dem-water-surface',
    datumConfidence: finiteNumber(options.datumConfidence, 0.9)
  });
  Object.assign(body, normalized);
  return body;
}

export {
  WATER_BODY_SCHEMA_VERSION,
  WATER_BODY_SHAPE,
  WATER_KIND,
  WATER_SURFACE_DATUM,
  normalizeWaterBody,
  normalizeWaterKind,
  polygonMetrics,
  polylineLength,
  reconcileWaterBodySurface,
  resolveWaterBodySurfaceY,
  waterKindLabel,
  waterSurfaceBaseElevation
};
