import { VOYAGE_EVENT_BY_ID, VOYAGE_EVENT_FAMILIES } from './voyage-events.js?v=3';

const VOYAGE_SLOTS = Object.freeze([
  Object.freeze({ id: 'departure', progress: 0.04, category: 'navigation', forceEventId: 'departure-handoff', phase: 'departure-watch' }),
  Object.freeze({ id: 'early-crew', progress: 0.1, category: 'crew', phase: 'early-cruise' }),
  Object.freeze({ id: 'early-engineering', progress: 0.17, category: 'engineering', phase: 'early-cruise' }),
  Object.freeze({ id: 'first-science', progress: 0.25, category: 'science', phase: 'survey-watch' }),
  Object.freeze({ id: 'first-hazard', progress: 0.33, category: 'hazard', phase: 'deep-cruise' }),
  Object.freeze({ id: 'course-development', progress: 0.41, category: 'navigation', phase: 'deep-cruise' }),
  Object.freeze({ id: 'systems-development', progress: 0.49, category: 'engineering', phase: 'systems-watch' }),
  Object.freeze({ id: 'long-watch', progress: 0.57, category: 'crew', phase: 'long-watch' }),
  Object.freeze({ id: 'route-discovery', progress: 0.65, category: 'science', phase: 'survey-leg' }),
  Object.freeze({ id: 'route-change', progress: 0.73, category: 'stop', phase: 'route-decision' }),
  Object.freeze({ id: 'late-hazard', progress: 0.81, category: 'hazard', phase: 'late-cruise' }),
  Object.freeze({ id: 'late-systems', progress: 0.87, category: 'engineering', phase: 'late-cruise' }),
  Object.freeze({ id: 'arrival-science', progress: 0.92, category: 'science', phase: 'approach-survey' }),
  Object.freeze({ id: 'final-approach', progress: 0.96, category: 'navigation', forceEventId: 'final-approach', phase: 'approach' })
]);
const FORCED_EVENT_IDS = Object.freeze(new Set(VOYAGE_SLOTS.map((slot) => slot.forceEventId).filter(Boolean)));

const EVENT_ONSET = Object.freeze({
  'coolant-pump-wear': Object.freeze({ thermal: -0.18 }),
  'power-converter-loss': Object.freeze({ power: -0.14, thermal: -0.03 }),
  'injector-imbalance': Object.freeze({ propulsion: -0.14 }),
  'radiator-obstruction': Object.freeze({ thermal: -0.13 }),
  'attitude-control-wear': Object.freeze({ propulsion: -0.07, navigation: -0.04 }),
  'pressure-zone-leak': Object.freeze({ hull: -0.1, 'life-support': -0.08 }),
  'fabrication-defect': Object.freeze({ fabrication: -0.08 }),
  'load-shed-recovery': Object.freeze({ power: -0.12 }),
  'water-contamination': Object.freeze({ 'life-support': -0.12 }),
  'crop-cycle-problem': Object.freeze({ 'food-production': -0.14 }),
  'particle-strike': Object.freeze({ hull: -0.15 }),
  'debris-region': Object.freeze({ hull: -0.05 }),
  'charged-interference': Object.freeze({ sensors: -0.08, navigation: -0.04 }),
  'close-star-thermal-stress': Object.freeze({ thermal: -0.12, hull: -0.04 })
});

