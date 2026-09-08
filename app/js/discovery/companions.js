import { COMPANION_CATALOG } from './catalog.js?v=4';
import { deterministicUnit } from './model.js?v=1';

const COMPANION_SCHEMA_VERSION = 3;
const STARTER_COMPANION_CATALOG_ID = 'trail-hound';
const STARTER_COMPANION_DEFAULT_NAME = 'Scout';
const STARTER_COMPANION_DISCOVERY_ID = 'starter-companion:v1';
const COMPANION_LEVEL_THRESHOLDS = Object.freeze([0, 40, 100, 180, 280, 400, 550, 730, 940, 1180, 1450, 1750]);
const COMPANION_XP_REASONS = Object.freeze({
  'field-activity': Object.freeze({ points: 12, label: 'Field record completed together' }),
  'new-species': Object.freeze({ points: 8, label: 'New species discovered together' }),
  'expedition-stop': Object.freeze({ points: 8, label: 'Expedition stop completed together' }),
  'expedition-complete': Object.freeze({ points: 20, label: 'Expedition completed together' }),
  'training-first-clear': Object.freeze({ points: 15, label: 'Training exercise completed' }),
  'training-personal-best': Object.freeze({ points: 5, label: 'New training best' }),
  'care-after-outing': Object.freeze({ points: 5, label: 'Cared for after exploring together' }),
  'new-region': Object.freeze({ points: 20, label: 'New region explored together' }),
  'qualified-travel': Object.freeze({ points: 10, label: '500 m explored together' }),
  'companion-challenge': Object.freeze({ points: 15, label: 'Companion challenge completed' }),
  'regional-memory': Object.freeze({ points: 5, label: 'New companion memory saved' })
});

const FIRST_RELEASE_COMPANION_IDS = Object.freeze([
  'trail-hound', 'field-retriever', 'park-terrier',
  'harbor-cat', 'meadow-tabby', 'midnight-cat', 'city-pigeon',
  'pasture-cow', 'wool-sheep', 'hill-goat', 'yard-chicken', 'heritage-pig', 'field-horse'
]);

function companionLevelForXp(totalXp = 0) {
  const xp = Math.max(0, Math.floor(Number(totalXp) || 0));
  let level = 1;
  for (let index = 1; index < COMPANION_LEVEL_THRESHOLDS.length; index += 1) {
    if (xp < COMPANION_LEVEL_THRESHOLDS[index]) break;
    level = index + 1;
  }
  return level;
}

function companionTrustForLevel(level = 1) {
  const value = Math.max(1, Math.floor(Number(level) || 1));
  if (value >= 8) return 'Bonded';
  if (value >= 3) return 'Trusting';
  return 'Comfortable';
}

function sanitizeCompanionName(value, fallback = 'Companion') {
  const clean = String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
  return clean || String(fallback || 'Companion').slice(0, 24);
}

function normalizeAwardLedger(input = []) {
  if (!Array.isArray(input)) return Object.freeze([]);
  return Object.freeze(input
    .filter((entry) => entry?.receiptId && entry?.reasonId)
    .slice(-600)
    .map((entry) => Object.freeze({
      receiptId: String(entry.receiptId).slice(0, 180),
      reasonId: String(entry.reasonId).slice(0, 48),
      points: Math.max(0, Math.min(100, Math.floor(Number(entry.points) || 0))),
      awardedAt: Math.max(0, Number(entry.awardedAt) || 0)
    })));
}

function normalizeCompanionProgression(instance = {}) {
  const source = instance.progression || {};
  const totalXp = Math.max(0, Math.floor(Number(source.totalXp ?? source.xp) || 0));
  const level = companionLevelForXp(totalXp);
  const lastAward = source.lastAward?.reasonId ? Object.freeze({
    reasonId: String(source.lastAward.reasonId),
    label: String(source.lastAward.label || ''),
    points: Math.max(0, Math.floor(Number(source.lastAward.points) || 0)),
    awardedAt: Math.max(0, Number(source.lastAward.awardedAt) || 0)
  }) : null;
  return Object.freeze({
    schemaVersion: COMPANION_SCHEMA_VERSION,
    level,
    totalXp,
    nextLevelXp: COMPANION_LEVEL_THRESHOLDS[level] ?? null,
    trustState: companionTrustForLevel(level),
    awardLedger: normalizeAwardLedger(source.awardLedger),
    lastAward
  });
}

