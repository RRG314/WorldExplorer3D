const DEVELOPED_LANDUSE_TYPES = new Set([
  'residential', 'commercial', 'retail', 'industrial', 'garages', 'construction', 'brownfield'
]);

const EXCLUDED_LANDUSE_TYPES = new Set([
  'water', 'forest', 'wood', 'park', 'garden', 'grass', 'meadow', 'scrub',
  'farmland', 'farmyard', 'orchard', 'vineyard', 'allotments', 'cemetery',
  'recreation_ground', 'village_green', 'sand', 'dune', 'barren', 'glacier', 'quarry'
]);

function pointInPolygon(x, z, polygon = []) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (!a || !b) continue;
    const intersects = a.z > z !== b.z > z && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function footprintBounds(points = [], padding = 0) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of points) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z)) continue;
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  return { minX: minX - padding, maxX: maxX + padding, minZ: minZ - padding, maxZ: maxZ + padding };
}

function boundsOverlap(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

function boundsNearOrigin(bounds, radius) {
  const x = Math.max(bounds.minX, Math.min(0, bounds.maxX));
  const z = Math.max(bounds.minZ, Math.min(0, bounds.maxZ));
  return Math.hypot(x, z) <= radius;
}

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function worldToGeo(point, location, scale) {
  const cosLat = Math.cos(Number(location.lat || 0) * Math.PI / 180) || 1;
  return {
    lat: Number(location.lat || 0) - point.z / scale,
    lon: Number(location.lon || 0) + point.x / (scale * cosLat)
  };
}

function dataFootprints(data, appCtx) {
  const nodes = new Map();
  for (const element of data?.elements || []) {
    if (element?.type === 'node') nodes.set(element.id, element);
  }
  const footprints = [];
  for (const element of data?.elements || []) {
    if (element?.type !== 'way' || !(element.tags?.building || element.tags?.['building:part'])) continue;
    const points = (element.nodes || [])
      .map((id) => nodes.get(id))
      .filter(Boolean)
      .map((node) => appCtx.geoToWorld(node.lat, node.lon))
      .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.z));
    if (points.length < 3) continue;
    const bounds = footprintBounds(points, 3.5);
    footprints.push({ points, bounds });
  }
  return footprints;
}

function polygonContainsFootprint(polygon, footprint) {
  let centerX = 0;
  let centerZ = 0;
  const samples = [];
  for (let index = 0; index < footprint.length; index++) {
    const point = footprint[index];
    const next = footprint[(index + 1) % footprint.length];
    centerX += point.x;
    centerZ += point.z;
    samples.push(point, { x: (point.x + next.x) * 0.5, z: (point.z + next.z) * 0.5 });
  }
  samples.push({ x: centerX / footprint.length, z: centerZ / footprint.length });
  return samples.every((point) => pointInPolygon(point.x, point.z, polygon));
}

function segmentsIntersect(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return ((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) &&
    ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0));
}

function polygonsOverlap(a, b) {
  if (a.some((point) => pointInPolygon(point.x, point.z, b))) return true;
  if (b.some((point) => pointInPolygon(point.x, point.z, a))) return true;
  for (let ai = 0; ai < a.length; ai++) {
    const aNext = a[(ai + 1) % a.length];
    for (let bi = 0; bi < b.length; bi++) {
      if (segmentsIntersect(a[ai], aNext, b[bi], b[(bi + 1) % b.length])) return true;
    }
  }
  return false;
}

function footprintTouchesPolygons(footprint, polygons) {
  return polygons.some((polygon) => polygonsOverlap(footprint, polygon));
}

function rectangleAt(centerX, centerZ, tangentX, tangentZ, width, depth) {
  const normalX = -tangentZ;
  const normalZ = tangentX;
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  return [
    { x: centerX - tangentX * halfWidth - normalX * halfDepth, z: centerZ - tangentZ * halfWidth - normalZ * halfDepth },
    { x: centerX + tangentX * halfWidth - normalX * halfDepth, z: centerZ + tangentZ * halfWidth - normalZ * halfDepth },
    { x: centerX + tangentX * halfWidth + normalX * halfDepth, z: centerZ + tangentZ * halfWidth + normalZ * halfDepth },
    { x: centerX - tangentX * halfWidth + normalX * halfDepth, z: centerZ - tangentZ * halfWidth + normalZ * halfDepth }
  ];
}

