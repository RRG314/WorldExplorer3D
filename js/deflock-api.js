import { postProtectedFunction } from './function-api.js?v=3';

function normalizeRoomCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

function normalizeSourceId(value) {
  const match = /^osm:node:(\d{1,18})$/.exec(String(value || '').trim());
  return match ? `osm:node:${match[1]}` : '';
}

export async function claimDeFlockVirtualDisable(input = {}) {
  const roomCode = normalizeRoomCode(input.roomCode);
  const sourceId = normalizeSourceId(input.sourceId);
  if (!roomCode) throw new Error('Join a valid room before using shared DeFlock progress.');
  if (!sourceId) throw new Error('This camera does not have a valid OpenStreetMap source ID.');
  const result = await postProtectedFunction('/claimDeFlockVirtualDisable', {
    roomCode,
    sourceId
  }, { label: 'DeFlock room API' });
  return result || {};
}

export { normalizeRoomCode, normalizeSourceId };
