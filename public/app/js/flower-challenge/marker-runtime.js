export function createFlowerMarkerRuntime(deps = {}) {
  const { appCtx, challengeState, getActiveActorPosition, minDistance: FLOWER_MIN_DISTANCE, maxDistance: FLOWER_MAX_DISTANCE } = deps;

function isInsidePolygon(x, z, pts) {
  if (!Array.isArray(pts) || pts.length < 3) return false;
  if (typeof appCtx.pointInPolygon === 'function') return !!appCtx.pointInPolygon(x, z, pts);

  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const zi = pts[i].z;
    const xj = pts[j].x;
    const zj = pts[j].z;
    const intersects = zi > z !== zj > z && x < (xj - xi) * (z - zi) / (zj - zi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function getTerrainY(x, z) {
  if (typeof appCtx.terrainMeshHeightAt === 'function') {
    const h = appCtx.terrainMeshHeightAt(x, z);
    if (Number.isFinite(h)) return h;
  }
  if (typeof appCtx.elevationWorldYAtWorldXZ === 'function') {
    const h = appCtx.elevationWorldYAtWorldXZ(x, z);
    if (Number.isFinite(h)) return h;
  }
  return 0;
}

function getBuildingRoofY(x, z, groundY) {
  if (!Array.isArray(appCtx.buildings) || appCtx.buildings.length === 0) return null;

  const candidates = typeof appCtx.getNearbyBuildings === 'function' ?
  appCtx.getNearbyBuildings(x, z, 30) || [] :
  appCtx.buildings;

  let roof = null;
  for (let i = 0; i < candidates.length; i++) {
    const b = candidates[i];
    if (!b) continue;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    if (!isInsidePolygon(x, z, b.pts)) continue;
    const h = Number(b.height);
    if (!Number.isFinite(h) || h <= 0) continue;
    const top = groundY + h;
    if (!Number.isFinite(roof) || top > roof) roof = top;
  }

  return roof;
}

function getTopSurfaceY(x, z) {
  const groundY = getTerrainY(x, z);
  let topY = groundY;

  const roofY = getBuildingRoofY(x, z, groundY);
  if (Number.isFinite(roofY) && roofY > topY) topY = roofY;

  if (typeof appCtx.getBuildTopSurfaceAtWorldXZ === 'function') {
    const blockTop = appCtx.getBuildTopSurfaceAtWorldXZ(x, z, Infinity);
    if (Number.isFinite(blockTop) && blockTop > topY) topY = blockTop;
  }

  return topY;
}

function pickFlowerSpawn() {
  const actor = getActiveActorPosition();
  const baseX = Number(actor?.x || appCtx.car?.x || 0);
  const baseZ = Number(actor?.z || appCtx.car?.z || 0);

  const roads = Array.isArray(appCtx.roads) ? appCtx.roads : [];
  if (roads.length > 0) {
    for (let attempt = 0; attempt < 220; attempt++) {
      const road = roads[Math.floor(Math.random() * roads.length)];
      if (!road || !Array.isArray(road.pts) || road.pts.length === 0) continue;
      const pt = road.pts[Math.floor(Math.random() * road.pts.length)];
      if (!pt) continue;

      const roadWidth = Number(road.width) > 0 ? Number(road.width) : 10;
      const jitter = roadWidth * 0.75;
      const x = pt.x + (Math.random() - 0.5) * jitter;
      const z = pt.z + (Math.random() - 0.5) * jitter;
      const dist = Math.hypot(x - baseX, z - baseZ);
      if (dist < FLOWER_MIN_DISTANCE || dist > FLOWER_MAX_DISTANCE) continue;

      const y = getTopSurfaceY(x, z);
      if (!Number.isFinite(y)) continue;

      return { x, y, z };
    }
  }

  for (let attempt = 0; attempt < 160; attempt++) {
    const radius = FLOWER_MIN_DISTANCE + Math.random() * (FLOWER_MAX_DISTANCE - FLOWER_MIN_DISTANCE);
    const theta = Math.random() * Math.PI * 2;
    const x = baseX + Math.cos(theta) * radius;
    const z = baseZ + Math.sin(theta) * radius;
    const y = getTopSurfaceY(x, z);
    if (!Number.isFinite(y)) continue;
    return { x, y, z };
  }

  return null;
}

function buildFlowerMarkerMesh() {
  if (typeof THREE === 'undefined') return null;

  const root = new THREE.Group();
  root.name = 'redFlowerChallenge';

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.06, 1.5, 10),
    new THREE.MeshStandardMaterial({ color: 0x047857, roughness: 0.45, metalness: 0.05 })
  );
  stem.position.y = 0.8;
  root.add(stem);

  const center = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.35, metalness: 0.1 })
  );
  center.position.y = 1.64;
  root.add(center);

  for (let i = 0; i < 8; i++) {
    const ang = i / 8 * Math.PI * 2;
    const petal = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35, metalness: 0.05 })
    );
    petal.scale.set(1.4, 0.8, 0.8);
    petal.position.set(Math.cos(ang) * 0.29, 1.64, Math.sin(ang) * 0.29);
    root.add(petal);
  }

  const beacon = new THREE.Mesh(
    new THREE.TorusGeometry(0.52, 0.03, 10, 40),
    new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.85 })
  );
  beacon.rotation.x = Math.PI * 0.5;
  beacon.position.y = 0.08;
  beacon.userData.isBeacon = true;
  root.add(beacon);

  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = false;
    }
  });

  return root;
}

function removeFlowerMarker() {
  if (!challengeState.marker) return;
  const marker = challengeState.marker;
  challengeState.marker = null;
  challengeState.markerPos = null;
  if (marker.parent) marker.parent.remove(marker);
  marker.traverse((child) => {
    if (child.geometry && typeof child.geometry.dispose === 'function') child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m?.dispose?.());
      else child.material.dispose?.();
    }
  });
}

function placeFlowerMarker(spawnPoint) {
  if (!appCtx.scene) return false;
  const marker = buildFlowerMarkerMesh();
  if (!marker) return false;

  marker.position.set(spawnPoint.x, spawnPoint.y + 0.02, spawnPoint.z);
  appCtx.scene.add(marker);

  challengeState.marker = marker;
  challengeState.markerBaseY = spawnPoint.y + 0.02;
  challengeState.markerPos = { x: spawnPoint.x, y: spawnPoint.y + 0.02, z: spawnPoint.z };
  return true;
}


  return { pickFlowerSpawn, placeFlowerMarker, removeFlowerMarker };
}
