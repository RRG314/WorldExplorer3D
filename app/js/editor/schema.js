import {
  OVERLAY_MERGE_MODES,
  OVERLAY_PUBLICATION_STATES,
  OVERLAY_REVIEW_STATES,
  OVERLAY_SOURCE_TYPES
} from './config.js?v=1';
import {
  getOverlayPreset,
  normalizePresetId
} from './preset-registry.js?v=1';

const OVERLAY_AREA_CELL_DEGREES = 0.06;

function sanitizeText(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampLat(lat) {
  return Math.max(-90, Math.min(90, finiteNumber(lat, 0)));
}

function wrapLon(lon) {
  let next = finiteNumber(lon, 0);
  while (next < -180) next += 360;
  while (next > 180) next -= 360;
  return next;
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeTagMap(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const next = {};
  Object.keys(source).forEach((key) => {
    const cleanKey = sanitizeText(key, 64).toLowerCase();
    if (!cleanKey) return;
    const value = source[key];
    if (value == null) return;
    if (typeof value === 'boolean') next[cleanKey] = value ? 'yes' : 'no';
    else if (typeof value === 'number') next[cleanKey] = String(value);
    else {
      const cleanValue = sanitizeText(value, 180);
      if (cleanValue) next[cleanKey] = cleanValue;
    }
  });
  return next;
}

function normalizeBaseFeatureRef(raw = null) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    source: sanitizeText(source.source || 'osm', 24).toLowerCase() || 'osm',
    featureType: sanitizeText(source.featureType || '', 40).toLowerCase(),
    featureId: sanitizeText(source.featureId || '', 180),
    areaKey: sanitizeText(source.areaKey || '', 64),
    displayName: sanitizeText(source.displayName || '', 120)
  };
}

function normalizePointCoordinate(raw = {}) {
  return {
    lat: clampLat(raw.lat),
    lon: wrapLon(raw.lon)
  };
}

function geometryPolygonRings(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  if (Array.isArray(source.rings)) {
    return source.rings
      .map((ring) => {
        if (Array.isArray(ring?.points)) return ring.points;
        if (Array.isArray(ring?.coordinates)) return ring.coordinates;
        return Array.isArray(ring) ? ring : [];
      })
      .map((ring) => ring.map((point) => normalizePointCoordinate(point)))
      .filter((ring) => ring.length > 0);
  }
  if (Array.isArray(source.coordinates)) {
    if (source.coordinates.length && Array.isArray(source.coordinates[0])) {
      return source.coordinates
        .map((ring) => Array.isArray(ring) ? ring.map((point) => normalizePointCoordinate(point)) : [])
        .filter((ring) => ring.length > 0);
    }
    return [
      source.coordinates.map((point) => normalizePointCoordinate(point))
    ].filter((ring) => ring.length > 0);
  }
  return [];
}

function normalizeGeometry(input = {}, explicitType = '') {
  const source = input && typeof input === 'object' ? input : {};
  const type = sanitizeText(explicitType || source.type || 'Point', 20);
  if (type === 'LineString') {
    const coordinates = Array.isArray(source.coordinates)
      ? source.coordinates.map((point) => normalizePointCoordinate(point))
      : [];
    return { type, coordinates };
  }
  if (type === 'Polygon') {
    const rings = geometryPolygonRings(source);
    return {
      type,
      coordinates: rings[0] || [],
      rings: rings.map((ring, index) => ({
        role: index === 0 ? 'outer' : 'inner',
        points: ring
      }))
    };
  }
  return {
    type: 'Point',
    coordinates: normalizePointCoordinate(source.coordinates || source)
  };
}

function collectGeometryPoints(geometry = {}) {
  if (geometry?.type === 'Point') {
    return [normalizePointCoordinate(geometry.coordinates || geometry)];
  }
  if (geometry?.type === 'LineString') {
    return Array.isArray(geometry.coordinates) ? geometry.coordinates.map((point) => normalizePointCoordinate(point)) : [];
  }
  if (geometry?.type === 'Polygon') {
    return geometryPolygonRings(geometry).flatMap((ring) => ring);
  }
  return [];
}

