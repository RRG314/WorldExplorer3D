import { ctx as appCtx } from "../shared-context.js?v=55";
import { buildingFootprintPoints } from "../building-entry.js?v=5";
import {
  INTERIOR_FLOOR_OFFSET,
  INTERIOR_LEVEL_HEIGHT,
  INTERIOR_WALL_HEIGHT,
  INTERIOR_WALL_THICKNESS
} from "./constants.js?v=1";
import {
  addFlatSurfaceMesh,
  addWallMesh,
  chooseInteriorSpawnPoint,
  createWallCollider,
  estimateInteriorFloorBaseY,
  finiteNumber,
  footprintBounds,
  makeRibbonGeometry,
  pointInPolygonSafe,
  polygonCentroid,
  ringAreaAbs
} from "./core.js?v=3";
import {
  constrainPointToFootprint,
  findInteriorAnchor,
  prepareInteriorFeaturePlan
} from "./planner.js?v=5";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pointInsideCollider(x, z, collider) {
  if (!collider || collider.collisionDisabled) return false;
  if (x < collider.minX || x > collider.maxX || z < collider.minZ || z > collider.maxZ) return false;
  return Array.isArray(collider.pts) && collider.pts.length >= 3
    ? pointInPolygonSafe(x, z, collider.pts)
    : true;
}

function interiorSpawnIsClear(point, footprint, colliders) {
  if (!pointInPolygonSafe(point.x, point.z, footprint)) return false;
  const radius = 0.34;
  const samples = [
    [0, 0],
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius]
  ];
  return !samples.some(([dx, dz]) =>
    colliders.some((collider) => pointInsideCollider(point.x + dx, point.z + dz, collider))
  );
}

function chooseClearInteriorSpawn(desired, center, footprint, colliders) {
  const candidates = [];
  const push = (x, z) => candidates.push({ x, z });
  const dx = center.x - desired.x;
  const dz = center.z - desired.z;

  for (let step = 0; step <= 16; step += 1) {
    const t = step / 16;
    push(desired.x + dx * t, desired.z + dz * t);
  }
  [1.2, 2.4, 3.8, 5.4].forEach((radius) => {
    for (let index = 0; index < 16; index += 1) {
      const angle = index / 16 * Math.PI * 2;
      push(center.x + Math.cos(angle) * radius, center.z + Math.sin(angle) * radius);
    }
  });

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!interiorSpawnIsClear(candidate, footprint, colliders)) continue;
    const towardCenterX = center.x - candidate.x;
    const towardCenterZ = center.z - candidate.z;
    const length = Math.hypot(towardCenterX, towardCenterZ) || 1;
    const forward = {
      x: candidate.x + towardCenterX / length * 0.8,
      z: candidate.z + towardCenterZ / length * 0.8
    };
    if (interiorSpawnIsClear(forward, footprint, colliders)) return candidate;
  }
  return center;
}

function createColumnCollider(x, z, radius, baseY, height) {
  const pts = [
    { x: x - radius, z: z - radius },
    { x: x + radius, z: z - radius },
    { x: x + radius, z: z + radius },
    { x: x - radius, z: z + radius }
  ];
  return {
    pts,
    minX: x - radius,
    maxX: x + radius,
    minZ: z - radius,
    maxZ: z + radius,
    baseY,
    height,
    centerX: x,
    centerZ: z,
    sourceBuildingId: 'interior-column',
    buildingType: 'interior_column',
    colliderDetail: 'full',
    isInteriorCollider: true
  };
}

