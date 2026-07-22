const DEFAULT_ROOM_BUDGET = Object.freeze({
  maxPlayers: 32,
  maxPersistentObjects: 20000,
  maxPersistentObjectsPerCell: 500,
  maxPersistentObjectsPerUser: 1000,
  maxSuppressedBaseFeaturesPerCell: 500,
  maxDynamicBodiesPerCell: 96,
  maxVehiclesPerCell: 32,
  maxNpcsPerCell: 48,
  maxProjectilesPerActor: 24,
  maxLightsPerCell: 8,
  maxActiveResources: 16,
  maxCommandBytes: 8192,
  maxCommandsPerSecond: 30,
  maxDurableCommandsPerMinute: 120,
  interestRadiusCells: 2,
  recoverySnapshotIntervalSec: 30
});

function finiteInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

function clampInteger(value, min, max, fallback) {
  return Math.max(min, Math.min(max, finiteInteger(value, fallback)));
}

function normalizeRoomBudget(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  return Object.freeze({
    maxPlayers: clampInteger(source.maxPlayers, 2, 64, DEFAULT_ROOM_BUDGET.maxPlayers),
    maxPersistentObjects: clampInteger(source.maxPersistentObjects, 200, 100000, DEFAULT_ROOM_BUDGET.maxPersistentObjects),
    maxPersistentObjectsPerCell: clampInteger(source.maxPersistentObjectsPerCell, 50, 2000, DEFAULT_ROOM_BUDGET.maxPersistentObjectsPerCell),
    maxPersistentObjectsPerUser: clampInteger(source.maxPersistentObjectsPerUser, 50, 10000, DEFAULT_ROOM_BUDGET.maxPersistentObjectsPerUser),
    maxSuppressedBaseFeaturesPerCell: clampInteger(source.maxSuppressedBaseFeaturesPerCell, 25, 2000, DEFAULT_ROOM_BUDGET.maxSuppressedBaseFeaturesPerCell),
    maxDynamicBodiesPerCell: clampInteger(source.maxDynamicBodiesPerCell, 16, 256, DEFAULT_ROOM_BUDGET.maxDynamicBodiesPerCell),
    maxVehiclesPerCell: clampInteger(source.maxVehiclesPerCell, 4, 96, DEFAULT_ROOM_BUDGET.maxVehiclesPerCell),
    maxNpcsPerCell: clampInteger(source.maxNpcsPerCell, 0, 128, DEFAULT_ROOM_BUDGET.maxNpcsPerCell),
    maxProjectilesPerActor: clampInteger(source.maxProjectilesPerActor, 1, 64, DEFAULT_ROOM_BUDGET.maxProjectilesPerActor),
    maxLightsPerCell: clampInteger(source.maxLightsPerCell, 0, 24, DEFAULT_ROOM_BUDGET.maxLightsPerCell),
    maxActiveResources: clampInteger(source.maxActiveResources, 0, 64, DEFAULT_ROOM_BUDGET.maxActiveResources),
    maxCommandBytes: clampInteger(source.maxCommandBytes, 512, 32768, DEFAULT_ROOM_BUDGET.maxCommandBytes),
    maxCommandsPerSecond: clampInteger(source.maxCommandsPerSecond, 10, 120, DEFAULT_ROOM_BUDGET.maxCommandsPerSecond),
    maxDurableCommandsPerMinute: clampInteger(source.maxDurableCommandsPerMinute, 10, 600, DEFAULT_ROOM_BUDGET.maxDurableCommandsPerMinute),
    interestRadiusCells: clampInteger(source.interestRadiusCells, 1, 4, DEFAULT_ROOM_BUDGET.interestRadiusCells),
    recoverySnapshotIntervalSec: clampInteger(source.recoverySnapshotIntervalSec, 10, 300, DEFAULT_ROOM_BUDGET.recoverySnapshotIntervalSec)
  });
}

export { DEFAULT_ROOM_BUDGET, normalizeRoomBudget };
