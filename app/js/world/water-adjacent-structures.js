import { pointInWaterBody } from './water-surface-registry.js?v=3';

const VESSEL_BUILDING_TYPES = new Set(['ship', 'houseboat']);
const OVERWATER_BUILDING_TYPES = new Set(['boathouse', 'bridge']);
const OVERWATER_MAN_MADE_TYPES = new Set(['pier', 'quay', 'breakwater', 'groyne']);
const DEFAULT_WATER_INDEX_CELL_SIZE = 256;
const NEARBY_WATER_DISTANCE_METERS = 45;

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

const KNOWN_MAPPED_VESSEL_IDENTITIES = Object.freeze({
  'uss constellation': Object.freeze({
    typeId: 'sloop-of-war',
    typeLabel: 'Sloop-of-war museum ship'
  })
});

const MAPPED_VESSEL_TYPE_LABELS = Object.freeze({
  cargo: 'Cargo ship',
  container: 'Container ship',
  ferry: 'Passenger ferry',
  fishing: 'Fishing vessel',
  houseboat: 'Houseboat',
  lightship: 'Lightship',
  military: 'Naval vessel',
  passenger: 'Passenger ship',
  research: 'Research vessel',
  sail: 'Sailing ship',
  sailing: 'Sailing ship',
  submarine: 'Submarine',
  tug: 'Tugboat'
});

function resolveMappedVesselIdentity(tags = {}) {
  const name = String(tags.name || tags['name:en'] || '').trim();
  const known = KNOWN_MAPPED_VESSEL_IDENTITIES[normalized(name)];
  const rawType = normalized(tags['ship:type'] || tags.ship || tags.vessel || tags.building);
  const historic = normalized(tags.historic) === 'ship';
  const typeId = known?.typeId || (rawType && rawType !== 'ship' ? rawType : historic ? 'historic-ship' : 'ship');
  const typeLabel = known?.typeLabel || MAPPED_VESSEL_TYPE_LABELS[typeId] || (historic ? 'Historic museum ship' : 'Mapped vessel');
  return Object.freeze({
    name,
    typeId,
    typeLabel,
    label: name ? `${name} · ${typeLabel}` : typeLabel
  });
}

function classifyMappedWaterStructure(tags = {}) {
  const building = normalized(tags.building || tags['building:part']);
  const historic = normalized(tags.historic);
  const manMade = normalized(tags.man_made);
  const location = normalized(tags.location);
  const vessel =
    VESSEL_BUILDING_TYPES.has(building) ||
    historic === 'ship' ||
    normalized(tags['ship:type']) !== '' ||
    normalized(tags['seamark:type']) === 'vessel';
  const explicitOverwaterStructure =
    OVERWATER_BUILDING_TYPES.has(building) ||
    OVERWATER_MAN_MADE_TYPES.has(manMade) ||
    location === 'overwater' ||
    location === 'over_water' ||
    (normalized(tags.bridge) !== '' && normalized(tags.bridge) !== 'no');
  return {
    vessel,
    explicitOverwaterStructure,
    kind: vessel ? 'vessel' : explicitOverwaterStructure ? 'overwater_structure' : 'building'
  };
}

