import assert from 'node:assert/strict';
import { ctx } from '../app/js/shared-context.js?v=55';
import {
  clearControlInputState,
  readControlActions
} from '../app/js/controls/action-input.js';
import { createBoatModePolicy } from '../app/js/boat-mode/policy.js';
import { getReferencePosition } from '../app/js/boat-mode/water-query.js';

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
  boatLocksOffshoreModeSwitches: true,
  explicitNearShoreExitStillWorks: true,
  groundedPlaneAndDroneCanFindNearbyBoats: true
}, null, 2));
