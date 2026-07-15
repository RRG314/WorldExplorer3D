import { ctx as appCtx } from './shared-context.js?v=55';

const state = {
  active: false,
  x: 0,
  y: 2,
  z: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  speed: 0,
  throttle: 0,
  climbRate: 0,
  airborne: false,
  cameraYaw: 0,
  cameraPitch: 0,
  cameraLookTimer: 0,
  contactKind: 'terrain',
  contactBuildingId: '',
  lastImpactAt: 0,
  lastImpactSpeed: 0,
  mesh: null,
  propeller: null
};

const surfaceSample = {
  valid: false,
  x: 0,
  z: 0,
  y: 0,
  kind: 'terrain',
  building: null,
  age: Infinity
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function damp(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

function material(color, metalness = 0.22, roughness = 0.52) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

function createPlaneMesh() {
  const plane = new THREE.Group();
  plane.name = 'Explorer STOL Aircraft';

  const white = material(0xf4f6f8, 0.34, 0.42);
  const blue = material(0x155fa0, 0.42, 0.38);
  const dark = material(0x1d252b, 0.16, 0.7);
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x69a8c5,
    transparent: true,
    opacity: 0.72,
    roughness: 0.1,
    metalness: 0.05,
    transmission: 0.18
  });

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.7, 4.8, 18), white);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.z = 0.15;
  plane.add(fuselage);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.05, 18), blue);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 3.05;
  plane.add(nose);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.64, 18, 12), glass);
  cockpit.scale.set(0.82, 0.58, 1.22);
  cockpit.position.set(0, 0.47, 1.15);
  plane.add(cockpit);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.12, 1.28), white);
  wing.position.set(0, 0.08, 0.2);
  plane.add(wing);
  const wingStripe = new THREE.Mesh(new THREE.BoxGeometry(6.58, 0.05, 0.28), blue);
  wingStripe.position.set(0, 0.16, 0.48);
  plane.add(wingStripe);

  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.1, 0.64), white);
  tailWing.position.set(0, 0.2, -2.25);
  plane.add(tailWing);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.15, 0.9), blue);
  fin.position.set(0, 0.62, -2.18);
  fin.rotation.x = -0.18;
  plane.add(fin);

  const propeller = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.34, 12), dark);
  hub.rotation.x = Math.PI / 2;
  propeller.add(hub);
  const bladeGeometry = new THREE.BoxGeometry(0.12, 1.7, 0.06);
  const bladeA = new THREE.Mesh(bladeGeometry, dark);
  const bladeB = new THREE.Mesh(bladeGeometry, dark);
  bladeB.rotation.z = Math.PI / 2;
  propeller.add(bladeA, bladeB);
  propeller.position.z = 3.65;
  plane.add(propeller);

  const gearMat = material(0x2f3438, 0.18, 0.82);
  [[-0.72, -0.72, 0.4], [0.72, -0.72, 0.4], [0, -0.52, -1.95]].forEach(([x, y, z], index) => {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.62, 8), dark);
    strut.position.set(x, y + 0.28, z);
    strut.rotation.z = index < 2 ? x * 0.3 : 0;
    plane.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 14), gearMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    plane.add(wheel);
  });

  plane.scale.setScalar(0.92);
  plane.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  plane.visible = false;
  appCtx.scene.add(plane);
  state.mesh = plane;
  state.propeller = propeller;
  return plane;
}

function ensurePlaneMesh() {
  if (state.mesh) return state.mesh;
  if (!appCtx.scene || typeof THREE === 'undefined') return null;
  return createPlaneMesh();
}

function buildingTopY(building) {
  const minY = Number.isFinite(building?.minY) ? building.minY : Number(building?.baseY) || 0;
  if (Number.isFinite(building?.maxY)) return building.maxY;
  return minY + Math.max(0, Number(building?.height) || 0);
}

function pointInsideBuildingFootprint(x, z, building) {
  if (!building) return false;
  if (x < building.minX || x > building.maxX || z < building.minZ || z > building.maxZ) return false;
  return !Array.isArray(building.pts) || building.pts.length < 3 || appCtx.pointInPolygon?.(x, z, building.pts) === true;
}

