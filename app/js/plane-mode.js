import { ctx as appCtx } from './shared-context.js?v=55';
import { aircraftBankTurnFactor, aircraftChaseOffset, aircraftForwardVector, cameraSmoothingBlend, integrateAerobaticAttitude } from './controls/traversal-control-policy.js?v=8';
import { aircraftGearSamplePoints } from './plane/roof-contact.js?v=2';
import { integrateFixedWingFlight, resolveAircraftFlightTuning } from './plane/flight-dynamics.js?v=1';
import { sampleSweptContact } from './physics/swept-contact.js?v=1';
import { getAviationCatalogEntry } from './transport/aviation-catalog.js?v=3';
import { aircraftGroundOffset, createAircraftVisual, updateAircraftVisual } from './transport/aircraft-visual-recipe.js?v=7';
import { applyTransportDamage } from './transport/damage-model.js?v=1';

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
  horizontalSpeed: 0,
  flightPathAngle: 0,
  angleOfAttack: 0,
  liftLoad: 0,
  turnRate: 0,
  stalled: false,
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
  transportEntityId: 'direct-flight:personal-prop',
  transportCatalogId: 'personal-prop',
  condition: 1,
  durabilityPolicy: 'standard',
  resistance: 150,
  mesh: null,
  visual: null
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

function planeGroundOffset(catalog = getAviationCatalogEntry(state.transportCatalogId)) {
  return aircraftGroundOffset(catalog);
}

function createPlaneMesh(catalog) {
  state.visual?.dispose?.();
  const visual = createAircraftVisual(globalThis.THREE, catalog, { mobile: appCtx.isTouchPreferredClient === true, state: 'active' });
  visual.root.visible = false;
  appCtx.scene.add(visual.root);
  state.visual = visual;
  state.mesh = visual.root;
  return visual.root;
}

function ensurePlaneMesh(catalog) {
  if (state.mesh?.userData?.transportCatalogId === catalog.id) return state.mesh;
  if (!appCtx.scene || typeof THREE === 'undefined') return null;
  return createPlaneMesh(catalog);
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

function safePlaneLaunchAboveUrbanGeometry(x, z, groundY, groundOffset = .72) {
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
    return { required: false, y: groundY + groundOffset, nearbyBuildingCount: 0 };
  }
  return {
    required: true,
    y: highestRoofY + groundOffset + 12,
    highestRoofY,
    nearbyBuildingCount
  };
}

