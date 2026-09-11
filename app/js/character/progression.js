import { PROFICIENCY_RANKS, SPECIALTY_RANKS, rankForXp } from './catalog.js?v=1';
import { REWARD_LEDGER_LIMIT, createDefaultCharacterState, normalizeCharacterState } from './model.js?v=1';

const ATTRIBUTE_POINT_MILESTONES = Object.freeze([20, 45, 80, 140]);
const REPETITION_FACTORS = Object.freeze([1, 0.6, 0.35, 0.15, 0]);

const ACTIVITY_PROGRESS_MAP = Object.freeze({
  inspect: Object.freeze({ specialties: Object.freeze([['surveying', 1]]), proficiencies: Object.freeze([['survey-equipment', 1]]) }),
  survey: Object.freeze({ specialties: Object.freeze([['surveying', 1]]), proficiencies: Object.freeze([['survey-equipment', 1]]) }),
  'metal-detect': Object.freeze({ specialties: Object.freeze([['geology', 1]]), proficiencies: Object.freeze([['detector', 1]]) }),
  'geology-inspect': Object.freeze({ specialties: Object.freeze([['geology', 1], ['surveying', 0.35]]), proficiencies: Object.freeze([['survey-equipment', 0.55]]) }),
  'pan-sediment': Object.freeze({ specialties: Object.freeze([['geology', 1]]), proficiencies: Object.freeze([['excavation', 0.65]]) }),
  'fossil-document': Object.freeze({ specialties: Object.freeze([['geology', 1]]), proficiencies: Object.freeze([['excavation', 1]]) }),
  photograph: Object.freeze({ specialties: Object.freeze([['wildlife', 0.65], ['photography', 1]]), proficiencies: Object.freeze([['photography', 1]]) }),
  'insect-macro': Object.freeze({ specialties: Object.freeze([['wildlife', 0.8], ['photography', 1]]), proficiencies: Object.freeze([['photography', 1]]) }),
  'nature-observe': Object.freeze({ specialties: Object.freeze([['wildlife', 1]]), proficiencies: Object.freeze([['survey-equipment', 0.45]]) }),
  'wildlife-track': Object.freeze({ specialties: Object.freeze([['wildlife', 1], ['surveying', 0.35]]), proficiencies: Object.freeze([['survey-equipment', 0.55]]) }),
  'trail-camera-survey': Object.freeze({ specialties: Object.freeze([['wildlife', 1], ['photography', 0.55]]), proficiencies: Object.freeze([['photography', 0.65], ['survey-equipment', 0.45]]) }),
  'habitat-survey': Object.freeze({ specialties: Object.freeze([['wildlife', 0.8], ['surveying', 1]]), proficiencies: Object.freeze([['survey-equipment', 1]]) }),
  'community-survey': Object.freeze({ specialties: Object.freeze([['wildlife', 0.65], ['surveying', 1]]), proficiencies: Object.freeze([['survey-equipment', 1]]) }),
  fish: Object.freeze({ specialties: Object.freeze([['marine', 1]]), proficiencies: Object.freeze([]) }),
  'sonar-survey': Object.freeze({ specialties: Object.freeze([['marine', 1], ['surveying', 0.65]]), proficiencies: Object.freeze([['sonar', 1]]) }),
  'dive-survey': Object.freeze({ specialties: Object.freeze([['marine', 1]]), proficiencies: Object.freeze([['dive', 1]]) }),
  'block-building': Object.freeze({ specialties: Object.freeze([['engineering', 1]]), proficiencies: Object.freeze([['construction-tools', 1]]) }),
  'world-editing': Object.freeze({ specialties: Object.freeze([['engineering', 1], ['surveying', 0.35]]), proficiencies: Object.freeze([['construction-tools', 0.75]]) }),
  'spaceflight': Object.freeze({ specialties: Object.freeze([['space', 1], ['piloting', 0.55]]), proficiencies: Object.freeze([['spacecraft', 1]]) }),
  'planetary-fieldwork': Object.freeze({ specialties: Object.freeze([['space', 1], ['surveying', 0.55]]), proficiencies: Object.freeze([['survey-equipment', 0.65]]) })
});

