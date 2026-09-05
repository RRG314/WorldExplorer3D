import { ctx as appCtx } from "../shared-context.js?v=55";
import { buildingFootprintPoints } from "../building-entry.js?v=8";
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
  createShapeFromPoints,
  createWallCollider,
  estimateInteriorFloorBaseY,
  finiteNumber,
  footprintBounds,
  makeRibbonGeometry,
  pointInPolygonSafe,
  polygonCentroid,
  ringAreaAbs
} from "./core.js?v=4";
import {
  constrainPointToFootprint,
  findInteriorAnchor,
  prepareInteriorFeaturePlan
} from "./planner.js?v=6";
import {
  deriveInteriorFloorPlan,
  interiorFloorIdentity,
  loadedInteriorLevels,
  nextElevatorLevel
} from "./floor-model.js?v=3";

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

function pointDistanceToSegment(point, start, end) {
  if (!point || !start || !end) return Infinity;
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (!(lengthSquared > 0.001)) return Math.hypot(point.x - start.x, point.z - start.z);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
  return Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t));
}

function overlapsConnectorCore(point, connector, padding = 0) {
  if (!connector || !point) return false;
  return pointDistanceToSegment(point, connector.start, connector.end) <= connector.rampWidth * 0.75 + padding ||
    Math.hypot(point.x - connector.elevator.x, point.z - connector.elevator.z) <= 2 + padding;
}

function segmentOverlapsConnectorCore(segment, connector, padding = 0) {
  if (!connector || !Array.isArray(segment) || segment.length < 2) return false;
  const start = segment[0];
  const end = segment[1];
  const length = Math.hypot(end.x - start.x, end.z - start.z);
  const samples = Math.max(2, Math.ceil(length / 0.45));
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    if (overlapsConnectorCore({
      x: start.x + (end.x - start.x) * t,
      z: start.z + (end.z - start.z) * t
    }, connector, padding)) return true;
  }
  return false;
}

