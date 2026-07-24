import assert from 'node:assert/strict';
import { boatPromptBlockedBySubgradeTravel } from '../app/js/boat-mode/prompt-policy.js';

const context = (terrainMode, overrides = {}) => ({
  boatMode: { active: false },
  oceanMode: { active: false },
  droneMode: false,
  car: { road: { structureSemantics: { terrainMode } } },
  Walk: { state: { mode: 'drive', walker: null } },
  ...overrides
});

assert.equal(boatPromptBlockedBySubgradeTravel(context('subgrade')), true);
assert.equal(boatPromptBlockedBySubgradeTravel(context('at_grade')), false);
assert.equal(boatPromptBlockedBySubgradeTravel(context('subgrade', { droneMode: true })), false);
assert.equal(boatPromptBlockedBySubgradeTravel(context('subgrade', { boatMode: { active: true } })), false);
assert.equal(boatPromptBlockedBySubgradeTravel(context('subgrade', { oceanMode: { active: true } })), false);
assert.equal(boatPromptBlockedBySubgradeTravel(context('at_grade', {
  Walk: {
    state: {
      mode: 'walk',
      walker: { road: { structureSemantics: { terrainMode: 'subgrade' } } }
    }
  }
})), true);

console.log('Boat prompt subgrade policy passed');
