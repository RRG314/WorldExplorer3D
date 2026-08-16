import assert from 'node:assert/strict';
import { ctx } from '../app/js/shared-context.js?v=55';
import {
  clearControlInputState,
  consumePlaneBarrelRollTrigger,
  keyboardControlActions,
  registerPlaneTurnTap,
  readControlActions
} from '../app/js/controls/action-input.js';
import {
  MAX_STEERING_ANGLE_RAD,
  arcadeSteeringYawTarget,
  earthDrivingSteeringProfile,
  aircraftBankTurnFactor,
  aircraftChaseOffset,
  aircraftForwardVector,
  cameraSmoothingBlend,
  integrateAerobaticAttitude,
  nextPrimaryTravelMode,
  projectSteeringArc,
  resolveCarDriveCommand
} from '../app/js/controls/traversal-control-policy.js';

const smoothForOneSecond = (framesPerSecond) => {
  let current = 0;
  for (let frame = 0; frame < framesPerSecond; frame += 1) {
    current += (100 - current) * cameraSmoothingBlend(8, 1 / framesPerSecond);
  }
  return current;
};
const smoothForDuration = (rate, seconds, framesPerSecond = 60) => {
  let current = 0;
  const frames = Math.round(seconds * framesPerSecond);
  for (let frame = 0; frame < frames; frame += 1) {
    current += (100 - current) * cameraSmoothingBlend(rate, 1 / framesPerSecond);
  }
  return current;
};
assert(Math.abs(smoothForOneSecond(30) - smoothForOneSecond(60)) < 1e-9,
  'camera damping changed with the rendered frame rate');
assert(Math.abs(smoothForOneSecond(60) - smoothForOneSecond(120)) < 1e-9,
  'camera damping changed at high refresh rates');
assert(smoothForDuration(60, 0.1) > 99.7,
  'car chase response must stay close to the previously deployed 0.7-per-frame feel');
assert(smoothForDuration(12, 0.25) > 95,
  'plane chase response must not visibly trail a moving aircraft');
import { createBoatModePolicy } from '../app/js/boat-mode/policy.js';
import { getReferencePosition } from '../app/js/boat-mode/water-query.js';
import {
  createEarthVehicleGroundContactSampler,
  sampleEarthVehicleGroundContact,
  stabilizeEarthVehicleSurfaceY
} from '../app/js/physics/vehicle-surface.js';
import {
  findSweptVehicleBuildingCollision,
  isVehicleBuildingCollisionBlocking,
  VEHICLE_COLLISION_PROFILE
} from '../app/js/physics/building-collision-response.js';
import { createBuildingCollisionQuery } from '../app/js/physics/building-collision.js';
import { resolveChaseCameraTerrainCollision } from '../app/js/hud/chase-camera-terrain.js';
import { createWalkingPhysicsHelpers } from '../app/js/walking/physics.js';
import fs from 'node:fs';
import { PLANE_MAX_SPEED_MPS } from '../app/js/plane-mode.js';

ctx.keys = {};
ctx.keys.ArrowUp = true;
ctx.keys.ArrowRight = true;
let actions = readControlActions('drive');
assert.equal(actions.throttle, 1);
assert.equal(actions.reverse, 0);
assert.equal(actions.steer, -1);

ctx.keys.ArrowUp = false;
ctx.keys.ArrowDown = true;
actions = readControlActions('drive');
assert.equal(actions.throttle, 0);
assert.equal(actions.reverse, 1);
assert.equal(actions.steer, -1);

actions = keyboardControlActions({ KeyA: true, KeyW: true }, 'drive');
assert.equal(actions.move, 0);
assert.equal(actions.turn, 0);
assert.equal(actions.lookYaw, 1);
assert.equal(actions.lookPitch, 1);

