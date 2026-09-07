'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizePlayerConditionInput } = require('../functions/player-state-authority.js');

test('signed-in player condition accepts only bounded health state', () => {
  assert.deepEqual(normalizePlayerConditionInput({ condition: 0.456789, reason: 'impact' }), {
    authority: 'explorer-player-state-v1', schemaVersion: 1, condition: 0.4568, reason: 'impact'
  });
  assert.throws(() => normalizePlayerConditionInput({ condition: -0.1 }), /invalid_player_condition/);
  assert.throws(() => normalizePlayerConditionInput({ condition: 1.1 }), /invalid_player_condition/);
});
