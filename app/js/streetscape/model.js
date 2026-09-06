import { roadWidthAtSegment } from '../world/road-cross-section-profile.js?v=1';

const STREETSCAPE_GENERATOR_VERSION = 1;
const CELL_SIZE = 64;
const SUBDIVISION_METERS = 8;

const TIER_BUDGETS = Object.freeze({
  low: Object.freeze({ radius: 700, sections: 900, frontage: 60 }),
  performance: Object.freeze({ radius: 1050, sections: 1600, frontage: 100 }),
  balanced: Object.freeze({ radius: 1500, sections: 3200, frontage: 180 }),
  quality: Object.freeze({ radius: 1900, sections: 5000, frontage: 260 })
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roadTags(road = {}) {
  return road?.transportRecord?.sourceTags || road?.transportRecord?.rawTags || road?.structureTags || {};
}

function roadClass(road = {}) {
  const tags = roadTags(road);
  return String(tags.highway || road.type || '').trim().toLowerCase();
}

function atGradeStreet(road = {}) {
  const semantics = road.structureSemantics || {};
  const structureKind = String(semantics.structureKind || 'none');
  return String(road.networkKind || 'road') === 'road' &&
    road.walkable !== false &&
    String(semantics.terrainMode || 'at_grade') === 'at_grade' &&
    semantics.topologySeparated !== true &&
    semantics.rampCandidate !== true &&
    (structureKind === 'none' || structureKind === 'at_grade');
}

function mappedSidewalkSides(tags = {}) {
  const general = String(tags.sidewalk || '').trim().toLowerCase();
  if (['no', 'none', 'separate'].includes(general)) return Object.freeze({ sides: [], reason: `mapped_${general}` });
  const sides = new Set();
  if (['yes', 'both'].includes(general)) { sides.add(-1); sides.add(1); }
  if (general === 'left') sides.add(1);
  if (general === 'right') sides.add(-1);
  const left = String(tags['sidewalk:left'] || '').trim().toLowerCase();
  const right = String(tags['sidewalk:right'] || '').trim().toLowerCase();
  if (['yes', 'designated'].includes(left)) sides.add(1);
  if (['no', 'none', 'separate'].includes(left)) sides.delete(1);
  if (['yes', 'designated'].includes(right)) sides.add(-1);
  if (['no', 'none', 'separate'].includes(right)) sides.delete(-1);
  return Object.freeze({ sides: [...sides].sort(), reason: sides.size ? 'mapped_road_tag' : '' });
}

function sectionContext({ buildingCount = 0, developedKind = '' } = {}) {
  const kind = String(developedKind || '').toLowerCase();
  if ((/commercial|retail/.test(kind) && buildingCount >= 3) || buildingCount >= 8) return 'downtown';
  if (/industrial/.test(kind)) return 'industrial';
  if (buildingCount >= 4) return 'urban';
  return 'suburban';
}

function dimensionsForContext(context) {
  if (context === 'downtown') return Object.freeze({ sidewalkWidth: 2.8, vergeWidth: 0, gutterWidth: 0.18, curbHeight: 0.14 });
  if (context === 'urban') return Object.freeze({ sidewalkWidth: 2.15, vergeWidth: 0, gutterWidth: 0.17, curbHeight: 0.14 });
  if (context === 'industrial') return Object.freeze({ sidewalkWidth: 1.8, vergeWidth: 0.35, gutterWidth: 0.18, curbHeight: 0.12 });
  return Object.freeze({ sidewalkWidth: 1.55, vergeWidth: 0.8, gutterWidth: 0.16, curbHeight: 0.12 });
}

function resolveRoadStreetSection(road, context = {}) {
  if (!atGradeStreet(road)) return Object.freeze({ eligible: false, sides: [], reason: 'not_ordinary_at_grade' });
  const tags = roadTags(road);
  const mapped = mappedSidewalkSides(tags);
  const highway = roadClass(road);
  const service = String(tags.service || '').trim().toLowerCase();
  if (mapped.reason && mapped.sides.length === 0) return Object.freeze({ eligible: false, sides: [], reason: mapped.reason });
  if (/^(motorway|motorway_link|trunk|trunk_link|raceway|construction|proposed|track)$/.test(highway)) {
    return Object.freeze({ eligible: false, sides: [], reason: 'non_pedestrian_road_class' });
  }
  if (highway === 'service' && /^(driveway|parking_aisle|alley|emergency_access)$/.test(service) && mapped.sides.length === 0) {
    return Object.freeze({ eligible: false, sides: [], reason: 'service_access' });
  }
  const explicit = mapped.sides.length > 0;
  const inferable = /^(secondary|secondary_link|tertiary|tertiary_link|residential|living_street|unclassified|road)$/.test(highway);
  const developed = /^(residential|commercial|retail|industrial|paved)$/.test(String(context.developedKind || '').toLowerCase());
  if (!explicit && (!inferable || (finite(context.buildingCount) < 2 && !developed))) {
    return Object.freeze({ eligible: false, sides: [], reason: 'insufficient_urban_evidence' });
  }
  const visualContext = sectionContext(context);
  return Object.freeze({
    eligible: true,
    sides: Object.freeze(explicit ? mapped.sides : [-1, 1]),
    provenance: explicit ? 'mapped_sidewalk_tag' : 'inferred_urban_sidewalk',
    context: visualContext,
    ...dimensionsForContext(visualContext)
  });
}

function boundsForPoints(points = []) {
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  points.forEach((point) => {
    minX = Math.min(minX, finite(point?.x, Infinity));
    maxX = Math.max(maxX, finite(point?.x, -Infinity));
    minZ = Math.min(minZ, finite(point?.z, Infinity));
    maxZ = Math.max(maxZ, finite(point?.z, -Infinity));
  });
  return Number.isFinite(minX) ? { minX, maxX, minZ, maxZ } : null;
}

function pointInPolygon(x, z, ring = []) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const a = ring[current]; const b = ring[previous];
    if (!a || !b) continue;
    const intersects = (finite(a.z) > z) !== (finite(b.z) > z) &&
      x < (finite(b.x) - finite(a.x)) * (z - finite(a.z)) / ((finite(b.z) - finite(a.z)) || 1e-9) + finite(a.x);
    if (intersects) inside = !inside;
  }
  return inside;
}

