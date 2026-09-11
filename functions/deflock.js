'use strict';

function normalizeDeFlockSourceId(value) {
  const match = /^osm:node:(\d{1,18})$/.exec(String(value || '').trim());
  return match ? { sourceId: `osm:node:${match[1]}`, nodeId: match[1] } : null;
}

function isMappedCameraTags(tags = {}) {
  if (String(tags.man_made || '').toLowerCase() !== 'surveillance') return false;
  const type = String(tags['surveillance:type'] || '').toLowerCase();
  return !type || type.split(/[;,]/).some((value) => ['camera', 'alpr', 'anpr'].includes(value.trim()));
}

async function claimImmutableDeFlockState({ runTransaction, cameraRef, state }) {
  if (typeof runTransaction !== 'function' || !cameraRef || !state) {
    throw new TypeError('A transaction runner, camera reference, and state are required.');
  }
  return runTransaction(async (transaction) => {
    const existing = await transaction.get(cameraRef);
    if (existing.exists) return { awarded: false, state: existing.data() || {} };
    transaction.create(cameraRef, state);
    return { awarded: true, state };
  });
}

module.exports = {
  claimImmutableDeFlockState,
  isMappedCameraTags,
  normalizeDeFlockSourceId
};