function geometryBbox(geometry = {}) {
  const points = collectGeometryPoints(geometry);
  if (!points.length) {
    return {
      minLat: 0,
      minLon: 0,
      maxLat: 0,
      maxLon: 0
    };
  }
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  points.forEach((point) => {
    minLat = Math.min(minLat, point.lat);
    minLon = Math.min(minLon, point.lon);
    maxLat = Math.max(maxLat, point.lat);
    maxLon = Math.max(maxLon, point.lon);
  });
  return { minLat, minLon, maxLat, maxLon };
}

function geometryCentroid(geometry = {}) {
  const points = collectGeometryPoints(geometry);
  if (!points.length) return { lat: 0, lon: 0 };
  let sumLat = 0;
  let sumLon = 0;
  points.forEach((point) => {
    sumLat += point.lat;
    sumLon += point.lon;
  });
  return {
    lat: sumLat / points.length,
    lon: sumLon / points.length
  };
}

function computeOverlayAreaKey(lat, lon, worldKind = 'earth') {
  const world = sanitizeText(worldKind || 'earth', 24).toLowerCase() || 'earth';
  const safeLat = clampLat(lat);
  const safeLon = wrapLon(lon);
  const latBucket = Math.floor((safeLat + 90) / OVERLAY_AREA_CELL_DEGREES);
  const lonBucket = Math.floor((safeLon + 180) / OVERLAY_AREA_CELL_DEGREES);
  return `${world}:${latBucket}:${lonBucket}`;
}

function normalizeThreeD(raw = {}, presetId = 'poi_marker') {
  const preset = getOverlayPreset(presetId);
  const source = raw && typeof raw === 'object' ? raw : {};
  const base = preset?.threeD && typeof preset.threeD === 'object' ? cloneJson(preset.threeD) : {};
  const entries = Array.isArray(source.entrances) ? source.entrances : base.entrances || [];
  return {
    height: Number.isFinite(Number(source.height)) ? Number(source.height) : (Number.isFinite(Number(base.height)) ? Number(base.height) : null),
    buildingLevels: Number.isFinite(Number(source.buildingLevels)) ? Number(source.buildingLevels) : (Number.isFinite(Number(base.buildingLevels)) ? Number(base.buildingLevels) : null),
    minHeight: finiteNumber(source.minHeight, finiteNumber(base.minHeight, 0)),
    roofShape: sanitizeText(source.roofShape || base.roofShape || 'flat', 40).toLowerCase() || 'flat',
    layer: Math.round(finiteNumber(source.layer, finiteNumber(base.layer, 0))),
    bridge: !!(source.bridge ?? base.bridge),
    tunnel: !!(source.tunnel ?? base.tunnel),
    surface: sanitizeText(source.surface || base.surface || '', 40).toLowerCase(),
    entrances: entries.map((entry) => ({
      lat: clampLat(entry?.lat),
      lon: wrapLon(entry?.lon),
      label: sanitizeText(entry?.label || '', 60),
      kind: sanitizeText(entry?.kind || entry?.type || 'entrance', 40).toLowerCase(),
      elevation: finiteNumber(entry?.elevation, 0),
      yaw: Number.isFinite(Number(entry?.yaw)) ? Number(entry.yaw) : null
    })),
    stairs: Array.isArray(source.stairs) ? source.stairs.map((item) => sanitizeText(item, 80)) : [],
    elevators: Array.isArray(source.elevators) ? source.elevators.map((item) => sanitizeText(item, 80)) : []
  };
}