function footprintForBuilding(building = {}) {
  if (Array.isArray(building.pts) && building.pts.length >= 3) return building.pts;
  if ([building.minX, building.maxX, building.minZ, building.maxZ].every((value) => Number.isFinite(Number(value)))) {
    return [
      { x: Number(building.minX), z: Number(building.minZ) },
      { x: Number(building.maxX), z: Number(building.minZ) },
      { x: Number(building.maxX), z: Number(building.maxZ) },
      { x: Number(building.minX), z: Number(building.maxZ) }
    ];
  }
  return null;
}

function cellKey(x, z) {
  return `${Math.floor(finite(x) / CELL_SIZE)},${Math.floor(finite(z) / CELL_SIZE)}`;
}

function spatialIndex(items = []) {
  const cells = new Map();
  items.forEach((item) => {
    const key = cellKey(item.x, item.z);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(item);
  });
  return cells;
}

function areaSpatialIndex(items = []) {
  const cells = new Map();
  items.forEach((item) => {
    if (!item?.bounds) return;
    const minCellX = Math.floor(item.bounds.minX / CELL_SIZE);
    const maxCellX = Math.floor(item.bounds.maxX / CELL_SIZE);
    const minCellZ = Math.floor(item.bounds.minZ / CELL_SIZE);
    const maxCellZ = Math.floor(item.bounds.maxZ / CELL_SIZE);
    for (let x = minCellX; x <= maxCellX; x += 1) {
      for (let z = minCellZ; z <= maxCellZ; z += 1) {
        const key = `${x},${z}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(item);
      }
    }
  });
  return cells;
}

function nearbyFromIndex(index, x, z, radius) {
  const output = [];
  const cellRadius = Math.max(1, Math.ceil(radius / CELL_SIZE));
  const cx = Math.floor(x / CELL_SIZE); const cz = Math.floor(z / CELL_SIZE);
  for (let ox = -cellRadius; ox <= cellRadius; ox += 1) {
    for (let oz = -cellRadius; oz <= cellRadius; oz += 1) {
      output.push(...(index.get(`${cx + ox},${cz + oz}`) || []));
    }
  }
  return output;
}

function pointSegmentDistance(x, z, start, end) {
  const dx = finite(end?.x) - finite(start?.x);
  const dz = finite(end?.z) - finite(start?.z);
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared > 1e-8
    ? Math.max(0, Math.min(1, ((x - finite(start?.x)) * dx + (z - finite(start?.z)) * dz) / lengthSquared))
    : 0;
  const px = finite(start?.x) + dx * t; const pz = finite(start?.z) + dz * t;
  return { distance: Math.hypot(x - px, z - pz), x: px, z: pz, t };
}

function quadContains(quad, x, z) {
  return Array.isArray(quad) && quad.length >= 3 && pointInPolygon(x, z, quad);
}

function quadBlocked(quad, footprintIndex, parkingIndex, vegetation) {
  const center = quad.reduce((result, point) => ({ x: result.x + point.x / quad.length, z: result.z + point.z / quad.length }), { x: 0, z: 0 });
  const samples = [...quad, center];
  for (const sample of samples) {
    if ((footprintIndex.get(cellKey(sample.x, sample.z)) || []).some((entry) =>
      sample.x >= entry.bounds.minX && sample.x <= entry.bounds.maxX && sample.z >= entry.bounds.minZ && sample.z <= entry.bounds.maxZ &&
      pointInPolygon(sample.x, sample.z, entry.ring))) return 'building';
    if ((parkingIndex.get(cellKey(sample.x, sample.z)) || []).some((entry) =>
      sample.x >= entry.bounds.minX && sample.x <= entry.bounds.maxX && sample.z >= entry.bounds.minZ && sample.z <= entry.bounds.maxZ &&
      pointInPolygon(sample.x, sample.z, entry.ring))) return 'parking';
  }
  if (vegetation.some((entry) => quadContains(quad, entry.x, entry.z))) return 'vegetation';
  return '';
}

function developedLanduseAt(landuseIndex, x, z) {
  const found = (landuseIndex.get(cellKey(x, z)) || []).find((entry) =>
    x >= entry.bounds.minX && x <= entry.bounds.maxX && z >= entry.bounds.minZ && z <= entry.bounds.maxZ &&
    pointInPolygon(x, z, entry.ring));
  return found?.type || '';
}

function roadContext(road, buildingIndex, landuseIndex) {
  const points = Array.isArray(road?.pts) ? road.pts : [];
  let buildingCount = 0;
  let developedKind = '';
  const stride = Math.max(1, Math.ceil((points.length - 1) / 10));
  for (let index = 0; index < points.length - 1; index += stride) {
    const x = (finite(points[index].x) + finite(points[index + 1].x)) * 0.5;
    const z = (finite(points[index].z) + finite(points[index + 1].z)) * 0.5;
    const count = nearbyFromIndex(buildingIndex, x, z, 58).filter((building) => Math.hypot(building.x - x, building.z - z) <= 58).length;
    buildingCount = Math.max(buildingCount, count);
    developedKind ||= developedLanduseAt(landuseIndex, x, z);
  }
  return { buildingCount, developedKind };
}

function heightAt(options, road, x, z, curbHeight, curbCut = false) {
  const terrain = finite(options.sampleTerrainY?.(x, z), 0);
  const roadY = finite(options.sampleRoadY?.(road, x, z), terrain);
  const lift = curbCut ? 0.035 : curbHeight;
  return {
    top: Math.max(terrain + 0.025, roadY + lift),
    road: Math.max(terrain + 0.012, roadY + 0.012)
  };
}

function segmentNormal(points, index, side) {
  const start = points[index];
  const end = points[index + 1];
  const dx = finite(end?.x) - finite(start?.x);
  const dz = finite(end?.z) - finite(start?.z);
  const length = Math.hypot(dx, dz) || 1;
  return { x: -dz / length * side, z: dx / length * side };
}

// Join consecutive offsets with one bounded miter. This keeps curved streets
// continuous without the long spikes produced by an unlimited line join.
function offsetVectorAt(road, segmentIndex, t, side, distance) {
  const points = road?.pts || [];
  const current = segmentNormal(points, segmentIndex, side);
  const adjacentIndex = t <= 1e-7 ? segmentIndex - 1 : segmentIndex + 1;
  if (adjacentIndex < 0 || adjacentIndex >= points.length - 1) {
    return { x: current.x * distance, z: current.z * distance };
  }
  const adjacent = segmentNormal(points, adjacentIndex, side);
  const sumX = current.x + adjacent.x;
  const sumZ = current.z + adjacent.z;
  const sumLength = Math.hypot(sumX, sumZ);
  if (sumLength < 0.25) return { x: current.x * distance, z: current.z * distance };
  const joinX = sumX / sumLength;
  const joinZ = sumZ / sumLength;
  const alignment = Math.max(0.25, joinX * current.x + joinZ * current.z);
  const scale = Math.min(1.35, 1 / alignment);
  return { x: joinX * distance * scale, z: joinZ * distance * scale };
}

function pointAlong(start, end, t) {
  return { x: finite(start?.x) + (finite(end?.x) - finite(start?.x)) * t, z: finite(start?.z) + (finite(end?.z) - finite(start?.z)) * t };
}

function nearestIntersection(intersections, x, z, sidewalkWidth) {
  return intersections.find((entry) => entry.hasGradeSeparatedRoad !== true &&
    Math.hypot(finite(entry.x) - x, finite(entry.z) - z) <= Math.max(2.2, finite(entry.maxWidth, 8) * 0.5 + sidewalkWidth * 0.8)) || null;
}

function collectDrivewaySegments(roads = []) {
  const output = [];
  roads.forEach((road) => {
    const tags = roadTags(road);
    if (roadClass(road) !== 'service' || String(tags.service || '').toLowerCase() !== 'driveway' || !atGradeStreet(road)) return;
    for (let index = 0; index < (road.pts?.length || 0) - 1; index += 1) {
      const start = road.pts[index]; const end = road.pts[index + 1];
      const width = roadWidthAtSegment(road, index, 0.5);
      const padding = width * 0.5 + SUBDIVISION_METERS;
      output.push({
        start, end, width,
        bounds: {
          minX: Math.min(start.x, end.x) - padding,
          maxX: Math.max(start.x, end.x) + padding,
          minZ: Math.min(start.z, end.z) - padding,
          maxZ: Math.max(start.z, end.z) + padding
        }
      });
    }
  });
  return output;
}

function collectRoadSegments(roads = []) {
  const output = [];
  roads.forEach((road) => {
    if (!atGradeStreet(road)) return;
    for (let index = 0; index < (road.pts?.length || 0) - 1; index += 1) {
      const start = road.pts[index]; const end = road.pts[index + 1];
      const width = roadWidthAtSegment(road, index, 0.5);
      const padding = width * 0.5 + 0.5;
      output.push({
        start, end, width,
        bounds: {
          minX: Math.min(start.x, end.x) - padding,
          maxX: Math.max(start.x, end.x) + padding,
          minZ: Math.min(start.z, end.z) - padding,
          maxZ: Math.max(start.z, end.z) + padding
        }
      });
    }
  });
  return output;
}

function curbCutAt(drivewayIndex, x, z, sidewalkWidth, sectionLength = 0) {
  return (drivewayIndex.get(cellKey(x, z)) || []).some((driveway) =>
    pointSegmentDistance(x, z, driveway.start, driveway.end).distance <=
    driveway.width * 0.5 + sidewalkWidth * 0.45 + Math.max(0, sectionLength) * 0.5);
}

function makeSidewalkQuad(options, road, segmentIndex, start, end, side, profile, startT, endT, curbCut) {
  const dx = end.x - start.x; const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  if (!(length > 0.25)) return null;
  const startInner = roadWidthAtSegment(road, segmentIndex, startT) * 0.5 + profile.gutterWidth + profile.vergeWidth;
  const endInner = roadWidthAtSegment(road, segmentIndex, endT) * 0.5 + profile.gutterWidth + profile.vergeWidth;
  const startOuter = startInner + profile.sidewalkWidth; const endOuter = endInner + profile.sidewalkWidth;
  const startInnerOffset = offsetVectorAt(road, segmentIndex, startT, side, startInner);
  const startOuterOffset = offsetVectorAt(road, segmentIndex, startT, side, startOuter);
  const endInnerOffset = offsetVectorAt(road, segmentIndex, endT, side, endInner);
  const endOuterOffset = offsetVectorAt(road, segmentIndex, endT, side, endOuter);
  const coordinates = [
    { x: start.x + startInnerOffset.x, z: start.z + startInnerOffset.z },
    { x: start.x + startOuterOffset.x, z: start.z + startOuterOffset.z },
    { x: end.x + endOuterOffset.x, z: end.z + endOuterOffset.z },
    { x: end.x + endInnerOffset.x, z: end.z + endInnerOffset.z }
  ];
  const heights = coordinates.map((point) => heightAt(options, road, point.x, point.z, profile.curbHeight, curbCut));
  const corners = coordinates.map((point, index) => ({ ...point, y: heights[index].top }));
  const centerStart = { x: (corners[0].x + corners[1].x) * 0.5, y: (corners[0].y + corners[1].y) * 0.5, z: (corners[0].z + corners[1].z) * 0.5 };
  const centerEnd = { x: (corners[2].x + corners[3].x) * 0.5, y: (corners[2].y + corners[3].y) * 0.5, z: (corners[2].z + corners[3].z) * 0.5 };
  let curbFace = null;
  let curbTop = null;
  if (!curbCut) {
    const curbWidth = 0.16;
    const startCurbInner = roadWidthAtSegment(road, segmentIndex, startT) * 0.5 + profile.gutterWidth;
    const endCurbInner = roadWidthAtSegment(road, segmentIndex, endT) * 0.5 + profile.gutterWidth;
    const startCurbInnerOffset = offsetVectorAt(road, segmentIndex, startT, side, startCurbInner);
    const startCurbOuterOffset = offsetVectorAt(road, segmentIndex, startT, side, startCurbInner + curbWidth);
    const endCurbInnerOffset = offsetVectorAt(road, segmentIndex, endT, side, endCurbInner);
    const endCurbOuterOffset = offsetVectorAt(road, segmentIndex, endT, side, endCurbInner + curbWidth);
    const curbCoordinates = [
      { x: start.x + startCurbInnerOffset.x, z: start.z + startCurbInnerOffset.z },
      { x: start.x + startCurbOuterOffset.x, z: start.z + startCurbOuterOffset.z },
      { x: end.x + endCurbOuterOffset.x, z: end.z + endCurbOuterOffset.z },
      { x: end.x + endCurbInnerOffset.x, z: end.z + endCurbInnerOffset.z }
    ];
    const curbHeights = curbCoordinates.map((point) => heightAt(options, road, point.x, point.z, profile.curbHeight, false));
    curbTop = curbCoordinates.map((point, index) => ({ ...point, y: curbHeights[index].top + 0.004 }));
    curbFace = [
      { x: curbTop[0].x, y: curbHeights[0].road, z: curbTop[0].z },
      { x: curbTop[3].x, y: curbHeights[3].road, z: curbTop[3].z },
      curbTop[3], curbTop[0]
    ];
  }
  return { corners, curbFace, curbTop, centerStart, centerEnd, length };
}

function entranceConnectors(model, entrances, options, roadSegmentIndex, maxCount) {
  const output = [];
  const sidewalks = model.filter((surface) => surface.kind === 'sidewalk');
  for (const entrance of entrances) {
    if (output.length >= maxCount) break;
    const ex = finite(entrance?.approachX, NaN); const ez = finite(entrance?.approachZ, NaN);
    if (!Number.isFinite(ex) || !Number.isFinite(ez)) continue;
    let nearest = null;
    sidewalks.forEach((surface) => {
      const projection = pointSegmentDistance(ex, ez, surface.centerStart, surface.centerEnd);
      if (!nearest || projection.distance < nearest.distance) nearest = { ...projection, surface };
    });
    if (!nearest || nearest.distance < 0.75 || nearest.distance > 18) continue;
    const start = { x: ex, z: ez }; const end = { x: nearest.x, z: nearest.z };
    const dx = end.x - start.x; const dz = end.z - start.z; const length = Math.hypot(dx, dz);
    const normalX = -dz / length; const normalZ = dx / length;
    const width = entrance.commercial === true ? 2.4 : 1.35;
    const midpoint = { x: (start.x + end.x) * 0.5, z: (start.z + end.z) * 0.5 };
    const crossesRoad = (roadSegmentIndex.get(cellKey(midpoint.x, midpoint.z)) || []).some((segment) =>
      pointSegmentDistance(midpoint.x, midpoint.z, segment.start, segment.end).distance <= segment.width * 0.5
    );
    if (crossesRoad) continue;
    const startY = finite(options.sampleTerrainY?.(start.x, start.z), nearest.surface.centerStart.y - 0.08) + 0.04;
    const endY = nearest.surface.centerStart.y +
      (nearest.surface.centerEnd.y - nearest.surface.centerStart.y) * nearest.t;
    output.push(Object.freeze({
      kind: 'frontage', provenance: entrance.provenance === 'mapped' ? 'mapped_entrance_connector' : 'inferred_entrance_connector',
      context: entrance.commercial === true ? 'commercial_frontage' : 'building_approach', width, length,
      corners: Object.freeze([
        Object.freeze({ x: start.x + normalX * width * 0.5, y: startY, z: start.z + normalZ * width * 0.5 }),
        Object.freeze({ x: start.x - normalX * width * 0.5, y: startY, z: start.z - normalZ * width * 0.5 }),
        Object.freeze({ x: end.x - normalX * width * 0.5, y: endY, z: end.z - normalZ * width * 0.5 }),
        Object.freeze({ x: end.x + normalX * width * 0.5, y: endY, z: end.z + normalZ * width * 0.5 })
      ])
    }));
  }
  return output;
}

function buildStreetscapeModel(options = {}) {
  const roads = Array.isArray(options.roads) ? options.roads : [];
  const tier = String(options.tier || 'balanced').toLowerCase();
  const budget = TIER_BUDGETS[tier] || TIER_BUDGETS.balanced;
  const footprints = (Array.isArray(options.buildings) ? options.buildings : []).map((building) => {
    const ring = footprintForBuilding(building);
    if (!ring || /bridge_guardrail|roof|canopy/i.test(String(building.buildingType || ''))) return null;
    const bounds = boundsForPoints(ring);
    return bounds ? { ring, bounds, x: (bounds.minX + bounds.maxX) * 0.5, z: (bounds.minZ + bounds.maxZ) * 0.5 } : null;
  }).filter(Boolean);
  const buildingIndex = spatialIndex(footprints);
  const footprintAreaIndex = areaSpatialIndex(footprints);
  const allLanduses = (Array.isArray(options.landuses) ? options.landuses : []).map((landuse) => {
    const ring = Array.isArray(landuse?.pts) ? landuse.pts : null;
    const bounds = landuse?.bounds || boundsForPoints(ring || []);
    return ring && bounds ? { ring, bounds, type: String(landuse.type || '').toLowerCase() } : null;
  }).filter(Boolean);
  const parking = allLanduses.filter((landuse) => /parking|paved/.test(landuse.type));
  const landuseIndex = areaSpatialIndex(allLanduses);
  const parkingIndex = areaSpatialIndex(parking);
  const vegetation = (Array.isArray(options.vegetation) ? options.vegetation : []).filter((entry) => Number.isFinite(Number(entry?.x)) && Number.isFinite(Number(entry?.z)));
  const intersections = Array.isArray(options.intersections) ? options.intersections : [];
  const driveways = collectDrivewaySegments(roads);
  const drivewayIndex = areaSpatialIndex(driveways);
  const roadSegmentIndex = areaSpatialIndex(collectRoadSegments(roads));
  const surfaces = [];
  const diagnostics = {
    generatorVersion: STREETSCAPE_GENERATOR_VERSION,
    tier, roadsConsidered: 0, eligibleRoads: 0, mappedRoads: 0, inferredRoads: 0,
    sidewalkSections: 0, curbSections: 0, curbCuts: 0, frontageConnectors: 0,
    skippedIntersections: 0, skippedBuildings: 0, skippedParking: 0, skippedVegetation: 0,
    excludedStructures: 0, excludedRuralOrUnsupported: 0,
    contexts: { downtown: 0, urban: 0, suburban: 0, industrial: 0 }
  };

  const orderedRoads = roads.map((road, sourceIndex) => ({
    road,
    sourceIndex,
    distance: (road?.pts || []).reduce((minimum, point) =>
      Math.min(minimum, Math.hypot(finite(point?.x, Infinity), finite(point?.z, Infinity))), Infinity)
  })).sort((left, right) =>
    left.distance - right.distance || left.sourceIndex - right.sourceIndex
  );

  for (const { road } of orderedRoads) {
    if (surfaces.length >= budget.sections) break;
    diagnostics.roadsConsidered += 1;
    const context = roadContext(road, buildingIndex, landuseIndex);
    const profile = resolveRoadStreetSection(road, context);
    if (!profile.eligible) {
      if (profile.reason === 'not_ordinary_at_grade') diagnostics.excludedStructures += 1;
      else diagnostics.excludedRuralOrUnsupported += 1;
      continue;
    }
    diagnostics.eligibleRoads += 1;
    diagnostics[profile.provenance === 'mapped_sidewalk_tag' ? 'mappedRoads' : 'inferredRoads'] += 1;
    diagnostics.contexts[profile.context] += 1;
    for (let segmentIndex = 0; segmentIndex < (road.pts?.length || 0) - 1 && surfaces.length < budget.sections; segmentIndex += 1) {
      const sourceStart = road.pts[segmentIndex]; const sourceEnd = road.pts[segmentIndex + 1];
      const segmentLength = Math.hypot(finite(sourceEnd.x) - finite(sourceStart.x), finite(sourceEnd.z) - finite(sourceStart.z));
      const steps = Math.max(1, Math.ceil(segmentLength / SUBDIVISION_METERS));
      for (let step = 0; step < steps && surfaces.length < budget.sections; step += 1) {
        const startT = step / steps; const endT = (step + 1) / steps;
        const start = pointAlong(sourceStart, sourceEnd, startT); const end = pointAlong(sourceStart, sourceEnd, endT);
        const midpoint = { x: (start.x + end.x) * 0.5, z: (start.z + end.z) * 0.5 };
        if (Math.hypot(midpoint.x, midpoint.z) > budget.radius) continue;
        if (nearestIntersection(intersections, midpoint.x, midpoint.z, profile.sidewalkWidth)) {
          diagnostics.skippedIntersections += profile.sides.length;
          continue;
        }
        for (const side of profile.sides) {
          if (surfaces.length >= budget.sections) break;
          const curbCut = curbCutAt(
            drivewayIndex,
            midpoint.x,
            midpoint.z,
            profile.sidewalkWidth,
            Math.hypot(end.x - start.x, end.z - start.z)
          );
          const geometry = makeSidewalkQuad(options, road, segmentIndex, start, end, side, profile, startT, endT, curbCut);
          if (!geometry) continue;
          const blocked = quadBlocked(geometry.corners, footprintAreaIndex, parkingIndex, vegetation);
          if (blocked) {
            const diagnosticKey = {
              building: 'skippedBuildings',
              parking: 'skippedParking',
              vegetation: 'skippedVegetation'
            }[blocked];
            diagnostics[diagnosticKey] += 1;
            continue;
          }
          const surface = Object.freeze({
            kind: 'sidewalk', roadId: String(road.sourceFeatureId || road.id || ''), roadClass: roadClass(road),
            side, provenance: profile.provenance, context: profile.context,
            width: profile.sidewalkWidth, vergeWidth: profile.vergeWidth, curbHeight: profile.curbHeight,
            curbCut, corners: Object.freeze(geometry.corners.map(Object.freeze)),
            curbTop: geometry.curbTop ? Object.freeze(geometry.curbTop.map(Object.freeze)) : null,
            curbFace: geometry.curbFace ? Object.freeze(geometry.curbFace.map(Object.freeze)) : null,
            centerStart: Object.freeze(geometry.centerStart), centerEnd: Object.freeze(geometry.centerEnd), length: geometry.length
          });
          surfaces.push(surface);
          diagnostics.sidewalkSections += 1;
          if (curbCut) diagnostics.curbCuts += 1;
          else diagnostics.curbSections += 1;
        }
      }
    }
  }

  const connectors = entranceConnectors(
    surfaces,
    Array.isArray(options.entrances) ? options.entrances : [],
    options,
    roadSegmentIndex,
    budget.frontage
  );
  surfaces.push(...connectors);
  diagnostics.frontageConnectors = connectors.length;
  diagnostics.surfaceCount = surfaces.length;
  diagnostics.vertices = surfaces.reduce((sum, surface) => sum + 4 + (surface.curbTop ? 4 : 0) + (surface.curbFace ? 4 : 0), 0);
  diagnostics.triangles = surfaces.reduce((sum, surface) => sum + 2 + (surface.curbTop ? 2 : 0) + (surface.curbFace ? 2 : 0), 0);
  diagnostics.maxSidewalkWidth = surfaces.reduce((max, surface) => Math.max(max, finite(surface.width)), 0);
  diagnostics.maxCurbHeight = surfaces.reduce((max, surface) => Math.max(max, finite(surface.curbHeight)), 0);
  return Object.freeze({
    type: 'StreetscapeModel', generatorVersion: STREETSCAPE_GENERATOR_VERSION,
    surfaces: Object.freeze(surfaces), diagnostics: Object.freeze({ ...diagnostics, contexts: Object.freeze({ ...diagnostics.contexts }) })
  });
}

function streetscapeContainsPoint(model, x, z) {
  return model?.surfaces?.some((surface) => quadContains(surface.corners, Number(x), Number(z))) === true;
}

export {
  STREETSCAPE_GENERATOR_VERSION,
  TIER_BUDGETS,
  atGradeStreet,
  buildStreetscapeModel,
  mappedSidewalkSides,
  pointInPolygon,
  resolveRoadStreetSection,
  roadClass,
  streetscapeContainsPoint
};
