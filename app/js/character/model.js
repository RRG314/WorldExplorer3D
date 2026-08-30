import {
  ATTRIBUTE_CREATION_MAXIMUM,
  ATTRIBUTE_CREATION_MINIMUM,
  ATTRIBUTE_CUSTOM_POINT_BUDGET,
  ATTRIBUTE_DEFINITIONS,
  ATTRIBUTE_MAXIMUM,
  ATTRIBUTE_MINIMUM,
  BACKGROUND_DEFINITIONS,
  BALANCED_ATTRIBUTES,
  CHARACTER_SCHEMA_VERSION,
  PROFICIENCY_DEFINITIONS,
  PROFICIENCY_RANKS,
  PROGRESSION_RULES_VERSION,
  SPECIALTY_DEFINITIONS,
  SPECIALTY_RANKS,
  TRAIT_DEFINITIONS,
  definitionById,
  rankForXp
} from './catalog.js?v=1';

const PRIMARY_CHARACTER_ID = 'local-explorer:primary';
const MAX_TRAITS = 2;
const REWARD_LEDGER_LIMIT = 2048;
const ACTIVITY_LEDGER_LIMIT = 512;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function boundedText(value, maximum = 160) {
  return String(value ?? '').trim().slice(0, maximum);
}

function boundedInteger(value, minimum, maximum, fallback = minimum) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

function uniqueKnownIds(values, definitions, maximum = Infinity) {
  const known = new Set(definitions.map((entry) => entry.id));
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter((id) => known.has(id)))].slice(0, maximum);
}

function normalizeAttributes(input = {}, limits = {}) {
  const minimum = Number.isFinite(limits.minimum) ? limits.minimum : ATTRIBUTE_MINIMUM;
  const maximum = Number.isFinite(limits.maximum) ? limits.maximum : ATTRIBUTE_MAXIMUM;
  return Object.fromEntries(ATTRIBUTE_DEFINITIONS.map(({ id }) => [
    id,
    boundedInteger(input?.[id], minimum, maximum, BALANCED_ATTRIBUTES[id])
  ]));
}

function emptySpecialties() {
  return Object.fromEntries(SPECIALTY_DEFINITIONS.map(({ id }) => [id, {
    xp: 0,
    rank: 0,
    meaningfulEvents: 0,
    lastProgressAt: 0
  }]));
}

function normalizeSpecialties(input = {}) {
  const result = emptySpecialties();
  for (const definition of SPECIALTY_DEFINITIONS) {
    const current = input?.[definition.id] || {};
    const xp = Math.max(0, Math.floor(Number(current.xp) || 0));
    result[definition.id] = {
      xp,
      rank: rankForXp(SPECIALTY_RANKS, xp).rank,
      meaningfulEvents: Math.max(0, Math.floor(Number(current.meaningfulEvents) || 0)),
      lastProgressAt: Math.max(0, Number(current.lastProgressAt) || 0)
    };
  }
  return result;
}

function normalizeProficiencies(input = {}) {
  const result = {};
  for (const definition of PROFICIENCY_DEFINITIONS) {
    if (!Object.hasOwn(input || {}, definition.id)) continue;
    const current = input[definition.id] || {};
    const xp = Math.max(0, Math.floor(Number(current.xp) || 0));
    result[definition.id] = {
      xp,
      rank: rankForXp(PROFICIENCY_RANKS, xp).rank,
      meaningfulEvents: Math.max(0, Math.floor(Number(current.meaningfulEvents) || 0)),
      lastProgressAt: Math.max(0, Number(current.lastProgressAt) || 0)
    };
  }
  return result;
}

function normalizeRepetitionLedger(input = {}) {
  const entries = Object.entries(input && typeof input === 'object' ? input : {})
    .filter(([key]) => boundedText(key, 240))
    .slice(-ACTIVITY_LEDGER_LIMIT)
    .map(([key, value]) => [boundedText(key, 240), {
      count: Math.max(0, Math.floor(Number(value?.count) || 0)),
      lastAt: Math.max(0, Number(value?.lastAt) || 0),
      lastDifficulty: boundedText(value?.lastDifficulty, 40)
    }]);
  return Object.fromEntries(entries);
}

