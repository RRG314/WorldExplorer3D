import { normalizeCharacterState } from './model.js?v=1';
import { PROFICIENCY_RANKS, SPECIALTY_RANKS } from './catalog.js?v=1';

const DIFFICULTY_ORDER = Object.freeze({ basic: 0, intermediate: 1, advanced: 2, expert: 3 });

const CAPABILITY_DEFINITIONS = Object.freeze({
  inspection: Object.freeze({
    label: 'Field inspection', attributes: Object.freeze({ awareness: 0.45, fieldKnowledge: 0.4, precision: 0.15 }),
    specialtyId: 'surveying', proficiencyId: 'survey-equipment', equipmentAny: Object.freeze([]), qualificationId: null
  }),
  'geology-inspection': Object.freeze({
    label: 'Geology field read', attributes: Object.freeze({ fieldKnowledge: 0.45, awareness: 0.35, precision: 0.2 }),
    specialtyId: 'geology', proficiencyId: 'survey-equipment', equipmentAny: Object.freeze(['field-lens', 'rock-hammer']), qualificationId: null
  }),
  detector: Object.freeze({
    label: 'Detector field read', attributes: Object.freeze({ awareness: 0.55, precision: 0.3, fieldKnowledge: 0.15 }),
    specialtyId: 'geology', proficiencyId: 'detector', equipmentAny: Object.freeze(['metal-detector']), qualificationId: null
  }),
  excavation: Object.freeze({
    label: 'Excavation', attributes: Object.freeze({ precision: 0.5, strength: 0.3, fieldKnowledge: 0.2 }),
    specialtyId: 'geology', proficiencyId: 'excavation', equipmentAny: Object.freeze(['hand-trowel', 'field-shovel', 'fossil-brush', 'specimen-brush']), qualificationId: 'advanced-excavation'
  }),
  'wildlife-observation': Object.freeze({
    label: 'Wildlife observation', attributes: Object.freeze({ awareness: 0.55, fieldKnowledge: 0.3, precision: 0.15 }),
    specialtyId: 'wildlife', proficiencyId: 'survey-equipment', equipmentAny: Object.freeze([]), qualificationId: null
  }),
  photography: Object.freeze({
    label: 'Photography', attributes: Object.freeze({ precision: 0.5, awareness: 0.4, fieldKnowledge: 0.1 }),
    specialtyId: 'photography', proficiencyId: 'photography', equipmentAny: Object.freeze(['field-camera']), qualificationId: null
  }),
  'companion-handling': Object.freeze({
    label: 'Companion handling', attributes: Object.freeze({ awareness: 0.55, fieldKnowledge: 0.3, precision: 0.15 }),
    specialtyId: 'companion-handling', proficiencyId: null, equipmentAny: Object.freeze([]), qualificationId: null
  }),
  dive: Object.freeze({
    label: 'Dive survey', attributes: Object.freeze({ endurance: 0.45, technical: 0.35, navigation: 0.2 }),
    specialtyId: 'marine', proficiencyId: 'dive', equipmentAny: Object.freeze(['virtual-dive-kit']), qualificationId: 'advanced-dive-ready'
  }),
  sonar: Object.freeze({
    label: 'Sonar survey', attributes: Object.freeze({ technical: 0.5, navigation: 0.35, fieldKnowledge: 0.15 }),
    specialtyId: 'marine', proficiencyId: 'sonar', equipmentAny: Object.freeze(['portable-sonar']), qualificationId: 'advanced-survey-instruments'
  }),
  boat: Object.freeze({
    label: 'Boat handling', attributes: Object.freeze({ navigation: 0.55, technical: 0.3, awareness: 0.15 }),
    specialtyId: 'piloting', proficiencyId: 'boat', equipmentAny: Object.freeze([]), qualificationId: null, vehicleRequired: true
  }),
  submersible: Object.freeze({
    label: 'Submersible operation', attributes: Object.freeze({ technical: 0.5, navigation: 0.4, awareness: 0.1 }),
    specialtyId: 'marine', proficiencyId: 'submersible', equipmentAny: Object.freeze([]), qualificationId: 'submersible-operator', vehicleRequired: true
  }),
  'ground-vehicle': Object.freeze({
    label: 'Ground vehicle handling', attributes: Object.freeze({ technical: 0.45, navigation: 0.35, awareness: 0.2 }),
    specialtyId: 'piloting', proficiencyId: 'ground-vehicle', equipmentAny: Object.freeze([]), qualificationId: null, vehicleRequired: true
  }),
  aircraft: Object.freeze({
    label: 'Aircraft handling', attributes: Object.freeze({ navigation: 0.5, technical: 0.4, awareness: 0.1 }),
    specialtyId: 'piloting', proficiencyId: 'aircraft', equipmentAny: Object.freeze([]), qualificationId: 'advanced-flight-ready', vehicleRequired: true
  }),
  spacecraft: Object.freeze({
    label: 'Spacecraft operation', attributes: Object.freeze({ navigation: 0.5, technical: 0.4, precision: 0.1 }),
    specialtyId: 'space', proficiencyId: 'spacecraft', equipmentAny: Object.freeze([]), qualificationId: 'orbital-flight-ready', vehicleRequired: true
  }),
  surveying: Object.freeze({
    label: 'Surveying', attributes: Object.freeze({ navigation: 0.4, awareness: 0.35, fieldKnowledge: 0.25 }),
    specialtyId: 'surveying', proficiencyId: 'survey-equipment', equipmentAny: Object.freeze([]), qualificationId: 'advanced-survey-instruments'
  }),
  construction: Object.freeze({
    label: 'Construction', attributes: Object.freeze({ technical: 0.45, precision: 0.4, strength: 0.15 }),
    specialtyId: 'engineering', proficiencyId: 'construction-tools', equipmentAny: Object.freeze([]), qualificationId: null
  })
});