function buildingRoofSurfaceAt(x, z, terrainY) {
  const gearY = state.y - 0.72;
  const candidates = appCtx.getNearbyBuildings?.(x, z, 8) || appCtx.buildings || [];
  let best = null;
  for (let i = 0; i < candidates.length; i += 1) {
    const building = candidates[i];
    if (!building || building.collisionDisabled || building.allowsPassageBelow === true) continue;
    if (building.collisionKind === 'barrier' || !pointInsideBuildingFootprint(x, z, building)) continue;
    const roofY = buildingTopY(building);
    if (!Number.isFinite(roofY) || roofY <= terrainY + 1.2 || gearY < roofY - 1.1) continue;
    if (!best || roofY > best.y) best = { y: roofY, kind: 'building', building };
  }
  return best;
}

function groundSurfaceAt(x, z, options = {}) {
  let terrainY = appCtx.terrainMeshHeightAt?.(x, z);
  if (!Number.isFinite(terrainY)) terrainY = appCtx.elevationWorldYAtWorldXZ?.(x, z);
  if (!Number.isFinite(terrainY)) terrainY = 0;
  let surface = { y: terrainY, kind: 'terrain', building: null };
  if (options.includeRoad !== false) {
    const nearest = appCtx.findNearestRoad?.(x, z, { y: state.y, maxVerticalDelta: 80 });
    const roadHalfWidth = Math.max(2.5, Number(nearest?.road?.width || 5) * 0.5);
    if (Number(nearest?.dist) <= roadHalfWidth + 1.2 && Number.isFinite(nearest?.y)) {
      surface = { y: nearest.y, kind: 'road', building: null };
    }
  }
  const roof = buildingRoofSurfaceAt(x, z, surface.y);
  return roof && roof.y > surface.y ? roof : surface;
}

function samplePlaneSurface(dt = 0, force = false) {
  surfaceSample.age += Math.max(0, Number(dt) || 0);
  const moved = surfaceSample.valid ? Math.hypot(state.x - surfaceSample.x, state.z - surfaceSample.z) : Infinity;
  const clearance = surfaceSample.valid ? state.y - surfaceSample.y : 0;
  const highFlight = state.airborne && clearance > 24;
  const interval = highFlight ? 0.28 : state.airborne ? 0.16 : 0.12;
  const movementThreshold = highFlight ? 24 : state.airborne ? 12 : 8;
  if (!force && surfaceSample.valid && surfaceSample.age < interval && moved < movementThreshold) {
    return surfaceSample.y;
  }
  const includeRoad = !state.airborne || clearance < 12;
  const sampled = groundSurfaceAt(state.x, state.z, { includeRoad });
  surfaceSample.y = sampled.y;
  surfaceSample.kind = sampled.kind;
  surfaceSample.building = sampled.building;
  surfaceSample.x = state.x;
  surfaceSample.z = state.z;
  surfaceSample.age = 0;
  surfaceSample.valid = true;
  return surfaceSample.y;
}

function referencePosition() {
  if (appCtx.droneMode && appCtx.drone) return appCtx.drone;
  if (appCtx.Walk?.state?.mode === 'walk') return appCtx.Walk.state.walker;
  return appCtx.car || { x: 0, z: 0, angle: 0 };
}