const EVENT_TYPE_PROGRESS_MAP = Object.freeze({
  'companion-befriended': Object.freeze({ specialties: Object.freeze([['companion-handling', 1]]), proficiencies: Object.freeze([]) }),
  'companion-training': Object.freeze({ specialties: Object.freeze([['companion-handling', 1]]), proficiencies: Object.freeze([]) }),
  'companion-level': Object.freeze({ specialties: Object.freeze([['companion-handling', 0.65]]), proficiencies: Object.freeze([]) }),
  'building-milestone': ACTIVITY_PROGRESS_MAP['block-building'],
  'world-edited': ACTIVITY_PROGRESS_MAP['world-editing'],
  'creation-saved': ACTIVITY_PROGRESS_MAP['world-editing'],
  'creation-submitted': ACTIVITY_PROGRESS_MAP['world-editing'],
  'planetary-landing': ACTIVITY_PROGRESS_MAP.spaceflight,
  'space-destination-reached': ACTIVITY_PROGRESS_MAP.spaceflight,
  'atmosphere-exploration': ACTIVITY_PROGRESS_MAP.spaceflight,
  'vehicle-route-completed': Object.freeze({ specialties: Object.freeze([['piloting', 1]]), proficiencies: Object.freeze([]) })
});

function boundedText(value, maximum = 200) {
  return String(value ?? '').trim().slice(0, maximum);
}

function normalizeDifficulty(value = 'basic') {
  const id = boundedText(value, 32).toLowerCase();
  return ['basic', 'intermediate', 'advanced', 'expert'].includes(id) ? id : 'basic';
}

function difficultyFactor(value) {
  return ({ basic: 1, intermediate: 1.15, advanced: 1.35, expert: 1.6 })[normalizeDifficulty(value)] || 1;
}

function progressionMapForEvent(event = {}) {
  const direct = EVENT_TYPE_PROGRESS_MAP[event.eventType] || ACTIVITY_PROGRESS_MAP[event.activityId] || null;
  const specialties = direct ? direct.specialties.map((entry) => [...entry]) : [];
  const proficiencies = direct ? direct.proficiencies.map((entry) => [...entry]) : [];
  const environment = boundedText(event.environment, 32).toUpperCase();
  const family = boundedText(event.family, 80).toLowerCase();
  if (environment === 'PLANETARY' || ['MOON', 'MARS', 'VENUS', 'MERCURY'].includes(environment)) {
    if (!specialties.some(([id]) => id === 'space')) specialties.unshift(['space', 1]);
    if (event.activityId === 'geology-inspect' && !specialties.some(([id]) => id === 'geology')) specialties.push(['geology', 0.75]);
  }
  if (/fish|marine|water-survey/.test(family) && !specialties.some(([id]) => id === 'marine')) specialties.unshift(['marine', 1]);
  if (/rock|mineral|sediment|fossil|gem|ore|metal/.test(family) && !specialties.some(([id]) => id === 'geology')) specialties.unshift(['geology', 1]);
  const vehicleClass = boundedText(event.metadata?.vehicleClass, 40);
  if (vehicleClass) {
    if (!specialties.some(([id]) => id === 'piloting')) specialties.push(['piloting', 1]);
    const proficiencyId = ({ car: 'ground-vehicle', ground: 'ground-vehicle', rover: 'ground-vehicle', plane: 'aircraft', aircraft: 'aircraft', boat: 'boat', submersible: 'submersible', spacecraft: 'spacecraft' })[vehicleClass];
    if (proficiencyId && !proficiencies.some(([id]) => id === proficiencyId)) proficiencies.push([proficiencyId, 1]);
  }
  return Object.freeze({ specialties: Object.freeze(specialties.map(Object.freeze)), proficiencies: Object.freeze(proficiencies.map(Object.freeze)) });
}

function basePracticeXp(event = {}, context = {}) {
  const reason = boundedText(context.noveltyReason || event.progress?.reason, 80);
  if (reason === 'new-identification') return 18;
  if (reason === 'new-region-evidence') return 12;
  if (event.firstCompletion === true) return 20;
  if (['companion-training', 'companion-befriended', 'planetary-landing', 'space-destination-reached', 'atmosphere-exploration'].includes(event.eventType)) return 18;
  if (Number(event.progress?.points) > 0) return 12;
  return context.meaningful === false ? 0 : 6;
}

function repetitionKeyForEvent(event = {}) {
  const activity = boundedText(event.activityId || event.eventType, 80);
  const subject = boundedText(event.catalogId || event.sourceId || event.family || event.name, 120);
  const region = boundedText(event.regionId || event.worldIdentity, 120);
  return `${activity}|${subject}|${region}`.slice(0, 240);
}

function milestoneCount(points = 0) {
  const total = Math.max(0, Number(points) || 0);
  return ATTRIBUTE_POINT_MILESTONES.filter((threshold) => total >= threshold).length;
}

