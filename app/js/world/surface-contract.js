const SURFACE_SCHEMA_VERSION = 1;

const SOURCE_PROFILE = Object.freeze({
  LOCATION_OSM: 'location_osm'
});

const SURFACE_KIND = Object.freeze({
  INTERIOR: 'interior',
  PATH: 'path',
  ROAD: 'road',
  TERRAIN: 'terrain',
  URBAN: 'urban_surface',
  WATER: 'water'
});

const VERTICAL_DATUM = Object.freeze({
  id: 'engine_local_world_y_v1',
  description: 'Local engine Y derived from the active Earth origin and source elevation.',
  units: 'world_unit'
});

const EARTH_TRAVERSAL_BOUNDS = Object.freeze({
  [SOURCE_PROFILE.LOCATION_OSM]: Object.freeze({ horizontalRadius: 5000, originRebase: false })
});

const SURFACE_COMPOSITION_LAYER = Object.freeze({
  TERRAIN: 0,
  DEVELOPED: 1,
  AGRICULTURE: 2,
  NATURAL: 3,
  PEDESTRIAN: 4,
  TRANSPORTATION: 5,
  ROAD: 6,
  WATER: 7
});

const NATURAL_SURFACES = new Set([
  'forest', 'wood', 'scrub', 'park', 'garden', 'grass', 'grassland', 'meadow',
  'orchard', 'recreation_ground', 'village_green', 'cemetery', 'sand', 'beach',
  'bare_rock', 'scree', 'shingle', 'wetland', 'marsh', 'bog', 'swamp', 'dune',
  'barren', 'glacier', 'quarry', 'greenfield'
]);
const AGRICULTURAL_SURFACES = new Set([
  'farmland', 'farmyard', 'vineyard', 'allotments', 'plant_nursery', 'greenhouse_horticulture'
]);
const DEVELOPED_SURFACES = new Set([
  'residential', 'construction', 'education', 'religious', 'medical', 'commercial',
  'industrial', 'retail', 'parking', 'paved'
]);
const surfaceCompositionCache = new Map();

function surfaceComposition(kind = '', role = 'land-cover') {
  const normalizedKind = String(kind || '').toLowerCase();
  const normalizedRole = String(role || '').toLowerCase();
  const cacheKey = `${normalizedRole}:${normalizedKind}`;
  if (surfaceCompositionCache.has(cacheKey)) return surfaceCompositionCache.get(cacheKey);
  let layer = SURFACE_COMPOSITION_LAYER.DEVELOPED;
  if (normalizedRole === 'terrain') layer = SURFACE_COMPOSITION_LAYER.TERRAIN;
  else if (normalizedRole === 'road') layer = SURFACE_COMPOSITION_LAYER.ROAD;
  else if (normalizedRole === 'water') layer = SURFACE_COMPOSITION_LAYER.WATER;
  else if (normalizedKind === 'pedestrian') layer = SURFACE_COMPOSITION_LAYER.PEDESTRIAN;
  else if (normalizedKind === 'transportation') layer = SURFACE_COMPOSITION_LAYER.TRANSPORTATION;
  else if (NATURAL_SURFACES.has(normalizedKind)) layer = SURFACE_COMPOSITION_LAYER.NATURAL;
  else if (AGRICULTURAL_SURFACES.has(normalizedKind)) layer = SURFACE_COMPOSITION_LAYER.AGRICULTURE;
  else if (DEVELOPED_SURFACES.has(normalizedKind)) layer = SURFACE_COMPOSITION_LAYER.DEVELOPED;
  const composition = Object.freeze({
    layer,
    renderOrder: layer,
    surfaceOffset: layer === SURFACE_COMPOSITION_LAYER.ROAD ? 0.1 : 0.025 + layer * 0.007,
    polygonOffsetFactor: -Math.max(1, layer),
    polygonOffsetUnits: -Math.max(1, layer)
  });
  surfaceCompositionCache.set(cacheKey, composition);
  return composition;
}

function finiteOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finiteOr(value, 0)));
}

function activeSourceProfile() {
  return SOURCE_PROFILE.LOCATION_OSM;
}

function earthTraversalBounds(profile = SOURCE_PROFILE.LOCATION_OSM) {
  return EARTH_TRAVERSAL_BOUNDS[profile] || EARTH_TRAVERSAL_BOUNDS[SOURCE_PROFILE.LOCATION_OSM];
}

function normalizedSourceName(feature = null, fallback = '') {
  const tags = feature?.tags || {};
  return String(
    tags._geometrySource ||
    feature?.geometrySource ||
    feature?.source?.type ||
    feature?.source ||
    fallback ||
    'unknown'
  ).trim().toLowerCase();
}

function sourceIdentity(feature = null) {
  const tags = feature?.tags || {};
  return String(
    tags._sourceFeatureId ||
    feature?.sourceFeatureId ||
    feature?.id ||
    ''
  );
}

