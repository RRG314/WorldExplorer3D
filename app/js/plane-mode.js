import { ctx as appCtx } from './shared-context.js?v=55';
import { aircraftBankTurnFactor, aircraftChaseOffset, aircraftForwardVector, integrateAerobaticAttitude } from './controls/traversal-control-policy.js?v=7';

const PLANE_MAX_SPEED_MPS = 84;

const state = {
  active: false,
  x: 0,
  y: 2,
  z: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  pitchRate: 0,
  rollRate: 0,
  barrelRollActive: false,
  barrelRollDirection: 0,
  barrelRollProgress: 0,
  barrelRollStart: 0,
  speed: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  throttle: 0,
  climbRate: 0,
  airborne: false,
  cameraYaw: 0,
  cameraPitch: 0,
  cameraLookTimer: 0,
  contactKind: 'terrain',
  contactBuildingId: '',
  launchKind: 'ground',
  launchClearanceY: null,
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
let planeCameraUp = null;

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

function pointToBuildingFootprintDistance(x, z, building) {
  if (!building) return Infinity;
  if (pointInsideBuildingFootprint(x, z, building)) return 0;
  const points = Array.isArray(building.pts) ? building.pts : [];
  if (points.length < 3) {
    const nearestX = clamp(x, Number(building.minX), Number(building.maxX));
    const nearestZ = clamp(z, Number(building.minZ), Number(building.maxZ));
    return Math.hypot(x - nearestX, z - nearestZ);
  }
  let best = Infinity;
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared > 0
      ? clamp(((x - start.x) * dx + (z - start.z) * dz) / lengthSquared, 0, 1)
      : 0;
    best = Math.min(
      best,
      Math.hypot(x - (start.x + dx * t), z - (start.z + dz * t))
    );
  }
  return best;
}

