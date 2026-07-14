import { ctx as appCtx } from "../shared-context.js?v=55";
import { buildingFootprintPoints } from "../building-entry.js?v=2";
import {
  INTERIOR_FLOOR_OFFSET,
  INTERIOR_LEVEL_HEIGHT,
  INTERIOR_SHELL_CLEARANCE,
  INTERIOR_WALL_HEIGHT,
  INTERIOR_WALL_THICKNESS
} from "./constants.js?v=1";
import {
  addBackdropRoomMesh,
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
} from "./core.js?v=1";
import {
  buildContainedRectFootprint,
  buildUsableFootprint,
  constrainPointToFootprint,
  findInteriorAnchor,
  footprintMinimumClearance,
  prepareInteriorFeaturePlan
} from "./planner.js?v=1";

export function buildInteriorScene(definition) {
  const support = definition.support;
  const building = support?.building || definition.building;
  const exteriorFootprint = buildingFootprintPoints(building);
  const baseShellFootprint = buildUsableFootprint(exteriorFootprint);
  const exteriorArea = ringAreaAbs(exteriorFootprint);
  const baseCentroid = findInteriorAnchor(baseShellFootprint) || findInteriorAnchor(exteriorFootprint) || {
    x: finiteNumber(building?.centerX, 0),
    z: finiteNumber(building?.centerZ, 0)
  };
  const generatedRoomFootprint = buildContainedRectFootprint(
    exteriorFootprint,
    baseCentroid,
    INTERIOR_SHELL_CLEARANCE + 0.2
  );
  let shellFootprint = baseShellFootprint;
  let centroid = baseCentroid;
  let featurePlan = prepareInteriorFeaturePlan(definition, shellFootprint, centroid);
  if (featurePlan.mode === 'generated' && generatedRoomFootprint.length >= 3) {
    shellFootprint = generatedRoomFootprint;
    centroid = findInteriorAnchor(shellFootprint) || centroid;
    featurePlan = prepareInteriorFeaturePlan(definition, shellFootprint, centroid);
  }

  const shellArea = ringAreaAbs(shellFootprint);
  const needsOuterEnvelope =
    featurePlan.mode === 'mapped' &&
    Array.isArray(exteriorFootprint) &&
    exteriorFootprint.length >= 3 &&
    shellArea > 0 &&
    shellArea < exteriorArea * 0.97;
  let shellClearanceMin = footprintMinimumClearance(shellFootprint, exteriorFootprint);

  if (
    featurePlan.mode === 'generated' &&
    shellClearanceMin < INTERIOR_WALL_THICKNESS * 0.5 &&
    Array.isArray(exteriorFootprint) &&
    exteriorFootprint.length >= 3
  ) {
    const emergencyShell = buildContainedRectFootprint(
      exteriorFootprint,
      centroid,
      INTERIOR_WALL_THICKNESS * 0.5 + 0.08
    );
    if (emergencyShell.length >= 3) {
      shellFootprint = emergencyShell;
      centroid = findInteriorAnchor(shellFootprint) || centroid;
      featurePlan = prepareInteriorFeaturePlan(definition, shellFootprint, centroid);
      shellClearanceMin = footprintMinimumClearance(shellFootprint, exteriorFootprint);
    }
  }

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

  const floorBaseY = estimateInteriorFloorBaseY(
    building,
    shellFootprint,
    centroid,
    Array.isArray(definition.entrances) ? definition.entrances : [],
    desiredEntry
  );
  const floorY = floorBaseY + finiteNumber(definition.selectedLevel, 0) * INTERIOR_LEVEL_HEIGHT;
  const group = new THREE.Group();
  group.name = `interior:${definition.key}`;

  const slabMaterial = new THREE.MeshStandardMaterial({ color: 0x20242b, roughness: 0.92, metalness: 0.02 });
  const roomMaterial = new THREE.MeshStandardMaterial({ color: 0x596674, roughness: 0.84, metalness: 0.04 });
  const envelopeFloorMaterial = new THREE.MeshStandardMaterial({ color: 0x36403a, roughness: 0.96, metalness: 0.01 });
  const corridorMaterial = new THREE.MeshStandardMaterial({ color: 0x434f5d, roughness: 0.88, metalness: 0.03 });
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xc9d2da, roughness: 0.95, metalness: 0.01 });
  const accentWallMaterial = new THREE.MeshStandardMaterial({ color: 0xb8c0c8, roughness: 0.94, metalness: 0.01 });
  const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0xe4e8ec, roughness: 0.97, metalness: 0, side: THREE.DoubleSide });
  const generatedShellMaterial = new THREE.MeshStandardMaterial({ color: 0xcfd6dd, roughness: 0.97, metalness: 0, side: THREE.BackSide });
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

  const ambientLight = new THREE.HemisphereLight(0xf8fafc, 0x1a2330, 0.72);
  ambientLight.position.set(centroid.x, floorY + INTERIOR_WALL_HEIGHT * 0.92, centroid.z);
  group.add(ambientLight);

  const ceilingLight = new THREE.PointLight(0xf7f3ea, 0.82, 36, 2);
  ceilingLight.position.set(centroid.x, floorY + INTERIOR_WALL_HEIGHT - 0.32, centroid.z);
  group.add(ceilingLight);

  if (needsOuterEnvelope) {
    const envelopeFloor = addFlatSurfaceMesh(group, exteriorFootprint, floorY + INTERIOR_FLOOR_OFFSET - 0.012, envelopeFloorMaterial, 10);
    const envelopeCeiling = addFlatSurfaceMesh(group, exteriorFootprint, floorY + INTERIOR_WALL_HEIGHT, ceilingMaterial, 8);
    if (envelopeFloor) envelopeFloor.renderOrder = -1;
    if (envelopeCeiling) envelopeCeiling.renderOrder = 0;

    for (let i = 0; i < exteriorFootprint.length; i++) {
      const p1 = exteriorFootprint[i];
      const p2 = exteriorFootprint[(i + 1) % exteriorFootprint.length];
      addWallMesh(group, p1, p2, floorY + INTERIOR_FLOOR_OFFSET - 0.01, accentWallMaterial);
    }
  }

  const effectiveMode = featurePlan.mode;
  if (Array.isArray(shellFootprint) && shellFootprint.length >= 3) {
    if (effectiveMode === 'generated') {
      addBackdropRoomMesh(group, footprintBounds(shellFootprint), floorY + INTERIOR_FLOOR_OFFSET, generatedShellMaterial);
    }
    const slab = addFlatSurfaceMesh(group, shellFootprint, floorY + INTERIOR_FLOOR_OFFSET, slabMaterial, 12);
    const shellCeiling = addFlatSurfaceMesh(group, shellFootprint, floorY + INTERIOR_WALL_HEIGHT, ceilingMaterial, 8);
    if (slab) placementTargets.push(slab);
    if (shellCeiling) shellCeiling.renderOrder = 1;

    walkSurfaces.push({ kind: 'polygon', pts: shellFootprint, y: floorY + INTERIOR_FLOOR_OFFSET });
    for (let i = 0; i < shellFootprint.length; i++) {
      const p1 = shellFootprint[i];
      const p2 = shellFootprint[(i + 1) % shellFootprint.length];
      addWallMesh(group, p1, p2, floorY + INTERIOR_FLOOR_OFFSET, wallMaterial);
      const collider = createWallCollider(p1, p2, floorY + INTERIOR_FLOOR_OFFSET);
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
    addWallMesh(group, p1, p2, floorY + INTERIOR_FLOOR_OFFSET, accentWallMaterial, INTERIOR_WALL_HEIGHT * 0.86, INTERIOR_WALL_THICKNESS * 0.62);
    const collider = createWallCollider(p1, p2, floorY + INTERIOR_FLOOR_OFFSET, INTERIOR_WALL_HEIGHT * 0.86, INTERIOR_WALL_THICKNESS * 0.62);
    if (collider) dynamicColliders.push(collider);
  });

  const resolvedEntryPoint = chooseInteriorSpawnPoint(desiredEntry, walkSurfaces, {
    x: centroid.x,
    z: centroid.z,
    y: floorY + INTERIOR_FLOOR_OFFSET
  }) || {
    x: centroid.x,
    z: centroid.z,
    y: floorY + INTERIOR_FLOOR_OFFSET
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
    requiredShellClearance: INTERIOR_WALL_THICKNESS * 0.5,
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