function localRoadSegments(roads, hasDevelopedLanduse, radius) {
  const segments = [];
  for (const road of roads || []) {
    const type = String(road?.type || '').toLowerCase();
    const residential = type.includes('residential') || type.includes('living_street');
    const developedConnector = hasDevelopedLanduse && (type.includes('service') || type.includes('unclassified'));
    if (!residential && !developedConnector) continue;
    const points = Array.isArray(road?.pts) ? road.pts : [];
    for (let index = 0; index < points.length - 1; index++) {
      const a = points[index];
      const b = points[index + 1];
      const dx = Number(b?.x) - Number(a?.x);
      const dz = Number(b?.z) - Number(a?.z);
      const length = Math.hypot(dx, dz);
      if (!(length >= 14)) continue;
      const midpointX = (a.x + b.x) * 0.5;
      const midpointZ = (a.z + b.z) * 0.5;
      if (Math.hypot(midpointX, midpointZ) > radius + length * 0.5) continue;
      segments.push({
        a,
        b,
        length,
        tangentX: dx / length,
        tangentZ: dz / length,
        roadWidth: Math.max(3, Number(road.width || 5)),
        sourceId: String(road.sourceFeatureId || `${type}:${index}:${midpointX.toFixed(1)}:${midpointZ.toFixed(1)}`),
        centerDistance: Math.hypot(midpointX, midpointZ)
      });
    }
  }
  return segments.sort((a, b) => a.centerDistance - b.centerDistance);
}

export function inferRoadFrontageFootprints(options = {}) {
  const roads = Array.isArray(options.roads) ? options.roads : [];
  const landuses = Array.isArray(options.landuses) ? options.landuses : [];
  const waterAreas = Array.isArray(options.waterAreas) ? options.waterAreas : [];
  const existing = Array.isArray(options.existingFootprints) ? options.existingFootprints : [];
  const radius = Math.max(180, Math.min(700, Number(options.radius || 520)));
  const maxFootprints = Math.max(0, Math.min(120, Number(options.maxFootprints || 72)));
  const developedPolygons = landuses
    .filter((entry) => DEVELOPED_LANDUSE_TYPES.has(String(entry?.type || '')) && Array.isArray(entry?.pts))
    .map((entry) => entry.pts);
  const excludedPolygons = landuses
    .filter((entry) => EXCLUDED_LANDUSE_TYPES.has(String(entry?.type || '')) && Array.isArray(entry?.pts))
    .map((entry) => entry.pts)
    .concat(waterAreas.filter((entry) => Array.isArray(entry?.pts)).map((entry) => entry.pts));
  const segments = localRoadSegments(roads, developedPolygons.length > 0, radius);
  const residentialRoadEvidence = new Set(segments.map((segment) => segment.sourceId)).size;
  if (segments.length === 0 || (developedPolygons.length === 0 && residentialRoadEvidence < 3)) {
    return { footprints: [], basis: '', eligibleSegments: segments.length, developedPolygons: developedPolygons.length };
  }

  const occupiedBounds = existing.map((entry) => entry.bounds || footprintBounds(entry.points || [], 3.5));
  const footprints = [];
  const basis = developedPolygons.length > 0 ?
    'mapped_developed_landuse_and_road_frontage' :
    'mapped_residential_road_frontage';

  for (const segment of segments) {
    if (footprints.length >= maxFootprints) break;
    const seed = hashString(segment.sourceId);
    const spacing = 30 + seed % 9;
    const slots = Math.max(1, Math.floor(segment.length / spacing));
    for (let slot = 0; slot < slots && footprints.length < maxFootprints; slot++) {
      const t = (slot + 1) / (slots + 1);
      const roadX = segment.a.x + (segment.b.x - segment.a.x) * t;
      const roadZ = segment.a.z + (segment.b.z - segment.a.z) * t;
      const slotSeed = hashString(`${segment.sourceId}:${slot}`);
      const width = 9 + slotSeed % 7;
      const depth = 8 + (slotSeed >>> 4) % 7;
      const frontSetback = 6 + (slotSeed >>> 8) % 5;
      const normalX = -segment.tangentZ;
      const normalZ = segment.tangentX;
      for (const side of [-1, 1]) {
        if (footprints.length >= maxFootprints) break;
        const offset = side * (segment.roadWidth * 0.5 + frontSetback + depth * 0.5);
        const centerX = roadX + normalX * offset;
        const centerZ = roadZ + normalZ * offset;
        if (Math.hypot(centerX, centerZ) > radius) continue;
        const footprint = rectangleAt(centerX, centerZ, segment.tangentX, segment.tangentZ, width, depth);
        if (developedPolygons.length > 0 && !developedPolygons.some((polygon) => polygonContainsFootprint(polygon, footprint))) continue;
        if (footprintTouchesPolygons(footprint, excludedPolygons)) continue;
        const bounds = footprintBounds(footprint, 3.5);
        if (occupiedBounds.some((occupied) => boundsOverlap(bounds, occupied))) continue;
        occupiedBounds.push(bounds);
        footprints.push({ points: footprint, basis, sourceId: `${segment.sourceId}:${slot}:${side}` });
      }
    }
  }

  return {
    footprints,
    basis,
    eligibleSegments: segments.length,
    developedPolygons: developedPolygons.length,
    residentialRoadEvidence
  };
}