function awardCompanionXp(instance = {}, award = {}) {
  const current = normalizeCompanionProgression(instance);
  const receiptId = String(award.receiptId || '').trim().slice(0, 180);
  const reasonId = String(award.reasonId || '').trim();
  const reason = COMPANION_XP_REASONS[reasonId];
  if (!receiptId || !reason) {
    return Object.freeze({ companion: Object.freeze({ ...instance, progression: current }), awarded: false, reason: 'invalid-award' });
  }
  if (current.awardLedger.some((entry) => entry.receiptId === receiptId)) {
    return Object.freeze({ companion: Object.freeze({ ...instance, progression: current }), awarded: false, reason: 'already-awarded' });
  }
  const points = reasonId === 'companion-challenge'
    ? Math.max(15, Math.min(35, Math.floor(Number(award.points) || reason.points)))
    : reason.points;
  const awardedAt = Math.max(0, Number(award.awardedAt) || Date.now());
  const progression = normalizeCompanionProgression({ progression: {
    totalXp: current.totalXp + points,
    awardLedger: [...current.awardLedger, { receiptId, reasonId, points, awardedAt }],
    lastAward: { reasonId, label: reason.label, points, awardedAt }
  } });
  return Object.freeze({
    companion: Object.freeze({ ...instance, progression }),
    awarded: true,
    points,
    label: reason.label,
    previousLevel: current.level,
    level: progression.level
  });
}

function companionArchetype(catalogId = '') {
  const id = String(catalogId);
  if (['trail-hound', 'field-retriever', 'park-terrier'].includes(id)) return 'dog';
  if (['harbor-cat', 'meadow-tabby', 'midnight-cat'].includes(id)) return 'cat';
  if (['city-pigeon', 'marsh-mallard'].includes(id)) return 'bird';
  if (id === 'pasture-cow') return 'livestock-cattle';
  if (id === 'wool-sheep') return 'livestock-sheep';
  if (id === 'hill-goat') return 'livestock-goat';
  if (id === 'yard-chicken') return 'livestock-bird';
  if (id === 'heritage-pig') return 'livestock-pig';
  if (id === 'field-horse') return 'livestock-horse';
  return 'legacy';
}

function normalizeTraining(source = {}, defaultSpecialization = null) {
  const learned = Array.isArray(source.learnedCommands) ? source.learnedCommands : ['follow'];
  return Object.freeze({
    learnedCommands: Object.freeze([...new Set(learned.map(String).filter(Boolean))]),
    availableExercise: source.availableExercise ? String(source.availableExercise) : null,
    activeExercise: null,
    records: Object.freeze({ ...(source.records || {}) }),
    specialization: source.specialization ? String(source.specialization) : defaultSpecialization ? String(defaultSpecialization) : null
  });
}

function normalizeCare(source = {}) {
  return Object.freeze({
    lastInteraction: source.lastInteraction ? String(source.lastInteraction) : null,
    lastInteractionAt: Math.max(0, Number(source.lastInteractionAt) || 0),
    lastXpDay: source.lastXpDay ? String(source.lastXpDay) : null
  });
}

function normalizeCompanionResidence(source = {}, fallbackState = 'care-network') {
  const allowedStates = new Set(['traveling', 'at-home', 'home-pending', 'care-network']);
  const homeId = String(source.homeId || '').trim().slice(0, 420);
  const requestedState = String(source.state || fallbackState);
  const state = allowedStates.has(requestedState) ? requestedState : fallbackState;
  return Object.freeze({
    state: state === 'at-home' && !homeId ? 'home-pending' : state,
    homeId,
    updatedAt: Math.max(0, Number(source.updatedAt) || 0)
  });
}

