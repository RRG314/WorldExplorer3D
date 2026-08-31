import { RESOURCE_KEYS, withExpeditionChanges } from './model.js?v=3';
import { JULIAN_YEAR_S } from './travel-calculator.js?v=1';

const VOYAGE_MILESTONES = Object.freeze([
  Object.freeze({ id: 'first-watch', progress: 0.04, phase: 'outbound-watch', kind: 'operations', title: 'First watch handoff', message: 'The departure watch is ready to hand the ship to the cruise crew. Navigation wants a final route review.', choices: Object.freeze(['review-course', 'hold-course']) }),
  Object.freeze({ id: 'thermal-pump', progress: 0.12, phase: 'early-cruise', kind: 'maintenance', title: 'Coolant pump wear', message: 'The thermal loop is losing efficiency. Engineering can replace the pump now or reduce reactor load.', choices: Object.freeze(['replace', 'reduce-load']) }),
  Object.freeze({ id: 'power-converter', progress: 0.23, phase: 'cruise', kind: 'power', title: 'Power conversion loss', message: 'A converter is wasting more energy as heat. The crew can service it or shed nonessential loads.', choices: Object.freeze(['service-converter', 'shed-load']) }),
  Object.freeze({ id: 'hull-strike', progress: 0.36, phase: 'deep-cruise', kind: 'collision', title: 'Hull impact', message: 'A small high-velocity particle struck the forward shielding. Pressure is stable, but the damaged section needs a response.', choices: Object.freeze(['inspect-hull', 'isolate-zone']) }),
  Object.freeze({ id: 'survey-contact', progress: 0.51, phase: 'survey-leg', kind: 'discovery', title: 'Uncharted system contact', message: 'Long-range sensors found a faint star and several orbiting bodies away from the planned route.', choices: Object.freeze(['survey', 'continue']) }),
  Object.freeze({ id: 'crew-health', progress: 0.63, phase: 'long-watch', kind: 'medical', title: 'Crew fatigue warning', message: 'The medical watch reports that accumulated fatigue is reducing performance across the ship.', choices: Object.freeze(['rotate-watch', 'medical-support']) }),
  Object.freeze({ id: 'resource-opportunity', progress: 0.76, phase: 'resource-leg', kind: 'resupply', title: 'Resource-bearing world', message: 'Sensor analysis identifies an uncharted solid world with materials that may support repairs and fabrication.', choices: Object.freeze(['mark-stop', 'remain-on-course']) }),
  Object.freeze({ id: 'radiation-front', progress: 0.86, phase: 'radiation-watch', kind: 'radiation', title: 'Radiation front', message: 'The particle monitor detects an approaching radiation front. The crew can shelter or spend propulsion reserve to alter course around the strongest region.', choices: Object.freeze(['take-shelter', 'alter-course']) }),
  Object.freeze({ id: 'arrival-calibration', progress: 0.94, phase: 'approach', kind: 'navigation', title: 'Arrival calibration', message: 'The destination frame is resolving. Navigation needs a final sensor calibration before local flight resumes.', choices: Object.freeze(['calibrate-arrival', 'manual-approach']) })
]);