function normalizeRelations(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const indoorShell = source.indoorShell && typeof source.indoorShell === 'object' ? source.indoorShell : {};
  return {
    level: sanitizeText(source.level || '', 40),
    buildingRef: sanitizeText(source.buildingRef || '', 180),
    parentFeatureId: sanitizeText(source.parentFeatureId || '', 180),
    indoorShell: {
      enabled: indoorShell.enabled === true,
      levels: Array.isArray(indoorShell.levels)
        ? indoorShell.levels.map((level) => ({
            level: sanitizeText(level?.level || '', 40),
            label: sanitizeText(level?.label || '', 80)
          }))
        : []
    }
  };
}

function normalizeSubmission(raw = {}, fallback = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const existing = fallback && typeof fallback === 'object' ? fallback : {};
  return {
    contributorNote: sanitizeText(source.contributorNote || existing.contributorNote || '', 320),
    generatedSummary: sanitizeText(source.generatedSummary || existing.generatedSummary || '', 240),
    changeSummary: sanitizeText(source.changeSummary || existing.changeSummary || '', 180),
    editIntent: sanitizeText(source.editIntent || existing.editIntent || '', 120)
  };
}

function normalizeState(value, allowedValues, fallback) {
  const next = sanitizeText(value || fallback, 40).toLowerCase();
  return allowedValues.includes(next) ? next : fallback;
}

function createClientFeatureId(prefix = 'overlay') {
  const rand = Math.random().toString(36).slice(2, 10);
  const stamp = Date.now().toString(36);
  return `${sanitizeText(prefix, 20).toLowerCase() || 'overlay'}_${stamp}_${rand}`;
}

function overlayFeatureLabel(feature = {}) {
  return sanitizeText(
    feature?.tags?.name ||
      feature?.summary ||
      getOverlayPreset(feature?.presetId)?.label ||
      'Overlay feature',
    120
  ) || 'Overlay feature';
}

function overlayFeatureSearchText(feature = {}) {
  return sanitizeText([
    feature?.presetId,
    feature?.featureClass,
    feature?.tags?.name,
    feature?.tags?.highway,
    feature?.tags?.railway,
    feature?.tags?.building,
    feature?.tags?.amenity,
    feature?.tags?.tourism,
    feature?.baseFeatureRef?.displayName
  ].filter(Boolean).join(' '), 240).toLowerCase();
}