function createDefaultCharacterState(options = {}) {
  const now = Math.max(1, Number(options.now) || Date.now());
  return {
    type: 'CharacterState',
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    rulesVersion: PROGRESSION_RULES_VERSION,
    characterId: boundedText(options.characterId, 120) || PRIMARY_CHARACTER_ID,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    creationComplete: false,
    creationMode: 'recommended',
    backgroundId: null,
    appearanceRef: null,
    attributes: { ...BALANCED_ATTRIBUTES },
    unspentAttributePoints: 0,
    traits: [],
    specialties: emptySpecialties(),
    proficiencies: {},
    qualifications: [],
    titles: [],
    activeTitleId: null,
    loadouts: [],
    rewardLedger: [],
    repetitionLedger: {},
    lastReward: null,
    migration: null
  };
}

function normalizeCharacterState(input = {}, options = {}) {
  const base = createDefaultCharacterState(options);
  const source = input && typeof input === 'object' ? input : {};
  const rewardLedger = [...new Set((Array.isArray(source.rewardLedger) ? source.rewardLedger : [])
    .map((entry) => boundedText(entry, 260)).filter(Boolean))].slice(-REWARD_LEDGER_LIMIT);
  const traits = uniqueKnownIds(source.traits, TRAIT_DEFINITIONS, MAX_TRAITS);
  const loadouts = (Array.isArray(source.loadouts) ? source.loadouts : []).slice(0, 8).map((entry) => ({
    id: boundedText(entry?.id, 80),
    label: boundedText(entry?.label, 80),
    itemInstanceIds: [...new Set((Array.isArray(entry?.itemInstanceIds) ? entry.itemInstanceIds : []).map((id) => boundedText(id, 160)).filter(Boolean))].slice(0, 20),
    updatedAt: Math.max(0, Number(entry?.updatedAt) || 0)
  })).filter((entry) => entry.id && entry.label);
  return {
    ...base,
    ...clone(source),
    type: 'CharacterState',
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    rulesVersion: PROGRESSION_RULES_VERSION,
    characterId: boundedText(source.characterId, 120) || base.characterId,
    revision: Math.max(0, Math.floor(Number(source.revision) || 0)),
    createdAt: Math.max(1, Number(source.createdAt) || base.createdAt),
    updatedAt: Math.max(1, Number(source.updatedAt) || base.updatedAt),
    creationComplete: source.creationComplete === true,
    creationMode: ['recommended', 'background', 'custom', 'migrated'].includes(source.creationMode) ? source.creationMode : base.creationMode,
    backgroundId: source.backgroundId === 'custom-start' || definitionById(BACKGROUND_DEFINITIONS, source.backgroundId) ? source.backgroundId : null,
    appearanceRef: source.appearanceRef == null ? null : boundedText(source.appearanceRef, 160),
    attributes: normalizeAttributes(source.attributes),
    unspentAttributePoints: Math.max(0, Math.floor(Number(source.unspentAttributePoints) || 0)),
    traits,
    specialties: normalizeSpecialties(source.specialties),
    proficiencies: normalizeProficiencies(source.proficiencies),
    qualifications: [...new Set((Array.isArray(source.qualifications) ? source.qualifications : []).map((id) => boundedText(id, 120)).filter(Boolean))],
    titles: [...new Set((Array.isArray(source.titles) ? source.titles : []).map((id) => boundedText(id, 120)).filter(Boolean))],
    activeTitleId: source.activeTitleId == null ? null : boundedText(source.activeTitleId, 120),
    loadouts,
    rewardLedger,
    repetitionLedger: normalizeRepetitionLedger(source.repetitionLedger),
    lastReward: source.lastReward && typeof source.lastReward === 'object' ? clone(source.lastReward) : null,
    migration: source.migration && typeof source.migration === 'object' ? clone(source.migration) : null
  };
}