export function supplementSparseBuildingData(data, appCtx, options = {}) {
  if (!data?.elements || !appCtx || appCtx.selLoc !== 'custom') return { added: 0, reason: 'not_custom' };
  const existingFootprints = dataFootprints(data, appCtx);
  const centralMapped = existingFootprints.filter((entry) => boundsNearOrigin(entry.bounds, 300)).length;
  if (centralMapped >= 3) return { added: 0, reason: 'mapped_center_coverage', centralMapped };

  const inferred = inferRoadFrontageFootprints({
    roads: appCtx.roads,
    landuses: appCtx.landuses,
    waterAreas: appCtx.waterAreas,
    existingFootprints,
    radius: options.radius || 520,
    maxFootprints: options.maxFootprints || 72
  });
  if (inferred.footprints.length === 0) {
    return { added: 0, reason: 'insufficient_development_evidence', centralMapped, ...inferred };
  }

  const location = appCtx.LOC || { lat: 0, lon: 0 };
  const scale = Math.max(1, Number(appCtx.SCALE || 1));
  let nextNodeId = -1000000000;
  let nextWayId = -900000000;
  for (const footprint of inferred.footprints) {
    const closed = [...footprint.points, footprint.points[0]];
    const nodeIds = closed.map((point) => {
      const id = nextNodeId--;
      const geo = worldToGeo(point, location, scale);
      data.elements.push({ type: 'node', id, lat: geo.lat, lon: geo.lon });
      return id;
    });
    const identity = `inferred:${hashString(footprint.sourceId).toString(16)}`;
    data.elements.push({
      type: 'way',
      id: nextWayId--,
      nodes: nodeIds,
      tags: {
        building: 'house',
        _sourceFeatureId: identity,
        _geometrySource: 'inferred_road_frontage',
        _inferenceBasis: footprint.basis,
        _buildingMetadataSourceId: ''
      }
    });
  }

  const summary = {
    added: inferred.footprints.length,
    centralMapped,
    basis: inferred.basis,
    eligibleSegments: inferred.eligibleSegments,
    developedPolygons: inferred.developedPolygons,
    residentialRoadEvidence: inferred.residentialRoadEvidence
  };
  data._inferredBuildings = summary;
  if (data._overtureBuildings) data._overtureBuildings.inferredFootprints = summary;
  return summary;
}