const sweptCar = { x: 0, y: 1.2, z: 0, road: null };
const sweptCollision = findSweptVehicleBuildingCollision(
  { car: sweptCar },
  (x) => x >= 9.5 && x <= 10.5
    ? {
        collision: true,
        inside: false,
        penetration: 0.2,
        pushX: -1,
        pushZ: 0,
        building: { colliderDetail: 'full' }
      }
    : { collision: false },
  0,
  0,
  20,
  0,
  0
);
assert.ok(sweptCollision, 'swept collision missed a thin building between frame endpoints');
assert.ok(sweptCollision.x >= 9.5 && sweptCollision.x <= 10.5);
assert.ok(sweptCollision.lastSafeX < 9.5);

const longFrameCollision = findSweptVehicleBuildingCollision(
  { car: sweptCar },
  (x) => x >= 89.1 && x <= 89.35
    ? {
        collision: true,
        inside: false,
        penetration: 0.1,
        pushX: -1,
        pushZ: 0,
        building: { colliderDetail: 'full' }
      }
    : { collision: false },
  0,
  0,
  120,
  0,
  0
);
assert.ok(longFrameCollision, 'a long frame step must not tunnel through a thin building wall');

const overlappingGhost = {
  minX: -2, maxX: 2, minZ: -2, maxZ: 2,
  minY: 0, maxY: 10,
  pts: [{ x: -2, z: -2 }, { x: 2, z: -2 }, { x: 2, z: 2 }, { x: -2, z: 2 }],
  colliderDetail: 'bbox'
};
const overlappingBuilding = {
  ...overlappingGhost,
  colliderDetail: 'full',
  buildingType: 'commercial'
};
const overlapQuery = createBuildingCollisionQuery({
  buildings: [overlappingGhost, overlappingBuilding],
  getNearbyBuildings: () => [overlappingGhost, overlappingBuilding],
  pointInPolygon: () => true
});
const acceptedOverlap = overlapQuery(0, 0, 0.92, {
  actorBaseY: 0,
  actorHeight: 1.9,
  acceptCollision: (collision) => collision.building.colliderDetail === 'full'
});
assert.equal(
  acceptedOverlap.building,
  overlappingBuilding,
  'a rejected non-blocking overlap must not hide a later solid building collider'
);

const hillCamera = resolveChaseCameraTerrainCollision(
  { x: 0, y: 0.5, z: 0 },
  { x: 0, y: 5, z: -10 },
  (_x, z) => z < -4 ? 4.2 : 0
);
assert.equal(hillCamera.collided, true, 'steep terrain between the car and camera must shorten the chase arm');
assert.ok(hillCamera.z > -4, 'the resolved chase camera must remain in front of the steep terrain crossing');
assert.equal(
  resolveChaseCameraTerrainCollision(
    { x: 0, y: 0.5, z: 0 },
    { x: 0, y: 5, z: -10 },
    () => 0
  ).collided,
  false,
  'flat terrain must not change chase-camera framing'
);

const mappedRoadCore = { dist: 0, road: { width: 12 } };
assert.equal(
  isVehicleBuildingCollisionBlocking({
    collision: true,
    inside: true,
    penetration: 1,
    building: { colliderDetail: 'full', buildingType: 'commercial' }
  }, mappedRoadCore),
  true,
  'a full mapped building became non-colliding merely because a road centerline crossed it'
);
assert.equal(
  isVehicleBuildingCollisionBlocking({
    collision: true,
    inside: true,
    penetration: 0.4,
    building: { colliderDetail: 'bbox' }
  }, mappedRoadCore),
  false,
  'a coarse road-overlap collider should remain suppressible until exact geometry replaces it'
);
assert.equal(
  isVehicleBuildingCollisionBlocking({
    collision: true,
    inside: false,
    penetration: 0.5,
    building: {
      colliderDetail: 'full',
      geometrySource: 'compiled_transport_structures',
      structureColliderKind: 'side_wall'
    }
  }, mappedRoadCore),
  false,
  'a neighboring parallel tunnel shell must not block another mapped tunnel centerline'
);
assert.equal(
  isVehicleBuildingCollisionBlocking({
    collision: true,
    inside: false,
    penetration: 0.5,
    building: {
      colliderDetail: 'full',
      geometrySource: 'compiled_transport_structures',
      structureColliderKind: 'side_wall'
    }
  }, { dist: 6.8, road: { width: 10 } }),
  true,
  'a tunnel wall outside every road core must stop the vehicle'
);

