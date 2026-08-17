import { COMPANION_CATALOG } from './catalog.js?v=1';
import { deterministicUnit } from './model.js?v=1';

function createCompanionInstance(catalogId, options = {}) {
  const catalog = COMPANION_CATALOG.find((entry) => entry.id === String(catalogId));
  if (!catalog) throw new Error(`Unknown companion catalog entry: ${catalogId}`);
  if (!['adoptable-domestic', 'virtual-unlock-only'].includes(catalog.companionPolicy)) {
    throw new Error(`${catalog.names.common} cannot become a companion.`);
  }
  const identitySeed = `${options.worldIdentity || 'local'}|${catalog.id}|${options.discoveryId || 'first'}`;
  const tintIndex = Math.floor(deterministicUnit(`${identitySeed}:tint`) * 4);
  return Object.freeze({
    instanceId: `companion:${catalog.id}:${Math.floor(deterministicUnit(identitySeed) * 0xffffffff).toString(36)}`,
    catalogId: catalog.id,
    name: String(options.name || catalog.names.common).slice(0, 40),
    adoptedAt: Number(options.adoptedAt) || Date.now(),
    originWorldIdentity: String(options.worldIdentity || 'local'),
    discoveryId: String(options.discoveryId || ''),
    behaviorArchetype: catalog.behaviorArchetype,
    personality: Object.freeze({
      curiosity: Number((0.35 + deterministicUnit(`${identitySeed}:curiosity`) * 0.6).toFixed(2)),
      energy: Number((0.35 + deterministicUnit(`${identitySeed}:energy`) * 0.6).toFixed(2)),
      sociability: Number((0.35 + deterministicUnit(`${identitySeed}:social`) * 0.6).toFixed(2))
    }),
    visualVariation: Object.freeze({ tintIndex, size: Number((0.9 + deterministicUnit(`${identitySeed}:size`) * 0.2).toFixed(2)) }),
    care: Object.freeze({ fullness: 80, trust: 20, happiness: 70 }),
    training: Object.freeze({ follow: 1, stay: 0, find: 0 }),
    active: false,
    tradeable: false
  });
}

function setActiveCompanion(instances = [], instanceId = null) {
  const target = instanceId == null ? null : String(instanceId);
  if (target && !instances.some((entry) => entry.instanceId === target)) throw new Error('Active companion must be owned.');
  return Object.freeze(instances.map((entry) => Object.freeze({ ...entry, active: entry.instanceId === target })));
}

function feedCompanion(instance, amount = 15) {
  const care = instance?.care || {};
  return Object.freeze({
    ...instance,
    care: Object.freeze({
      ...care,
      fullness: Math.min(100, Number(care.fullness || 0) + Math.max(1, Number(amount) || 1)),
      happiness: Math.min(100, Number(care.happiness || 0) + 3)
    })
  });
}

function trainCompanion(instance, skill = 'follow') {
  if (!['follow', 'stay', 'find'].includes(skill)) throw new Error('Unsupported companion training skill.');
  return Object.freeze({
    ...instance,
    training: Object.freeze({ ...instance.training, [skill]: Math.min(5, Number(instance.training?.[skill] || 0) + 1) }),
    care: Object.freeze({ ...instance.care, trust: Math.min(100, Number(instance.care?.trust || 0) + 4) })
  });
}

function resolveCompanionTravelPolicy(instance, mode = 'walk', environment = 'EARTH') {
  if (!instance) return Object.freeze({ visible: false, state: 'none' });
  if (environment !== 'EARTH') return Object.freeze({ visible: false, state: 'safe-at-home' });
  if (['plane', 'drone'].includes(mode)) return Object.freeze({ visible: false, state: 'safe-with-vehicle' });
  if (mode === 'boat') return Object.freeze({ visible: true, state: 'aboard' });
  return Object.freeze({ visible: true, state: 'following' });
}

export { createCompanionInstance, feedCompanion, resolveCompanionTravelPolicy, setActiveCompanion, trainCompanion };