function boundedRating(value = 4) {
  const rating = Math.max(2, Math.min(8, Number(value) || 4));
  return rating <= 6 ? rating : 6 + (rating - 6) * 0.5;
}

function normalizedDifficulty(value = 'basic') {
  const id = String(value || '').toLowerCase();
  return Object.hasOwn(DIFFICULTY_ORDER, id) ? id : 'basic';
}

function informationTier(score) {
  if (score >= 75) return 'detailed';
  if (score >= 58) return 'guided';
  if (score >= 38) return 'standard';
  return 'basic';
}

function experienceScore(entry, ranks) {
  const maximumXp = Number(ranks.at(-1)?.minimumXp) || 1;
  return Math.min(100, Math.sqrt(Math.max(0, Number(entry?.xp) || 0) / maximumXp) * 100);
}

function traitAssistance(character, capabilityId) {
  const traits = new Set(character.traits || []);
  const contributingIds = [];
  let control = 0;
  let interpretation = 0;
  const reasons = [];
  if (traits.has('methodical') && capabilityId === 'excavation') {
    control += 7;
    contributingIds.push('methodical');
    reasons.push('Methodical gives finer excavation control but does not speed heavy removal.');
  }
  if (traits.has('patient-observer') && ['wildlife-observation', 'photography'].includes(capabilityId)) {
    interpretation += 6;
    contributingIds.push('patient-observer');
    reasons.push('Patient Observer helps observation cues settle after you remain still.');
  }
  if (traits.has('wayfinder') && ['surveying', 'boat', 'aircraft', 'spacecraft'].includes(capabilityId)) {
    interpretation += 6;
    contributingIds.push('wayfinder');
    reasons.push('Wayfinder makes route and bearing information easier to read.');
  }
  if (traits.has('strong-swimmer') && capabilityId === 'dive') {
    control += 6;
    contributingIds.push('strong-swimmer');
    reasons.push('Strong Swimmer provides extra water-movement assistance.');
  }
  if (traits.has('equipment-minded') && ['detector', 'sonar', 'construction', 'spacecraft'].includes(capabilityId)) {
    interpretation += 5;
    contributingIds.push('equipment-minded');
    reasons.push('Equipment Minded provides clearer instrument feedback.');
  }
  if (traits.has('sure-footed') && capabilityId === 'ground-vehicle') {
    control += 3;
    contributingIds.push('sure-footed');
    reasons.push('Sure-Footed helps recovery when leaving the vehicle on rough ground.');
  }
  return { control, interpretation, reasons, contributingIds };
}