function createOverlayFeatureDraft(options = {}) {
  const presetId = normalizePresetId(options.presetId);
  const preset = getOverlayPreset(presetId);
  const geometry = normalizeGeometry(
    options.geometry || { type: preset.geometryType, coordinates: preset.geometryType === 'Point' ? { lat: 0, lon: 0 } : [] },
    options.geometryType || preset.geometryType
  );
  const centroid = geometryCentroid(geometry);
  const nowMs = Date.now();
  const tags = normalizeTagMap({
    ...(preset.tags || {}),
    ...(options.tags || {})
  });
  const feature = {
    featureId: sanitizeText(options.featureId || createClientFeatureId('overlay'), 180),
    worldKind: sanitizeText(options.worldKind || 'earth', 24).toLowerCase() || 'earth',
    areaKey: sanitizeText(options.areaKey || computeOverlayAreaKey(centroid.lat, centroid.lon, options.worldKind || 'earth'), 64),
    presetId,
    featureClass: sanitizeText(options.featureClass || preset.featureClass, 40).toLowerCase() || preset.featureClass,
    sourceType: normalizeState(options.sourceType || preset.sourceType, OVERLAY_SOURCE_TYPES, preset.sourceType),
    mergeMode: normalizeState(options.mergeMode || preset.mergeMode, OVERLAY_MERGE_MODES, preset.mergeMode),
    baseFeatureRef: normalizeBaseFeatureRef(options.baseFeatureRef),
    geometryType: geometry.type,
    geometry,
    tags,
    threeD: normalizeThreeD(options.threeD || {}, presetId),
    relations: normalizeRelations(options.relations || {}),
    submission: normalizeSubmission(options.submission || {}, options.submission || {}),
    bbox: geometryBbox(geometry),
    level: sanitizeText(options.level || options.relations?.level || '', 40),
    buildingRef: sanitizeText(options.buildingRef || options.relations?.buildingRef || '', 180),
    reviewState: normalizeState(options.reviewState || 'draft', OVERLAY_REVIEW_STATES, 'draft'),
    publicationState: normalizeState(options.publicationState || 'unpublished', OVERLAY_PUBLICATION_STATES, 'unpublished'),
    storageMode: sanitizeText(options.storageMode || 'cloud', 24).toLowerCase() === 'local' ? 'local' : 'cloud',
    validation: {
      valid: options.validation?.valid !== false,
      issues: Array.isArray(options.validation?.issues) ? cloneJson(options.validation.issues) : [],
      updatedAtMs: finiteNumber(options.validation?.updatedAtMs, nowMs)
    },
    summary: sanitizeText(options.summary || tags.name || preset.label, 120),
    searchText: sanitizeText(options.searchText || '', 240).toLowerCase(),
    version: Math.max(1, Math.round(finiteNumber(options.version, 1))),
    headRevisionId: sanitizeText(options.headRevisionId || '', 180),
    createdBy: sanitizeText(options.createdBy || '', 160),
    createdByName: sanitizeText(options.createdByName || '', 80),
    updatedBy: sanitizeText(options.updatedBy || options.createdBy || '', 160),
    updatedByName: sanitizeText(options.updatedByName || options.createdByName || '', 80),
    createdAtMs: finiteNumber(options.createdAtMs, nowMs),
    updatedAtMs: finiteNumber(options.updatedAtMs, nowMs),
    submittedAtMs: finiteNumber(options.submittedAtMs, 0),
    approvedAtMs: finiteNumber(options.approvedAtMs, 0),
    publishedAtMs: finiteNumber(options.publishedAtMs, 0),
    rejectedAtMs: finiteNumber(options.rejectedAtMs, 0),
    needsChangesAtMs: finiteNumber(options.needsChangesAtMs, 0),
    supersedes: sanitizeText(options.supersedes || '', 180),
    supersededBy: sanitizeText(options.supersededBy || '', 180),
    moderation: {
      note: sanitizeText(options.moderation?.note || '', 240),
      actorUid: sanitizeText(options.moderation?.actorUid || '', 160),
      actorName: sanitizeText(options.moderation?.actorName || '', 80)
    },
    runtimeFlags: {
      hidden: options.runtimeFlags?.hidden === true,
      replaceInTraversal: options.runtimeFlags?.replaceInTraversal === true
    }
  };
  feature.searchText = overlayFeatureSearchText(feature);
  feature.summary = overlayFeatureLabel(feature);
  feature.areaKey = computeOverlayAreaKey(centroid.lat, centroid.lon, feature.worldKind);
  return feature;
}

function normalizeOverlayFeature(raw = {}, fallback = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return createOverlayFeatureDraft({
    ...fallback,
    ...cloneJson(source)
  });
}

function cloneOverlayFeature(feature = {}) {
  return normalizeOverlayFeature(cloneJson(feature));
}

function mergeModeNeedsBaseFeatureRef(mergeMode = '') {
  const mode = sanitizeText(mergeMode, 40).toLowerCase();
  return mode === 'render_override' || mode === 'local_replace';
}

export {
  OVERLAY_AREA_CELL_DEGREES,
  clampLat,
  cloneOverlayFeature,
  collectGeometryPoints,
  computeOverlayAreaKey,
  createClientFeatureId,
  createOverlayFeatureDraft,
  geometryPolygonRings,
  geometryBbox,
  geometryCentroid,
  mergeModeNeedsBaseFeatureRef,
  normalizeBaseFeatureRef,
  normalizeGeometry,
  normalizeOverlayFeature,
  normalizeSubmission,
  normalizeTagMap,
  overlayFeatureLabel,
  overlayFeatureSearchText,
  wrapLon
};
