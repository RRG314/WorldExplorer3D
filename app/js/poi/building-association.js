import {
  buildingKey,
  distanceToFootprint,
  isEnterableBuildingCandidate,
  resolveBuildingEntrySupport
} from '../building-entry.js?v=9';

const DEFAULT_ASSOCIATION_RADIUS_METERS = 28;
const MAX_OUTSIDE_ASSOCIATION_DISTANCE_METERS = 18;

function associatePoiToBuilding(poi = {}, buildings = [], options = {}) {
  const position = poi.position || poi;
  const x = Number(position?.x);
  const z = Number(position?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const radius = Math.max(1, Number(options.radiusMeters) || DEFAULT_ASSOCIATION_RADIUS_METERS);
  const candidates = (Array.isArray(buildings) ? buildings : []).map((building) => {
    if (!isEnterableBuildingCandidate(building)) return null;
    const hit = distanceToFootprint(x, z, building);
    if (!Number.isFinite(hit.dist) || hit.dist > radius || (!hit.inside && hit.dist > MAX_OUTSIDE_ASSOCIATION_DISTANCE_METERS)) return null;
    const key = buildingKey(building);
    if (!key) return null;
    const support = resolveBuildingEntrySupport(building, { allowSynthetic: false });
    return { building, hit, key, support, score: hit.dist + (hit.inside ? -1000 : 0) };
  }).filter(Boolean).sort((left, right) => left.score - right.score || left.key.localeCompare(right.key));
  const selected = candidates[0];
  if (!selected) return null;
  const entrance = options.entranceByBuilding?.get?.(selected.key) || null;
  return Object.freeze({
    type: 'PoiBuildingAssociation',
    poiId: String(poi.id || ''),
    sourceBuildingId: selected.key,
    relationship: selected.hit.inside ? 'contained' : 'nearest-safe-building',
    distanceMeters: Number(selected.hit.dist.toFixed(2)),
    enterable: selected.support.enterable === true,
    entrance: entrance ? Object.freeze({
      x: Number(entrance.x),
      z: Number(entrance.z),
      approachX: Number(entrance.approachX ?? entrance.x),
      approachZ: Number(entrance.approachZ ?? entrance.z)
    }) : null,
    entryType: entrance ? 'published-door' : 'exterior-fallback',
    representativeInterior: true
  });
}

function associatePoisToBuildings(pois = [], buildings = [], options = {}) {
  return Object.freeze((Array.isArray(pois) ? pois : []).map((poi) => Object.freeze({
    ...poi,
    buildingAssociation: associatePoiToBuilding(poi, buildings, options)
  })));
}

export {
  DEFAULT_ASSOCIATION_RADIUS_METERS,
  MAX_OUTSIDE_ASSOCIATION_DISTANCE_METERS,
  associatePoiToBuilding,
  associatePoisToBuildings
};
