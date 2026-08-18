import { postProtectedFunction } from './function-api.js?v=1';

function roomPayload(input = {}) {
  const roomCode = String(input.roomCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  const worldSeed = String(input.worldSeed || '').trim().slice(0, 180);
  if (!roomCode || !worldSeed) throw new Error('Join a valid Earth room before using shared urban interactions.');
  return { roomCode, worldSeed };
}

function entityPayload(input = {}) {
  const entityId = String(input.entityId || '').trim().slice(0, 220);
  if (!entityId) throw new Error('This world object does not have a stable shared identity.');
  return { ...roomPayload(input), entityId };
}

async function claimUrbanVehicle(input = {}) {
  return postProtectedFunction('/claimUrbanVehicle', {
    ...entityPayload(input),
    label: String(input.label || 'Vehicle').slice(0, 80),
    style: String(input.style || 'sedan').slice(0, 40),
    color: Number(input.color || 0),
    pose: input.pose || {}
  }, { label: 'Urban room authority' });
}

async function updateUrbanVehicle(input = {}) {
  return postProtectedFunction('/updateUrbanVehicle', {
    ...entityPayload(input),
    pose: input.pose || {}
  }, { label: 'Urban room authority', forceRefreshToken: false });
}

async function releaseUrbanVehicle(input = {}) {
  return postProtectedFunction('/releaseUrbanVehicle', {
    ...entityPayload(input),
    pose: input.pose || {}
  }, { label: 'Urban room authority', forceRefreshToken: false });
}

async function commitUrbanImpacts(input = {}) {
  return postProtectedFunction('/commitUrbanImpacts', {
    ...roomPayload(input),
    equipmentId: String(input.equipmentId || '').slice(0, 40),
    impactPosition: input.impactPosition || {},
    targets: Array.isArray(input.targets) ? input.targets.slice(0, 10) : []
  }, { label: 'Urban room authority', forceRefreshToken: false });
}

export {
  claimUrbanVehicle,
  commitUrbanImpacts,
  releaseUrbanVehicle,
  updateUrbanVehicle
};