const narrowBridgeCar = { x: 0, y: 1.2, z: 0, angle: 0, road: null };
let largestBridgeProbeRadius = 0;
const narrowBridgeCollision = findSweptVehicleBuildingCollision(
  { car: narrowBridgeCar },
  (x, z, radius) => {
    largestBridgeProbeRadius = Math.max(largestBridgeProbeRadius, radius);
    const touchesBarrier = Math.abs(x) + radius >= 1.5;
    return touchesBarrier
      ? {
          collision: true,
          inside: false,
          penetration: 0.1,
          pushX: x < 0 ? 1 : -1,
          pushZ: 0,
          building: { colliderDetail: 'full', buildingType: 'bridge_guardrail' }
        }
      : { collision: false };
  },
  0,
  0,
  0,
  8,
  0
);
assert.equal(narrowBridgeCollision, null, 'a 1.8 m car must fit within a 3 m protected bridge deck');
assert.equal(largestBridgeProbeRadius, VEHICLE_COLLISION_PROFILE.radius);
assert.ok(
  VEHICLE_COLLISION_PROFILE.radius * 2 <= 1.9,
  'vehicle collision width must remain aligned with the rendered 1.8 m body'
);

const sharedCollisionBeforeWalkContract = ctx.checkBuildingCollision;
const blockCollisionBeforeWalkContract = ctx.getBuildCollisionAtWorldXZ;
const readActionsBeforeWalkContract = ctx.readControlActions;
const onMoonBeforeWalkContract = ctx.onMoon;
const onMarsBeforeWalkContract = ctx.onMars;
let sharedWalkCollisionCalls = 0;
const walkState = {
  walker: {
    x: 0,
    y: 1.7,
    z: 0,
    angle: 0,
    yaw: 0,
    lookYawOffset: 0,
    pitch: 0,
    speedMph: 0,
    vy: 0,
    onGround: true,
    wallJumpTimer: 0,
    onBuilding: false
  },
  characterMesh: null
};
try {
  ctx.checkBuildingCollision = () => {
    sharedWalkCollisionCalls += 1;
    return { collision: false };
  };
  ctx.getBuildCollisionAtWorldXZ = undefined;
  ctx.readControlActions = () => ({ move: 1 });
  ctx.onMoon = false;
  ctx.onMars = false;
  const walkingPhysics = createWalkingPhysicsHelpers({
    CFG: {
      walkSpeed: 6,
      runSpeed: 12,
      turnSpeed: 2.6,
      eyeHeight: 1.7,
      blockStepHeight: 0.65,
      wallJumpVelocity: 7.2,
      wallJumpOutward: 0.28,
      wallDetectRadius: 1.65,
      wallJumpCooldown: 0.18
    },
    animateCharacterWalk: () => {},
    getBuildingsArray: () => [{
      minX: -1,
      maxX: 1,
      minZ: -1,
      maxZ: 1,
      minY: 0,
      maxY: 3,
      pts: [{ x: -1, z: -1 }, { x: 1, z: -1 }, { x: 1, z: 1 }, { x: -1, z: 1 }]
    }],
    getNearbyBuildings: null,
    getWalkGroundY: () => 0,
    isPointInPolygon: () => true,
    keys: {},
    state: walkState
  });
  walkingPhysics.updateWalkPhysics(1 / 60, (value, fallback = 0) => Number.isFinite(value) ? value : fallback);
} finally {
  ctx.checkBuildingCollision = sharedCollisionBeforeWalkContract;
  ctx.getBuildCollisionAtWorldXZ = blockCollisionBeforeWalkContract;
  ctx.readControlActions = readActionsBeforeWalkContract;
  ctx.onMoon = onMoonBeforeWalkContract;
  ctx.onMars = onMarsBeforeWalkContract;
}
assert.ok(sharedWalkCollisionCalls > 0, 'walking bypassed the shared building collision authority');
assert.ok(walkState.walker.z > 0.09, 'a duplicate walking collision path overruled the shared collision result');

