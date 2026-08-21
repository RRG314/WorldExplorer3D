import { ctx as appCtx } from '../shared-context.js?v=55';
import { sampleFeatureSurfaceY } from '../structure-semantics.js?v=61';
import { createBridgeStructuralDetails } from './bridge-landmark-structure.js?v=1';
import { applyPublishedTransportSurfaceControls } from './transport-surface-controls.js?v=2';

const BRIDGE_COLOR = 0xbf4e3b;
const MIN_SUSPENSION_SPAN_METERS = 600;
const BRIDGE_HALF_WIDTH_METERS = 13.5;
const MAIN_CABLE_RADIUS_METERS = 0.46;
const SUSPENDER_RADIUS_METERS = 0.06;
const SUSPENDER_SPACING_METERS = 15.24;

function numberTag(tags, key, fallback = 0) {
  const value = Number.parseFloat(String(tags?.[key] ?? '').replace(',', '.'));
  return Number.isFinite(value) ? value : fallback;
}

function pathPoints(way, nodes) {
  const points = [];
  for (const nodeId of way?.nodes || []) {
    const node = nodes[nodeId];
    if (!node) continue;
    const point = appCtx.geoToWorld(node.lat, node.lon);
    const previous = points[points.length - 1];
    if (!previous || Math.hypot(point.x - previous.x, point.z - previous.z) > 0.05) points.push(point);
  }
  return points;
}

function openFootprint(way, nodes) {
  const points = pathPoints(way, nodes);
  if (points.length > 3) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.hypot(first.x - last.x, first.z - last.z) < 0.12) points.pop();
  }
  return points;
}

function footprintCenter(points) {
  const center = points.reduce((sum, point) => ({ x: sum.x + point.x, z: sum.z + point.z }), { x: 0, z: 0 });
  const scale = 1 / Math.max(1, points.length);
  return { x: center.x * scale, z: center.z * scale };
}

function prismGeometry(points, bottomY, topY) {
  const center = footprintCenter(points);
  const contour = points.map((point) => new THREE.Vector2(point.x - center.x, point.z - center.z));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  if (!faces.length) return null;
  const positions = [];
  for (const face of faces) {
    const a = contour[face[0]];
    const b = contour[face[1]];
    const c = contour[face[2]];
    positions.push(
      a.x, topY, a.y, b.x, topY, b.y, c.x, topY, c.y,
      c.x, bottomY, c.y, b.x, bottomY, b.y, a.x, bottomY, a.y
    );
  }
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % contour.length];
    positions.push(
      a.x, bottomY, a.y, b.x, bottomY, b.y, a.x, topY, a.y,
      b.x, bottomY, b.y, b.x, topY, b.y, a.x, topY, a.y
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return { geometry, center };
}

function polylineMetrics(points) {
  const distances = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    distances.push(total);
  }
  return { distances, total };
}

function pointAtDistance(points, distances, distance) {
  const target = Math.max(0, Math.min(distances[distances.length - 1] || 0, distance));
  let index = 1;
  while (index < distances.length && distances[index] < target) index += 1;
  index = Math.min(points.length - 1, Math.max(1, index));
  const start = points[index - 1];
  const end = points[index];
  const span = distances[index] - distances[index - 1] || 1;
  const t = (target - distances[index - 1]) / span;
  return {
    x: start.x + (end.x - start.x) * t,
    z: start.z + (end.z - start.z) * t,
    dx: end.x - start.x,
    dz: end.z - start.z,
    segmentIndex: index - 1,
    t
  };
}

function projectDistanceToPath(point, points, distances) {
  let bestDistanceSq = Infinity;
  let bestAlong = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSq = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSq));
    const px = start.x + dx * t;
    const pz = start.z + dz * t;
    const distanceSq = (point.x - px) ** 2 + (point.z - pz) ** 2;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestAlong = distances[i] + Math.sqrt(lengthSq) * t;
    }
  }
  return bestAlong;
}