function resolveCharacterCapability(input, capabilityId, context = {}) {
  const character = normalizeCharacterState(input);
  const definition = CAPABILITY_DEFINITIONS[capabilityId];
  if (!definition) return Object.freeze({ allowed: false, capabilityId, reason: 'unknown-capability', requirements: Object.freeze([]), explanations: Object.freeze(['This activity does not have a character capability definition.']) });
  const difficulty = normalizedDifficulty(context.difficulty);
  const equipmentIds = new Set((Array.isArray(context.equipmentIds) ? context.equipmentIds : []).map(String));
  const qualifications = new Set(character.qualifications || []);
  const requirements = [];
  if (definition.equipmentAny.length && !definition.equipmentAny.some((id) => equipmentIds.has(id))) {
    requirements.push(Object.freeze({ type: 'equipment', met: false, anyOf: definition.equipmentAny, label: `Use ${definition.equipmentAny.join(' or ')}.` }));
  }
  if (definition.vehicleRequired && context.vehicleAvailable !== true) {
    requirements.push(Object.freeze({ type: 'vehicle', met: false, label: `A suitable ${definition.label.toLowerCase()} vehicle is required.` }));
  }
  if (definition.qualificationId && DIFFICULTY_ORDER[difficulty] >= DIFFICULTY_ORDER.advanced && !qualifications.has(definition.qualificationId)) {
    requirements.push(Object.freeze({ type: 'qualification', met: false, id: definition.qualificationId, label: `Complete ${definition.qualificationId.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ')} for advanced work.` }));
  }
  const attributeParts = Object.entries(definition.attributes).map(([id, weight]) => ({ id, rating: character.attributes[id], weight }));
  const attributeScore = attributeParts.reduce((sum, entry) => sum + boundedRating(entry.rating) * entry.weight, 0) / 7 * 100;
  const specialty = character.specialties[definition.specialtyId] || { rank: 0 };
  const proficiency = definition.proficiencyId ? character.proficiencies[definition.proficiencyId] || { rank: 0 } : { rank: 0 };
  const specialtyScore = experienceScore(specialty, SPECIALTY_RANKS);
  const proficiencyScore = definition.proficiencyId ? experienceScore(proficiency, PROFICIENCY_RANKS) : specialtyScore;
  const trait = traitAssistance(character, capabilityId);
  const baseScore = Math.max(0, Math.min(100, attributeScore * 0.55 + specialtyScore * 0.27 + proficiencyScore * 0.18));
  const control = Math.max(0, Math.min(100, Math.round(baseScore + trait.control)));
  const interpretation = Math.max(0, Math.min(100, Math.round(attributeScore * 0.5 + specialtyScore * 0.32 + proficiencyScore * 0.18 + trait.interpretation)));
  const explanations = [
    `${definition.label} uses ${attributeParts.map((entry) => entry.id.replace(/([A-Z])/g, ' $1').toLowerCase()).join(', ')}.`,
    specialty.rank > 0 ? `${definition.specialtyId.replaceAll('-', ' ')} experience provides stronger assistance.` : `Practice ${definition.specialtyId.replaceAll('-', ' ')} activities to improve this capability.`,
    definition.proficiencyId && proficiency.rank > 0 ? `${definition.proficiencyId.replaceAll('-', ' ')} practice improves handling.` : null,
    ...trait.reasons,
    ...requirements.map((entry) => entry.label)
  ].filter(Boolean);
  return Object.freeze({
    type: 'CharacterCapability',
    capabilityId,
    label: definition.label,
    allowed: requirements.every((entry) => entry.met !== false),
    reason: requirements.length ? requirements[0].type : 'available',
    difficulty,
    characterRevision: character.revision,
    assistance: Object.freeze({ control, interpretation, informationTier: informationTier(interpretation) }),
    contributions: Object.freeze({
      attributes: Object.freeze(attributeParts.map(Object.freeze)),
      specialty: Object.freeze({ id: definition.specialtyId, rank: specialty.rank || 0 }),
      proficiency: definition.proficiencyId ? Object.freeze({ id: definition.proficiencyId, rank: proficiency.rank || 0 }) : null,
      traits: Object.freeze(trait.contributingIds)
    }),
    requirements: Object.freeze(requirements),
    explanations: Object.freeze(explanations)
  });
}

function createCapabilityResolver() {
  const cache = new Map();
  return Object.freeze({
    clear() { cache.clear(); },
    resolve(character, capabilityId, context = {}) {
      const state = normalizeCharacterState(character);
      const equipmentKey = (context.equipmentIds || []).map(String).sort().join(',');
      const key = `${state.characterId}|${state.revision}|${capabilityId}|${normalizedDifficulty(context.difficulty)}|${context.environment || ''}|${context.vehicleAvailable === true}|${equipmentKey}`;
      if (!cache.has(key)) cache.set(key, resolveCharacterCapability(state, capabilityId, context));
      return cache.get(key);
    },
    snapshot() { return Object.freeze({ cachedCapabilities: cache.size }); }
  });
}

export { CAPABILITY_DEFINITIONS, createCapabilityResolver, resolveCharacterCapability };