function startPlaneMode(options = {}) {
  if (
    appCtx.onMoon ||
    appCtx.onMars ||
    appCtx.oceanMode?.active ||
    appCtx.spaceFlight?.active ||
    appCtx.worldLoading ||
    (appCtx.earthResumePending && options.allowDuringEarthResume !== true)
  ) return false;
  const mesh = ensurePlaneMesh();
  if (!mesh) return false;
  const reference = referencePosition();
  state.x = Number.isFinite(options.x) ? options.x : Number(reference?.x) || 0;
  state.z = Number.isFinite(options.z) ? options.z : Number(reference?.z) || 0;
  state.yaw = Number.isFinite(options.yaw) ? options.yaw : Number(reference?.angle ?? reference?.yaw) || 0;
  if (Number.isFinite(options.y)) state.y = options.y;
  surfaceSample.valid = false;
  const groundY = samplePlaneSurface(0, true);
  state.y = Number.isFinite(options.y) ? Math.max(groundY + 0.72, options.y) : groundY + 0.72;
  state.pitch = clamp(Number(options.pitch) || 0, -0.35, 0.35);
  state.roll = clamp(Number(options.roll) || 0, -0.65, 0.65);
  state.speed = clamp(Number(options.speed) || 0, 0, 62);
  state.throttle = clamp(Number(options.throttle) || 0, 0, 1);
  state.airborne = options.airborne === true || state.y > groundY + 1.4;
  state.climbRate = 0;
  state.cameraYaw = 0;
  state.cameraPitch = 0;
  state.cameraLookTimer = 0;
  state.active = true;
  mesh.visible = true;
  appCtx.camMode = Number.isFinite(appCtx.camMode) ? appCtx.camMode : 0;
  syncPlaneMesh();
  return true;
}

function stopPlaneMode(options = {}) {
  if (!state.active) return false;
  const exitState = getPlaneSnapshot();
  const targetMode = String(options.targetMode || 'drive');
  state.active = false;
  if (state.mesh) state.mesh.visible = false;
  state.speed = 0;
  state.throttle = 0;
  state.climbRate = 0;

  if (targetMode === 'drone') return exitState;

  const targetGroundMode = targetMode === 'walk' ? 'walk' : 'drive';
  const landedOnRoof = targetGroundMode === 'walk' && surfaceSample.kind === 'building' &&
    Math.abs((exitState.y - 0.72) - surfaceSample.y) <= 1.25;
  exitState.landedOnRoof = landedOnRoof;
  exitState.surfaceY = surfaceSample.y;
  const resolved = appCtx.resolveSafeWorldSpawn?.(state.x, state.z, {
    mode: targetGroundMode,
    angle: state.yaw,
    feetY: landedOnRoof ? surfaceSample.y + 0.04 : undefined,
    preserveElevatedSurface: landedOnRoof,
    allowBuildingRoof: landedOnRoof,
    maxRoadDistance: 180,
    maxGroundRadius: 80,
    source: 'plane_exit'
  });
  if (resolved && typeof appCtx.applyResolvedWorldSpawn === 'function') {
    appCtx.applyResolvedWorldSpawn(resolved, { syncCar: true, syncWalker: true });
  } else {
    const groundY = samplePlaneSurface(0, true);
    if (appCtx.car) {
      appCtx.car.x = state.x;
      appCtx.car.z = state.z;
      appCtx.car.y = groundY + 1.2;
      appCtx.car.angle = state.yaw;
      appCtx.car.speed = 0;
    }
    if (appCtx.Walk?.state?.walker) {
      appCtx.Walk.state.walker.x = state.x;
      appCtx.Walk.state.walker.z = state.z;
      appCtx.Walk.state.walker.y = groundY + 1.7;
    }
  }
  return exitState;
}

function syncPlaneMesh() {
  if (!state.mesh) return;
  state.mesh.position.set(state.x, state.y, state.z);
  state.mesh.rotation.order = 'YXZ';
  state.mesh.rotation.set(-state.pitch, state.yaw, -state.roll);
}

function buildingImpactAt(x, y, z) {
  const actorBaseY = y - 0.68;
  const hit = appCtx.checkBuildingCollision?.(x, z, 2.15, {
    actorBaseY,
    actorHeight: 1.45
  });
  if (!hit?.collision || !hit.building) return null;
  const roofY = buildingTopY(hit.building);
  if (Number.isFinite(roofY) && actorBaseY >= roofY - 0.32) return null;
  return hit;
}