function centerMappedPathOnCompiledSurface(mappedPath, compiledSurfacePath) {
  if (
    !Array.isArray(mappedPath) || mappedPath.length < 2 ||
    !Array.isArray(compiledSurfacePath) || compiledSurfacePath.length < 2
  ) return mappedPath;
  const vectors = [];
  for (const point of compiledSurfacePath) {
    let closest = null;
    for (let index = 0; index < mappedPath.length - 1; index += 1) {
      const start = mappedPath[index];
      const end = mappedPath[index + 1];
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const lengthSquared = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(
        1,
        ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared
      ));
      const x = start.x + dx * t;
      const z = start.z + dz * t;
      const distance = Math.hypot(point.x - x, point.z - z);
      if (!closest || distance < closest.distance) closest = { x, z, distance };
    }
    if (closest && closest.distance <= 20) {
      vectors.push({ x: point.x - closest.x, z: point.z - closest.z });
    }
  }
  if (vectors.length < 2) return mappedPath;
  const offset = vectors.reduce((sum, vector) => ({
    x: sum.x + vector.x,
    z: sum.z + vector.z
  }), { x: 0, z: 0 });
  offset.x /= vectors.length;
  offset.z /= vectors.length;
  return mappedPath.map((point) => ({
    ...point,
    x: point.x + offset.x,
    z: point.z + offset.z
  }));
}

function sampleRoadDeckY(x, z) {
  let best = null;
  for (const road of appCtx.roads || []) {
    if (road?.structureSemantics?.terrainMode !== 'elevated' || !Array.isArray(road.pts)) continue;
    for (let i = 0; i < road.pts.length - 1; i++) {
      const start = road.pts[i];
      const end = road.pts[i + 1];
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const lengthSq = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - start.x) * dx + (z - start.z) * dz) / lengthSq));
      const px = start.x + dx * t;
      const pz = start.z + dz * t;
      const distance = Math.hypot(px - x, pz - z);
      if (best && distance >= best.distance) continue;
      const profileY = sampleFeatureSurfaceY(road, px, pz, {
        x: px,
        z: pz,
        dist: distance,
        segIndex: i,
        t
      });
      best = { distance, y: Number.isFinite(profileY) ? profileY : appCtx.elevationWorldYAtWorldXZ(x, z) + 55 };
    }
  }
  const terrainY = appCtx.elevationWorldYAtWorldXZ(x, z);
  const worldUnitsPerMeter = Math.max(0.01, Number(appCtx.WORLD_UNITS_PER_METER) || 1);
  const localRoadY = best?.distance <= 45 ? Number(best.y) : NaN;
  return Math.max(
    terrainY + 8 * worldUnitsPerMeter,
    Number.isFinite(localRoadY) ? localRoadY : -Infinity
  );
}

