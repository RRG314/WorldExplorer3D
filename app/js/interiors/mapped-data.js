import { ctx as appCtx } from "../shared-context.js?v=55";
import { buildingLabel, distanceToFootprint } from "../building-entry.js?v=9";
import { INTERIOR_FAST_ENTRY_WAIT_MS, INTERIOR_FETCH_TIMEOUT_MS } from "./constants.js?v=1";
import {
  buildingGeoBounds,
  cleanLinePoints,
  cleanRingPoints,
  createGeneratedInteriorDefinition,
  createInteriorCacheEntry,
  parseLevelValue,
  pickInteriorLevel,
  pointInsideBuilding,
  polygonCentroid,
  ringAreaAbs,
  wayWorldPoints,
  worldToGeo,
  isClosedWay
} from "./core.js?v=4";

export async function fetchMappedInteriorDefinition(support, interiorCache) {
  if (!support?.enterable || !support.allowMappedData || typeof appCtx.fetchOverpassJSON !== 'function') return null;
  const building = support.building;
  if (!building || !Array.isArray(building.pts) || building.pts.length < 3) return null;

  const bounds = buildingGeoBounds(building);
  const bbox = `(${bounds.south},${bounds.west},${bounds.north},${bounds.east})`;
  const query = `[out:json][timeout:${Math.floor(INTERIOR_FETCH_TIMEOUT_MS / 1000)}];(
    node["entrance"]${bbox};
    node["door"]${bbox};
    node["indoor"]${bbox};
    way["indoor"]${bbox};
    way["highway"="corridor"]${bbox};
  );out body;>;out skel qt;`;
  const centerGeo = worldToGeo(
    Number.isFinite(building.centerX) ? building.centerX : (Number(building.minX || 0) + Number(building.maxX || 0)) * 0.5,
    Number.isFinite(building.centerZ) ? building.centerZ : (Number(building.minZ || 0) + Number(building.maxZ || 0)) * 0.5
  );
  const data = await appCtx.fetchOverpassJSON(
    query,
    INTERIOR_FETCH_TIMEOUT_MS,
    performance.now() + INTERIOR_FETCH_TIMEOUT_MS + 400,
    {
      lat: centerGeo.lat,
      lon: centerGeo.lon,
      roadsRadius: 0,
      featureRadius: Math.max(0.00008, Math.abs(bounds.north - bounds.south)),
      poiRadius: Math.max(0.00008, Math.abs(bounds.east - bounds.west))
    }
  );

  const nodesById = new Map();
  (data?.elements || []).forEach((element) => {
    if (element?.type === 'node') nodesById.set(element.id, element);
  });

  const entrances = [];
  const features = [];
  const elements = Array.isArray(data?.elements) ? data.elements : [];

  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    if (!element?.tags) continue;
    if (element.type === 'node' && (element.tags.entrance || element.tags.door)) {
      const point = appCtx.geoToWorld(element.lat, element.lon);
      const footprint = distanceToFootprint(point.x, point.z, building);
      if (!footprint.inside && footprint.dist > 5) continue;
      entrances.push({
        x: point.x,
        z: point.z,
        level: parseLevelValue(element.tags.level),
        kind: element.tags.entrance ? 'entrance' : 'door'
      });
      continue;
    }

    if (element.type !== 'way') continue;
    const indoorTag = String(element.tags.indoor || '').toLowerCase();
    const corridorTag = String(element.tags.highway || '').toLowerCase() === 'corridor';
    if (!indoorTag && !corridorTag) continue;

    const rawWorldPoints = wayWorldPoints(element, nodesById);
    if (rawWorldPoints.length < 2) continue;
    const closed = isClosedWay(element, nodesById);
    const level = parseLevelValue(element.tags.level);
    const name = String(element.tags.name || '').trim();
    const width = Math.max(1.1, Math.min(4.5, Number.parseFloat(element.tags.width) || (corridorTag ? 2.1 : 1.6)));

    if (closed) {
      const pts = cleanRingPoints(rawWorldPoints);
      if (pts.length < 3 || ringAreaAbs(pts) < 2) continue;
      const centroid = polygonCentroid(pts);
      if (!pointInsideBuilding(centroid, building)) continue;
      features.push({ kind: 'polygon', indoorKind: indoorTag || 'room', level, name, width, pts });
      continue;
    }

    const pts = cleanLinePoints(rawWorldPoints);
    if (pts.length < 2) continue;
    let insideCount = 0;
    for (let p = 0; p < pts.length; p++) {
      if (pointInsideBuilding(pts[p], building)) insideCount += 1;
    }
    if (insideCount === 0) continue;
    features.push({
      kind: 'line',
      indoorKind: corridorTag ? 'corridor' : (indoorTag || 'corridor'),
      level,
      name,
      width,
      pts
    });
  }

  const selectedLevel = pickInteriorLevel(features, entrances, building);
  const selectedFeatures = features.filter((feature) => Math.abs(feature.level - selectedLevel) < 0.01);
  const selectedEntrances = entrances.filter((entry) => Math.abs(entry.level - selectedLevel) < 0.01);
  if (selectedFeatures.length === 0) return null;

  // Retain every mapped level as source-owned indoor geometry. Publication is
  // still bounded by the active-plus-adjacent floor window, but changing floors
  // must not silently replace mapped rooms/corridors with a generated layout.
  const mappedLevelValues = [...new Set(features
    .map((feature) => Number(feature.level))
    .filter(Number.isFinite))]
    .sort((a, b) => a - b);
  const mappedLevels = mappedLevelValues.map((level) => Object.freeze({
    level,
    features: Object.freeze(features.filter((feature) => Math.abs(feature.level - level) < 0.01)),
    entrances: Object.freeze(entrances.filter((entry) => Math.abs(entry.level - level) < 0.01))
  }));

  return createInteriorCacheEntry(interiorCache, {
    key: support.key,
    label: support.label || buildingLabel(building),
    mode: 'mapped',
    support,
    building,
    selectedLevel,
    features: selectedFeatures,
    entrances: selectedEntrances,
    mappedLevels: Object.freeze(mappedLevels),
    mappedLevelValues: Object.freeze(mappedLevelValues),
    rawFeatureCount: features.length,
    rawEntranceCount: entrances.length
  });
}