function clone(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function hashText(text) {
  let hash = 2166136261;
  for (const char of String(text)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash >>> 0;
}

function conditionStatus(condition) {
  const value = Math.max(0, Math.min(1, Number(condition) || 0));
  return value < 0.25 ? 'critical' : value < 0.55 ? 'degraded' : value < 0.85 ? 'operational' : 'optimal';
}

function createVoyageDirector(expeditionIdentity = {}) {
  const seed = hashText(`${expeditionIdentity.id || 'expedition'}:${expeditionIdentity.destinationId || 'unknown'}:${expeditionIdentity.createdAtMs || 0}`);
  return Object.freeze({
    version: 1,
    seed,
    step: 0,
    nextSlotIndex: 0,
    encounteredIds: Object.freeze([]),
    cooldowns: Object.freeze({}),
    tags: Object.freeze({}),
    history: Object.freeze([]),
    deferredConsequences: Object.freeze([])
  });
}

function normalizeVoyageDirector(expedition) {
  const defaults = createVoyageDirector(expedition);
  const source = expedition?.voyageDirector || {};
  return Object.freeze({
    ...defaults,
    ...source,
    seed: Number.isInteger(source.seed) ? source.seed : defaults.seed,
    step: Math.max(0, Number(source.step) || 0),
    nextSlotIndex: Math.max(0, Number(source.nextSlotIndex) || 0),
    encounteredIds: Object.freeze([...(source.encounteredIds || [])]),
    cooldowns: Object.freeze({ ...(source.cooldowns || {}) }),
    tags: Object.freeze({ ...(source.tags || {}) }),
    history: Object.freeze([...(source.history || [])]),
    deferredConsequences: Object.freeze([...(source.deferredConsequences || [])])
  });
}

function hasRoles(expedition, roles = []) {
  if (!roles.length) return true;
  const available = new Set((expedition?.crew || []).filter((member) => member.status !== 'dead').flatMap((member) => member.roles || []));
  return roles.every((role) => available.has(role));
}

function availabilityForResponse(expedition, eventDefinition, option) {
  const requires = option.effects?.requires || {};
  const director = normalizeVoyageDirector(expedition);
  const missingRoles = (requires.roles || option.effects?.roles || []).filter((role) => !hasRoles(expedition, [role]));
  if (missingRoles.length) return Object.freeze({ enabled: false, reason: `Requires crew coverage: ${missingRoles.join(', ')}.` });
  for (const [key, minimum] of Object.entries(requires.resources || {})) {
    if (Number(expedition?.resources?.[key] || 0) < Number(minimum)) return Object.freeze({ enabled: false, reason: `Requires ${minimum} ${key.replaceAll(/([A-Z])/g, ' $1').toLowerCase()}.` });
  }
  for (const [key, minimum] of Object.entries(requires.systems || {})) {
    if (Number(expedition?.systems?.[key]?.condition || 0) < Number(minimum)) return Object.freeze({ enabled: false, reason: `${key.replaceAll('-', ' ')} is not stable enough.` });
  }
  for (const tag of requires.tags || []) {
    if (!director.tags[tag]) return Object.freeze({ enabled: false, reason: 'The required earlier survey or decision is not in the voyage record.' });
  }
  return Object.freeze({ enabled: true, reason: '' });
}

function eventIsEligible(expedition, definition) {
  const director = normalizeVoyageDirector(expedition);
  if (director.encounteredIds.includes(definition.id)) return false;
  if (Number(director.cooldowns[definition.id] || 0) > director.step) return false;
  if (definition.incompatibleTags.some((tag) => director.tags[tag])) return false;
  if (definition.requiresTags.some((tag) => !director.tags[tag])) return false;
  return definition.choices.some((choice) => availabilityForResponse(expedition, definition, choice).enabled);
}

function selectWeighted(expedition, candidates, slot) {
  const director = normalizeVoyageDirector(expedition);
  const totalWeight = candidates.reduce((sum, entry) => sum + Number(entry.weight || 1), 0);
  let cursor = (hashText(`${director.seed}:${slot.id}:${director.step}:${director.history.length}`) / 0xffffffff) * totalWeight;
  for (const candidate of candidates) {
    cursor -= Number(candidate.weight || 1);
    if (cursor <= 0) return candidate;
  }
  return candidates.at(-1) || null;
}

function selectVoyageEvent(expedition, slot) {
  if (slot.forceEventId && eventIsEligible(expedition, VOYAGE_EVENT_BY_ID[slot.forceEventId])) return VOYAGE_EVENT_BY_ID[slot.forceEventId];
  if (slot.category === 'stop' && !(expedition.routeContacts || []).some((contact) => ['available', 'returned'].includes(contact.localOperationState))) {
    const surveyStop = VOYAGE_EVENT_BY_ID['modeled-salvage'];
    if (eventIsEligible(expedition, surveyStop)) return surveyStop;
  }
  const eligible = VOYAGE_EVENT_FAMILIES.filter((entry) => !FORCED_EVENT_IDS.has(entry.id) && eventIsEligible(expedition, entry));
  const preferred = eligible.filter((entry) => entry.category === slot.category);
  return selectWeighted(expedition, preferred.length ? preferred : eligible, slot);
}

function stableContact(expedition, familyId) {
  const seed = hashText(`${expedition.id}:${expedition.destinationId}:${familyId}`);
  const suffix = String(seed % 997).padStart(3, '0');
  const profiles = [
    { spectralClass: 'M dwarf', worldClass: 'cold rocky world', resource: 'silicate and metal-bearing regolith' },
    { spectralClass: 'K dwarf', worldClass: 'dry highland world', resource: 'hydrated minerals and metal oxides' },
    { spectralClass: 'dim red dwarf', worldClass: 'tidally influenced rocky world', resource: 'basaltic feedstock and volatile-bearing deposits' },
    { spectralClass: 'faint binary', worldClass: 'airless fractured moon', resource: 'nickel-iron and ceramic feedstock' }
  ];
  const profile = profiles[seed % profiles.length];
  return Object.freeze({
    id: `${expedition.id}-contact-${suffix}`,
    designation: `Survey Contact ${suffix}`,
    truthClass: 'modeled-uncharted-system',
    stableSeed: seed,
    spectralClass: profile.spectralClass,
    worldClass: profile.worldClass,
    resourceSignature: profile.resource,
    status: 'detected',
    localOperationState: 'unvisited'
  });
}

function createDirectedEvent(expedition, slot) {
  const definition = selectVoyageEvent(expedition, slot);
  if (!definition) return null;
  const director = normalizeVoyageDirector(expedition);
  const systems = clone(expedition.systems || {});
  for (const [systemId, delta] of Object.entries(EVENT_ONSET[definition.id] || {})) {
    if (!systems[systemId]) continue;
    systems[systemId].condition = Math.max(0, Math.min(1, Number(systems[systemId].condition || 0) + Number(delta)));
    systems[systemId].status = conditionStatus(systems[systemId].condition);
  }
  const options = definition.choices.map((choice) => Object.freeze({
    id: choice.id,
    label: choice.label,
    ...availabilityForResponse({ ...expedition, systems, voyageDirector: director }, definition, choice)
  }));
  const enabledChoices = options.filter((option) => option.enabled).map((option) => option.id);
  const nextDirector = Object.freeze({ ...director, nextSlotIndex: director.nextSlotIndex + 1 });
  return Object.freeze({
    systems: Object.freeze(systems),
    voyageDirector: nextDirector,
    voyagePhase: slot.phase,
    pendingEvent: Object.freeze({
      id: `${expedition.id}:${definition.id}:${director.step}`,
      familyId: definition.id,
      slotId: slot.id,
      kind: definition.category,
      title: definition.title,
      message: definition.evidence,
      roomId: definition.roomId,
      responsibleRoles: definition.roles,
      choices: Object.freeze(enabledChoices),
      options: Object.freeze(options)
    }),
    eventFlags: Object.freeze({ ...(expedition.eventFlags || {}), [definition.id]: true }),
    logEntry: Object.freeze({ atMissionS: expedition.strategicElapsedS, kind: definition.category, message: definition.title })
  });
}

function crewCapability(expedition, roles) {
  const relevant = (expedition.crew || []).filter((member) => member.status !== 'dead' && (roles || []).some((role) => member.roles?.includes(role)));
  if (!relevant.length) return 0.3;
  return relevant.reduce((sum, member) => {
    const health = Number(member.health ?? 1);
    const fatigue = Number(member.fatigue || 0);
    const experience = Math.min(0.12, Number(member.experienceYears || 0) / 100);
    return sum + Math.max(0.12, health * (1 - fatigue * 0.65) + experience);
  }, 0) / relevant.length;
}

function systemCapability(expedition, definition) {
  const onsetSystems = Object.keys(EVENT_ONSET[definition.id] || {});
  const ids = onsetSystems.length ? onsetSystems : Object.keys(expedition.systems || {});
  if (!ids.length) return 0.7;
  return ids.reduce((sum, id) => sum + Number(expedition.systems?.[id]?.condition ?? 0.7), 0) / ids.length;
}

function resolveBand(expedition, definition, option) {
  const director = normalizeVoyageDirector(expedition);
  const roll = hashText(`${director.seed}:${definition.id}:${option.id}:${director.step}`) / 0xffffffff;
  const roles = option.effects?.roles?.length ? option.effects.roles : definition.roles;
  const score = crewCapability(expedition, roles) * 0.5 + systemCapability(expedition, definition) * 0.32 + roll * 0.18 - (expedition.survival === 'severe' ? 0.07 : 0);
  return score >= 0.72 ? 'success' : score >= 0.48 ? 'partial' : 'setback';
}

function applyContactEffect(expedition, contacts, definition, effect) {
  if (!effect) return;
  let contact = [...contacts].reverse().find((entry) => entry.localOperationState !== 'completed');
  if (!contact) {
    contact = clone(stableContact(expedition, definition.id));
    contacts.push(contact);
  }
  if (effect === 'survey') { contact.status = 'surveyed'; contact.localOperationState = 'available'; }
  if (effect === 'offer-stop') { contact.status = 'surveyed'; contact.localOperationState = 'available'; }
  if (effect === 'mark-stop') { contact.status = 'route-stop'; contact.localOperationState = 'available'; }
}

function resolveDirectedEvent(expedition, choiceId) {
  const pending = expedition?.pendingEvent;
  const definition = VOYAGE_EVENT_BY_ID[pending?.familyId];
  const option = definition?.choices.find((entry) => entry.id === choiceId);
  if (!pending || !definition || !option || !pending.choices.includes(choiceId)) return null;
  const availability = availabilityForResponse(expedition, definition, option);
  if (!availability.enabled) return null;
  const band = resolveBand(expedition, definition, option);
  const effects = option.effects || {};
  const resources = clone(expedition.resources || {});
  const systems = clone(expedition.systems || {});
  const crew = clone(expedition.crew || []);
  const contacts = clone(expedition.routeContacts || []);
  const director = normalizeVoyageDirector(expedition);
  const tags = { ...director.tags };
  const factor = band === 'success' ? 1 : band === 'partial' ? 0.55 : 0.2;
  const damageFactor = band === 'success' ? 0.18 : band === 'partial' ? 0.55 : 1;

  for (const [key, amount] of Object.entries(effects.cost || {})) resources[key] = Math.max(0, Number(resources[key] || 0) - Number(amount));
  for (const [systemId, amount] of Object.entries(effects.repair || {})) {
    if (!systems[systemId]) continue;
    systems[systemId].condition = Math.min(1, Number(systems[systemId].condition || 0) + Number(amount) * factor);
  }
  for (const [systemId, amount] of Object.entries(effects.damage || {})) {
    if (!systems[systemId]) continue;
    systems[systemId].condition = Math.max(0, Number(systems[systemId].condition || 0) - Number(amount) * damageFactor);
  }
  if (band === 'setback') {
    const fallbackSystem = Object.keys(EVENT_ONSET[definition.id] || {})[0];
    if (fallbackSystem && systems[fallbackSystem]) systems[fallbackSystem].condition = Math.max(0, Number(systems[fallbackSystem].condition || 0) - 0.035);
  }
  Object.values(systems).forEach((system) => { system.status = conditionStatus(system.condition); });
  crew.forEach((member) => {
    member.fatigue = Math.max(0, Math.min(1, Number(member.fatigue || 0) + Number(effects.fatigue || 0) * (band === 'setback' ? 1.35 : 1)));
    if ((effects.roles || definition.roles).some((role) => member.roles?.includes(role))) member.experienceYears = Number(member.experienceYears || 0) + (band === 'success' ? 0.02 : 0.01);
  });
  for (const tag of effects.tags || []) tags[tag] = true;
  applyContactEffect(expedition, contacts, definition, effects.contact);
  const deferred = [...director.deferredConsequences, ...(effects.deferred || []).map((entry) => Object.freeze({ ...entry, sourceEventId: definition.id, dueStep: director.step + Number(entry.afterSteps || 1) }))];
  const message = option.results[band === 'success' ? 0 : band === 'partial' ? 1 : 2];
  const historyEntry = Object.freeze({
    eventId: pending.id,
    familyId: definition.id,
    slotId: pending.slotId,
    choiceId,
    outcome: band,
    atMissionS: expedition.strategicElapsedS,
    tagsAdded: Object.freeze([...(effects.tags || [])])
  });
  const nextDirector = Object.freeze({
    ...director,
    step: director.step + 1,
    encounteredIds: Object.freeze([...director.encounteredIds, definition.id]),
    cooldowns: Object.freeze({ ...director.cooldowns, [definition.id]: director.step + Number(definition.cooldownSteps || 4) }),
    tags: Object.freeze(tags),
    history: Object.freeze([...director.history, historyEntry]),
    deferredConsequences: Object.freeze(deferred)
  });
  return Object.freeze({
    pendingEvent: null,
    resources: Object.freeze(resources),
    systems: Object.freeze(systems),
    crew: Object.freeze(crew.map((member) => Object.freeze(member))),
    routeContacts: Object.freeze(contacts.map((contact) => Object.freeze(contact))),
    voyageDirector: nextDirector,
    outcome: band,
    logEntry: Object.freeze({ atMissionS: expedition.strategicElapsedS, kind: definition.category, message })
  });
}

function applyDueConsequences(expedition) {
  const director = normalizeVoyageDirector(expedition);
  const due = director.deferredConsequences.filter((entry) => Number(entry.dueStep) <= director.step && (!entry.unlessTag || !director.tags[entry.unlessTag]));
  if (!due.length) return null;
  const resources = clone(expedition.resources || {});
  const systems = clone(expedition.systems || {});
  const crew = clone(expedition.crew || []);
  for (const entry of due) {
    if (entry.systemId && systems[entry.systemId]) {
      systems[entry.systemId].condition = Math.max(0, Math.min(1, Number(systems[entry.systemId].condition || 0) + Number(entry.delta || 0)));
      systems[entry.systemId].status = conditionStatus(systems[entry.systemId].condition);
    }
    if (entry.resourceKey) resources[entry.resourceKey] = Math.max(0, Number(resources[entry.resourceKey] || 0) + Number(entry.delta || 0));
    if (entry.crewFatigue) crew.forEach((member) => { member.fatigue = Math.min(1, Number(member.fatigue || 0) + Number(entry.crewFatigue)); });
  }
  const dueSet = new Set(due);
  return Object.freeze({
    resources: Object.freeze(resources),
    systems: Object.freeze(systems),
    crew: Object.freeze(crew.map((member) => Object.freeze(member))),
    voyageDirector: Object.freeze({ ...director, deferredConsequences: Object.freeze(director.deferredConsequences.filter((entry) => !dueSet.has(entry))) }),
    logEntries: Object.freeze(due.map((entry) => Object.freeze({ atMissionS: expedition.strategicElapsedS, kind: 'consequence', message: entry.message })))
  });
}

function nextVoyageSlot(expedition) {
  return VOYAGE_SLOTS[normalizeVoyageDirector(expedition).nextSlotIndex] || null;
}

export {
  applyDueConsequences,
  availabilityForResponse,
  createDirectedEvent,
  createVoyageDirector,
  nextVoyageSlot,
  normalizeVoyageDirector,
  resolveDirectedEvent,
  selectVoyageEvent,
  VOYAGE_SLOTS
};