function normalizeCompanionInstance(instance = {}) {
  const catalog = COMPANION_CATALOG.find((entry) => entry.id === String(instance.catalogId));
  if (!catalog || !instance.instanceId) return null;
  const legacyTrust = Number(instance.care?.trust || 0);
  const progressionSeed = instance.progression || (legacyTrust >= 60 ? { totalXp: 100 } : {});
  const isStarterCompanion = instance.isStarterCompanion === true || instance.originKind === 'starter-companion';
  const originKind = isStarterCompanion
    ? 'starter-companion'
    : ['encounter', 'legacy'].includes(instance.originKind) ? instance.originKind : 'legacy';
  const nameStatus = instance.nameStatus === 'default' && isStarterCompanion ? 'default' : 'player-chosen';
  return Object.freeze({
    schemaVersion: COMPANION_SCHEMA_VERSION,
    instanceId: String(instance.instanceId),
    catalogId: catalog.id,
    speciesArchetype: String(instance.speciesArchetype || companionArchetype(catalog.id)),
    name: sanitizeCompanionName(instance.name, catalog.names.common),
    adoptedAt: Math.max(0, Number(instance.adoptedAt) || Date.now()),
    originWorldIdentity: String(instance.originWorldIdentity || 'local').slice(0, 160),
    discoveryId: String(instance.discoveryId || '').slice(0, 180),
    originKind,
    isStarterCompanion,
    nameStatus,
    namedAt: nameStatus === 'player-chosen' ? Math.max(0, Number(instance.namedAt) || 0) : 0,
    behaviorArchetype: catalog.behaviorArchetype,
    personality: Object.freeze({
      curiosity: Math.max(0, Math.min(1, Number(instance.personality?.curiosity) || .5)),
      energy: Math.max(0, Math.min(1, Number(instance.personality?.energy) || .5)),
      sociability: Math.max(0, Math.min(1, Number(instance.personality?.sociability) || .5))
    }),
    visualVariation: Object.freeze({
      tintIndex: Math.max(0, Math.min(3, Math.floor(Number(instance.visualVariation?.tintIndex) || 0))),
      size: Math.max(.9, Math.min(1.1, Number(instance.visualVariation?.size) || 1))
    }),
    care: normalizeCare(instance.care),
    training: normalizeTraining(instance.training, catalog.trainingSpecialty),
    progression: normalizeCompanionProgression({ progression: progressionSeed }),
    favorite: instance.favorite === true,
    archived: instance.archived === true,
    active: instance.active === true,
    residence: normalizeCompanionResidence(
      instance.residence,
      instance.active === true ? 'traveling' : isStarterCompanion ? 'home-pending' : 'care-network'
    ),
    tradeable: false,
    legacyContent: !FIRST_RELEASE_COMPANION_IDS.includes(catalog.id)
  });
}

function createCompanionInstance(catalogId, options = {}) {
  const catalog = COMPANION_CATALOG.find((entry) => entry.id === String(catalogId));
  if (!catalog) throw new Error(`Unknown companion catalog entry: ${catalogId}`);
  if (!['adoptable-domestic', 'virtual-unlock-only'].includes(catalog.companionPolicy)) {
    throw new Error(`${catalog.names.common} cannot become a companion.`);
  }
  const discoveryId = String(options.discoveryId || `encounter-${Date.now().toString(36)}`);
  const identitySeed = `${options.worldIdentity || 'local'}|${catalog.id}|${discoveryId}`;
  const instanceId = `companion:${catalog.id}:${Math.floor(deterministicUnit(identitySeed) * 0xffffffff).toString(36)}`;
  return normalizeCompanionInstance({
    instanceId,
    catalogId: catalog.id,
    speciesArchetype: companionArchetype(catalog.id),
    name: sanitizeCompanionName(options.name, catalog.names.common),
    adoptedAt: Number(options.adoptedAt) || Date.now(),
    originWorldIdentity: String(options.worldIdentity || 'local'),
    discoveryId,
    originKind: options.originKind === 'starter-companion' ? 'starter-companion' : 'encounter',
    isStarterCompanion: options.originKind === 'starter-companion',
    nameStatus: options.nameStatus === 'default' ? 'default' : 'player-chosen',
    namedAt: options.nameStatus === 'default' ? 0 : Number(options.namedAt) || Date.now(),
    behaviorArchetype: catalog.behaviorArchetype,
    personality: {
      curiosity: Number((0.35 + deterministicUnit(`${identitySeed}:curiosity`) * 0.6).toFixed(2)),
      energy: Number((0.35 + deterministicUnit(`${identitySeed}:energy`) * 0.6).toFixed(2)),
      sociability: Number((0.35 + deterministicUnit(`${identitySeed}:social`) * 0.6).toFixed(2))
    },
    visualVariation: { tintIndex: Math.floor(deterministicUnit(`${identitySeed}:tint`) * 4), size: Number((0.9 + deterministicUnit(`${identitySeed}:size`) * 0.2).toFixed(2)) },
    care: {},
    training: { learnedCommands: ['follow'] },
    progression: {},
    active: false,
    residence: options.residence || { state: options.originKind === 'starter-companion' ? 'home-pending' : 'care-network', homeId: '', updatedAt: Number(options.adoptedAt) || Date.now() }
  });
}

