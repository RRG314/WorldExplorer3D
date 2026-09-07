const VEHICLE_UPGRADE_STORAGE_KEY = 'world-explorer:vehicle-upgrades:v1';
const VEHICLE_UPGRADE_SCHEMA_VERSION = 1;

const VEHICLE_UPGRADE_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'engine-tune', label: 'Engine tune', maximumLevel: 3, prices: [4000, 9000, 18000], description: 'Sharper throttle response and stronger acceleration.', effect: 'Acceleration +8% per level' }),
  Object.freeze({ id: 'street-brakes', label: 'Performance brakes', maximumLevel: 3, prices: [2500, 5200, 9500], description: 'Shorter, more controlled braking from road speeds.', effect: 'Braking +10% per level' }),
  Object.freeze({ id: 'all-road-tires', label: 'All-road tire set', maximumLevel: 3, prices: [1200, 2400, 4500], description: 'More dependable grip during turns and on rough approaches.', effect: 'Grip +7% per level' }),
  Object.freeze({ id: 'reinforced-suspension', label: 'Reinforced suspension', maximumLevel: 3, prices: [3000, 6500, 12000], description: 'More stable steering recovery and less damage from hard landings.', effect: 'Recovery +6% and landing protection +12% per level' })
]);

const UPGRADE_BY_ID = new Map(VEHICLE_UPGRADE_DEFINITIONS.map((definition) => [definition.id, definition]));

function stableVehicleIdentity(vehicle = {}) {
  return String(vehicle.vehicleIdentity || vehicle.id || `player-default:${vehicle.transportCatalogId || vehicle.vehicleVariantId || 'sedan'}`);
}

function serviceIdForUpgrade(upgradeId, level) {
  return `vehicle-upgrade:${upgradeId}:${Math.max(1, Math.floor(Number(level) || 1))}`;
}

function parseUpgradeServiceId(serviceId = '') {
  const match = /^vehicle-upgrade:([a-z0-9-]+):(\d+)$/.exec(String(serviceId || ''));
  if (!match) return null;
  const definition = UPGRADE_BY_ID.get(match[1]);
  const level = Number(match[2]);
  if (!definition || level < 1 || level > definition.maximumLevel) return null;
  return Object.freeze({ definition, upgradeId: definition.id, level });
}

const VEHICLE_UPGRADE_SERVICES = Object.freeze(VEHICLE_UPGRADE_DEFINITIONS.flatMap((definition) => (
  definition.prices.map((price, index) => Object.freeze({
    id: serviceIdForUpgrade(definition.id, index + 1),
    capability: 'service.vehicleUpgrade',
    label: `${definition.label} · level ${index + 1}`,
    price,
    description: `${definition.description} ${definition.effect}.`,
    upgradeId: definition.id,
    upgradeLevel: index + 1
  }))
)));

function createVehicleUpgradeStore(options = {}) {
  const storage = options.storage || globalThis.localStorage;
  let vehicles = {};
  const listeners = new Set();
  try {
    const saved = JSON.parse(storage?.getItem?.(VEHICLE_UPGRADE_STORAGE_KEY) || 'null');
    if (saved?.schemaVersion === VEHICLE_UPGRADE_SCHEMA_VERSION && saved.vehicles && typeof saved.vehicles === 'object') {
      vehicles = { ...saved.vehicles };
    }
  } catch (_) {}

  function save() {
    try {
      storage?.setItem?.(VEHICLE_UPGRADE_STORAGE_KEY, JSON.stringify({ schemaVersion: VEHICLE_UPGRADE_SCHEMA_VERSION, vehicles }));
    } catch (_) {}
  }

  function levels(vehicle = {}) {
    const current = vehicles[stableVehicleIdentity(vehicle)] || {};
    return Object.freeze(Object.fromEntries(VEHICLE_UPGRADE_DEFINITIONS.map((definition) => [
      definition.id,
      Math.max(0, Math.min(definition.maximumLevel, Math.floor(Number(current[definition.id]) || 0)))
    ])));
  }

  function canApply(vehicle = {}, serviceId = '') {
    const parsed = parseUpgradeServiceId(serviceId);
    if (!parsed) return false;
    return levels(vehicle)[parsed.upgradeId] + 1 === parsed.level;
  }

  function apply(vehicle = {}, serviceId = '') {
    const parsed = parseUpgradeServiceId(serviceId);
    if (!parsed || !canApply(vehicle, serviceId)) return Object.freeze({ ok: false, reason: 'wrong_upgrade_level' });
    const vehicleId = stableVehicleIdentity(vehicle);
    vehicles[vehicleId] = { ...(vehicles[vehicleId] || {}), [parsed.upgradeId]: parsed.level };
    save();
    const change = Object.freeze({ ok: true, vehicleId, upgradeId: parsed.upgradeId, level: parsed.level, definition: parsed.definition });
    listeners.forEach((listener) => listener(change));
    return change;
  }

  function hydrate(nextVehicles = {}) {
    vehicles = nextVehicles && typeof nextVehicles === 'object'
      ? Object.fromEntries(Object.entries(nextVehicles).map(([vehicleId, entry]) => [vehicleId, { ...(entry?.levels || entry || {}) }]))
      : {};
    save();
    return snapshot();
  }

  function exportState() {
    return Object.fromEntries(Object.entries(vehicles).map(([vehicleId, entry]) => [vehicleId, { ...entry }]));
  }

  function snapshot(vehicle = {}) {
    const vehicleId = stableVehicleIdentity(vehicle);
    const currentLevels = levels(vehicle);
    return Object.freeze({ type: 'VehicleUpgradeState', schemaVersion: VEHICLE_UPGRADE_SCHEMA_VERSION, vehicleId, levels: currentLevels });
  }

  return Object.freeze({
    apply,
    canApply,
    exportState,
    hydrate,
    levels,
    snapshot,
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
}

function vehicleUpgradeDynamics(levels = {}) {
  const engine = Math.max(0, Number(levels['engine-tune']) || 0);
  const brakes = Math.max(0, Number(levels['street-brakes']) || 0);
  const tires = Math.max(0, Number(levels['all-road-tires']) || 0);
  const suspension = Math.max(0, Number(levels['reinforced-suspension']) || 0);
  return Object.freeze({
    accelerationScale: 1 + engine * 0.08,
    brakeScale: 1 + brakes * 0.1,
    gripScale: 1 + tires * 0.07,
    recoveryScale: 1 + suspension * 0.06,
    suspensionResistance: Math.min(0.36, suspension * 0.12)
  });
}

function ensureVehicleUpgradeStore(appContext = {}, options = {}) {
  if (!appContext.vehicleUpgradeStore?.snapshot) appContext.vehicleUpgradeStore = createVehicleUpgradeStore(options);
  return appContext.vehicleUpgradeStore;
}

export {
  VEHICLE_UPGRADE_DEFINITIONS,
  VEHICLE_UPGRADE_SCHEMA_VERSION,
  VEHICLE_UPGRADE_SERVICES,
  VEHICLE_UPGRADE_STORAGE_KEY,
  createVehicleUpgradeStore,
  ensureVehicleUpgradeStore,
  parseUpgradeServiceId,
  serviceIdForUpgrade,
  stableVehicleIdentity,
  vehicleUpgradeDynamics
};