export function buildInteriorScene(definition) {
  const support = definition.support;
  const building = support?.building || definition.building;
  const exteriorFootprint = buildingFootprintPoints(building);
  const exteriorArea = ringAreaAbs(exteriorFootprint);
  const baseCentroid = findInteriorAnchor(exteriorFootprint) || {
    x: finiteNumber(building?.centerX, 0),
    z: finiteNumber(building?.centerZ, 0)
  };
  let shellFootprint = exteriorFootprint;
  let centroid = baseCentroid;
  let featurePlan = prepareInteriorFeaturePlan(definition, shellFootprint, centroid);

  const shellClearanceMin = 0;

  let desiredEntry = support?.entryAnchor ? { ...support.entryAnchor } : centroid;
  const walker = appCtx.Walk?.state?.walker || null;
  if (Array.isArray(definition.entrances) && definition.entrances.length > 0) {
    let best = null;
    for (let i = 0; i < definition.entrances.length; i++) {
      const entry = definition.entrances[i];
      const dist = walker ? Math.hypot(entry.x - walker.x, entry.z - walker.z) : 0;
      if (!best || dist < best.dist) best = { entry, dist };
    }
    if (best?.entry) {
      desiredEntry = constrainPointToFootprint(best.entry, shellFootprint, centroid, 0.65) || desiredEntry;
    }
  } else {
    desiredEntry = constrainPointToFootprint(desiredEntry, shellFootprint, centroid, 0.65) || centroid;
  }
  const entryDx = centroid.x - desiredEntry.x;
  const entryDz = centroid.z - desiredEntry.z;
  const entryDistance = Math.hypot(entryDx, entryDz);
  if (entryDistance > 0.5) {
    const bounds = footprintBounds(shellFootprint);
    const entryInset = Math.min(4.8, Math.max(2.4, Math.min(bounds.width, bounds.depth) * 0.18));
    desiredEntry = constrainPointToFootprint({
      x: desiredEntry.x + entryDx / entryDistance * entryInset,
      z: desiredEntry.z + entryDz / entryDistance * entryInset
    }, shellFootprint, centroid, 0.8) || desiredEntry;
  }

  const floorBaseY = estimateInteriorFloorBaseY(
    building,
    shellFootprint,
    centroid,
    Array.isArray(definition.entrances) ? definition.entrances : [],
    desiredEntry
  );
  const floorY = floorBaseY + finiteNumber(definition.selectedLevel, 0) * INTERIOR_LEVEL_HEIGHT;
  const buildingLevels = Math.max(1, Math.round(finiteNumber(building?.levels, 1)));
  const buildingHeight = Math.max(INTERIOR_WALL_HEIGHT, finiteNumber(building?.height, INTERIOR_WALL_HEIGHT));
  const type = String(building?.buildingType || '').toLowerCase();
  const openPlan = /warehouse|industrial|hangar|garage|parking|station/.test(type);
  const mappedStoryHeight = buildingHeight / buildingLevels;
  const wallHeight = clamp(mappedStoryHeight, INTERIOR_WALL_HEIGHT, openPlan ? 5.6 : 4.6);
  const group = new THREE.Group();
  group.name = `interior:${definition.key}`;

  const slabMaterial = new THREE.MeshStandardMaterial({ color: 0x353b42, roughness: 0.86, metalness: 0.02 });
  const roomMaterial = new THREE.MeshStandardMaterial({
    color: 0x71808c,
    emissive: 0x18232b,
    emissiveIntensity: 0.2,
    roughness: 0.82,
    metalness: 0.03
  });
  const corridorMaterial = new THREE.MeshStandardMaterial({ color: 0x4d5b68, roughness: 0.86, metalness: 0.03 });
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0xd9e0e5,
    emissive: 0x293238,
    emissiveIntensity: 0.16,
    roughness: 0.91,
    metalness: 0.01
  });
  const accentWallMaterial = new THREE.MeshStandardMaterial({
    color: 0xaeb9c2,
    emissive: 0x232b30,
    emissiveIntensity: 0.14,
    roughness: 0.9,
    metalness: 0.01
  });
  const ceilingMaterial = new THREE.MeshStandardMaterial({
    color: 0xf0f3f5,
    emissive: 0x3d4244,
    emissiveIntensity: 0.2,
    roughness: 0.94,
    metalness: 0,
    side: THREE.DoubleSide
  });
  const fixtureMaterial = new THREE.MeshStandardMaterial({
    color: 0xf7f8f3,
    emissive: 0xe8e2c8,
    emissiveIntensity: 0.7,
    roughness: 0.55
  });
  const columnMaterial = new THREE.MeshStandardMaterial({ color: 0x87939d, roughness: 0.9, metalness: 0.02 });
  const entryMaterial = new THREE.MeshStandardMaterial({
    color: 0x4cc9b0,
    emissive: 0x21564d,
    emissiveIntensity: 0.42,
    roughness: 0.6,
    metalness: 0.06
  });

  const walkSurfaces = [];
  const dynamicColliders = [];
  const placementTargets = [];

  const ambientLight = new THREE.HemisphereLight(0xf8fafc, 0x1a2330, 1.05);
  ambientLight.position.set(centroid.x, floorY + wallHeight * 0.92, centroid.z);
  group.add(ambientLight);
  group.add(new THREE.AmbientLight(0xffffff, 0.62));

  const lightBounds = footprintBounds(shellFootprint);
  const lightColumns = lightBounds.width > 26 ? 3 : lightBounds.width > 13 ? 2 : 1;
  const lightRows = lightBounds.depth > 22 ? 2 : 1;
  for (let gx = 0; gx < lightColumns; gx++) {
    for (let gz = 0; gz < lightRows; gz++) {
      const x = lightBounds.minX + lightBounds.width * ((gx + 1) / (lightColumns + 1));
      const z = lightBounds.minZ + lightBounds.depth * ((gz + 1) / (lightRows + 1));
      if (!pointInPolygonSafe(x, z, shellFootprint)) continue;
      const ceilingLight = new THREE.PointLight(0xf7f3ea, 0.88, 32, 2);
      ceilingLight.position.set(x, floorY + wallHeight - 0.32, z);
      group.add(ceilingLight);
      const fixture = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.07, 0.5), fixtureMaterial);
      fixture.position.set(x, floorY + wallHeight - 0.06, z);
      group.add(fixture);
    }
  }

  const effectiveMode = featurePlan.mode;
  if (Array.isArray(shellFootprint) && shellFootprint.length >= 3) {
    const slab = addFlatSurfaceMesh(group, shellFootprint, floorY + INTERIOR_FLOOR_OFFSET, slabMaterial, 12);
    const shellCeiling = addFlatSurfaceMesh(group, shellFootprint, floorY + wallHeight, ceilingMaterial, 8);
    if (slab) placementTargets.push(slab);
    if (shellCeiling) shellCeiling.renderOrder = 1;

    walkSurfaces.push({ kind: 'polygon', pts: shellFootprint, y: floorY + INTERIOR_FLOOR_OFFSET });
    for (let i = 0; i < shellFootprint.length; i++) {
      const p1 = shellFootprint[i];
      const p2 = shellFootprint[(i + 1) % shellFootprint.length];
      addWallMesh(group, p1, p2, floorY + INTERIOR_FLOOR_OFFSET, wallMaterial, wallHeight);
      const collider = createWallCollider(p1, p2, floorY + INTERIOR_FLOOR_OFFSET, wallHeight);
      if (collider) dynamicColliders.push(collider);
    }
  }

  for (let i = 0; i < featurePlan.features.length; i++) {
    const feature = featurePlan.features[i];
    if (feature.kind === 'polygon') {
      const material = feature.indoorKind === 'corridor' ? corridorMaterial : roomMaterial;
      const floorMesh = addFlatSurfaceMesh(group, feature.pts, floorY + INTERIOR_FLOOR_OFFSET + 0.015, material, 10);
      if (floorMesh) placementTargets.push(floorMesh);
      walkSurfaces.push({
        kind: 'polygon',
        pts: feature.pts,
        y: floorY + INTERIOR_FLOOR_OFFSET + 0.015,
        label: feature.name || feature.indoorKind
      });
      continue;
    }

    if (feature.kind === 'line') {
      const ribbonGeometry = makeRibbonGeometry(feature.pts, feature.width);
      if (!ribbonGeometry) continue;
      const ribbon = new THREE.Mesh(ribbonGeometry, corridorMaterial);
      ribbon.position.y = floorY + INTERIOR_FLOOR_OFFSET + 0.015;
      group.add(ribbon);
      placementTargets.push(ribbon);
      walkSurfaces.push({
        kind: 'line',
        pts: feature.pts,
        halfWidth: Math.max(0.7, finiteNumber(feature.width, 2)) * 0.5,
        y: floorY + INTERIOR_FLOOR_OFFSET + 0.015,
        label: feature.name || feature.indoorKind
      });
    }
  }

  featurePlan.partitions.forEach((segment) => {
    if (!Array.isArray(segment) || segment.length < 2) return;
    const p1 = segment[0];
    const p2 = segment[1];
    addWallMesh(group, p1, p2, floorY + INTERIOR_FLOOR_OFFSET, accentWallMaterial, wallHeight * 0.88, INTERIOR_WALL_THICKNESS * 0.62);
    const collider = createWallCollider(p1, p2, floorY + INTERIOR_FLOOR_OFFSET, wallHeight * 0.88, INTERIOR_WALL_THICKNESS * 0.62);
    if (collider) dynamicColliders.push(collider);
  });

  if (exteriorArea > 900) {
    const columnRadius = 0.34;
    const columnColumns = Math.min(4, Math.max(2, Math.floor(lightBounds.width / 20)));
    const columnRows = Math.min(3, Math.max(2, Math.floor(lightBounds.depth / 18)));
    for (let gx = 1; gx <= columnColumns; gx++) {
      for (let gz = 1; gz <= columnRows; gz++) {
        const x = lightBounds.minX + lightBounds.width * (gx / (columnColumns + 1));
        const z = lightBounds.minZ + lightBounds.depth * (gz / (columnRows + 1));
        if (!pointInPolygonSafe(x, z, shellFootprint) || Math.hypot(x - desiredEntry.x, z - desiredEntry.z) < 4) continue;
        const column = new THREE.Mesh(new THREE.CylinderGeometry(columnRadius, columnRadius, wallHeight, 12), columnMaterial);
        column.position.set(x, floorY + wallHeight * 0.5, z);
        group.add(column);
        dynamicColliders.push(createColumnCollider(x, z, columnRadius + 0.12, floorY, wallHeight));
      }
    }
  }

  const surfaceEntryPoint = chooseInteriorSpawnPoint(desiredEntry, walkSurfaces, {
    x: centroid.x,
    z: centroid.z,
    y: floorY + INTERIOR_FLOOR_OFFSET
  }) || {
    x: centroid.x,
    z: centroid.z,
    y: floorY + INTERIOR_FLOOR_OFFSET
  };
  const clearEntryPoint = chooseClearInteriorSpawn(surfaceEntryPoint, centroid, shellFootprint, dynamicColliders);
  const resolvedEntryPoint = {
    x: clearEntryPoint.x,
    z: clearEntryPoint.z,
    y: surfaceEntryPoint.y
  };

  const entryMarker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.08, 18),
    entryMaterial
  );
  entryMarker.position.set(resolvedEntryPoint.x, resolvedEntryPoint.y + 0.09, resolvedEntryPoint.z);
  group.add(entryMarker);

  return {
    group,
    mode: effectiveMode,
    dynamicColliders,
    placementTargets,
    walkSurfaces,
    exteriorFootprint,
    usableFootprint: shellFootprint,
    center: { x: centroid.x, z: centroid.z },
    shellClearanceMin,
    requiredShellClearance: 0,
    exteriorArea,
    usableArea: ringAreaAbs(shellFootprint),
    partitionCount: featurePlan.partitions.length,
    layoutKind: featurePlan.layoutKind || (effectiveMode === 'mapped' ? 'mapped' : 'open_plan'),
    wallHeight,
    suppressionRadius: Math.min(180, Math.hypot(lightBounds.width, lightBounds.depth) * 0.5 + 14),
    entryPoint: {
      x: resolvedEntryPoint.x,
      z: resolvedEntryPoint.z,
      y: Number.isFinite(resolvedEntryPoint.y)
        ? resolvedEntryPoint.y + (appCtx.Walk?.CFG?.eyeHeight || 1.7)
        : floorY + (appCtx.Walk?.CFG?.eyeHeight || 1.7) + INTERIOR_FLOOR_OFFSET
    },
    floorY
  };
}