function updatePlane(dt) {
  if (!state.active) return false;
  const previousX = state.x;
  const previousZ = state.z;
  const up = !!appCtx.keys.ArrowUp;
  const down = !!appCtx.keys.ArrowDown;
  const left = !!appCtx.keys.ArrowLeft;
  const right = !!appCtx.keys.ArrowRight;
  const throttleUp = !!(appCtx.keys.ShiftLeft || appCtx.keys.ShiftRight);
  const throttleDown = !!(appCtx.keys.ControlLeft || appCtx.keys.ControlRight);
  const brake = !!appCtx.keys.Space;

  state.throttle = clamp(state.throttle + ((throttleUp ? 1 : 0) - (throttleDown ? 1 : 0)) * dt * 0.58, 0, 1);
  if (!state.airborne && up) state.throttle = Math.max(state.throttle, Math.min(0.82, state.throttle + dt * 0.42));
  const targetSpeed = state.throttle * 58;
  const speedRate = state.airborne ? 0.72 : 1.35;
  state.speed = damp(state.speed, targetSpeed, speedRate, dt);
  if (brake && !state.airborne) state.speed *= Math.exp(-5.8 * dt);

  const pitchInput = (up ? 1 : 0) - (down ? 1 : 0);
  const rollInput = (left ? 1 : 0) - (right ? 1 : 0);
  const groundY = samplePlaneSurface(dt);

  if (!state.airborne) {
    state.pitch = damp(state.pitch, clamp(pitchInput * 0.16, -0.12, 0.18), 3.5, dt);
    state.roll = damp(state.roll, 0, 6, dt);
    const steerScale = clamp(state.speed / 12, 0.3, 1);
    state.yaw += rollInput * dt * 1.02 * steerScale;
    state.y = damp(state.y, groundY + 0.72, 12, dt);
    if (state.speed > 13.5 && pitchInput > 0.2) {
      state.airborne = true;
      state.climbRate = 1.4;
    }
  } else {
    const controlAuthority = clamp(state.speed / 20, 0.3, 1.25);
    state.pitch = damp(state.pitch, pitchInput * 0.42, 2.15 * controlAuthority, dt);
    state.roll = damp(state.roll, rollInput * 0.78, 2.6 * controlAuthority, dt);
    state.yaw += Math.sin(state.roll) * dt * (0.5 + controlAuthority * 0.52);
    const liftBalance = clamp((state.speed - 15) * 0.09, -2.4, 2.8);
    const desiredClimb = Math.sin(state.pitch) * state.speed + liftBalance - 0.8;
    state.climbRate = damp(state.climbRate, desiredClimb, 1.6, dt);
    state.y += state.climbRate * dt;
    if (state.y <= groundY + 0.72) {
      state.y = groundY + 0.72;
      state.airborne = false;
      state.climbRate = 0;
      if (Math.abs(state.pitch) > 0.24 || Math.abs(state.roll) > 0.42) state.speed *= 0.42;
      state.pitch = 0;
      state.roll = 0;
    }
  }

  const horizontalSpeed = state.speed * Math.cos(state.pitch);
  state.x += Math.sin(state.yaw) * horizontalSpeed * dt;
  state.z += Math.cos(state.yaw) * horizontalSpeed * dt;
  const horizontalMovement = Math.hypot(state.x - previousX, state.z - previousZ);
  const impact = horizontalMovement > 0.05 && state.y - groundY < 520 ?
    buildingImpactAt(state.x, state.y, state.z) :
    null;
  if (impact) {
    state.lastImpactAt = performance.now();
    state.lastImpactSpeed = state.speed;
    state.x = previousX;
    state.z = previousZ;
    state.speed = Math.min(2.5, state.speed * 0.12);
    state.throttle = 0;
    state.climbRate = Math.max(0, state.climbRate * 0.2);
    state.pitch = damp(state.pitch, 0, 8, dt);
    state.roll = damp(state.roll, 0, 8, dt);
  }
  const localGround = groundY;
  state.y = clamp(state.y, localGround + 0.72, localGround + 1400);
  if (state.airborne && state.y <= localGround + 0.73) state.airborne = false;
  state.contactKind = surfaceSample.kind;
  state.contactBuildingId = String(surfaceSample.building?.sourceBuildingId || '');

  if (state.propeller) state.propeller.rotation.z += dt * (8 + state.throttle * 70);
  syncPlaneMesh();
  return true;
}

