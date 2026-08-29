import { ctx as appCtx } from "./shared-context.js?v=55";
import { createWalkingCharacterHelpers } from "./walking/character.js?v=2";
import { createWalkingGeometryHelpers } from "./walking/geometry.js?v=1";
import { createWalkingPhysicsHelpers } from "./walking/physics.js?v=22";
import { createWalkingRuntimeHelpers } from "./walking/runtime.js?v=3";
import { createWalkingTerrainHelpers } from "./walking/terrain.js?v=4";

const DEFAULT_WALKING_SPEEDS = Object.freeze({ walk: 2.8, run: 5.6 });

function createWalkingModule(opts) {
  const {
    THREE,
    scene,
    camera,
    keys,
    car,
    carMesh = null,
    getBuildingsArray = null, // Function that returns current buildings array
    getNearbyBuildings = null, // Optional spatial query for nearby buildings
    isPointInPolygon = null
  } = opts;

  if (!THREE || !scene || !camera || !keys || !car) {
    throw new Error("WalkingModule missing required inputs");
  }

  const state = {
    enabled: true,
    mode: "drive",
    view: "third",
    walker: { x: 0, z: 0, y: 0, angle: 0, yaw: 0, lookYawOffset: 0, pitch: 0, speedMph: 0, vy: 0, mobileForward: 0, mobileStrafe: 0, mobileMoveBasisYaw: null, mobileMoveWasActive: false, onGround: true, wallJumpTimer: 0, onBuilding: false },
    characterMesh: null
  };

  const CFG = {
    // Exploration uses a responsive game pace while the HUD still reports the
    // resulting measured world speed. Live GPS translation remains provider-owned.
    walkSpeed: DEFAULT_WALKING_SPEEDS.walk,
    runSpeed: DEFAULT_WALKING_SPEEDS.run,
    turnSpeed: 2.6,
    eyeHeight: 1.7,
    thirdPersonDist: 4.5,
    thirdPersonHeight: 2.2,
    thirdPersonLookAhead: 6.0,
    collisionPushBack: 2.0,
    wallJumpVelocity: 7.2,
    wallJumpOutward: 0.28,
    wallDetectRadius: 1.65,
    wallJumpCooldown: 0.18,
    blockStepHeight: 0.65 // Max step-up without jumping
  };

  const { animateCharacterWalk, createCharacterMesh } = createWalkingCharacterHelpers({ THREE, scene });
  const { clampPointInsideFootprint, pointInPolygonSafe } = createWalkingGeometryHelpers();
  const {
    finiteOr,
    getSafeDriveY,
    getWalkGroundY,
    syncCarFromWalker,
    syncWalkerFromCar
  } = createWalkingTerrainHelpers({ car, state, CFG });
  const { resolveWalkGroundState, updateWalkPhysics } = createWalkingPhysicsHelpers({
    CFG,
    animateCharacterWalk,
    getBuildingsArray,
    getNearbyBuildings,
    getWalkGroundY,
    isPointInPolygon,
    keys,
    state
  });
  const {
    getMapRefPosition,
    setModeDrive,
    setModeWalk,
    toggleView,
    toggleWalk,
    updateWalkCamera
  } = createWalkingRuntimeHelpers({
    CFG,
    camera,
    car,
    carMesh,
    clampPointInsideFootprint,
    createCharacterMesh,
    finiteOr,
    getSafeDriveY,
    getWalkGroundY,
    pointInPolygonSafe,
    resolveWalkGroundState,
    scene,
    state,
    syncCarFromWalker,
    syncWalkerFromCar
  });

  state.characterMesh = createCharacterMesh();
  syncWalkerFromCar();

  return {
    state,
    CFG,
    toggleWalk,
    setModeWalk,
    setModeDrive,
    toggleView,
    update(dt) {
      if (!state.enabled) return;
      if (state.mode === "walk") updateWalkPhysics(dt, finiteOr);
    },
    applyCameraIfWalking() {
      return updateWalkCamera();
    },
    getMapRefPosition
  };
}

Object.assign(appCtx, { createWalkingModule });

export { createWalkingModule, DEFAULT_WALKING_SPEEDS };