function provenanceFor(feature, options = {}) {
  const source = normalizedSourceName(feature, options.source);
  let provider = String(options.provider || 'runtime');
  let dataset = String(options.dataset || source || 'unknown');
  let confidence = finiteOr(options.confidence, 0.7);
  let fallback = options.fallback === true;

  if (source.includes('shortbread')) {
    provider = 'OpenStreetMap Foundation';
    dataset = 'OSM Shortbread vector tiles';
    confidence = 0.9;
  } else if (source.includes('overpass') || source === 'osm') {
    provider = 'OpenStreetMap contributors';
    dataset = 'OpenStreetMap';
    confidence = 0.94;
  } else if (source.includes('inferred') || source.includes('synthetic') || source.includes('procedural')) {
    provider = 'World Explorer 3D';
    dataset = source || 'procedural fallback';
    confidence = Math.min(confidence, 0.45);
    fallback = true;
  }

  return {
    provider,
    dataset,
    source,
    featureId: sourceIdentity(feature),
    confidence: clamp01(confidence),
    fallback
  };
}

function normalizeNormal(normal = null) {
  const x = finiteOr(normal?.x, 0);
  const y = finiteOr(normal?.y, 1);
  const z = finiteOr(normal?.z, 0);
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

function traversalFor(kind, options = {}) {
  return {
    walk: options.walk ?? kind !== SURFACE_KIND.WATER,
    drive: options.drive ?? (kind === SURFACE_KIND.ROAD || kind === SURFACE_KIND.TERRAIN),
    boat: options.boat ?? kind === SURFACE_KIND.WATER,
    planeContact: options.planeContact ?? kind !== SURFACE_KIND.WATER
  };
}

function createSurfaceSample(options = {}) {
  const kind = Object.values(SURFACE_KIND).includes(options.kind) ? options.kind : SURFACE_KIND.TERRAIN;
  const y = finiteOr(options.y, 0);
  const x = finiteOr(options.x, 0);
  const z = finiteOr(options.z, 0);
  const metersPerWorldUnit = Math.max(0.000001, finiteOr(options.metersPerWorldUnit, 1));
  return {
    schemaVersion: SURFACE_SCHEMA_VERSION,
    profile: Object.values(SOURCE_PROFILE).includes(options.profile) ? options.profile : SOURCE_PROFILE.LOCATION_OSM,
    kind,
    position: {
      x,
      y,
      z
    },
    contact: {
      x: finiteOr(options.contact?.x, x),
      y: finiteOr(options.contact?.y, y),
      z: finiteOr(options.contact?.z, z)
    },
    normal: normalizeNormal(options.normal),
    distance: Number.isFinite(Number(options.distance)) ? Number(options.distance) : null,
    vertical: {
      ...VERTICAL_DATUM,
      metersPerWorldUnit,
      elevationMeters: y * metersPerWorldUnit
    },
    provenance: provenanceFor(options.feature, options.provenance),
    traversal: traversalFor(kind, options.traversal),
    feature: options.feature || null
  };
}

function createSurfaceTileDescriptor(options = {}) {
  const z = Math.max(0, Math.round(finiteOr(options.z, 0)));
  const n = 2 ** z;
  const x = ((Math.round(finiteOr(options.x, 0)) % n) + n) % n;
  const y = Math.max(0, Math.min(n - 1, Math.round(finiteOr(options.y, 0))));
  return {
    schemaVersion: SURFACE_SCHEMA_VERSION,
    key: `${z}/${x}/${y}`,
    profile: Object.values(SOURCE_PROFILE).includes(options.profile) ? options.profile : SOURCE_PROFILE.LOCATION_OSM,
    tile: { z, x, y },
    bounds: options.bounds ? {
      latN: finiteOr(options.bounds.latN),
      latS: finiteOr(options.bounds.latS),
      lonW: finiteOr(options.bounds.lonW),
      lonE: finiteOr(options.bounds.lonE)
    } : null,
    generation: Math.max(0, Math.round(finiteOr(options.generation, 0))),
    sources: Array.isArray(options.sources) ? options.sources.map(String) : [],
    status: String(options.status || 'requested')
  };
}

function surfaceKindFromWalkInfo(info = {}) {
  const source = String(info.source || '').toLowerCase();
  if (source.includes('interior')) return SURFACE_KIND.INTERIOR;
  if (source === 'road') return SURFACE_KIND.ROAD;
  if (source === 'urban_surface') return SURFACE_KIND.URBAN;
  if (source && source !== 'terrain') return SURFACE_KIND.PATH;
  return SURFACE_KIND.TERRAIN;
}

function terrainProvenance(appCtx) {
  const hasLoadedElevation = [...(appCtx.terrainTileCache?.values?.() || [])].some((tile) => tile?.loaded && tile?.elev);
  return hasLoadedElevation ? {
    provider: 'Amazon Web Services Open Data',
    dataset: 'Mapzen Terrarium elevation tiles',
    source: 'terrarium',
    confidence: 0.88,
    fallback: false
  } : {
    provider: 'World Explorer 3D',
    dataset: 'terrain fallback',
    source: 'terrain_fallback',
    confidence: 0.35,
    fallback: true
  };
}

function createSurfaceQuery(appCtx, GroundHeight) {
  if (!appCtx || !GroundHeight) throw new TypeError('SurfaceQuery requires app context and GroundHeight.');
  const profile = () => activeSourceProfile(appCtx);
  const units = () => Math.max(0.000001, finiteOr(appCtx.METERS_PER_WORLD_UNIT, 1));

  function terrainAt(x, z) {
    return createSurfaceSample({
      x,
      y: GroundHeight.terrainY(x, z),
      z,
      kind: SURFACE_KIND.TERRAIN,
      profile: profile(),
      metersPerWorldUnit: units(),
      provenance: terrainProvenance(appCtx)
    });
  }

  function walkAt(x, z, options = {}) {
    const info = GroundHeight.walkSurfaceInfo(x, z, options.currentY);
    const kind = surfaceKindFromWalkInfo(info);
    return createSurfaceSample({
      x,
      y: info.y,
      z,
      kind,
      profile: profile(),
      metersPerWorldUnit: units(),
      feature: info.feature,
      contact: info.pt ? { x: info.pt.x, y: info.y, z: info.pt.z } : null,
      distance: info.dist,
      provenance: kind === SURFACE_KIND.TERRAIN ? terrainProvenance(appCtx) : {},
      traversal: { drive: kind === SURFACE_KIND.ROAD || kind === SURFACE_KIND.TERRAIN }
    });
  }

  function driveAt(x, z, options = {}) {
    const preferRoad = options.preferRoad !== false;
    const currentY = Number.isFinite(Number(options.currentY)) ? Number(options.currentY) : NaN;
    const info = GroundHeight.driveSurfaceInfo(x, z, preferRoad, currentY);
    const road = info.source === 'road';
    return createSurfaceSample({
      x,
      y: info.y,
      z,
      kind: road ? SURFACE_KIND.ROAD : SURFACE_KIND.TERRAIN,
      profile: profile(),
      metersPerWorldUnit: units(),
      normal: options.includeNormal === true ? GroundHeight._computeNormal(x, z) : null,
      feature: info.road,
      contact: info.roadPt ? { x: info.roadPt.x, y: info.y, z: info.roadPt.z } : null,
      distance: info.roadDist,
      provenance: road ? {} : terrainProvenance(appCtx)
    });
  }

  function waterAt(x, z, options = {}) {
    const candidate = options.candidate || null;
    const dynamic = candidate && typeof appCtx.sampleDynamicWaterAt === 'function'
      ? appCtx.sampleDynamicWaterAt(x, z, candidate, options)
      : null;
    const y = Number.isFinite(dynamic?.surfaceY)
      ? dynamic.surfaceY
      : Number.isFinite(candidate?.surfaceY) ? candidate.surfaceY : 0;
    return createSurfaceSample({
      x,
      y,
      z,
      kind: SURFACE_KIND.WATER,
      profile: profile(),
      metersPerWorldUnit: units(),
      feature: candidate?.source || candidate,
      provenance: candidate ? {} : {
        source: 'unresolved_water',
        confidence: 0,
        fallback: true
      }
    });
  }

  function at(x, z, options = {}) {
    const mode = String(options.mode || 'terrain').toLowerCase();
    if (mode === 'walk') return walkAt(x, z, options);
    if (mode === 'drive' || mode === 'plane') return driveAt(x, z, options);
    if (mode === 'boat' || mode === 'water') return waterAt(x, z, options);
    return terrainAt(x, z);
  }

  return Object.freeze({
    at,
    createTileDescriptor: (options = {}) => createSurfaceTileDescriptor({ ...options, profile: options.profile || profile() }),
    driveAt,
    getSourceProfile: profile,
    getTraversalBounds: () => earthTraversalBounds(profile()),
    terrainAt,
    walkAt,
    waterAt
  });
}

export {
  EARTH_TRAVERSAL_BOUNDS,
  SOURCE_PROFILE,
  SURFACE_KIND,
  SURFACE_COMPOSITION_LAYER,
  SURFACE_SCHEMA_VERSION,
  VERTICAL_DATUM,
  activeSourceProfile,
  createSurfaceQuery,
  createSurfaceSample,
  createSurfaceTileDescriptor,
  earthTraversalBounds,
  provenanceFor,
  surfaceComposition
};