function clone(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function appendLog(log, entry) {
  return Object.freeze([...(log || []), Object.freeze(entry)]);
}

function startExpedition(expedition, atMs = Date.now()) {
  if (!expedition || expedition.state !== 'planned') return expedition;
  if (expedition.readiness.status === 'insufficient') throw new Error('The Expedition is not ready to depart.');
  return withExpeditionChanges(expedition, {
    state: 'traveling', voyagePhase: 'departure', departedAtMs: atMs, updatedAtMs: atMs,
    log: appendLog(expedition.log, { atMissionS: 0, kind: 'departure', message: 'Surveyor departed the Solar System.' })
  });
}

function consumeResources(resources, expectedResources, deltaS, totalS) {
  const next = clone(resources);
  const fraction = totalS > 0 ? deltaS / totalS : 0;
  for (const key of RESOURCE_KEYS) {
    if (key === 'scienceCargoKg') continue;
    next[key] = Math.max(0, Number(next[key] || 0) - Number(expectedResources?.[key] || 0) * fraction);
  }
  return Object.freeze(next);
}

function conditionStatus(condition) {
  const value = Math.max(0, Math.min(1, Number(condition) || 0));
  return value < 0.25 ? 'critical' : value < 0.55 ? 'degraded' : value < 0.85 ? 'operational' : 'optimal';
}

function degradeSystems(systems, deltaS, totalS) {
  const next = clone(systems);
  const fraction = totalS > 0 ? deltaS / totalS : 0;
  for (const [id, system] of Object.entries(next)) {
    const wearRate = id === 'hull' ? 0.08 : id === 'life-support' ? 0.12 : 0.1;
    system.condition = Math.max(0, Number(system.condition || 0) - wearRate * fraction);
    system.status = conditionStatus(system.condition);
  }
  return Object.freeze(next);
}

function advanceCrew(crew, deltaS, systems = {}) {
  const years = Math.max(0, Number(deltaS) || 0) / JULIAN_YEAR_S;
  const lifeSupportCondition = Math.max(0, Math.min(1, Number(systems['life-support']?.condition ?? 1)));
  const medicalCondition = Math.max(0, Math.min(1, Number(systems.medical?.condition ?? 1)));
  return Object.freeze((crew || []).map((member) => Object.freeze({
    ...member,
    ageYears: Number(member.ageYears || 0) + years,
    experienceYears: Number(member.experienceYears || 0) + years,
    health: Math.max(0, Math.min(1, Number(member.health ?? 1) - years * (1 - lifeSupportCondition) * 0.004 - years * (1 - medicalCondition) * 0.002)),
    fatigue: Math.min(1, Math.max(0, Number(member.fatigue || 0)) + Math.min(0.08, years * 0.003 + (1 - lifeSupportCondition) * 0.025))
  })));
}

function nextMilestone(expedition) {
  return VOYAGE_MILESTONES.find((milestone) => expedition?.eventFlags?.[milestone.id] !== true) || null;
}

function stableContact(expedition, milestone) {
  const seedText = `${expedition.id}:${expedition.destinationId}:${milestone.id}`;
  let seed = 2166136261;
  for (const char of seedText) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const suffix = String(seed % 997).padStart(3, '0');
  const profiles = [
    { spectralClass: 'M dwarf', worldClass: 'cold rocky world', resource: 'silicate and metal-bearing regolith' },
    { spectralClass: 'K dwarf', worldClass: 'dry highland world', resource: 'hydrated minerals and metal oxides' },
    { spectralClass: 'dim red dwarf', worldClass: 'tidally influenced rocky world', resource: 'basaltic feedstock and volatile-bearing deposits' },
    { spectralClass: 'faint binary', worldClass: 'airless fractured moon', resource: 'nickel-iron and ceramic feedstock' }
  ];
  const profile = profiles[seed % profiles.length];
  return Object.freeze({
    id: `${expedition.id}-contact-${suffix}`, designation: `Survey Contact ${suffix}`,
    truthClass: 'modeled-uncharted-system', stableSeed: seed,
    spectralClass: profile.spectralClass, worldClass: profile.worldClass,
    resourceSignature: profile.resource, status: 'detected', localOperationState: 'unvisited'
  });
}

function createMilestoneEvent(expedition, milestone) {
  const systems = clone(expedition.systems);
  const contacts = [...(expedition.routeContacts || [])];
  if (milestone.kind === 'maintenance') systems.thermal = { condition: Math.min(Number(systems.thermal?.condition || 1), 0.58), status: 'degraded' };
  if (milestone.kind === 'power') systems.power = { condition: Math.min(Number(systems.power?.condition || 1), 0.7), status: 'operational' };
  if (milestone.kind === 'collision') systems.hull = { condition: Math.min(Number(systems.hull?.condition || 1), 0.72), status: 'operational' };
  if (milestone.kind === 'discovery' || milestone.kind === 'resupply') {
    const contact = stableContact(expedition, milestone);
    if (!contacts.some((entry) => entry.id === contact.id)) contacts.push(contact);
  }
  return withExpeditionChanges(expedition, {
    systems: Object.freeze(systems), routeContacts: Object.freeze(contacts), voyagePhase: milestone.phase,
    pendingEvent: Object.freeze({ id: `${expedition.id}-${milestone.id}`, milestoneId: milestone.id, kind: milestone.kind, title: milestone.title, message: milestone.message, choices: milestone.choices }),
    eventFlags: Object.freeze({ ...(expedition.eventFlags || {}), [milestone.id]: true }),
    log: appendLog(expedition.log, { atMissionS: expedition.strategicElapsedS, kind: milestone.kind === 'operations' ? 'watch' : milestone.kind, message: milestone.title })
  });
}

function advanceExpedition(expedition, requestedDeltaS) {
  if (!expedition || expedition.state !== 'traveling' || expedition.pendingEvent) return expedition;
  const totalS = expedition.calculation.properElapsedS;
  const remainingS = Math.max(0, totalS - expedition.strategicElapsedS);
  let deltaS = Math.max(0, Math.min(Number(requestedDeltaS) || 0, remainingS));
  const milestone = nextMilestone(expedition);
  if (milestone && expedition.strategicElapsedS < totalS * milestone.progress) deltaS = Math.min(deltaS, totalS * milestone.progress - expedition.strategicElapsedS);
  const elapsed = expedition.strategicElapsedS + deltaS;
  let next = withExpeditionChanges(expedition, {
    strategicElapsedS: elapsed, progress: totalS > 0 ? Math.min(1, elapsed / totalS) : 0,
    resources: consumeResources(expedition.resources, expedition.calculation.expectedResources, deltaS, totalS),
    systems: degradeSystems(expedition.systems, deltaS, totalS), crew: advanceCrew(expedition.crew, deltaS, expedition.systems)
  });
  if (milestone && elapsed + 1 >= totalS * milestone.progress) return createMilestoneEvent(next, milestone);
  if (elapsed + 1 >= totalS) return withExpeditionChanges(next, {
    state: 'arrived', voyagePhase: 'arrival', progress: 1,
    log: appendLog(next.log, { atMissionS: totalS, kind: 'arrival', message: `Surveyor arrived at ${next.destinationId}.` })
  });
  return next;
}

function advanceToNextMilestone(expedition) {
  if (!expedition || expedition.state !== 'traveling' || expedition.pendingEvent) return expedition;
  return advanceExpedition(expedition, expedition.calculation.properElapsedS);
}

function repairSystem(systems, id, amount) {
  if (!systems[id]) return;
  systems[id].condition = Math.min(1, Number(systems[id].condition || 0) + amount);
  systems[id].status = conditionStatus(systems[id].condition);
}

function resolveExpeditionEvent(expedition, choice) {
  const event = expedition?.pendingEvent;
  if (!event || !event.choices.includes(choice)) return expedition;
  const systems = clone(expedition.systems);
  const resources = clone(expedition.resources);
  const crew = clone(expedition.crew);
  const contacts = clone(expedition.routeContacts || []);
  let message = 'The crew completed the response.';
  let kind = event.kind;

  if (event.kind === 'operations') {
    if (choice === 'review-course') repairSystem(systems, 'navigation', 0.025);
    message = choice === 'review-course' ? 'Navigation verified the cruise course before the watch handoff.' : 'The crew held the planned course and completed the watch handoff.';
  } else if (event.kind === 'maintenance') {
    if (choice === 'replace') {
      if (resources.maintenanceKg < 180) throw new Error('The ship does not have enough maintenance material.');
      resources.maintenanceKg -= 180;
      systems.thermal = { condition: 0.94, status: 'optimal' };
      message = 'Engineering replaced the coolant pump.';
    } else {
      systems.thermal = { condition: 0.68, status: 'operational' };
      resources.powerMWh *= 0.98;
      message = 'The crew reduced thermal load and stabilized the loop.';
    }
    kind = 'repair';
  } else if (event.kind === 'power') {
    if (choice === 'service-converter') { resources.maintenanceKg = Math.max(0, resources.maintenanceKg - 35); repairSystem(systems, 'power', 0.2); message = 'Engineering serviced the converter and recovered the lost power margin.'; }
    else { resources.powerMWh *= 0.985; message = 'The crew shed nonessential loads and protected life support and navigation.'; }
  } else if (event.kind === 'collision') {
    if (choice === 'inspect-hull') { resources.maintenanceKg = Math.max(0, resources.maintenanceKg - 28); repairSystem(systems, 'hull', 0.16); message = 'The crew inspected and patched the damaged shielding section.'; }
    else { systems.hull.status = 'operational'; message = 'The affected zone was isolated for a later exterior inspection.'; }
  } else if (event.kind === 'discovery') {
    const contact = contacts.find((entry) => entry.status === 'detected');
    if (contact && choice === 'survey') { contact.status = 'surveyed'; resources.powerMWh = Math.max(0, resources.powerMWh - 0.5); message = `${contact.designation} was surveyed and added to the route record.`; }
    else message = 'The contact remains in the route record while Surveyor continues on course.';
    kind = 'science';
  } else if (event.kind === 'medical') {
    if (choice === 'medical-support') resources.medicalUnits = Math.max(0, resources.medicalUnits - 2);
    crew.forEach((member) => { member.fatigue = Math.max(0, Number(member.fatigue || 0) - (choice === 'rotate-watch' ? 0.06 : 0.045)); });
    message = choice === 'rotate-watch' ? 'The watch rotation was changed and the most fatigued crew stood down.' : 'Medical supported the active watch and set a stricter rest schedule.';
  } else if (event.kind === 'resupply') {
    const contact = [...contacts].reverse().find((entry) => entry.localOperationState === 'unvisited');
    if (contact && choice === 'mark-stop') { contact.status = 'route-stop'; contact.localOperationState = 'available'; message = `${contact.designation} was added as an optional local-operation stop. Supplies must be acquired on site.`; }
    else message = 'Surveyor retained the contact and remained on the primary route.';
  } else if (event.kind === 'radiation') {
    if (choice === 'alter-course') { resources.propellantKg = Math.max(0, resources.propellantKg * 0.992); message = 'Surveyor altered course around the strongest particle region.'; }
    else { crew.forEach((member) => { member.fatigue = Math.min(1, Number(member.fatigue || 0) + 0.01); }); message = 'The crew sheltered until the particle front passed.'; }
  } else if (event.kind === 'navigation') {
    if (choice === 'calibrate-arrival') resources.powerMWh = Math.max(0, resources.powerMWh - 0.2);
    repairSystem(systems, 'navigation', choice === 'calibrate-arrival' ? 0.08 : 0.02);
    message = choice === 'calibrate-arrival' ? 'Navigation calibrated the destination frame for local flight.' : 'The flight crew retained manual control through final approach.';
  }

  return withExpeditionChanges(expedition, {
    pendingEvent: null, systems: Object.freeze(systems), resources: Object.freeze(resources),
    crew: Object.freeze(crew.map((member) => Object.freeze(member))), routeContacts: Object.freeze(contacts.map((contact) => Object.freeze(contact))),
    log: appendLog(expedition.log, { atMissionS: expedition.strategicElapsedS, kind, message })
  });
}

export { advanceExpedition, advanceToNextMilestone, resolveExpeditionEvent, startExpedition, VOYAGE_MILESTONES };