actions = keyboardControlActions({ KeyA: true, ArrowLeft: true }, 'drone');
assert.equal(actions.turn, 1);
assert.equal(actions.strafe, 0);
assert.equal(actions.lookYaw, 1);
actions = keyboardControlActions({ KeyD: true, KeyW: true, ArrowRight: true, ArrowUp: true }, 'drone');
assert.equal(actions.move, 1);
assert.equal(actions.turn, -1);
assert.equal(actions.lookYaw, -1);
assert.equal(actions.lookPitch, 1);

actions = keyboardControlActions({ ArrowDown: true, ArrowRight: true, Space: true }, 'plane');
assert.equal(actions.pitch, 1);
assert.equal(actions.roll, -1);
assert.equal(actions.aerobaticRoll, 0);
assert.equal(actions.throttleAdjust, 1);
assert.equal(actions.brake, 0);
actions = keyboardControlActions({ ShiftLeft: true, ControlLeft: true }, 'plane');
assert.equal(actions.throttleAdjust, -1);
assert.equal(actions.brake, 1);
actions = keyboardControlActions({ ControlLeft: true, ArrowRight: true }, 'plane');
assert.equal(actions.roll, -1);
assert.equal(actions.aerobaticRoll, -1);

assert.equal(nextPrimaryTravelMode('walk'), 'drive');
assert.equal(nextPrimaryTravelMode('drive'), 'plane');
assert.equal(nextPrimaryTravelMode('plane'), 'drone');
assert.equal(nextPrimaryTravelMode('drone'), 'walk');
assert.equal(PLANE_MAX_SPEED_MPS, 84);
assert.ok(PLANE_MAX_SPEED_MPS * 2.237 > 185, 'plane full-throttle speed did not reach the faster flight envelope');

let command = resolveCarDriveCommand({ speed: 12, reverse: 1 });
assert.equal(command.serviceBrake, true);
assert.equal(command.reverse, 0);
command = resolveCarDriveCommand({ speed: 0, reverse: 1 });
assert.equal(command.serviceBrake, false);
assert.equal(command.reverse, 1);
command = resolveCarDriveCommand({ speed: -8, throttle: 1 });
assert.equal(command.serviceBrake, true);
assert.equal(command.forward, 0);

