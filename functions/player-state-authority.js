'use strict';

function normalizePlayerConditionInput(input = {}) {
  const condition = Number(input.condition);
  if (!Number.isFinite(condition) || condition < 0 || condition > 1) throw new Error('invalid_player_condition');
  return Object.freeze({
    authority: 'explorer-player-state-v1',
    schemaVersion: 1,
    condition: Math.round(condition * 10000) / 10000,
    reason: String(input.reason || 'gameplay').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80)
  });
}

module.exports = { normalizePlayerConditionInput };