function createStarterCompanionInstance(options = {}) {
  return createCompanionInstance(STARTER_COMPANION_CATALOG_ID, {
    worldIdentity: String(options.profileIdentity || 'local-explorer'),
    discoveryId: STARTER_COMPANION_DISCOVERY_ID,
    name: options.name || STARTER_COMPANION_DEFAULT_NAME,
    adoptedAt: Number(options.adoptedAt) || Date.now(),
    originKind: 'starter-companion',
    nameStatus: 'default',
    residence: { state: 'home-pending', homeId: '', updatedAt: Number(options.adoptedAt) || Date.now() }
  });
}

function renameCompanion(instance, requestedName, now = Date.now()) {
  const current = normalizeCompanionInstance(instance);
  if (!current) return Object.freeze({ renamed: false, reason: 'unknown-companion', companion: null, firstStarterNaming: false });
  const name = sanitizeCompanionName(requestedName, current.name);
  if (name === current.name && current.nameStatus === 'player-chosen') {
    return Object.freeze({ renamed: false, reason: 'unchanged', companion: current, firstStarterNaming: false });
  }
  const firstStarterNaming = current.isStarterCompanion && current.nameStatus !== 'player-chosen';
  const companion = normalizeCompanionInstance({
    ...current,
    name,
    nameStatus: 'player-chosen',
    namedAt: current.namedAt || Math.max(1, Number(now) || Date.now())
  });
  return Object.freeze({ renamed: true, companion, firstStarterNaming });
}

function assignCompanionHome(instance, homeId, now = Date.now()) {
  const current = normalizeCompanionInstance(instance);
  if (!current) return null;
  const assignedHomeId = String(homeId || '').trim().slice(0, 420);
  return normalizeCompanionInstance({
    ...current,
    residence: {
      state: current.active ? 'traveling' : assignedHomeId ? 'at-home' : 'care-network',
      homeId: assignedHomeId,
      updatedAt: Math.max(1, Number(now) || Date.now())
    }
  });
}

function careForCompanion(instance, interaction = 'pet', now = Date.now()) {
  const supported = new Set(['pet', 'feed', 'play', 'rest', 'groom']);
  const action = supported.has(String(interaction)) ? String(interaction) : 'pet';
  return Object.freeze({ ...instance, care: normalizeCare({ ...instance.care, lastInteraction: action, lastInteractionAt: now }) });
}

function resolveCompanionTravelPolicy(instance, mode = 'walk', environment = 'EARTH') {
  if (!instance) return Object.freeze({ visible: false, state: 'none' });
  if (environment !== 'EARTH') return Object.freeze({ visible: false, state: 'protected-quarters' });
  if (mode === 'drone' || mode === 'skydive') return Object.freeze({ visible: false, state: 'safe-during-exposed-travel' });
  if (String(instance.speciesArchetype || '').startsWith('livestock-') && ['car', 'boat'].includes(mode)) {
    return Object.freeze({ visible: false, state: 'waiting' });
  }
  // Road vehicles do not expose a reliable passenger-seat volume across every
  // body style. Keep the companion safely represented as an occupant instead
  // of rendering it through the roof or beside a moving car. Boats have an
  // open deck and retain their visible aboard presentation.
  if (mode === 'car') return Object.freeze({ visible: false, state: 'vehicle-occupant', positionMode: 'interior' });
  if (mode === 'plane') return Object.freeze({ visible: false, state: 'vehicle-occupant', positionMode: 'interior' });
  if (mode === 'boat') return Object.freeze({ visible: true, state: 'aboard', positionMode: 'aboard' });
  return Object.freeze({ visible: true, state: 'following' });
}

export {
  COMPANION_LEVEL_THRESHOLDS,
  COMPANION_SCHEMA_VERSION,
  COMPANION_XP_REASONS,
  FIRST_RELEASE_COMPANION_IDS,
  STARTER_COMPANION_CATALOG_ID,
  STARTER_COMPANION_DEFAULT_NAME,
  STARTER_COMPANION_DISCOVERY_ID,
  assignCompanionHome,
  awardCompanionXp,
  careForCompanion,
  companionArchetype,
  companionLevelForXp,
  companionTrustForLevel,
  createCompanionInstance,
  createStarterCompanionInstance,
  normalizeCompanionInstance,
  normalizeCompanionProgression,
  normalizeCompanionResidence,
  renameCompanion,
  resolveCompanionTravelPolicy,
  sanitizeCompanionName
};
