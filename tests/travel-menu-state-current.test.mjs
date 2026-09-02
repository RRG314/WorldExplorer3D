import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTravelMenuState } from '../app/js/travel/menu-state.js';

const allModes = () => true;

test('Earth exposes one clear craft action for each space-travel role', () => {
  const state = resolveTravelMenuState({ environment: 'EARTH', earthEnvironment: 'EARTH', supports: allModes });
  assert.deepEqual(state.pathfinder, { visible: true, label: '🛸 Deploy Pathfinder Pod' });
  assert.deepEqual(state.boardStarship, { visible: true, label: '🛰️ Board Solis Reach Directly' });
  assert.deepEqual(state.freeSpaceFlight, { visible: true, label: '✦ Enter Free Space Flight' });
  assert.deepEqual(state.quickTrip, { visible: true, label: '🌙 Quick Trip to the Moon' });
  assert.equal(state.earth.visible, false);
  assert.equal(state.ocean.visible, true);
});

test('Moon publishes only its return action instead of competing Earth actions', () => {
  const state = resolveTravelMenuState({
    environment: 'MOON',
    earthEnvironment: 'EARTH',
    moonEnvironment: 'MOON',
    supports: allModes
  });
  assert.equal(state.pathfinder.visible, false);
  assert.equal(state.boardStarship.visible, false);
  assert.equal(state.freeSpaceFlight.visible, false);
  assert.deepEqual(state.quickTrip, { visible: true, label: '🌍 Return to Earth' });
  assert.equal(state.earth.visible, true);
  assert.equal(state.ocean.visible, false);
});

test('planetary capability rules suppress space actions at the state boundary', () => {
  const state = resolveTravelMenuState({
    environment: 'EARTH',
    earthEnvironment: 'EARTH',
    supports: (mode) => mode !== 'space'
  });
  assert.equal(state.pathfinder.visible, false);
  assert.equal(state.boardStarship.visible, false);
  assert.equal(state.freeSpaceFlight.visible, false);
  assert.equal(state.quickTrip.visible, false);
});

test('Earth reports a staged Pathfinder without creating another travel action', () => {
  const state = resolveTravelMenuState({
    environment: 'EARTH',
    earthEnvironment: 'EARTH',
    pathfinderStaged: true,
    supports: allModes
  });
  assert.deepEqual(state.pathfinder, { visible: true, label: '🛸 Pathfinder Ready Nearby' });
});