const forwardYawTarget = arcadeSteeringYawTarget(12, 0.25, 2.6, 2);
const reverseYawTarget = arcadeSteeringYawTarget(-12, 0.25, 2.6, 2);
assert.ok(forwardYawTarget > 0);
assert.equal(reverseYawTarget, -forwardYawTarget);
const forwardLeftArc = projectSteeringArc(12, 0.25, 0.25, 2.6);
const reverseLeftArc = projectSteeringArc(-12, 0.25, 0.25, 2.6);
assert.ok(forwardLeftArc.x > 0, `forward-left arc moved to the wrong side: ${JSON.stringify(forwardLeftArc)}`);
assert.ok(reverseLeftArc.x > 0, `reverse-left rear trajectory moved to the wrong side: ${JSON.stringify(reverseLeftArc)}`);
assert.ok(forwardLeftArc.angle > 0 && reverseLeftArc.angle < 0, 'reverse chassis yaw did not invert');
assert.ok(MAX_STEERING_ANGLE_RAD < Math.PI / 2);
assert.ok(arcadeSteeringYawTarget(-3, 1.8, 2.6, 3) < 0, 'extreme reverse steering crossed the tangent singularity');
assert.ok(arcadeSteeringYawTarget(-3, -1.8, 2.6, 3) > 0, 'extreme reverse-right steering crossed the tangent singularity');
const highwaySteering = earthDrivingSteeringProfile(95);
assert.ok(highwaySteering.maxSteeringAngle >= 0.4, 'high-speed steering angle is too weak for arcade driving');
assert.ok(highwaySteering.maxYawRate >= 1.0, 'high-speed yaw authority is too weak for evasive turns');
const steepGroundContact = sampleEarthVehicleGroundContact({
  SurfaceQuery: {
    driveAt: (x, z) => ({ position: { y: 20 + x * 0.7 + z * 0.25 } })
  }
}, { x: 0, z: 0, angle: 0, currentY: 20 });
assert.equal(steepGroundContact.sampleCount, 5);
assert.ok(steepGroundContact.supportY > steepGroundContact.centerY, 'vehicle footprint did not retain uphill support');
assert.ok(Math.abs(steepGroundContact.pitch) > 0.1, 'vehicle did not align to the steep longitudinal grade');
assert.ok(Math.abs(steepGroundContact.roll) > 0.1, 'vehicle did not align to the steep cross-grade');
const mountainRoad = { id: 'mountain-road' };
const mountainRoadContact = sampleEarthVehicleGroundContact({
  SurfaceQuery: {
    driveAt: (x, z) => {
      const lateralTerrain = Math.abs(x) > 0.5;
      return lateralTerrain
        ? { kind: 'terrain', position: { y: x > 0 ? 48 : 8 } }
        : { kind: 'road', feature: mountainRoad, position: { y: 20 + z * 0.12 } };
    }
  }
}, { x: 0, z: 0, angle: 0, currentY: 20, preferRoad: true });
assert.equal(mountainRoadContact.roadCentered, true);
assert.equal(mountainRoadContact.sampleCount, 5);
assert.equal(mountainRoadContact.supportSampleCount, 3);
assert.ok(mountainRoadContact.supportY < 21, 'adjacent mountainside lifted the road-centered car');
assert.ok(Math.abs(mountainRoadContact.roll) < 1e-9, 'adjacent mountainside rolled the road-centered car');
assert.ok(Math.abs(mountainRoadContact.pitch) > 0.05, 'road grade was lost while filtering mountainside probes');
assert.ok(
  stabilizeEarthVehicleSurfaceY(0, 120, 1 / 60, 40) > 119,
  'one transient low terrain sample could still drop the car through a steep surface'
);
assert.equal(
  stabilizeEarthVehicleSurfaceY(-6.07, null, 1 / 60, 0),
  -6.07,
  'a reset vehicle surface must accept a below-sea-level tunnel spawn immediately'
);

let cachedGroundQueries = 0;
const cachedGroundOptions = [];
const cachedGroundSampler = createEarthVehicleGroundContactSampler({
  SurfaceQuery: {
    driveAt: (x, z, options) => {
      cachedGroundQueries += 1;
      cachedGroundOptions.push(options);
      return { kind: 'road', position: { y: 12 + z * 0.1 } };
    }
  }
});
cachedGroundSampler.sample({ x: 0, z: 0, angle: 0 }, 1 / 45, 100);
assert.equal(cachedGroundQueries, 5, 'initial vehicle footprint did not sample all contact points');
assert.ok(cachedGroundOptions.every((options) => options.sampleRenderedMesh === false), 'vehicle footprint still requested rendered road-mesh raycasts');
assert.equal(cachedGroundOptions.filter((options) => options.preferredRoadOnly).length, 4, 'wheelbase probes did not reuse the current compiled road');
cachedGroundSampler.sample({ x: 0.5, z: 0, angle: 0.02 }, 1 / 45, 100);
assert.equal(cachedGroundQueries, 5, 'recursive physics substep repeated the rendered-frame footprint query');
cachedGroundSampler.sample({ x: 0.8, z: 0, angle: 0.03 }, 1 / 60, 101);
assert.equal(cachedGroundQueries, 10, 'elapsed ground-contact cache did not refresh on the next eligible frame');
cachedGroundSampler.sample({ x: 5, z: 0, angle: 0.03 }, 1 / 240, 102);
assert.equal(cachedGroundQueries, 15, 'large vehicle movement did not refresh ground contact immediately');
cachedGroundSampler.reset();
cachedGroundSampler.sample({ x: 5, z: 0, angle: 0.03 }, 0, 103);
assert.equal(cachedGroundQueries, 20, 'ground-contact cache reset did not force a fresh sample');

