import {
  buildingKey,
  buildingFootprintPoints,
  distanceToFootprint,
  isEnterableBuildingCandidate,
  resolveBuildingEntrySupport
} from '../building-entry.js?v=9';

const DEFAULT_ASSOCIATION_RADIUS_METERS = 28;
const MAX_OUTSIDE_ASSOCIATION_DISTANCE_METERS = 18;

// A batch owns its input snapshot. Index full footprints, including large
// buildings whose centres lie outside the search radius. Keep input order so
// equal scores/keys retain the same stable selection as the exhaustive search.
function buildingAssociationQuery(buildings) {
  const cellSize = 64, cells = new Map(), wide = [];
  const source = Array.isArray(buildings) ? buildings : [];
  source.forEach((building, index) => {
    if (!isEnterableBuildingCandidate(building)) return;
    const footprint = buildingFootprintPoints(building);
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for (const point of footprint) {
      minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);
      minZ=Math.min(minZ,point.z);maxZ=Math.max(maxZ,point.z);
    }
    const x0=Math.floor(minX/cellSize),x1=Math.floor(maxX/cellSize);
    const z0=Math.floor(minZ/cellSize),z1=Math.floor(maxZ/cellSize);
    if (![x0,x1,z0,z1].every(Number.isSafeInteger) || (x1-x0+1)*(z1-z0+1)>256) {
      wide.push(index);return;
    }
    for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++) {
      const key=`${x}:${z}`;
      if(!cells.has(key))cells.set(key,[]);
      cells.get(key).push(index);
    }
  });
  return (poi, radius) => {
    const position=poi.position || poi,x=Number(position?.x),z=Number(position?.z);
    if(!Number.isFinite(x)||!Number.isFinite(z))return [];
    const x0=Math.floor((x-radius)/cellSize),x1=Math.floor((x+radius)/cellSize);
    const z0=Math.floor((z-radius)/cellSize),z1=Math.floor((z+radius)/cellSize);
    if(![x0,x1,z0,z1].every(Number.isSafeInteger))return source;
    const selected=new Set(wide);
    for(let cx=x0;cx<=x1;cx++)for(let cz=z0;cz<=z1;cz++) {
      for(const index of cells.get(`${cx}:${cz}`)||[])selected.add(index);
    }
    return [...selected].sort((a,b)=>a-b).map(index=>source[index]);
  };
}

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
  const inputs = Array.isArray(pois) ? pois : [];
  if (inputs.length === 0) return Object.freeze([]);
  const nearby = buildingAssociationQuery(buildings);
  const radius = Math.min(MAX_OUTSIDE_ASSOCIATION_DISTANCE_METERS,
    Math.max(1, Number(options.radiusMeters) || DEFAULT_ASSOCIATION_RADIUS_METERS));
  return Object.freeze(inputs.map((poi) => Object.freeze({
    ...poi,
    buildingAssociation: associatePoiToBuilding(poi, nearby(poi,radius), options)
  })));
}

export {
  DEFAULT_ASSOCIATION_RADIUS_METERS,
  MAX_OUTSIDE_ASSOCIATION_DISTANCE_METERS,
  associatePoiToBuilding,
  associatePoisToBuildings
};