function createWaterAreaSpatialIndex(waterAreas = [], options = {}) {
  const areas = Array.isArray(waterAreas) ? waterAreas : [];
  const cellSize = Math.max(32, Number(options.cellSize) || DEFAULT_WATER_INDEX_CELL_SIZE);
  const nearbyDistance = Math.max(0, Number(options.nearbyDistance) || NEARBY_WATER_DISTANCE_METERS);
  const cells = new Map();
  const unboundedAreaIndices = [];

  const addToCell = (cellX, cellZ, areaIndex) => {
    const key = `${cellX},${cellZ}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(areaIndex);
    else cells.set(key, [areaIndex]);
  };

  areas.forEach((area, areaIndex) => {
    const bounds = area?.bounds;
    if (
      !bounds ||
      !Number.isFinite(Number(bounds.minX)) ||
      !Number.isFinite(Number(bounds.maxX)) ||
      !Number.isFinite(Number(bounds.minZ)) ||
      !Number.isFinite(Number(bounds.maxZ))
    ) {
      unboundedAreaIndices.push(areaIndex);
      return;
    }
    const minCellX = Math.floor((Number(bounds.minX) - nearbyDistance) / cellSize);
    const maxCellX = Math.floor((Number(bounds.maxX) + nearbyDistance) / cellSize);
    const minCellZ = Math.floor((Number(bounds.minZ) - nearbyDistance) / cellSize);
    const maxCellZ = Math.floor((Number(bounds.maxZ) + nearbyDistance) / cellSize);
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        addToCell(cellX, cellZ, areaIndex);
      }
    }
  });

  const diagnostics = {
    areaCount: areas.length,
    boundedAreaCount: areas.length - unboundedAreaIndices.length,
    unboundedAreaCount: unboundedAreaIndices.length,
    cellCount: cells.size,
    queryCount: 0,
    candidateCount: 0
  };

  return Object.freeze({
    candidates(x, z) {
      diagnostics.queryCount += 1;
      const bucket = cells.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`) || [];
      const candidateIndices = unboundedAreaIndices.length > 0
        ? [...new Set([...bucket, ...unboundedAreaIndices])].sort((a, b) => a - b)
        : bucket;
      diagnostics.candidateCount += candidateIndices.length;
      return candidateIndices.map((areaIndex) => areas[areaIndex]);
    },
    snapshot() {
      return Object.freeze({
        ...diagnostics,
        averageCandidatesPerQuery: diagnostics.queryCount > 0
          ? Number((diagnostics.candidateCount / diagnostics.queryCount).toFixed(2))
          : 0,
        cellSize,
        nearbyDistance
      });
    }
  });
}

function footprintWaterCoverage(points = [], waterAreas = [], options = {}) {
  if (!Array.isArray(points) || points.length < 3 || !Array.isArray(waterAreas) || waterAreas.length === 0) {
    return { total: 0, inside: 0, ratio: 0, centroidInside: false, primaryWater: null };
  }
  let sumX = 0;
  let sumZ = 0;
  const samples = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    sumX += point.x;
    sumZ += point.z;
    samples.push(
      point,
      { x: (point.x + next.x) * 0.5, z: (point.z + next.z) * 0.5 },
      { x: point.x + (next.x - point.x) * 0.25, z: point.z + (next.z - point.z) * 0.25 },
      { x: point.x + (next.x - point.x) * 0.75, z: point.z + (next.z - point.z) * 0.75 }
    );
  }
  const centroid = { x: sumX / points.length, z: sumZ / points.length };
  samples.push(centroid);
  const hitCounts = new Map();
  let inside = 0;
  let centroidWater = null;
  const waterAreaIndex = options?.waterAreaIndex;
  const candidatesAt = typeof waterAreaIndex?.candidates === 'function'
    ? (x, z) => waterAreaIndex.candidates(x, z)
    : () => waterAreas;
  for (const sample of samples) {
    const water = candidatesAt(sample.x, sample.z)
      .find((area) => pointInWaterBody(area, sample.x, sample.z)) || null;
    if (!water) continue;
    inside += 1;
    hitCounts.set(water, (hitCounts.get(water) || 0) + 1);
    if (sample === samples[samples.length - 1]) centroidWater = water;
  }
  let primaryWater = centroidWater;
  let primaryHits = primaryWater ? hitCounts.get(primaryWater) || 0 : 0;
  hitCounts.forEach((count, water) => {
    if (count > primaryHits) {
      primaryHits = count;
      primaryWater = water;
    }
  });
  if (!primaryWater) {
    let nearestDistance = Infinity;
    for (const water of candidatesAt(centroid.x, centroid.z)) {
      if (!water?.bounds || !Number.isFinite(Number(water.surfaceY))) continue;
      const dx = Math.max(water.bounds.minX - centroid.x, 0, centroid.x - water.bounds.maxX);
      const dz = Math.max(water.bounds.minZ - centroid.z, 0, centroid.z - water.bounds.maxZ);
      const distance = Math.hypot(dx, dz);
      if (distance <= 45 && distance < nearestDistance) {
        nearestDistance = distance;
        primaryWater = water;
      }
    }
  }
  return {
    total: samples.length,
    inside,
    ratio: inside / samples.length,
    centroidInside: !!centroidWater,
    primaryWater
  };
}

