import assert from 'node:assert/strict';
import { ctx } from '../app/js/shared-context.js?v=55';
import {
  clearControlInputState,
  keyboardControlActions,
  readControlActions
} from '../app/js/controls/action-input.js';
import {
  arcadeSteeringYawTarget,
  aircraftBankTurnFactor,
  aircraftChaseOffset,
  aircraftForwardVector,
  integrateAerobaticAttitude,
  nextPrimaryTravelMode,
  resolveCarDriveCommand
} from '../app/js/controls/traversal-control-policy.js';
import { createBoatModePolicy } from '../app/js/boat-mode/policy.js';
import { getReferencePosition } from '../app/js/boat-mode/water-query.js';
import { shouldSuppressBoatTerrain } from '../app/js/boat-mode/surface-effects.js';
import fs from 'node:fs';
import { PLANE_MAX_SPEED_MPS } from '../app/js/plane-mode.js';

ctx.keys = {};
ctx.keys.KeyW = true;
ctx.keys.KeyD = true;
let actions = readControlActions('drive');
assert.equal(actions.throttle, 1);
assert.equal(actions.reverse, 0);
assert.equal(actions.steer, -1);

ctx.keys.KeyW = false;
ctx.keys.KeyS = true;
actions = readControlActions('drive');
assert.equal(actions.throttle, 0);
assert.equal(actions.reverse, 1);
assert.equal(actions.steer, -1);

actions = keyboardControlActions({ ArrowLeft: true, ArrowUp: true }, 'drive');
assert.equal(actions.move, 0);
assert.equal(actions.turn, 0);
assert.equal(actions.lookYaw, 1);
assert.equal(actions.lookPitch, 1);

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
assert.equal(reverseYawTarget, forwardYawTarget);

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
assert.match(planeSource, /appCtx\.camMode === 1 && state\.mesh/);
assert.match(planeSource, /else \{\s*appCtx\.camera\.up\.set\(0, 1, 0\)/);

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

assert.equal(shouldSuppressBoatTerrain({
  boatMode: { active: true },
  worldLoadRuntimeState: { groundMode: 'open-ocean-surface-only' }
}), true);
assert.equal(shouldSuppressBoatTerrain({
  boatMode: { active: true },
  worldLoadRuntimeState: { groundMode: 'accepted-terrain' }
}), false);
assert.equal(shouldSuppressBoatTerrain({
  boatMode: { active: false },
  worldLoadRuntimeState: { groundMode: 'open-ocean-surface-only' }
}), false);

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
  wasdMovementArrowCameraSeparated: true,
  primaryModeOrderCharacterCarPlaneDrone: true,
  directionChangesBrakeBeforeGearChange: true,
  reverseSteeringKeepsInputSign: true,
  droneUsesV31TurnAndIndependentCameraControls: true,
  aerobaticRollAndLoopAuthority: true,
  normalPlaneTurnUsesBoundedCoordinatedBank: true,
  fasterPlaneFlightEnvelope: true,
  activeBarrelRollsDoNotChangeHeading: true,
  aerobaticForwardVectorRemainsBodyRelative: true,
  aerobaticChaseCameraRemainsLoopStable: true,
  chaseAndOverheadPlaneCamerasRemainHorizonStable: true,
  boatLocksOffshoreModeSwitches: true,
  openOceanFallbackTerrainSuppressed: true,
  explicitNearShoreExitStillWorks: true,
  groundedPlaneAndDroneCanFindNearbyBoats: true
}, null, 2));