function applyPlaneCamera(dt) {
  if (!state.active || !appCtx.camera) return false;
  const lookSpeed = 1.8 * dt;
  const manualLook = !!(appCtx.keys.KeyA || appCtx.keys.KeyD || appCtx.keys.KeyW || appCtx.keys.KeyS);
  if (manualLook) state.cameraLookTimer = 1.6;
  else state.cameraLookTimer = Math.max(0, state.cameraLookTimer - dt);
  if (appCtx.keys.KeyA) state.cameraYaw += lookSpeed;
  if (appCtx.keys.KeyD) state.cameraYaw -= lookSpeed;
  if (appCtx.keys.KeyW) state.cameraPitch += lookSpeed;
  if (appCtx.keys.KeyS) state.cameraPitch -= lookSpeed;
  if (!manualLook && state.cameraLookTimer <= 0 && appCtx.camMode === 0) {
    state.cameraYaw = damp(state.cameraYaw, 0, 2.7, dt);
    state.cameraPitch = damp(state.cameraPitch, 0, 2.7, dt);
  }
  state.cameraYaw = Math.atan2(Math.sin(state.cameraYaw), Math.cos(state.cameraYaw));
  state.cameraPitch = clamp(state.cameraPitch, -0.5, 0.55);

  const viewYaw = state.yaw + state.cameraYaw;
  const forwardX = Math.sin(state.yaw) * Math.cos(state.pitch);
  const forwardZ = Math.cos(state.yaw) * Math.cos(state.pitch);
  const lookY = state.y + 0.45 + Math.sin(state.pitch) * 10 + Math.sin(state.cameraPitch) * 5;
  state.mesh.visible = appCtx.camMode !== 1;

  if (appCtx.camMode === 1) {
    appCtx.camera.position.set(state.x + forwardX * 0.65, state.y + 0.62, state.z + forwardZ * 0.65);
    appCtx.camera.lookAt(state.x + forwardX * 18, lookY, state.z + forwardZ * 18);
  } else if (appCtx.camMode === 2) {
    appCtx.camera.position.set(state.x, state.y + 24, state.z - 2);
    appCtx.camera.lookAt(state.x + forwardX * 5, state.y, state.z + forwardZ * 5);
  } else {
    const distance = 12 + clamp(state.speed / 18, 0, 4);
    const targetX = state.x - Math.sin(viewYaw) * distance;
    const targetY = state.y + 4.2 + Math.sin(state.cameraPitch) * 6;
    const targetZ = state.z - Math.cos(viewYaw) * distance;
    const blend = 1 - Math.exp(-6.5 * dt);
    appCtx.camera.position.x += (targetX - appCtx.camera.position.x) * blend;
    appCtx.camera.position.y += (targetY - appCtx.camera.position.y) * blend;
    appCtx.camera.position.z += (targetZ - appCtx.camera.position.z) * blend;
    appCtx.camera.lookAt(state.x + forwardX * 3, state.y + 0.4, state.z + forwardZ * 3);
  }
  return true;
}

function getPlaneSnapshot() {
  return {
    active: state.active,
    x: state.x,
    y: state.y,
    z: state.z,
    yaw: state.yaw,
    pitch: state.pitch,
    roll: state.roll,
    speed: state.speed,
    throttle: state.throttle,
    airborne: state.airborne,
    contactKind: state.contactKind,
    contactBuildingId: state.contactBuildingId,
    lastImpactAt: state.lastImpactAt,
    lastImpactSpeed: state.lastImpactSpeed
  };
}

appCtx.planeMode = state;
Object.assign(appCtx, {
  applyPlaneCamera,
  getPlaneSnapshot,
  startPlaneMode,
  stopPlaneMode,
  updatePlane
});

export { applyPlaneCamera, getPlaneSnapshot, startPlaneMode, stopPlaneMode, updatePlane };
