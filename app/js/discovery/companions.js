import { COMPANION_CATALOG } from './catalog.js?v=3';
import { deterministicUnit } from './model.js?v=1';

const COMPANION_SCHEMA_VERSION = 2;
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
  'harbor-cat', 'meadow-tabby', 'midnight-cat', 'city-pigeon'
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
  return 'legacy';
}

function normalizeTraining(source = {}) {
  const learned = Array.isArray(source.learnedCommands) ? source.learnedCommands : ['follow'];
  return Object.freeze({
    learnedCommands: Object.freeze([...new Set(learned.map(String).filter(Boolean))]),
    availableExercise: source.availableExercise ? String(source.availableExercise) : null,
    activeExercise: null,
    records: Object.freeze({ ...(source.records || {}) }),
    specialization: source.specialization ? String(source.specialization) : null
  });
}

function normalizeCare(source = {}) {
  return Object.freeze({
    lastInteraction: source.lastInteraction ? String(source.lastInteraction) : null,
    lastInteractionAt: Math.max(0, Number(source.lastInteractionAt) || 0),
    lastXpDay: source.lastXpDay ? String(source.lastXpDay) : null
  });
}

function normalizeCompanionInstance(instance = {}) {
  const catalog = COMPANION_CATALOG.find((entry) => entry.id === String(instance.catalogId));
  if (!catalog || !instance.instanceId) return null;
  const legacyTrust = Number(instance.care?.trust || 0);
  const progressionSeed = instance.progression || (legacyTrust >= 60 ? { totalXp: 100 } : {});
  return Object.freeze({
    schemaVersion: COMPANION_SCHEMA_VERSION,
    instanceId: String(instance.instanceId),
    catalogId: catalog.id,
    speciesArchetype: String(instance.speciesArchetype || companionArchetype(catalog.id)),
    name: sanitizeCompanionName(instance.name, catalog.names.common),
    adoptedAt: Math.max(0, Number(instance.adoptedAt) || Date.now()),
    originWorldIdentity: String(instance.originWorldIdentity || 'local').slice(0, 160),
    discoveryId: String(instance.discoveryId || '').slice(0, 180),
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
    training: normalizeTraining(instance.training),
    progression: normalizeCompanionProgression({ progression: progressionSeed }),
    favorite: instance.favorite === true,
    archived: instance.archived === true,
    active: instance.active === true,
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
    active: false
  });
}

function careForCompanion(instance, interaction = 'pet', now = Date.now()) {
  const supported = new Set(['pet', 'feed', 'play', 'rest', 'groom']);
  const action = supported.has(String(interaction)) ? String(interaction) : 'pet';
  return Object.freeze({ ...instance, care: normalizeCare({ ...instance.care, lastInteraction: action, lastInteractionAt: now }) });
}

function resolveCompanionTravelPolicy(instance, mode = 'walk', environment = 'EARTH') {
  if (!instance) return Object.freeze({ visible: false, state: 'none' });
  if (environment !== 'EARTH' || ['plane', 'drone'].includes(mode)) return Object.freeze({ visible: false, state: 'waiting' });
  if (['car', 'boat'].includes(mode)) return Object.freeze({ visible: true, state: 'aboard', positionMode: 'aboard' });
  return Object.freeze({ visible: true, state: 'following' });
}

export {
  COMPANION_LEVEL_THRESHOLDS,
  COMPANION_SCHEMA_VERSION,
  COMPANION_XP_REASONS,
  FIRST_RELEASE_COMPANION_IDS,
  awardCompanionXp,
  careForCompanion,
  companionArchetype,
  companionLevelForXp,
  companionTrustForLevel,
  createCompanionInstance,
  normalizeCompanionInstance,
  normalizeCompanionProgression,
  resolveCompanionTravelPolicy,
  sanitizeCompanionName
};
