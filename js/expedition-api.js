import { postProtectedFunction } from './function-api.js?v=1';

function roomCode(value) {
  const code = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (!code) throw new Error('Join a multiplayer room before sharing an Expedition.');
  return code;
}

async function mutateSharedExpedition(input = {}) {
  const payload = {
    roomCode: roomCode(input.roomCode),
    action: String(input.action || '').slice(0, 32),
    role: String(input.role || '').slice(0, 32),
    ready: input.ready !== false,
    connected: input.connected !== false,
    expectedRevision: Number(input.expectedRevision || 0),
    mutationKind: String(input.mutationKind || '').slice(0, 24),
    manifestId: String(input.manifestId || '').slice(0, 160)
  };
  if (input.expedition) payload.expedition = input.expedition;
  return postProtectedFunction('/mutateSharedExpedition', payload, {
    label: 'Shared Expedition authority',
    forceRefreshToken: input.forceRefreshToken !== false
  });
}

export { mutateSharedExpedition };