function addFlatSurfaceWithConnectorOpening(group, points, y, material, connector, tessellation = 8) {
  if (!connector) return addFlatSurfaceMesh(group, points, y, material, tessellation);
  const shape = createShapeFromPoints(points);
  const halfWidth = connector.rampWidth * 0.74;
  const extension = 0.72;
  const start = {
    x: connector.start.x - connector.axis.x * extension,
    z: connector.start.z - connector.axis.z * extension
  };
  const end = {
    x: connector.end.x + connector.axis.x * extension,
    z: connector.end.z + connector.axis.z * extension
  };
  const corners = [
    { x: start.x + connector.perpendicular.x * halfWidth, z: start.z + connector.perpendicular.z * halfWidth },
    { x: end.x + connector.perpendicular.x * halfWidth, z: end.z + connector.perpendicular.z * halfWidth },
    { x: end.x - connector.perpendicular.x * halfWidth, z: end.z - connector.perpendicular.z * halfWidth },
    { x: start.x - connector.perpendicular.x * halfWidth, z: start.z - connector.perpendicular.z * halfWidth }
  ];
  const hole = new THREE.Path();
  corners.forEach((point, index) => {
    if (index === 0) hole.moveTo(point.x, -point.z);
    else hole.lineTo(point.x, -point.z);
  });
  hole.closePath();
  shape.holes.push(hole);
  const geometry = new THREE.ShapeGeometry(shape, tessellation);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = y;
  group.add(mesh);
  return mesh;
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

function buildInteriorLevelScene(definition, options = {}) {
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

  const floorBaseY = Number.isFinite(options.floorBaseY)
    ? Number(options.floorBaseY)
    : estimateInteriorFloorBaseY(
      building,
      shellFootprint,
      centroid,
      Array.isArray(definition.entrances) ? definition.entrances : [],
      desiredEntry
    );
  const storyHeight = clamp(finiteNumber(options.storyHeight, INTERIOR_LEVEL_HEIGHT), 2.7, 5.6);
  const floorY = floorBaseY + finiteNumber(definition.selectedLevel, 0) * storyHeight;
  const type = String(building?.buildingType || '').toLowerCase();
  const openPlan = /warehouse|industrial|hangar|garage|parking|station/.test(type);
  // Leave a small structural gap below the next slab/roof. The ceiling and
  // floor now share one story-height authority and cannot cross each other.
  const wallHeight = clamp(storyHeight - 0.12, 2.65, openPlan ? 5.48 : 4.6);
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

  if (options.suppressLights !== true) {
    const ambientLight = new THREE.HemisphereLight(0xf8fafc, 0x1a2330, 1.05);
    ambientLight.position.set(centroid.x, floorY + wallHeight * 0.92, centroid.z);
    group.add(ambientLight);
    group.add(new THREE.AmbientLight(0xffffff, 0.62));
  }

  const lightBounds = footprintBounds(shellFootprint);
  const lightColumns = lightBounds.width > 26 ? 3 : lightBounds.width > 13 ? 2 : 1;
  const lightRows = lightBounds.depth > 22 ? 2 : 1;
  for (let gx = 0; options.suppressLights !== true && gx < lightColumns; gx++) {
    for (let gz = 0; gz < lightRows; gz++) {
      const x = lightBounds.minX + lightBounds.width * ((gx + 1) / (lightColumns + 1));
      const z = lightBounds.minZ + lightBounds.depth * ((gz + 1) / (lightRows + 1));
      if (!pointInPolygonSafe(x, z, shellFootprint)) continue;
      // Keep fixtures out of the connector approach. A point light directly in
      // front of the metal elevator doors creates a blown-out first-person glare
      // and makes the interaction harder to read.
      if (overlapsConnectorCore({ x, z }, options.connectorLayout, 2.2)) continue;
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
    const slab = addFlatSurfaceWithConnectorOpening(
      group,
      shellFootprint,
      floorY + INTERIOR_FLOOR_OFFSET,
      slabMaterial,
      options.connectorLayout,
      12
    );
    const shellCeiling = addFlatSurfaceWithConnectorOpening(
      group,
      shellFootprint,
      floorY + wallHeight,
      ceilingMaterial,
      options.connectorLayout,
      8
    );
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

  const acceptedPartitions = options.suppressPartitions === true ? [] : featurePlan.partitions.filter((segment) =>
    !segmentOverlapsConnectorCore(segment, options.connectorLayout, 0.7));
  acceptedPartitions.forEach((segment) => {
    if (!Array.isArray(segment) || segment.length < 2) return;
    // Multi-floor circulation is reserved before room partitions. This keeps
    // stairs/elevators traversable even when a generated partition plan would
    // otherwise cut across the shared core.
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
        if (overlapsConnectorCore({ x, z }, options.connectorLayout, 0.65)) continue;
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

  if (finiteNumber(definition.selectedLevel, 0) === 0) {
    const entryMarker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.08, 18),
      entryMaterial
    );
    entryMarker.name = 'interior-lobby-entry-marker';
    entryMarker.userData.interactionKind = 'interior_exit';
    entryMarker.position.set(resolvedEntryPoint.x, resolvedEntryPoint.y + 0.09, resolvedEntryPoint.z);
    group.add(entryMarker);
  }

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
    partitionCount: acceptedPartitions.length,
    layoutKind: options.connectorLayout
      ? 'multi_floor_core'
      : featurePlan.layoutKind || (effectiveMode === 'mapped' ? 'mapped' : 'open_plan'),
    wallHeight,
    suppressionRadius: Math.min(180, Math.hypot(lightBounds.width, lightBounds.depth) * 0.5 + 14),
    entryPoint: {
      x: resolvedEntryPoint.x,
      z: resolvedEntryPoint.z,
      y: Number.isFinite(resolvedEntryPoint.y)
        ? resolvedEntryPoint.y + (appCtx.Walk?.CFG?.eyeHeight || 1.7)
        : floorY + (appCtx.Walk?.CFG?.eyeHeight || 1.7) + INTERIOR_FLOOR_OFFSET
    },
    floorBaseY,
    floorY
  };
}

function connectorLayout(footprint, center) {
  const bounds = footprintBounds(footprint);
  const primaryAxes = bounds.width >= bounds.depth
    ? [{ x: 1, z: 0 }, { x: 0, z: 1 }]
    : [{ x: 0, z: 1 }, { x: 1, z: 0 }];
  const minSpan = Math.min(bounds.width, bounds.depth);
  const rampLength = Math.max(5.8, Math.min(7.4, Math.max(bounds.width, bounds.depth) * 0.34));
  const rampWidth = 1.85;
  const offsets = [0, minSpan * 0.14, -minSpan * 0.14, minSpan * 0.26, -minSpan * 0.26];
  for (const axis of primaryAxes) {
    const perpendicular = { x: -axis.z, z: axis.x };
    for (const offset of offsets) {
      const rampCenter = {
        x: center.x + perpendicular.x * offset,
        z: center.z + perpendicular.z * offset
      };
      const start = {
        x: rampCenter.x - axis.x * rampLength * 0.5,
        z: rampCenter.z - axis.z * rampLength * 0.5
      };
      const end = {
        x: rampCenter.x + axis.x * rampLength * 0.5,
        z: rampCenter.z + axis.z * rampLength * 0.5
      };
      const corners = [start, end].flatMap((point) => [-1, 1].map((side) => ({
        x: point.x + perpendicular.x * rampWidth * 0.58 * side,
        z: point.z + perpendicular.z * rampWidth * 0.58 * side
      })));
      if (!corners.every((point) => pointInPolygonSafe(point.x, point.z, footprint))) continue;
      const elevatorOffsets = [-minSpan * 0.28, minSpan * 0.28, -minSpan * 0.38, minSpan * 0.38];
      for (const elevatorOffset of elevatorOffsets) {
        const elevator = {
          x: center.x + perpendicular.x * elevatorOffset,
          z: center.z + perpendicular.z * elevatorOffset
        };
        const elevatorClearance = [
          elevator,
          { x: elevator.x + axis.x * 3.1, z: elevator.z + axis.z * 3.1 },
          { x: elevator.x + axis.x * 0.55 + perpendicular.x * 1.62, z: elevator.z + axis.z * 0.55 + perpendicular.z * 1.62 },
          { x: elevator.x + axis.x * 0.55 - perpendicular.x * 1.62, z: elevator.z + axis.z * 0.55 - perpendicular.z * 1.62 },
          { x: elevator.x - axis.x * 0.55 + perpendicular.x * 1.62, z: elevator.z - axis.z * 0.55 + perpendicular.z * 1.62 },
          { x: elevator.x - axis.x * 0.55 - perpendicular.x * 1.62, z: elevator.z - axis.z * 0.55 - perpendicular.z * 1.62 }
        ];
        if (!elevatorClearance.every((point) => pointInPolygonSafe(point.x, point.z, footprint))) continue;
        if (Math.hypot(elevator.x - rampCenter.x, elevator.z - rampCenter.z) < 2.8) continue;
        return { axis, perpendicular, start, end, elevator, rampLength, rampWidth };
      }
    }
  }
  return null;
}

export function canPublishInteriorConnector(support) {
  const building = support?.building || support?.destination;
  const footprint = buildingFootprintPoints(building);
  if (!building || footprint.length < 3) return false;
  const floorPlan = deriveInteriorFloorPlan({
    key: support?.key,
    support,
    building
  }, footprintBounds(footprint));
  return floorPlan.connectorEligible &&
    connectorLayout(footprint, polygonCentroid(footprint) || { x: 0, z: 0 }) != null;
}

function addElevatorVisual(group, layout, floorY, level) {
  const cabin = new THREE.Group();
  cabin.name = `interior-elevator:floor:${level}`;
  cabin.userData.interactionKind = 'interior_elevator';
  const yaw = Math.atan2(layout.axis.x, layout.axis.z);
  cabin.position.set(layout.elevator.x, floorY, layout.elevator.z);
  cabin.rotation.y = yaw;
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x102a36,
    emissive: 0x06151c,
    emissiveIntensity: 0.34,
    roughness: 0.4,
    metalness: 0.64
  });
  const doorMaterial = new THREE.MeshStandardMaterial({
    color: 0x304b59,
    emissive: 0x08151b,
    emissiveIntensity: 0.22,
    roughness: 0.52,
    metalness: 0.64
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0x07131b,
    emissive: 0x02090d,
    emissiveIntensity: 0.25,
    roughness: 0.46,
    metalness: 0.5
  });
  const signalMaterial = new THREE.MeshStandardMaterial({
    color: 0xffc857,
    emissive: 0xd57c18,
    emissiveIntensity: 1.4,
    roughness: 0.32
  });
  // Structural metal should participate in scene tone mapping; only the small
  // status signal is intentionally emissive. Disabling tone mapping on the
  // doors turns ordinary ceiling lights into opaque white glare.
  signalMaterial.toneMapped = false;
  // Keep the structural backing behind the visible doors. A positive-Z
  // backing occludes the door panels and trim from the first-person approach.
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.75, 2.85, 0.18), frameMaterial);
  back.position.set(0, 1.43, -0.11);
  cabin.add(back);
  [-0.58, 0.58].forEach((x) => {
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.08, 2.42, 0.09), doorMaterial);
    door.position.set(x, 1.28, 0.11);
    cabin.add(door);
  });
  const centerSeam = new THREE.Mesh(new THREE.BoxGeometry(0.055, 2.4, 0.045), trimMaterial);
  centerSeam.position.set(0, 1.28, 0.045);
  cabin.add(centerSeam);
  [-1.38, 1.38].forEach((x) => {
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.95, 0.34), trimMaterial);
    upright.position.set(x, 1.48, 0.14);
    cabin.add(upright);
  });
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.18, 0.38), trimMaterial);
  canopy.position.set(0, 2.91, 0.14);
  cabin.add(canopy);
  const headerBand = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.12, 0.06), signalMaterial);
  headerBand.position.set(0, 2.72, 0.035);
  cabin.add(headerBand);
  const callPanel = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.46, 0.08), trimMaterial);
  callPanel.position.set(1.62, 1.32, 0.08);
  cabin.add(callPanel);
  const callLight = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), signalMaterial);
  callLight.position.set(1.62, 1.38, 0.025);
  cabin.add(callLight);
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.18, 0.07), trimMaterial);
  plaque.position.set(0, 3.13, 0.06);
  cabin.add(plaque);
  const bars = Math.min(8, level + 1);
  for (let index = 0; index < bars; index += 1) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.085, 0.025), signalMaterial);
    bar.position.set((index - (bars - 1) * 0.5) * 0.06, 3.13, 0.015);
    cabin.add(bar);
  }
  group.add(cabin);
  return cabin;
}