function safePlaneLaunchAboveUrbanGeometry(x, z, groundY) {
  const aircraftAndCameraRadius = 18;
  const candidates = appCtx.getNearbyBuildings?.(
    x,
    z,
    aircraftAndCameraRadius + 12
  ) || appCtx.buildings || [];
  let highestRoofY = -Infinity;
  let nearbyBuildingCount = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    const building = candidates[index];
    if (
      !building ||
      building.collisionDisabled ||
      building.allowsPassageBelow === true ||
      building.collisionKind === 'barrier'
    ) continue;
    if (pointToBuildingFootprintDistance(x, z, building) > aircraftAndCameraRadius) continue;
    const roofY = buildingTopY(building);
    if (!Number.isFinite(roofY) || roofY <= groundY + 2) continue;
    highestRoofY = Math.max(highestRoofY, roofY);
    nearbyBuildingCount += 1;
  }
  if (nearbyBuildingCount === 0) {
    return { required: false, y: groundY + 0.72, nearbyBuildingCount: 0 };
  }
  return {
    required: true,
    y: highestRoofY + 12,
    highestRoofY,
    nearbyBuildingCount
  };
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
  const terrainY = appCtx.SurfaceQuery?.terrainAt?.(x, z)?.position?.y ?? 0;
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
  const hasExplicitY = Number.isFinite(options.y);
  const safeLaunch = hasExplicitY
    ? { required: false, y: Math.max(groundY + 0.72, options.y) }
    : safePlaneLaunchAboveUrbanGeometry(state.x, state.z, groundY);
  state.y = safeLaunch.y;
  state.pitch = clamp(Number(options.pitch) || 0, -0.35, 0.35);
  state.roll = clamp(Number(options.roll) || 0, -0.65, 0.65);
  state.speed = clamp(
    safeLaunch.required ? Math.max(20, Number(options.speed) || 0) : Number(options.speed) || 0,
    0,
    62
  );
  state.throttle = clamp(
    safeLaunch.required ? Math.max(0.48, Number(options.throttle) || 0) : Number(options.throttle) || 0,
    0,
    1
  );
  state.airborne = safeLaunch.required || options.airborne === true || state.y > groundY + 1.4;
  state.launchKind = safeLaunch.required ? 'urban_airborne' : 'ground';
  state.launchClearanceY = safeLaunch.required ? safeLaunch.y : null;
  state.climbRate = 0;
  state.pitchRate = 0;
  state.rollRate = 0;
  state.barrelRollActive = false;
  state.barrelRollDirection = 0;
  state.barrelRollProgress = 0;
  state.barrelRollStart = state.roll;
  state.vx = 0;
  state.vy = 0;
  state.vz = 0;
  appCtx.camera?.up?.set?.(0, 1, 0);
  state.cameraYaw = 0;
  state.cameraPitch = 0;
  state.cameraLookTimer = 0;
  state.active = true;
  mesh.visible = true;
  appCtx.setCameraMode(appCtx.camMode);
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
  state.pitchRate = 0;
  state.rollRate = 0;
  state.barrelRollActive = false;
  state.barrelRollDirection = 0;
  state.barrelRollProgress = 0;
  state.vx = 0;
  state.vy = 0;
  state.vz = 0;
  appCtx.camera?.up?.set?.(0, 1, 0);

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
    maxGroundRadius: 36,
    fastLocalFallback: true,
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
  if (dt > 1 / 30) {
    const steps = Math.ceil(dt / (1 / 45));
    const stepDt = dt / steps;
    for (let i = 0; i < steps; i += 1) updatePlane(stepDt);
    return true;
  }
  const previousX = state.x;
  const previousY = state.y;
  const previousZ = state.z;
  const actions = appCtx.readControlActions?.('plane') || {};
  const pitchInput = Number(actions.pitch) || 0;
  const rollInput = Number(actions.roll) || 0;
  const triggeredBarrelRoll = Number(appCtx.consumePlaneBarrelRollTrigger?.()) || 0;
  if (state.airborne && !state.barrelRollActive && Math.abs(triggeredBarrelRoll) > 0.05) {
    state.barrelRollActive = true;
    state.barrelRollDirection = Math.sign(triggeredBarrelRoll);
    state.barrelRollProgress = 0;
    state.barrelRollStart = state.roll;
  }
  const explicitAerobaticRoll = Number(actions.aerobaticRoll) || 0;
  const aerobaticRollInput = state.barrelRollActive ? state.barrelRollDirection : explicitAerobaticRoll;
  const throttleAdjust = Number(actions.throttleAdjust) || 0;
  const brake = Number(actions.brake) > 0.05;

  state.throttle = clamp(state.throttle + throttleAdjust * dt * 0.66, 0, 1);
  if (!state.airborne && pitchInput > 0.2) state.throttle = Math.max(state.throttle, Math.min(0.82, state.throttle + dt * 0.42));
  const targetSpeed = state.throttle * PLANE_MAX_SPEED_MPS;
  const speedRate = state.airborne ? 0.72 : 1.35;
  state.speed = damp(state.speed, targetSpeed, speedRate, dt);
  if (brake && !state.airborne) state.speed *= Math.exp(-5.8 * dt);

  const groundY = samplePlaneSurface(dt);

  if (!state.airborne) {
    state.pitch = damp(state.pitch, clamp(pitchInput * 0.16, -0.12, 0.18), 3.5, dt);
    state.roll = damp(state.roll, 0, 6, dt);
    state.pitchRate = 0;
    state.rollRate = 0;
    const steerScale = clamp(state.speed / 12, 0.3, 1);
    state.yaw += rollInput * dt * 1.02 * steerScale;
    state.y = damp(state.y, groundY + 0.72, 12, dt);
    if (state.speed > 13.5 && pitchInput > 0.2) {
      state.airborne = true;
      state.climbRate = 1.4;
    }
  } else {
    const controlAuthority = clamp(state.speed / 20, 0.3, 1.25);
    const stallBlend = clamp((13 - state.speed) / 5, 0, 1);
    const previousRoll = state.roll;
    const attitude = integrateAerobaticAttitude(state, {
      pitch: pitchInput,
      roll: Math.abs(aerobaticRollInput) > 0.05 ? aerobaticRollInput : rollInput,
      aerobaticRoll: aerobaticRollInput,
      authority: controlAuthority,
      stallBlend
    }, dt);
    state.pitch = attitude.pitch;
    state.roll = attitude.roll;
    state.pitchRate = attitude.pitchRate;
    state.rollRate = attitude.rollRate;
    if (state.barrelRollActive) {
      const rollDelta = Math.atan2(Math.sin(state.roll - previousRoll), Math.cos(state.roll - previousRoll));
      state.barrelRollProgress += Math.max(0, rollDelta * state.barrelRollDirection);
      if (state.barrelRollProgress >= Math.PI * 2) {
        state.barrelRollActive = false;
        state.barrelRollDirection = 0;
        state.barrelRollProgress = 0;
        state.roll = state.barrelRollStart;
        state.rollRate = 0;
      }
    }
    const turnFactor = Math.abs(aerobaticRollInput) > 0.05
      ? aircraftBankTurnFactor(state.roll, state.rollRate)
      : Math.sin(state.roll);
    state.yaw += turnFactor * dt * (0.55 + controlAuthority * 0.58);
    const liftBalance = clamp((state.speed - 15) * 0.09, -2.4, 2.8);
    const stallSink = stallBlend * (2.2 + (13 - state.speed) * 0.32);
    const desiredClimb = Math.sin(state.pitch) * state.speed + liftBalance - 0.8 - stallSink;
    state.climbRate = damp(state.climbRate, desiredClimb, 1.6, dt);
    state.y += state.climbRate * dt;
    if (state.y <= groundY + 0.72) {
      state.y = groundY + 0.72;
      state.airborne = false;
      state.climbRate = 0;
      if (Math.abs(state.pitch) > 0.24 || Math.abs(state.roll) > 0.42) state.speed *= 0.42;
      state.pitch = 0;
      state.roll = 0;
      state.pitchRate = 0;
      state.rollRate = 0;
      state.barrelRollActive = false;
      state.barrelRollDirection = 0;
      state.barrelRollProgress = 0;
    }
  }

  const flightForward = aircraftForwardVector(state.yaw, state.pitch);
  state.x += flightForward.x * state.speed * dt;
  state.z += flightForward.z * state.speed * dt;
  const bounded = appCtx.SurfaceQuery?.clampTraversalPoint?.(state.x, state.z, { margin: 30 });
  if (bounded?.limited) {
    state.x = bounded.x;
    state.z = bounded.z;
    state.speed = Math.min(state.speed, 4);
    state.throttle = 0;
  }
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
    state.pitchRate = 0;
    state.rollRate = 0;
  }
  const localGround = groundY;
  state.y = clamp(state.y, localGround + 0.72, localGround + 1400);
  if (state.airborne && state.y <= localGround + 0.73) state.airborne = false;
  const elapsed = Math.max(0.001, dt);
  state.vx = (state.x - previousX) / elapsed;
  state.vy = (state.y - previousY) / elapsed;
  state.vz = (state.z - previousZ) / elapsed;
  state.contactKind = surfaceSample.kind;
  state.contactBuildingId = String(surfaceSample.building?.sourceBuildingId || '');

  if (state.propeller) state.propeller.rotation.z += dt * (8 + state.throttle * 70);
  syncPlaneMesh();
  return true;
}