function projectCharacterProgress(input, event = {}, context = {}) {
  const character = normalizeCharacterState(input);
  const eventId = boundedText(event.eventId, 260);
  if (!eventId) return Object.freeze({ changed: false, reason: 'missing-event-id', character, reward: null });
  if (character.rewardLedger.includes(eventId)) return Object.freeze({ changed: false, reason: 'already-rewarded', character, reward: character.lastReward?.eventId === eventId ? character.lastReward : null });
  const mapping = progressionMapForEvent(event);
  if (!mapping.specialties.length && !mapping.proficiencies.length) {
    return Object.freeze({ changed: false, reason: 'no-character-progression', character, reward: null });
  }
  const key = repetitionKeyForEvent(event);
  const repetition = character.repetitionLedger[key] || { count: 0, lastAt: 0, lastDifficulty: '' };
  const difficulty = normalizeDifficulty(context.difficulty || event.metadata?.difficulty);
  const newDifficulty = ['basic', 'intermediate', 'advanced', 'expert'].indexOf(difficulty) > ['basic', 'intermediate', 'advanced', 'expert'].indexOf(repetition.lastDifficulty || 'basic');
  const repetitionIndex = newDifficulty ? 0 : Math.min(REPETITION_FACTORS.length - 1, repetition.count);
  const baseXp = basePracticeXp(event, context);
  const awardedBaseXp = Math.max(0, Math.round(baseXp * difficultyFactor(difficulty) * REPETITION_FACTORS[repetitionIndex]));
  if (awardedBaseXp <= 0) {
    return Object.freeze({ changed: false, reason: 'repetition-limit', character, reward: null });
  }
  const now = Math.max(1, Number(event.occurredAt || context.now) || Date.now());
  const specialties = { ...character.specialties };
  const proficiencies = { ...character.proficiencies };
  const specialtyAwards = [];
  const proficiencyAwards = [];
  for (const [id, weight] of mapping.specialties) {
    const current = specialties[id];
    if (!current) continue;
    const points = Math.max(1, Math.round(awardedBaseXp * Math.max(0.1, Number(weight) || 0)));
    const xp = current.xp + points;
    const rankBefore = rankForXp(SPECIALTY_RANKS, current.xp).rank;
    const rankAfter = rankForXp(SPECIALTY_RANKS, xp).rank;
    specialties[id] = { xp, rank: rankAfter, meaningfulEvents: current.meaningfulEvents + 1, lastProgressAt: now };
    specialtyAwards.push(Object.freeze({ id, xp: points, rankBefore, rankAfter }));
  }
  for (const [id, weight] of mapping.proficiencies) {
    const current = proficiencies[id] || { xp: 0, rank: 0, meaningfulEvents: 0, lastProgressAt: 0 };
    const points = Math.max(1, Math.round(awardedBaseXp * 0.7 * Math.max(0.1, Number(weight) || 0)));
    const xp = current.xp + points;
    const rankBefore = rankForXp(PROFICIENCY_RANKS, current.xp).rank;
    const rankAfter = rankForXp(PROFICIENCY_RANKS, xp).rank;
    proficiencies[id] = { xp, rank: rankAfter, meaningfulEvents: current.meaningfulEvents + 1, lastProgressAt: now };
    proficiencyAwards.push(Object.freeze({ id, xp: points, rankBefore, rankAfter }));
  }
  const milestonePointsBefore = Number(context.explorerPointsBefore) || 0;
  const milestonePointsAfter = Number(context.explorerPointsAfter) || milestonePointsBefore;
  const attributePoints = Math.max(0, milestoneCount(milestonePointsAfter) - milestoneCount(milestonePointsBefore));
  const reward = Object.freeze({
    eventId,
    occurredAt: now,
    difficulty,
    repetitionBand: repetitionIndex,
    baseXp: awardedBaseXp,
    specialtyAwards: Object.freeze(specialtyAwards),
    proficiencyAwards: Object.freeze(proficiencyAwards),
    attributePoints
  });
  const next = normalizeCharacterState({
    ...character,
    revision: character.revision + 1,
    updatedAt: now,
    specialties,
    proficiencies,
    unspentAttributePoints: character.unspentAttributePoints + attributePoints,
    rewardLedger: [...character.rewardLedger, eventId].slice(-REWARD_LEDGER_LIMIT),
    repetitionLedger: {
      ...character.repetitionLedger,
      [key]: { count: repetition.count + 1, lastAt: now, lastDifficulty: difficulty }
    },
    lastReward: reward
  });
  return Object.freeze({ changed: true, reason: 'progress-awarded', character: next, reward });
}