function addStairVisual(group, layout, fromLevel, floorBaseY, storyHeight) {
  const stairGroup = new THREE.Group();
  stairGroup.name = `interior-stairs:${fromLevel}:${fromLevel + 1}`;
  const treadMaterial = new THREE.MeshStandardMaterial({ color: 0x596775, roughness: 0.78, metalness: 0.08 });
  const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0xe7a948, emissive: 0x6d3b09, emissiveIntensity: 0.28, roughness: 0.55 });
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0x1b2832, roughness: 0.38, metalness: 0.68 });
  const stepCount = 14;
  const dx = layout.end.x - layout.start.x;
  const dz = layout.end.z - layout.start.z;
  const yaw = Math.atan2(dx, dz);
  const stepDepth = layout.rampLength / stepCount;
  const baseY = floorBaseY + fromLevel * storyHeight + INTERIOR_FLOOR_OFFSET;
  for (let index = 0; index < stepCount; index += 1) {
    const t = (index + 0.5) / stepCount;
    const height = storyHeight * (index + 1) / stepCount;
    const step = new THREE.Mesh(new THREE.BoxGeometry(layout.rampWidth, height, stepDepth + 0.035), treadMaterial);
    step.position.set(
      layout.start.x + dx * t,
      baseY + height * 0.5,
      layout.start.z + dz * t
    );
    step.rotation.y = yaw;
    stairGroup.add(step);
    if (index % 2 === 0) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(layout.rampWidth + 0.04, 0.035, 0.055), edgeMaterial);
      edge.position.set(
        layout.start.x + dx * ((index + 1) / stepCount),
        baseY + height + 0.025,
        layout.start.z + dz * ((index + 1) / stepCount)
      );
      edge.rotation.y = yaw;
      stairGroup.add(edge);
    }
  }
  [-1, 1].forEach((side) => {
    for (let index = 0; index <= 4; index += 1) {
      const t = index / 4;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.075, 1.02, 0.075), railMaterial);
      post.position.set(
        layout.start.x + dx * t + layout.perpendicular.x * layout.rampWidth * 0.55 * side,
        baseY + storyHeight * t + 0.51,
        layout.start.z + dz * t + layout.perpendicular.z * layout.rampWidth * 0.55 * side
      );
      stairGroup.add(post);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, Math.hypot(dx, dz) + 0.1), railMaterial);
    rail.position.set(
      (layout.start.x + layout.end.x) * 0.5 + layout.perpendicular.x * layout.rampWidth * 0.55 * side,
      baseY + storyHeight * 0.5 + 1,
      (layout.start.z + layout.end.z) * 0.5 + layout.perpendicular.z * layout.rampWidth * 0.55 * side
    );
    rail.rotation.order = 'YXZ';
    rail.rotation.y = yaw;
    rail.rotation.x = -Math.atan2(storyHeight, layout.rampLength);
    stairGroup.add(rail);
  });
  group.add(stairGroup);
  return {
    group: stairGroup,
    surface: {
      kind: 'ramp',
      start: { ...layout.start },
      end: { ...layout.end },
      halfWidth: layout.rampWidth * 0.58,
      yStart: baseY,
      yEnd: baseY + storyHeight,
      floorLevel: fromLevel,
      targetLevel: fromLevel + 1,
      label: `Stairs to Floor ${fromLevel + 2}`
    }
  };
}

