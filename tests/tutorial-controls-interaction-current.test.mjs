import assert from 'node:assert/strict';
import test from 'node:test';

import { ctx as appCtx } from '../app/js/shared-context.js?v=55';
import { pickNearbyEnterableBuildingSupport } from '../app/js/building-entry.js?v=9';
import { keyboardControlActions } from '../app/js/controls/action-input.js?v=12';
import { nextPrimaryTravelMode } from '../app/js/controls/traversal-control-policy.js?v=8';
import {
  defaultKeyboardBindings,
  keyboardBindingCode,
  resetKeyboardBindings,
  setKeyboardBinding
} from '../app/js/controls/keyboard-bindings.js?v=3';
import { interactionFamily } from '../app/js/interaction/context-router.js?v=5';
import { onKey } from '../app/js/input.js';
import { resolveSpaceControlInput } from '../app/js/space/runtime.js?v=34';

if (typeof globalThis.CustomEvent !== 'function') {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, options = {}) {
      super(type);
      this.detail = options.detail;
    }
  };
}

test('conventional defaults drive and walk without consuming camera actions', () => {
  resetKeyboardBindings();
  const defaults = defaultKeyboardBindings();
  assert.equal(defaults.move_forward, 'KeyW');
  assert.equal(defaults.interact, 'KeyE');
  assert.equal(defaults.look_back, 'KeyQ');
  assert.equal(defaults.traversal_mode, 'KeyF');
  assert.equal(defaults.facility_action, 'KeyH');

  const walking = keyboardControlActions({ KeyW: true, KeyD: true }, 'walk');
  assert.equal(walking.move, 1);
  assert.equal(walking.strafe, 1);
  assert.equal(walking.turn, 0);
  assert.equal(walking.lookYaw, 0);

  const driving = keyboardControlActions({ KeyW: true, KeyA: true }, 'drive');
  assert.equal(driving.throttle, 1);
  assert.equal(driving.steer, 1);
});

test('the configurable traversal action keeps the full character, car, plane, and drone cycle', () => {
  assert.equal(nextPrimaryTravelMode('walk'), 'drive');
  assert.equal(nextPrimaryTravelMode('drive'), 'plane');
  assert.equal(nextPrimaryTravelMode('plane'), 'drone');
  assert.equal(nextPrimaryTravelMode('drone'), 'walk');

  const previous = {
    gameStarted: appCtx.gameStarted,
    keyMatchesControlAction: appCtx.keyMatchesControlAction,
    cyclePrimaryTravelMode: appCtx.cyclePrimaryTravelMode,
    toggleWalkDriveMode: appCtx.toggleWalkDriveMode,
    updateControlsModeUI: appCtx.updateControlsModeUI
  };
  let cycleOptions = null;
  let legacyToggleCalled = false;
  let uiUpdates = 0;
  let prevented = false;
  appCtx.gameStarted = true;
  appCtx.keyMatchesControlAction = (code, actionId) => code === 'KeyF' && actionId === 'traversal_mode';
  appCtx.cyclePrimaryTravelMode = (options) => { cycleOptions = options; };
  appCtx.toggleWalkDriveMode = () => { legacyToggleCalled = true; };
  appCtx.updateControlsModeUI = () => { uiUpdates += 1; };

  try {
    onKey('KeyF', {
      repeat: false,
      target: null,
      preventDefault() { prevented = true; }
    });
    assert.deepEqual(cycleOptions, { source: 'keyboard_traversal' });
    assert.equal(legacyToggleCalled, false);
    assert.equal(uiUpdates, 1);
    assert.equal(prevented, true);
  } finally {
    Object.assign(appCtx, previous);
  }
});

test('saved remaps change live control actions and swap collisions', () => {
  resetKeyboardBindings();
  const forward = setKeyboardBinding('move_forward', 'KeyZ');
  assert.equal(forward.ok, true);
  assert.equal(keyboardBindingCode('move_forward'), 'KeyZ');
  assert.equal(keyboardControlActions({ KeyW: true }, 'walk').move, 0);
  assert.equal(keyboardControlActions({ KeyZ: true }, 'walk').move, 1);

  const swapped = setKeyboardBinding('move_forward', 'KeyS');
  assert.equal(swapped.swappedActionId, 'move_backward');
  assert.equal(keyboardBindingCode('move_forward'), 'KeyS');
  assert.equal(keyboardBindingCode('move_backward'), 'KeyZ');
  resetKeyboardBindings();
});

test('space flight consumes the same configurable actions while keeping arrow and touch fallbacks', () => {
  const configured = resolveSpaceControlInput({}, { move: 1, turn: 1, jump: 1, sprint: 0 });
  assert.deepEqual(configured, { yaw: -1, pitch: 1, thrust: true, brake: false });
  const legacyTouch = resolveSpaceControlInput({ arrowright: true, arrowdown: true, shift: true }, {});
  assert.deepEqual(legacyTouch, { yaw: 1, pitch: -1, thrust: false, brake: true });
});

test('building entry prompts require a published door and door-range approach', () => {
  const previous = {
    buildings: appCtx.buildings,
    getNearbyBuildings: appCtx.getNearbyBuildings,
    buildingEntranceByBuilding: appCtx.buildingEntranceByBuilding,
    selectedProperty: appCtx.selectedProperty,
    selectedHistoric: appCtx.selectedHistoric
  };
  const building = {
    sourceBuildingId: 'door-test-building',
    minX: -2, maxX: 2, minZ: -2, maxZ: 2,
    height: 8, buildingType: 'retail'
  };
  appCtx.buildings = [building];
  appCtx.getNearbyBuildings = () => [building];
  appCtx.selectedProperty = null;
  appCtx.selectedHistoric = null;
  appCtx.buildingEntranceByBuilding = new Map();
  assert.equal(pickNearbyEnterableBuildingSupport(0, -2.8, {
    radius: 8.5,
    requireExteriorEntrance: true
  }), null);

  appCtx.buildingEntranceByBuilding.set('door-test-building', {
    x: 0, z: -2, approachX: 0, approachZ: -2.7
  });
  const atDoor = pickNearbyEnterableBuildingSupport(0, -3, {
    radius: 8.5,
    requireExteriorEntrance: true
  });
  assert.equal(atDoor?.support?.key, 'door-test-building');
  assert.ok(atDoor.distance < 1);
  assert.equal(pickNearbyEnterableBuildingSupport(0, -6.2, {
    radius: 8.5,
    requireExteriorEntrance: true
  }), null);

  Object.assign(appCtx, previous);
});

test('interaction familiarity groups repeated prompts by real-world action family', () => {
  assert.equal(interactionFamily('enter_building'), 'building');
  assert.equal(interactionFamily('exit_interior'), 'building');
  assert.equal(interactionFamily('enter_vehicle'), 'vehicle');
  assert.equal(interactionFamily('aircraft_options'), 'vehicle');
  assert.equal(interactionFamily('talk_npc'), 'person');
});