function legacySpecialtySeeds(profile = {}) {
  const legacy = profile.explorerProgress?.specialties || {};
  return Object.freeze({
    wildlife: Math.max(0, Math.floor(Number(legacy.nature?.points) || 0) * 4),
    geology: Math.max(0, Math.floor(Number(legacy.earth?.points) || 0) * 4),
    surveying: Math.max(0, Math.floor(Number(legacy.places?.points) || 0) * 2)
  });
}

function migrationEventForGuide(entry = {}, index = 0) {
  const family = boundedText(entry.family, 80);
  const regionId = boundedText(entry.regions?.[0], 120) || 'legacy-region';
  return {
    eventId: `migration:guide:${boundedText(entry.catalogId, 120) || index}`,
    eventType: 'discovery-recorded',
    activityId: /rock|mineral|sediment|fossil|gem|ore|metal/i.test(family) ? 'geology-inspect'
      : /fish|marine|water/i.test(family) ? 'sonar-survey' : 'nature-observe',
    catalogId: boundedText(entry.catalogId, 120),
    family,
    regionId,
    environment: 'EARTH',
    occurredAt: Number(entry.firstObservedAt) || 1,
    progress: { reason: 'new-identification', points: 0 }
  };
}

function migrateLegacyCharacterState(options = {}) {
  const now = Math.max(1, Number(options.now) || Date.now());
  let character = normalizeCharacterState({
    ...createDefaultCharacterState({ now }),
    creationComplete: true,
    creationMode: 'migrated',
    backgroundId: 'general-explorer',
    revision: 1,
    migration: {
      version: 1,
      migratedAt: now,
      sourceProfileSchemaVersion: Number(options.profile?.schemaVersion) || 0,
      eventEvidenceCount: 0,
      guideEvidenceCount: 0,
      companionEvidenceCount: 0,
      legacyCountersUsed: false,
      backupAvailable: options.backupAvailable === true
    }
  });
  const events = (Array.isArray(options.events) ? options.events : []).slice().sort((a, b) => Number(a.occurredAt) - Number(b.occurredAt));
  let eventEvidenceCount = 0;
  for (const event of events) {
    const projected = projectCharacterProgress(character, event, {
      noveltyReason: event.progress?.reason,
      meaningful: true,
      explorerPointsBefore: 0,
      explorerPointsAfter: 0
    });
    if (!projected.changed) continue;
    character = projected.character;
    eventEvidenceCount += 1;
  }
  const guide = Array.isArray(options.fieldGuide) ? options.fieldGuide : [];
  let guideEvidenceCount = 0;
  if (eventEvidenceCount === 0) {
    guide.forEach((entry, index) => {
      const projected = projectCharacterProgress(character, migrationEventForGuide(entry, index), { meaningful: true });
      if (!projected.changed) return;
      character = projected.character;
      guideEvidenceCount += 1;
    });
  }
  const seeds = legacySpecialtySeeds(options.profile);
  let legacyCountersUsed = false;
  const specialties = { ...character.specialties };
  for (const [id, xp] of Object.entries(seeds)) {
    if (xp <= specialties[id].xp) continue;
    legacyCountersUsed = true;
    specialties[id] = {
      ...specialties[id],
      xp,
      rank: rankForXp(SPECIALTY_RANKS, xp).rank
    };
  }
  const companionEvidenceCount = Math.min(3, (Array.isArray(options.companions) ? options.companions : []).length);
  if (companionEvidenceCount > 0) {
    const current = specialties['companion-handling'];
    const xp = Math.max(current.xp, companionEvidenceCount * 8);
    specialties['companion-handling'] = { ...current, xp, rank: rankForXp(SPECIALTY_RANKS, xp).rank };
  }
  const explorerPoints = Math.max(0, Number(options.profile?.explorerProgress?.points) || 0);
  character = normalizeCharacterState({
    ...character,
    specialties,
    unspentAttributePoints: milestoneCount(explorerPoints),
    revision: character.revision + 1,
    updatedAt: now,
    migration: {
      ...character.migration,
      eventEvidenceCount,
      guideEvidenceCount,
      companionEvidenceCount,
      legacyCountersUsed
    }
  });
  return character;
}

export {
  ACTIVITY_PROGRESS_MAP,
  ATTRIBUTE_POINT_MILESTONES,
  EVENT_TYPE_PROGRESS_MAP,
  REPETITION_FACTORS,
  basePracticeXp,
  migrateLegacyCharacterState,
  progressionMapForEvent,
  projectCharacterProgress,
  repetitionKeyForEvent
};