clearControlInputState('double-tap-contract');
assert.equal(registerPlaneTurnTap('ArrowRight', 1000), 0);
assert.equal(registerPlaneTurnTap('ArrowRight', 1220), -1);
assert.equal(consumePlaneBarrelRollTrigger(), -1);
assert.equal(consumePlaneBarrelRollTrigger(), 0);
assert.equal(registerPlaneTurnTap('ArrowLeft', 2000), 0);
assert.equal(registerPlaneTurnTap('ArrowLeft', 2500), 0, 'slow plane turn taps must remain normal turns');

const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
let rollAttitude = { pitch: 0, roll: 0, pitchRate: 0, rollRate: 0 };
let normalTurnHeading = 0;
for (let index = 0; index < 360; index += 1) {
  rollAttitude = integrateAerobaticAttitude(rollAttitude, { roll: 1, authority: 1.1 }, 1 / 60);
  normalTurnHeading += Math.sin(rollAttitude.roll) * (1 / 60);
}
assert.ok(rollAttitude.roll > 0.58 && rollAttitude.roll < 0.64, `normal bank escaped its turn limit: ${rollAttitude.roll}`);
assert.equal(rollAttitude.rollRate, 0);
assert.ok(normalTurnHeading > 2.5, `bounded bank failed to produce a sustained coordinated turn: ${normalTurnHeading}`);

rollAttitude = { pitch: 0, roll: 0, pitchRate: 0, rollRate: 0 };
let accumulatedRoll = 0;
for (let index = 0; index < 360; index += 1) {
  const next = integrateAerobaticAttitude(rollAttitude, { roll: 1, aerobaticRoll: 1, authority: 1.1 }, 1 / 60);
  accumulatedRoll += angleDelta(rollAttitude.roll, next.roll);
  rollAttitude = next;
}
assert.ok(accumulatedRoll > Math.PI * 2, `barrel roll authority only reached ${accumulatedRoll}`);
assert.equal(aircraftBankTurnFactor(Math.PI / 2, 1.2), 0);
assert.ok(aircraftBankTurnFactor(Math.PI / 4, 0) > 0.7);

let loopAttitude = { pitch: 0, roll: 0, pitchRate: 0, rollRate: 0 };
let accumulatedPitch = 0;
for (let index = 0; index < 420; index += 1) {
  const next = integrateAerobaticAttitude(loopAttitude, { pitch: 1, authority: 1.1 }, 1 / 60);
  accumulatedPitch += angleDelta(loopAttitude.pitch, next.pitch);
  loopAttitude = next;
}
assert.ok(accumulatedPitch > Math.PI * 2, `loop authority only reached ${accumulatedPitch}`);

const uprightForward = aircraftForwardVector(0.7, 0.2, 0);
const rolledForward = aircraftForwardVector(0.7, 0.2, Math.PI);
assert.deepEqual(rolledForward, uprightForward);
const loopTopForward = aircraftForwardVector(0, Math.PI);
assert.ok(loopTopForward.z < -0.999, `loop-top forward vector reversed incorrectly: ${JSON.stringify(loopTopForward)}`);
const uprightChase = aircraftChaseOffset(0, 0, 12, 4.2);
const loopTopChase = aircraftChaseOffset(0, Math.PI, 12, 4.2);
assert.deepEqual(loopTopChase, uprightChase, 'third-person loop camera must remain heading-locked');