function createTowerPartMesh(way, nodes) {
  const points = openFootprint(way, nodes);
  if (points.length < 3) return null;
  const tags = way.tags || {};
  const minHeight = Math.max(0, numberTag(tags, 'min_height', 0));
  const height = Math.max(minHeight + 0.5, numberTag(tags, 'height', minHeight + 8));
  const baseTerrainY = points.reduce(
    (sum, point) => sum + appCtx.elevationWorldYAtWorldXZ(point.x, point.z),
    0
  ) / points.length;
  const prism = prismGeometry(points, baseTerrainY + minHeight, baseTerrainY + height);
  if (!prism) return null;
  const material = new THREE.MeshStandardMaterial({ color: BRIDGE_COLOR, roughness: 0.67, metalness: 0.3 });
  const mesh = new THREE.Mesh(prism.geometry, material);
  mesh.position.set(prism.center.x, 0, prism.center.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.userData = {
    isHistoricLandmark: true,
    landmarkKind: 'suspension_bridge_tower',
    landmarkName: 'Golden Gate Bridge',
    sourceFeatureId: `osm-way:${way.id}`,
    footprint: points,
    heightMeters: height,
    minHeightMeters: minHeight
  };
  return { mesh, center: footprintCenter(points), topY: baseTerrainY + height, height };
}

function cableHeight(distance, total, towerA, towerB, deckY) {
  const anchorLift = 12;
  if (distance <= towerA.distance) {
    const u = Math.max(0, Math.min(1, distance / Math.max(1, towerA.distance)));
    return deckY + anchorLift + (towerA.topY - deckY - anchorLift) * u * u;
  }
  if (distance >= towerB.distance) {
    const u = Math.max(0, Math.min(1, (total - distance) / Math.max(1, total - towerB.distance)));
    return deckY + anchorLift + (towerB.topY - deckY - anchorLift) * u * u;
  }
  const u = (distance - towerA.distance) / Math.max(1, towerB.distance - towerA.distance);
  const edgeTop = towerA.topY + (towerB.topY - towerA.topY) * u;
  const sag = 4 * u * (1 - u);
  return edgeTop - sag * Math.max(45, edgeTop - deckY - 28);
}

function createDeckGirderMeshes(path, metrics) {
  const meshes = [];
  const sampleCount = Math.max(48, Math.ceil(metrics.total / 24));
  for (const side of [-1, 1]) {
    const samples = [];
    for (let i = 0; i <= sampleCount; i++) {
      const distance = metrics.total * i / sampleCount;
      const point = pointAtDistance(path, metrics.distances, distance);
      const tangentLength = Math.hypot(point.dx, point.dz) || 1;
      const sideX = -point.dz / tangentLength;
      const sideZ = point.dx / tangentLength;
      samples.push(new THREE.Vector3(
        point.x + sideX * BRIDGE_HALF_WIDTH_METERS * side,
        sampleRoadDeckY(point.x, point.z) - 0.8,
        point.z + sideZ * BRIDGE_HALF_WIDTH_METERS * side
      ));
    }
    const curve = new THREE.CatmullRomCurve3(samples, false, 'centripetal');
    const geometry = new THREE.TubeGeometry(curve, Math.min(220, sampleCount), 0.9, 6, false);
    const material = new THREE.MeshStandardMaterial({ color: BRIDGE_COLOR, roughness: 0.62, metalness: 0.34 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.userData = {
      isHistoricLandmark: true,
      landmarkKind: 'suspension_bridge_girder',
      landmarkName: 'Golden Gate Bridge'
    };
    meshes.push(mesh);
  }
  return meshes;
}

function createCableMeshes(path, metrics, towers) {
  const material = new THREE.MeshStandardMaterial({ color: BRIDGE_COLOR, roughness: 0.55, metalness: 0.38 });
  const cableMeshes = [];
  const cableSamplesBySide = [];
  const sampleStep = 24;
  const sampleCount = Math.max(48, Math.ceil(metrics.total / sampleStep));
  for (const side of [-1, 1]) {
    const samples = [];
    for (let i = 0; i <= sampleCount; i++) {
      const distance = metrics.total * i / sampleCount;
      const point = pointAtDistance(path, metrics.distances, distance);
      const tangentLength = Math.hypot(point.dx, point.dz) || 1;
      const sideX = -point.dz / tangentLength;
      const sideZ = point.dx / tangentLength;
      const deckY = sampleRoadDeckY(point.x, point.z);
      samples.push(new THREE.Vector3(
        point.x + sideX * BRIDGE_HALF_WIDTH_METERS * side,
        cableHeight(distance, metrics.total, towers[0], towers[1], deckY),
        point.z + sideZ * BRIDGE_HALF_WIDTH_METERS * side
      ));
    }
    const curve = new THREE.CatmullRomCurve3(samples, false, 'centripetal');
    const geometry = new THREE.TubeGeometry(curve, Math.min(220, sampleCount), MAIN_CABLE_RADIUS_METERS, 8, false);
    const mesh = new THREE.Mesh(geometry, material.clone());
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.userData = { isHistoricLandmark: true, landmarkKind: 'suspension_bridge_cable', landmarkName: 'Golden Gate Bridge' };
    cableMeshes.push(mesh);
    cableSamplesBySide.push(samples);
  }

  const suspensionCount = Math.max(12, Math.floor(metrics.total / SUSPENDER_SPACING_METERS));
  const cylinder = new THREE.CylinderGeometry(SUSPENDER_RADIUS_METERS, SUSPENDER_RADIUS_METERS, 1, 6);
  const suspenderMaterial = new THREE.MeshStandardMaterial({ color: BRIDGE_COLOR, roughness: 0.58, metalness: 0.32 });
  const suspenders = new THREE.InstancedMesh(cylinder, suspenderMaterial, suspensionCount * 2);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  let instance = 0;
  for (let i = 1; i <= suspensionCount; i++) {
    const distance = metrics.total * i / (suspensionCount + 1);
    const pathPoint = pointAtDistance(path, metrics.distances, distance);
    const tangentLength = Math.hypot(pathPoint.dx, pathPoint.dz) || 1;
    const sideX = -pathPoint.dz / tangentLength;
    const sideZ = pathPoint.dx / tangentLength;
    const deckY = sampleRoadDeckY(pathPoint.x, pathPoint.z) + 1.2;
    for (const side of [-1, 1]) {
      const cableY = cableHeight(distance, metrics.total, towers[0], towers[1], deckY);
      const length = Math.max(0.5, cableY - deckY);
      position.set(
        pathPoint.x + sideX * BRIDGE_HALF_WIDTH_METERS * side,
        deckY + length * 0.5,
        pathPoint.z + sideZ * BRIDGE_HALF_WIDTH_METERS * side
      );
      scale.set(1, length, 1);
      matrix.compose(position, quaternion, scale);
      suspenders.setMatrixAt(instance++, matrix);
    }
  }
  suspenders.instanceMatrix.needsUpdate = true;
  suspenders.castShadow = true;
  suspenders.frustumCulled = false;
  suspenders.userData = {
    isHistoricLandmark: true,
    landmarkKind: 'suspension_bridge_suspender',
    landmarkName: 'Golden Gate Bridge',
    instanceCount: instance
  };
  return {
    cableMeshes,
    girderMeshes: createDeckGirderMeshes(path, metrics),
    suspenders,
    suspenderCount: instance
  };
}

function towerStations(towerParts, path, metrics) {
  const tall = towerParts.filter((part) => part.height >= 215);
  const projected = tall
    .map((part) => ({ ...part, distance: projectDistanceToPath(part.center, path, metrics.distances) }))
    .sort((a, b) => a.distance - b.distance);
  const clusters = [];
  for (const part of projected) {
    const cluster = clusters[clusters.length - 1];
    if (!cluster || part.distance - cluster.distance > 150) {
      clusters.push({ distance: part.distance, topY: part.topY, count: 1 });
    } else {
      cluster.distance = (cluster.distance * cluster.count + part.distance) / (cluster.count + 1);
      cluster.topY = Math.max(cluster.topY, part.topY);
      cluster.count += 1;
    }
  }
  return clusters.filter((cluster) => cluster.distance > 80 && cluster.distance < metrics.total - 80).slice(0, 2);
}

export function renderSuspensionBridgeLandmark(data) {
  if (typeof THREE === 'undefined') return null;
  const nodes = {};
  for (const element of data?.elements || []) {
    if (element?.type === 'node') nodes[element.id] = element;
  }
  const ways = (data?.elements || []).filter((element) => element?.type === 'way');
  const spanWay = ways
    .filter((way) => way.tags?.['bridge:structure'] === 'suspension' && way.tags?.highway === 'motorway')
    .sort((a, b) => (b.nodes?.length || 0) - (a.nodes?.length || 0))[0];
  const towerWays = ways.filter((way) => way.tags?.['tower:type'] === 'bridge');
  if (!spanWay || towerWays.length === 0) return null;

  const path = pathPoints(spanWay, nodes);
  const metrics = polylineMetrics(path);
  if (path.length < 3 || metrics.total < MIN_SUSPENSION_SPAN_METERS) return null;
  const surfaceControl = applyPublishedTransportSurfaceControls({
    controls: data?._transportSurfaceControls,
    roads: appCtx.roads,
    referencePath: path
  });
  const result = {
    meshes: [],
    metrics: {
      status: 'awaiting_compiled_transport_surface',
      towerParts: 0,
      towers: 0,
      cables: 0,
      girders: 0,
      suspenders: 0,
      structuralMembers: 0,
      controlledRoads: surfaceControl.appliedRoads,
      surfaceControlAuthority: surfaceControl.authority,
      synchronizedRoads: 0,
      transportSurfaceOwner: 'compiled_transport_surface',
      spanMeters: Number(metrics.total.toFixed(1))
    }
  };

  const publishFromCompiledTransport = () => {
    const compiledSharedSurface = (appCtx.roads || []).map((road) =>
      road?.transportSurfacePresentation
    ).find((surface) =>
      surface?.status === 'compiled' &&
      surface?.physicalSurfaceKind === 'bridge_deck' &&
      surface?.memberFeatureIds?.some((featureId) =>
        surfaceControl.controls.some((control) => control.sourceFeatureId === featureId)
      )
    ) || null;
    const structurePath = compiledSharedSurface?.pts?.length >= 2
      ? centerMappedPathOnCompiledSurface(path, compiledSharedSurface.pts)
      : path;
    const structureMetrics = polylineMetrics(structurePath);
    const createdMeshes = [];
    const towerParts = [];
    for (const way of towerWays) {
      const part = createTowerPartMesh(way, nodes);
      if (!part) continue;
      appCtx.addEarthWorldObject(part.mesh);
      appCtx.historicMarkers.push(part.mesh);
      createdMeshes.push(part.mesh);
      towerParts.push(part);
    }
    const towers = towerStations(towerParts, structurePath, structureMetrics);
    let structuralDetails = null;
    if (towers.length === 2) {
      const cables = createCableMeshes(structurePath, structureMetrics, towers);
      for (const mesh of cables.cableMeshes) {
        appCtx.addEarthWorldObject(mesh);
        appCtx.historicMarkers.push(mesh);
        createdMeshes.push(mesh);
      }
      for (const mesh of cables.girderMeshes) {
        appCtx.addEarthWorldObject(mesh);
        appCtx.historicMarkers.push(mesh);
        createdMeshes.push(mesh);
      }
      appCtx.addEarthWorldObject(cables.suspenders);
      appCtx.historicMarkers.push(cables.suspenders);
      createdMeshes.push(cables.suspenders);
      structuralDetails = createBridgeStructuralDetails({
        path: structurePath,
        metrics: structureMetrics,
        towers,
        pointAtDistance,
        sampleRoadDeckY,
        color: BRIDGE_COLOR
      });
      if (structuralDetails) createdMeshes.push(structuralDetails);
    }
    appCtx.historicSites.push({
      x: footprintCenter(structurePath).x,
      z: footprintCenter(structurePath).z,
      type: 'suspension_bridge',
      name: spanWay.tags?.name || 'Golden Gate Bridge',
      wikidata: spanWay.tags?.wikidata || 'Q44440',
      sourceFeatureId: `osm-way:${spanWay.id}`,
      height: Math.max(0, ...towerParts.map((part) => part.height))
    });
    result.meshes.push(...createdMeshes);
    Object.assign(result.metrics, {
      status: 'published_from_compiled_transport_surface',
      towerParts: towerParts.length,
      towers: towers.length,
      cables: towers.length === 2 ? 2 : 0,
      girders: towers.length === 2 ? 2 : 0,
      suspenders: createdMeshes.find((mesh) =>
        mesh.userData?.landmarkKind === 'suspension_bridge_suspender')?.userData?.instanceCount || 0,
      structuralMembers: structuralDetails?.userData?.instanceCount || 0,
      structureAxisAuthority: compiledSharedSurface
        ? 'compiled_transport_surface_group'
        : 'mapped_landmark_path'
    });
    return result.metrics;
  };
  if (!Array.isArray(appCtx.deferredTransportLandmarkPublishers)) {
    appCtx.deferredTransportLandmarkPublishers = [];
  }
  appCtx.deferredTransportLandmarkPublishers.push(publishFromCompiledTransport);
  return result;
}