function applyPlaneCamera(dt) {
  if (!state.active || !appCtx.camera) return false;
  const lookSpeed = 1.8 * dt;
  const actions = appCtx.readControlActions?.('plane') || {};
  const lookYaw = Number(actions.lookYaw) || 0;
  const lookPitch = Number(actions.lookPitch) || 0;
  const manualLook = Math.abs(lookYaw) > 0.05 || Math.abs(lookPitch) > 0.05;
  if (manualLook) state.cameraLookTimer = 1.6;
  else state.cameraLookTimer = Math.max(0, state.cameraLookTimer - dt);
  state.cameraYaw += lookYaw * lookSpeed;
  state.cameraPitch += lookPitch * lookSpeed;
  if (!manualLook && state.cameraLookTimer <= 0 && appCtx.camMode === 0) {
    state.cameraYaw = damp(state.cameraYaw, 0, 2.7, dt);
    state.cameraPitch = damp(state.cameraPitch, 0, 2.7, dt);
  }
  state.cameraYaw = Math.atan2(Math.sin(state.cameraYaw), Math.cos(state.cameraYaw));
  state.cameraPitch = clamp(state.cameraPitch, -0.5, 0.55);

  const flightPose = appCtx.presentationPose?.mode === 'plane'
    ? appCtx.presentationPose.plane
    : state;
  const viewYaw = flightPose.yaw + state.cameraYaw;
  if (appCtx.camMode === 1 && state.mesh && typeof THREE !== 'undefined') {
    if (!planeCameraUp) planeCameraUp = new THREE.Vector3();
    planeCameraUp.set(0, 1, 0).applyQuaternion(state.mesh.quaternion);
    appCtx.camera.up.copy(planeCameraUp);
  } else {
    appCtx.camera.up.set(0, 1, 0);
  }
  const forward = aircraftForwardVector(flightPose.yaw, flightPose.pitch);
  const lookY = flightPose.y + 0.45 + forward.y * 10 + Math.sin(state.cameraPitch) * 5;
  state.mesh.visible = appCtx.camMode !== 1;

  if (appCtx.camMode === 1) {
    appCtx.camera.position.set(flightPose.x + forward.x * 0.65, flightPose.y + 0.62, flightPose.z + forward.z * 0.65);
    appCtx.camera.lookAt(flightPose.x + forward.x * 18, lookY, flightPose.z + forward.z * 18);
  } else if (appCtx.camMode === 2) {
    appCtx.camera.position.set(flightPose.x, flightPose.y + 24, flightPose.z - 2);
    appCtx.camera.lookAt(flightPose.x + forward.x * 5, flightPose.y, flightPose.z + forward.z * 5);
  } else {
    const distance = 12 + clamp(state.speed / 18, 0, 4);
    const chaseOffset = aircraftChaseOffset(viewYaw, flightPose.pitch, distance, 4.2 + Math.sin(state.cameraPitch) * 6);
    const targetX = flightPose.x + chaseOffset.x;
    const targetY = flightPose.y + chaseOffset.y;
    const targetZ = flightPose.z + chaseOffset.z;
    const blend = 1 - Math.exp(-6.5 * dt);
    appCtx.camera.position.x += (targetX - appCtx.camera.position.x) * blend;
    appCtx.camera.position.y += (targetY - appCtx.camera.position.y) * blend;
    appCtx.camera.position.z += (targetZ - appCtx.camera.position.z) * blend;
    appCtx.camera.lookAt(flightPose.x + forward.x * 3, flightPose.y + 0.4, flightPose.z + forward.z * 3);
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
    pitchRate: state.pitchRate,
    rollRate: state.rollRate,
    speed: state.speed,
    vx: state.vx,
    vy: state.vy,
    vz: state.vz,
    throttle: state.throttle,
    airborne: state.airborne,
    contactKind: state.contactKind,
    contactBuildingId: state.contactBuildingId,
    launchKind: state.launchKind,
    launchClearanceY: state.launchClearanceY,
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
export { PLANE_MAX_SPEED_MPS };