function classifyBuildingWaterRelationship(tags = {}, points = [], waterAreas = [], options = {}) {
  const mapped = classifyMappedWaterStructure(tags);
  const coverage = footprintWaterCoverage(points, waterAreas, options);
  if (mapped.vessel) {
    return { ...mapped, coverage, action: 'render_vessel' };
  }
  if (mapped.explicitOverwaterStructure) {
    return { ...mapped, coverage, action: 'render_structure' };
  }
  const substantiallyInWater = coverage.centroidInside && coverage.ratio >= 0.45;
  return {
    ...mapped,
    coverage,
    action: substantiallyInWater ? 'suppress_water_overlap' : 'render_building'
  };
}

function mappedVesselVerticalProfile(waterSurfaceY, requestedHullHeight = 2.2) {
  const surfaceY = Number(waterSurfaceY);
  if (!Number.isFinite(surfaceY)) return null;
  const hullHeight = Math.max(1.6, Math.min(3.2, Number(requestedHullHeight) || 2.2));
  const hullBottomY = surfaceY - 0.42;
  const hullTopY = hullBottomY + hullHeight;
  return {
    hullHeight,
    hullBottomY,
    hullTopY,
    waterlineClearance: hullTopY - surfaceY
  };
}

function createMappedVesselMesh(points, waterSurfaceY, tags = {}, options = {}) {
  if (!Array.isArray(points) || points.length < 3 || !Number.isFinite(waterSurfaceY)) return null;
  const makeShape = (footprint) => {
    const shape = new THREE.Shape();
    footprint.forEach((point, index) => {
      if (index === 0) shape.moveTo(point.x, -point.z);
      else shape.lineTo(point.x, -point.z);
    });
    shape.closePath();
    return shape;
  };
  let centerX = 0;
  let centerZ = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  points.forEach((point) => {
    centerX += point.x;
    centerZ += point.z;
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  });
  centerX /= points.length;
  centerZ /= points.length;
  const verticalProfile = mappedVesselVerticalProfile(waterSurfaceY, options.hullHeight);
  const identity = resolveMappedVesselIdentity(tags);
  const { hullHeight, hullBottomY, hullTopY, waterlineClearance } = verticalProfile;
  const hullGeometry = new THREE.ExtrudeGeometry(makeShape(points), { depth: hullHeight, bevelEnabled: false });
  hullGeometry.rotateX(-Math.PI / 2);
  const historic = normalized(tags.historic) === 'ship';
  const hullMaterial = new THREE.MeshStandardMaterial({
    color: historic ? 0x29323a : 0x3e5867,
    roughness: 0.72,
    metalness: 0.12
  });
  const vessel = new THREE.Group();
  vessel.name = identity.label;
  const hull = new THREE.Mesh(hullGeometry, hullMaterial);
  // Keep only the lower portion submerged. The old half-height placement put
  // most of a low ship outline behind the opaque water sheet.
  hull.position.y = hullBottomY;
  hull.castShadow = true;
  hull.receiveShadow = true;
  vessel.add(hull);

  const deckFootprint = points.map((point) => ({
    x: centerX + (point.x - centerX) * 0.84,
    z: centerZ + (point.z - centerZ) * 0.84
  }));
  const deckGeometry = new THREE.ExtrudeGeometry(makeShape(deckFootprint), { depth: 0.28, bevelEnabled: false });
  deckGeometry.rotateX(-Math.PI / 2);
  const deck = new THREE.Mesh(
    deckGeometry,
    new THREE.MeshStandardMaterial({ color: historic ? 0x9b8768 : 0xb8bec0, roughness: 0.78 })
  );
  deck.position.y = waterSurfaceY + hullHeight - 0.48;
  deck.castShadow = true;
  vessel.add(deck);

  const spanX = Math.max(2, maxX - minX);
  const spanZ = Math.max(2, maxZ - minZ);
  const longAxisX = spanX >= spanZ;
  const majorSpan = Math.max(spanX, spanZ);
  const mastCount = historic && majorSpan >= 18 ? 3 : majorSpan >= 12 ? 1 : 0;
  for (let index = 0; index < mastCount; index += 1) {
    const along = mastCount === 1 ? 0 : (index / (mastCount - 1) - 0.5) * majorSpan * 0.42;
    const mastHeight = Math.max(4, Math.min(15, majorSpan * (historic ? 0.22 : 0.12)));
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.2, mastHeight, 8),
      new THREE.MeshStandardMaterial({ color: historic ? 0x6f5538 : 0xd2d6d8, roughness: 0.7 })
    );
    mast.position.set(
      centerX + (longAxisX ? along : 0),
      waterSurfaceY + hullHeight - 0.28 + mastHeight * 0.5,
      centerZ + (longAxisX ? 0 : along)
    );
    mast.castShadow = true;
    vessel.add(mast);
  }

  const cabinWidth = Math.max(1.4, Math.min(spanX * 0.38, 10));
  const cabinDepth = Math.max(1.4, Math.min(spanZ * 0.38, 8));
  const cabinHeight = historic ? 1.2 : Math.max(1.4, Math.min(3.2, Math.min(spanX, spanZ) * 0.35));
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(cabinWidth, cabinHeight, cabinDepth),
    new THREE.MeshStandardMaterial({ color: historic ? 0xd7d1c4 : 0xe1e5e5, roughness: 0.68 })
  );
  cabin.position.set(centerX, waterSurfaceY + hullHeight - 0.2 + cabinHeight * 0.5, centerZ);
  cabin.castShadow = true;
  vessel.add(cabin);

  vessel.userData.isMappedVessel = true;
  vessel.userData.vesselName = identity.name;
  vessel.userData.vesselType = identity.typeId;
  vessel.userData.vesselTypeLabel = identity.typeLabel;
  vessel.userData.vesselLabel = identity.label;
  vessel.userData.mappedIdentity = identity;
  vessel.userData.mappedProvider = String(tags._provider || 'OpenStreetMap');
  vessel.userData.mappedLicense = String(tags._license || 'ODbL-1.0');
  vessel.userData.mappedSourceFeatureId = String(tags._sourceFeatureId || '');
  vessel.userData.mappedReviewedAt = String(tags._reviewedAt || '');
  vessel.userData.lodTier = 'vessel';
  vessel.userData.lodCenter = { x: centerX, z: centerZ };
  vessel.userData.waterSurfaceY = waterSurfaceY;
  vessel.userData.hullBottomY = hullBottomY;
  vessel.userData.hullTopY = hullTopY;
  vessel.userData.waterlineClearance = waterlineClearance;
  vessel.traverse((object) => {
    object.userData ||= {};
    object.userData.isMappedVesselPart = true;
  });
  return vessel;
}

export {
  classifyBuildingWaterRelationship,
  classifyMappedWaterStructure,
  createWaterAreaSpatialIndex,
  createMappedVesselMesh,
  footprintWaterCoverage,
  mappedVesselVerticalProfile,
  resolveMappedVesselIdentity
};