const planeSource = fs.readFileSync(new URL('../app/js/plane-mode.js', import.meta.url), 'utf8');
const hudSource = fs.readFileSync(new URL('../app/js/hud.js', import.meta.url), 'utf8');
assert.match(planeSource, /appCtx\.camMode === 1 && state\.mesh/);
assert.match(planeSource, /else \{\s*appCtx\.camera\.up\.set\(0, 1, 0\)/);
assert.match(planeSource, /cameraSmoothingBlend\(12, dt\)/,
  'plane chase camera lost its responsive time-based rate');
assert.match(hudSource, /CHASE_CAMERA_SMOOTH_RATE = 60/,
  'car chase camera lost its responsive time-based rate');
const chaseCollisionSource = hudSource.match(
  /function resolveChaseCameraStructureCollision[\s\S]*?function locationName/
)?.[0] || '';
assert.match(chaseCollisionSource, /checkBuildingCollision/,
  'chase camera must use the bounded nearby collision index');
assert.doesNotMatch(chaseCollisionSource, /intersectObjects|roadMeshes|elevated_road_shells/,
  'chase camera must not raycast whole regional road or bridge meshes');

clearControlInputState('controller-contract');
actions = readControlActions('drive');
assert.equal(actions.throttle, 0);
assert.equal(actions.reverse, 0);
assert.equal(actions.steer, 0);
assert.equal(actions.brake, 0);

ctx.keys.ArrowUp = true;
ctx.keys.Space = true;
clearControlInputState('focus-lost');
actions = readControlActions('drone');
assert.equal(actions.move, 0);
assert.equal(actions.vertical, 0);

const boatNotices = [];
const boatPolicyContext = {
  boatMode: {
    active: true,
    shorelineDistance: 40
  }
};
const boatPolicy = createBoatModePolicy({
  appCtx: boatPolicyContext,
  exitMaxShorelineDrive: 132,
  exitMaxShorelineWalk: 96,
  minimumBoatShorelineDistance: () => 10,
  promptDurationMs: 1000,
  setPromptSignature: () => {},
  showBoatPrompt: (message) => boatNotices.push(message),
  updateBoatMenuUi: () => {}
});
assert.equal(boatPolicy.canExitBoatMode('drive', { source: 'ui_button', showNotice: true }), false);
assert.match(boatNotices.at(-1), /Boat Mode is locked on the water/);
assert.equal(boatPolicy.canExitBoatMode('drive', { source: 'boat_prompt_exit' }), true);
boatPolicyContext.boatMode.shorelineDistance = 500;
assert.equal(boatPolicy.canExitBoatMode('walk', { source: 'boat_prompt_exit', showNotice: false }), false);

ctx.boatMode = { active: false };
ctx.planeMode = { active: true, airborne: true, x: 3, y: 1, z: 4, yaw: 0.2 };
ctx.droneMode = false;
assert.equal(getReferencePosition(), null);
ctx.planeMode.airborne = false;
assert.equal(getReferencePosition()?.mode, 'plane');
ctx.planeMode.active = false;
ctx.droneMode = true;
ctx.drone = { x: 5, y: 3, z: 7, yaw: 0.4 };
ctx.SurfaceQuery = { walkAt: () => ({ position: { y: 0 } }) };
assert.equal(getReferencePosition()?.mode, 'drone');
ctx.drone.y = 8;
assert.equal(getReferencePosition(), null);

console.log(JSON.stringify({
  ok: true,
  contract: 'phase5-controller-input',
  staleKeyboardStateCleared: true,
  forwardReverseChannelsIndependent: true,
  v31ArrowMovementWasdCameraRestored: true,
  primaryModeOrderCharacterCarPlaneDrone: true,
  directionChangesBrakeBeforeGearChange: true,
  walkingUsesSharedCollisionAuthority: true,
  reverseSteeringKeepsPathDirection: true,
  steeringAngleCannotCrossTangentSingularity: true,
  droneUsesV31TurnAndIndependentCameraControls: true,
  aerobaticRollAndLoopAuthority: true,
  normalPlaneTurnUsesBoundedCoordinatedBank: true,
  planeDoubleTapTriggersBarrelRoll: true,
  fasterPlaneFlightEnvelope: true,
  activeBarrelRollsDoNotChangeHeading: true,
  aerobaticForwardVectorRemainsBodyRelative: true,
  aerobaticChaseCameraRemainsLoopStable: true,
  chaseAndOverheadPlaneCamerasRemainHorizonStable: true,
  chaseCamerasRemainResponsiveWithoutFrameRateDependence: true,
  boatLocksOffshoreModeSwitches: true,
  boatMovementDoesNotSuppressWorld: true,
  explicitNearShoreExitStillWorks: true,
  groundedPlaneAndDroneCanFindNearbyBoats: true
}, null, 2));