function validateCreationAttributes(attributes = {}) {
  for (const { id } of ATTRIBUTE_DEFINITIONS) {
    const value = Number(attributes?.[id]);
    if (!Number.isInteger(value) || value < ATTRIBUTE_CREATION_MINIMUM || value > ATTRIBUTE_CREATION_MAXIMUM) {
      throw new RangeError(`Custom Start ${id} must be a whole number from ${ATTRIBUTE_CREATION_MINIMUM} to ${ATTRIBUTE_CREATION_MAXIMUM}.`);
    }
  }
  const normalized = normalizeAttributes(attributes, {
    minimum: ATTRIBUTE_CREATION_MINIMUM,
    maximum: ATTRIBUTE_CREATION_MAXIMUM
  });
  const total = Object.values(normalized).reduce((sum, value) => sum + value, 0);
  if (total !== ATTRIBUTE_CUSTOM_POINT_BUDGET) {
    throw new RangeError(`Custom Start requires ${ATTRIBUTE_CUSTOM_POINT_BUDGET} attribute points.`);
  }
  return normalized;
}

function applyStartingXp(state, specialtyXp = {}, proficiencyXp = {}) {
  const specialties = normalizeSpecialties(state.specialties);
  for (const [id, value] of Object.entries(specialtyXp)) {
    if (!specialties[id]) continue;
    specialties[id] = { ...specialties[id], xp: Math.max(0, Math.floor(Number(value) || 0)) };
  }
  const proficiencies = normalizeProficiencies(Object.fromEntries(Object.entries(proficiencyXp).map(([id, xp]) => [id, { xp }])));
  return { specialties: normalizeSpecialties(specialties), proficiencies };
}

function createCharacter(options = {}) {
  const now = Math.max(1, Number(options.now) || Date.now());
  const traits = uniqueKnownIds(options.traits, TRAIT_DEFINITIONS, MAX_TRAITS);
  const base = createDefaultCharacterState({ now, characterId: options.characterId });
  if (options.mode === 'custom') {
    return normalizeCharacterState({
      ...base,
      creationComplete: true,
      creationMode: 'custom',
      backgroundId: 'custom-start',
      attributes: validateCreationAttributes(options.attributes),
      traits,
      appearanceRef: options.appearanceRef || null,
      revision: 1,
      updatedAt: now
    });
  }
  const background = definitionById(BACKGROUND_DEFINITIONS, options.backgroundId || 'general-explorer');
  if (!background) throw new TypeError('Choose a recognized Explorer background.');
  const starting = applyStartingXp(base, background.specialtyXp, background.proficiencyXp);
  return normalizeCharacterState({
    ...base,
    creationComplete: true,
    creationMode: options.mode === 'recommended' ? 'recommended' : 'background',
    backgroundId: background.id,
    attributes: background.attributes,
    traits,
    appearanceRef: options.appearanceRef || null,
    specialties: starting.specialties,
    proficiencies: starting.proficiencies,
    revision: 1,
    updatedAt: now
  });
}

function increaseAttribute(input, attributeId, now = Date.now()) {
  const state = normalizeCharacterState(input);
  if (!ATTRIBUTE_DEFINITIONS.some((entry) => entry.id === attributeId)) return Object.freeze({ changed: false, reason: 'unknown-attribute', character: state });
  if (state.unspentAttributePoints <= 0) return Object.freeze({ changed: false, reason: 'no-attribute-point', character: state });
  if (state.attributes[attributeId] >= ATTRIBUTE_MAXIMUM) return Object.freeze({ changed: false, reason: 'attribute-at-maximum', character: state });
  const character = normalizeCharacterState({
    ...state,
    attributes: { ...state.attributes, [attributeId]: state.attributes[attributeId] + 1 },
    unspentAttributePoints: state.unspentAttributePoints - 1,
    revision: state.revision + 1,
    updatedAt: now
  });
  return Object.freeze({ changed: true, reason: 'attribute-increased', character });
}

export {
  ACTIVITY_LEDGER_LIMIT,
  MAX_TRAITS,
  PRIMARY_CHARACTER_ID,
  REWARD_LEDGER_LIMIT,
  createCharacter,
  createDefaultCharacterState,
  increaseAttribute,
  normalizeAttributes,
  normalizeCharacterState,
  normalizeProficiencies,
  normalizeSpecialties,
  validateCreationAttributes
};