export function warmMappedInteriorDefinition(support, interiorCache, mappedInteriorWarmPromises) {
  if (!support?.enterable || !support.allowMappedData || !support.key) {
    return Promise.resolve(null);
  }
  const cached = interiorCache.get(support.key);
  if (cached?.status === 'ready' && cached.mode === 'mapped') return Promise.resolve(cached);
  const existing = mappedInteriorWarmPromises.get(support.key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      return await fetchMappedInteriorDefinition(support, interiorCache);
    } catch (error) {
      console.warn('[Interior] Mapped indoor fetch failed for', support.label || support.key, error);
      return null;
    } finally {
      mappedInteriorWarmPromises.delete(support.key);
    }
  })();
  mappedInteriorWarmPromises.set(support.key, promise);
  return promise;
}

export async function resolveInteriorDefinitionForEntry(support, interiorCache, mappedInteriorWarmPromises) {
  if (!support?.enterable) return null;
  const cached = interiorCache.get(support.key);
  if (cached?.status === 'ready') return cached;

  let mappedResult = null;
  if (support.allowMappedData) {
    const warmPromise = warmMappedInteriorDefinition(support, interiorCache, mappedInteriorWarmPromises);
    mappedResult = await Promise.race([
      warmPromise,
      new Promise((resolve) => {
        window.setTimeout(() => resolve(null), INTERIOR_FAST_ENTRY_WAIT_MS);
      })
    ]);
  }

  if (mappedResult?.mode === 'mapped') return mappedResult;

  const generated = createGeneratedInteriorDefinition(interiorCache, support, {
    reason: support.allowMappedData ? 'fast_fallback' : 'generated_only'
  });
  if (support.allowMappedData) {
    warmMappedInteriorDefinition(support, interiorCache, mappedInteriorWarmPromises).then((definition) => {
      if (definition?.mode === 'mapped') interiorCache.set(definition.key, definition);
    }).catch(() => {});
  }
  return generated;
}