function floorDefinition(definition, level) {
  const mappedLevel = Array.isArray(definition.mappedLevels)
    ? definition.mappedLevels.find((entry) =>
      Math.abs(finiteNumber(entry?.level, NaN) - level) < 0.01
    )
    : null;
  const legacyMapped = definition.mode === 'mapped' &&
    Math.abs(finiteNumber(definition.selectedLevel, 0) - level) < 0.01;
  const mapped = mappedLevel != null || legacyMapped;
  return {
    ...definition,
    selectedLevel: level,
    mode: mapped ? definition.mode : 'generated',
    features: mapped
      ? (mappedLevel?.features || definition.features || [])
      : [],
    entrances: mapped
      ? (mappedLevel?.entrances || (level === 0 ? definition.entrances : []) || [])
      : []
  };
}

export function buildInteriorScene(definition, options = {}) {
  const building = definition.support?.building || definition.building;
  const footprint = buildingFootprintPoints(building);
  const bounds = footprintBounds(footprint);
  const floorPlan = deriveInteriorFloorPlan(definition, bounds);
  const requestedActiveLevel = finiteNumber(options.activeLevel, 0);
  const activeLevel = Math.max(0, Math.min(floorPlan.floorCount - 1, Math.round(requestedActiveLevel)));
  const loadedLevels = [...loadedInteriorLevels(floorPlan, activeLevel)];
  const root = new THREE.Group();
  root.name = `interior:${definition.key}:published-floors`;
  root.userData.activeFloorId = interiorFloorIdentity(floorPlan, activeLevel).id;
  const connector = floorPlan.connectorEligible ? connectorLayout(footprint, polygonCentroid(footprint) || { x: 0, z: 0 }) : null;
  const levelStates = loadedLevels.map((level) => {
    const state = buildInteriorLevelScene(floorDefinition(definition, level), {
      suppressLights: level !== activeLevel,
      suppressPartitions: options.curatedHome === true,
      connectorLayout: connector,
      storyHeight: floorPlan.storyHeight,
      floorBaseY: Number.isFinite(options.floorBaseY) ? Number(options.floorBaseY) : undefined
    });
    state.group.name = `interior:${definition.key}:floor:${level}`;
    state.group.userData.floorId = interiorFloorIdentity(floorPlan, level).id;
    state.walkSurfaces.forEach((surface) => { surface.floorLevel = level; });
    state.dynamicColliders.forEach((collider) => { collider.floorLevel = level; });
    root.add(state.group);
    return { level, ...state };
  });
  const activeState = levelStates.find((state) => state.level === activeLevel) || levelStates[0];
  const walkSurfaces = levelStates.flatMap((state) => state.walkSurfaces);
  const dynamicColliders = levelStates.flatMap((state) => state.dynamicColliders);
  const placementTargets = levelStates.flatMap((state) => state.placementTargets);
  const stairs = [];
  if (connector) {
    const sorted = [...loadedLevels].sort((a, b) => a - b);
    for (let index = 0; index < sorted.length - 1; index += 1) {
      if (sorted[index + 1] !== sorted[index] + 1) continue;
      const stair = addStairVisual(root, connector, sorted[index], activeState.floorBaseY, floorPlan.storyHeight);
      stairs.push(stair.surface);
      walkSurfaces.unshift(stair.surface);
    }
    loadedLevels.forEach((level) => {
      addElevatorVisual(root, connector, activeState.floorBaseY + level * floorPlan.storyHeight + INTERIOR_FLOOR_OFFSET, level);
    });
  }
  const lobbyEntryPoint = {
    x: activeState.entryPoint.x,
    z: activeState.entryPoint.z,
    y: activeState.entryPoint.y - activeLevel * floorPlan.storyHeight
  };
  const activeFloor = interiorFloorIdentity(floorPlan, activeLevel);
  const interactions = [];
  if (activeLevel === 0) interactions.push({
    kind: 'exit',
    level: 0,
    x: lobbyEntryPoint.x,
    z: lobbyEntryPoint.z,
    radius: 2.25,
    label: `Exit ${definition.label || 'building'}`
  });
  if (connector) {
    const targetLevel = nextElevatorLevel(floorPlan, activeLevel);
    interactions.push({
      kind: 'elevator',
      level: activeLevel,
      targetLevel,
      x: connector.elevator.x,
      z: connector.elevator.z,
      radius: 2.55,
      label: targetLevel === 0 ? 'Take elevator to Lobby' : `Take elevator to Floor ${targetLevel + 1}`
    });
  }
  return {
    ...activeState,
    group: root,
    walkSurfaces,
    dynamicColliders,
    placementTargets,
    floorPlan,
    floorId: activeFloor.id,
    floorLabel: activeFloor.label,
    activeLevel,
    loadedLevels,
    connector,
    stairs,
    interactions,
    lobbyEntryPoint,
    entryPoint: activeLevel === 0 ? lobbyEntryPoint : activeState.entryPoint
  };
}