function buildingRoofSurfaceAt(x, z, terrainY) {
  const gearY = state.y - planeGroundOffset();
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

function aircraftGroundSurfaceAt(x, z, options = {}) {
  const catalog = getAviationCatalogEntry(state.transportCatalogId);
  return aircraftGearSamplePoints(x, z, state.yaw, catalog.dimensions)
    .map((point) => groundSurfaceAt(point.x, point.z, options))
    .sort((left, right) => right.y - left.y)[0];
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
  const sampled = aircraftGroundSurfaceAt(state.x, state.z, { includeRoad });
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
  const catalog = getAviationCatalogEntry(options.transportCatalogId);
  const mesh = ensurePlaneMesh(catalog);
  if (!mesh) return false;
  const reference = referencePosition();
  state.transportEntityId = String(options.transportEntityId || `direct-flight:${catalog.id}`);
  state.transportCatalogId = catalog.id;
  state.condition = Math.max(0, Math.min(1, Number(options.condition ?? 1)));
  state.durabilityPolicy = catalog.damage.durabilityPolicy;
  state.resistance = catalog.damage.resistance;
  state.x = Number.isFinite(options.x) ? options.x : Number(reference?.x) || 0;
  state.z = Number.isFinite(options.z) ? options.z : Number(reference?.z) || 0;
  state.yaw = Number.isFinite(options.yaw) ? options.yaw : Number(reference?.angle ?? reference?.yaw) || 0;
  if (Number.isFinite(options.y)) state.y = options.y;
  surfaceSample.valid = false;
  const groundY = samplePlaneSurface(0, true);
  const hasExplicitY = Number.isFinite(options.y);
  const groundOffset = planeGroundOffset(catalog);
  const safeLaunch = hasExplicitY
    ? { required: false, y: Math.max(groundY + groundOffset, options.y) }
    : safePlaneLaunchAboveUrbanGeometry(state.x, state.z, groundY, groundOffset);
  state.y = safeLaunch.y;
  state.pitch = clamp(Number(options.pitch) || 0, catalog.aircraftKind === 'rotorcraft' ? -0.28 : -0.35, catalog.aircraftKind === 'rotorcraft' ? 0.28 : 0.35);
  state.roll = clamp(Number(options.roll) || 0, catalog.aircraftKind === 'rotorcraft' ? -0.35 : -0.65, catalog.aircraftKind === 'rotorcraft' ? 0.35 : 0.65);
  const startSpeedLimit = catalog.aircraftKind === 'rotorcraft'
    ? 40
    : Math.min(240, catalog.performance.topSpeed * .514444 / Math.max(.2, Number(appCtx.METERS_PER_WORLD_UNIT || 1)));
  state.speed = clamp(
    safeLaunch.required ? Math.max(20, Number(options.speed) || 0) : Number(options.speed) || 0,
    0,
    startSpeedLimit
  );
  state.throttle = clamp(
    safeLaunch.required ? Math.max(0.48, Number(options.throttle) || 0) : Number(options.throttle) || 0,
    0,
    1
  );
  state.airborne = safeLaunch.required || options.airborne === true || state.y > groundY + groundOffset + .7;
  state.launchKind = safeLaunch.required ? 'urban_airborne' : options.anchorFacilityId ? 'mapped-facility' : 'ground';
  state.launchClearanceY = safeLaunch.required ? safeLaunch.y : null;
  state.climbRate = 0;
  state.horizontalSpeed = state.speed;
  state.flightPathAngle = 0;
  state.angleOfAttack = 0;
  state.liftLoad = 0;
  state.turnRate = 0;
  state.stalled = false;
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
  if (appCtx.camera?.userData) delete appCtx.camera.userData.planeLookTarget;
  state.cameraYaw = 0;
  state.cameraPitch = 0;
  state.cameraLookTimer = 0;
  state.active = true;
  mesh.visible = true;
  appCtx.setCameraMode(appCtx.camMode);
  syncPlaneMesh();
  updateAircraftVisual(state.visual, state.condition, 0);
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
  state.horizontalSpeed = 0;
  state.flightPathAngle = 0;
  state.angleOfAttack = 0;
  state.liftLoad = 0;
  state.turnRate = 0;
  state.stalled = false;
  state.pitchRate = 0;
  state.rollRate = 0;
  state.barrelRollActive = false;
  state.barrelRollDirection = 0;
  state.barrelRollProgress = 0;
  state.vx = 0;
  state.vy = 0;
  state.vz = 0;
  appCtx.camera?.up?.set?.(0, 1, 0);
  if (appCtx.camera?.userData) delete appCtx.camera.userData.planeLookTarget;

  if (options.suppressFlightEnded !== true) appCtx.onAircraftFlightEnded?.(exitState, { targetMode });

  if (targetMode === 'skydive') return exitState;

  if (targetMode === 'drone') return exitState;

  const targetGroundMode = targetMode === 'walk' ? 'walk' : 'drive';
  const groundOffset = planeGroundOffset();
  const landedOnRoof = targetGroundMode === 'walk' && surfaceSample.kind === 'building' &&
    Math.abs((exitState.y - groundOffset) - surfaceSample.y) <= 1.25;
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
  const catalog = getAviationCatalogEntry(state.transportCatalogId);
  const forwardX = Math.sin(state.yaw);
  const forwardZ = Math.cos(state.yaw);
  const rightX = Math.cos(state.yaw);
  const rightZ = -Math.sin(state.yaw);
  const offsets = [
    [0, 0],
    [0, catalog.dimensions.length * .34],
    [0, -catalog.dimensions.length * .32],
    [catalog.dimensions.wingspan * .42, 0],
    [-catalog.dimensions.wingspan * .42, 0]
  ];
  const actorBaseY = y - Math.max(.58, catalog.dimensions.height * .28);
  const actorHeight = Math.max(1.1, catalog.dimensions.height * .58);
  const radius = Math.max(.65, Math.min(2.2, catalog.dimensions.width * .34));
  for (const [right, forward] of offsets) {
    const sampleX = x + rightX * right + forwardX * forward;
    const sampleZ = z + rightZ * right + forwardZ * forward;
    const hit = appCtx.checkBuildingCollision?.(sampleX, sampleZ, radius, { actorBaseY, actorHeight });
    if (!hit?.collision || !hit.building) continue;
    const roofY = buildingTopY(hit.building);
    if (Number.isFinite(roofY) && actorBaseY >= roofY - .32) continue;
    return hit;
  }
  return null;
}

function sweptBuildingImpact(from, to) {
  // The fuselage collision radius is 2.15 world units. Sampling well below
  // that radius keeps thin mapped walls from falling between physics poses.
  const catalog = getAviationCatalogEntry(state.transportCatalogId);
  const step = catalog.dimensions.length > 20 ? 1.5 : .65;
  return sampleSweptContact(from, to, step, (position) =>
    buildingImpactAt(position.x, position.y, position.z)
  );
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
  const catalog = getAviationCatalogEntry(state.transportCatalogId);
  const flightTuning = resolveAircraftFlightTuning(catalog);
  const groundOffset = planeGroundOffset(catalog);
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
  const operable = state.condition > .05;
  const powerFactor = operable ? clamp(.35 + state.condition * .65, .35, 1) : 0;

  state.throttle = operable
    ? clamp(state.throttle + throttleAdjust * dt * (catalog.aircraftKind === 'rotorcraft' ? .78 : .66), 0, 1)
    : damp(state.throttle, 0, 4.5, dt);
  const groundY = samplePlaneSurface(dt);
  if (catalog.aircraftKind === 'rotorcraft') {
    const forwardCommand = -pitchInput;
    state.yaw += rollInput * dt * 1.15 * catalog.performance.steeringScale;
    state.pitch = damp(state.pitch, -forwardCommand * .2, 4.2, dt);
    state.roll = damp(state.roll, -rollInput * .18, 4.8, dt);
    const horizontalTarget = forwardCommand * Math.min(34, catalog.performance.topSpeed * .23) * catalog.performance.accelerationScale;
    state.speed = damp(state.speed, horizontalTarget, 1.8, dt);
    const desiredClimb = (state.throttle * powerFactor - .52) * 13;
    state.climbRate = damp(state.climbRate, desiredClimb, 2.1, dt);
    if (!state.airborne && state.throttle > .58) state.airborne = true;
    if (state.airborne) state.y += state.climbRate * dt;
    if (state.y <= groundY + groundOffset) {
      state.y = groundY + groundOffset;
      state.airborne = false;
      state.climbRate = Math.max(0, state.climbRate);
    }
  } else {
  if (!state.airborne && pitchInput > 0.2) state.throttle = Math.max(state.throttle, Math.min(0.82, state.throttle + dt * 0.42));
  const catalogTopSpeed = Math.min(240, catalog.performance.topSpeed * .514444 / Math.max(.2, Number(appCtx.METERS_PER_WORLD_UNIT || 1)));
  const targetSpeed = state.throttle * catalogTopSpeed * powerFactor;
  if (!state.airborne) {
    const acceleration = flightTuning.groundAcceleration * catalog.performance.accelerationScale;
    const deceleration = acceleration * 0.42;
    const speedDelta = targetSpeed - state.speed;
    const maximumDelta = (speedDelta >= 0 ? acceleration : deceleration) * dt;
    state.speed += clamp(speedDelta, -maximumDelta, maximumDelta);
  }
  if (brake && !state.airborne) state.speed *= Math.exp(-5.8 * dt);

  if (!state.airborne) {
    state.pitch = damp(state.pitch, clamp(pitchInput * 0.16, -0.12, 0.18), 3.5, dt);
    state.roll = damp(state.roll, 0, 6, dt);
    state.pitchRate = 0;
    state.rollRate = 0;
    const steerScale = clamp(state.speed / Math.max(8, catalog.performance.turningRadius), 0.2, 1);
    state.yaw += rollInput * dt * 1.02 * steerScale * catalog.performance.steeringScale;
    state.y = damp(state.y, groundY + groundOffset, 12, dt);
    const takeoffSpeed = flightTuning.rotationSpeed;
    if (state.speed > takeoffSpeed && pitchInput > 0.2) {
      state.airborne = true;
      state.climbRate = Math.max(.35, state.climbRate);
    }
    state.horizontalSpeed = state.speed;
    state.flightPathAngle = 0;
    state.angleOfAttack = state.pitch;
    state.liftLoad = 0;
    state.turnRate = 0;
    state.stalled = false;
  } else {
    const controlAuthority = clamp(state.speed / Math.max(10, flightTuning.stallSpeed * 1.2), 0.28, 1.15) * catalog.performance.steeringScale;
    const stallBlend = clamp((flightTuning.stallSpeed - state.speed) / Math.max(4, flightTuning.stallSpeed * .35), 0, 1);
    const previousRoll = state.roll;
    const attitude = integrateAerobaticAttitude(state, {
      pitch: pitchInput * flightTuning.pitchControl,
      roll: (Math.abs(aerobaticRollInput) > 0.05 ? aerobaticRollInput : rollInput) * flightTuning.rollControl,
      aerobaticRoll: aerobaticRollInput,
      authority: controlAuthority,
      stallBlend
    }, dt);
    const ordinaryPitchLimit = flightTuning.maxPitch;
    state.pitch = Math.abs(aerobaticRollInput) > .05
      ? attitude.pitch
      : clamp(attitude.pitch, -ordinaryPitchLimit, ordinaryPitchLimit);
    state.roll = Math.abs(aerobaticRollInput) > .05
      ? attitude.roll
      : clamp(attitude.roll, -flightTuning.maxBank, flightTuning.maxBank);
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
    const flight = integrateFixedWingFlight(state, {
      throttle: state.throttle,
      powerFactor,
      topSpeed: catalogTopSpeed
    }, catalog, dt);
    state.speed = flight.speed;
    state.climbRate = flight.climbRate;
    state.horizontalSpeed = flight.horizontalSpeed;
    state.flightPathAngle = flight.flightPathAngle;
    state.angleOfAttack = flight.angleOfAttack;
    state.liftLoad = flight.liftLoad;
    state.turnRate = Math.abs(aerobaticRollInput) > .05
      ? aircraftBankTurnFactor(state.roll, state.rollRate) * .18
      : flight.turnRate;
    state.stalled = flight.stalled;
    state.yaw += state.turnRate * dt;
    state.y += state.climbRate * dt;
    if (state.y <= groundY + groundOffset) {
      state.y = groundY + groundOffset;
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
  }

  const flightForward = aircraftForwardVector(state.yaw, catalog.aircraftKind === 'rotorcraft' ? state.pitch : 0);
  const travelSpeed = catalog.aircraftKind === 'rotorcraft' ? state.speed : state.horizontalSpeed;
  state.x += flightForward.x * travelSpeed * dt;
  state.z += flightForward.z * travelSpeed * dt;
  const horizontalMovement = Math.hypot(state.x - previousX, state.z - previousZ);
  const impact = horizontalMovement > 0.05 && state.y - groundY < 520 ?
    sweptBuildingImpact(
      { x: previousX, y: previousY, z: previousZ },
      { x: state.x, y: state.y, z: state.z }
    ) :
    null;
  if (impact) {
    state.lastImpactAt = performance.now();
    state.lastImpactSpeed = state.speed;
    state.x = impact.lastSafe.x;
    state.y = impact.lastSafe.y;
    state.z = impact.lastSafe.z;
    state.speed = Math.min(2.5, state.speed * 0.12);
    state.throttle = 0;
    state.climbRate = Math.max(0, state.climbRate * 0.2);
    state.pitch = damp(state.pitch, 0, 8, dt);
    state.roll = damp(state.roll, 0, 8, dt);
    state.pitchRate = 0;
    state.rollRate = 0;
    applyTransportDamage(state, Math.max(12, state.lastImpactSpeed * 3.2), {
      resistance: state.resistance,
      durabilityPolicy: state.durabilityPolicy
    });
  }
  const localGround = groundY;
  state.y = clamp(state.y, localGround + groundOffset, localGround + 1400);
  if (state.airborne && state.y <= localGround + groundOffset + .01) state.airborne = false;
  const elapsed = Math.max(0.001, dt);
  state.vx = (state.x - previousX) / elapsed;
  state.vy = (state.y - previousY) / elapsed;
  state.vz = (state.z - previousZ) / elapsed;
  state.contactKind = surfaceSample.kind;
  state.contactBuildingId = String(surfaceSample.building?.sourceBuildingId || '');

  updateAircraftVisual(state.visual, state.condition, dt * (.25 + state.throttle));
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
  const catalog = getAviationCatalogEntry(state.transportCatalogId);
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
    const cockpitOffset = catalog.aircraftKind === 'rotorcraft' ? catalog.dimensions.length * .16 : catalog.dimensions.length * .29;
    appCtx.camera.position.set(flightPose.x + forward.x * cockpitOffset, flightPose.y + catalog.dimensions.height * .2, flightPose.z + forward.z * cockpitOffset);
    appCtx.camera.lookAt(flightPose.x + forward.x * Math.max(18, catalog.dimensions.length * .7), lookY, flightPose.z + forward.z * Math.max(18, catalog.dimensions.length * .7));
  } else if (appCtx.camMode === 2) {
    appCtx.camera.position.set(flightPose.x, flightPose.y + Math.max(24, catalog.dimensions.wingspan * .7), flightPose.z - 2);
    appCtx.camera.lookAt(flightPose.x + forward.x * 5, flightPose.y, flightPose.z + forward.z * 5);
  } else {
    const distance = Math.max(12, catalog.dimensions.length * .62, catalog.dimensions.wingspan * .34) + clamp(Math.abs(state.speed) / 18, 0, 8);
    const cameraHeight = Math.max(4.2, catalog.dimensions.height * .58) + Math.sin(state.cameraPitch) * Math.max(6, catalog.dimensions.height * .35);
    const chaseOffset = aircraftChaseOffset(viewYaw, flightPose.pitch, distance, cameraHeight);
    const targetX = flightPose.x + chaseOffset.x;
    const targetY = flightPose.y + chaseOffset.y;
    const targetZ = flightPose.z + chaseOffset.z;
    const blend = cameraSmoothingBlend(12, dt);
    appCtx.camera.position.x += (targetX - appCtx.camera.position.x) * blend;
    appCtx.camera.position.y += (targetY - appCtx.camera.position.y) * blend;
    appCtx.camera.position.z += (targetZ - appCtx.camera.position.z) * blend;
    const targetLookX = flightPose.x + forward.x * 3;
    const targetLookY = flightPose.y + 0.4;
    const targetLookZ = flightPose.z + forward.z * 3;
    const lookTarget = appCtx.camera.userData.planeLookTarget || {
      x: targetLookX,
      y: targetLookY,
      z: targetLookZ
    };
    appCtx.camera.userData.planeLookTarget = lookTarget;
    const lookBlend = cameraSmoothingBlend(14, dt);
    lookTarget.x += (targetLookX - lookTarget.x) * lookBlend;
    lookTarget.y += (targetLookY - lookTarget.y) * lookBlend;
    lookTarget.z += (targetLookZ - lookTarget.z) * lookBlend;
    appCtx.camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z);
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
    climbRate: state.climbRate,
    horizontalSpeed: state.horizontalSpeed,
    flightPathAngle: state.flightPathAngle,
    angleOfAttack: state.angleOfAttack,
    liftLoad: state.liftLoad,
    turnRate: state.turnRate,
    stalled: state.stalled,
    airborne: state.airborne,
    contactKind: state.contactKind,
    contactBuildingId: state.contactBuildingId,
    launchKind: state.launchKind,
    launchClearanceY: state.launchClearanceY,
    lastImpactAt: state.lastImpactAt,
    lastImpactSpeed: state.lastImpactSpeed
    ,transportEntityId: state.transportEntityId
    ,transportCatalogId: state.transportCatalogId
    ,condition: state.condition
    ,durabilityPolicy: state.durabilityPolicy
    ,operable: state.condition > .05
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
