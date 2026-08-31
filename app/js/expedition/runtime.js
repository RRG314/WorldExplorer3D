import { DEFAULT_CREW, getShipProfile, PROPULSION_PROFILES, SHIP_PROFILES } from './catalog.js?v=2';
import { createExpeditionPlan, withExpeditionChanges } from './model.js?v=6';
import {
  advanceToNextMilestone,
  resolveExpeditionEvent,
  startExpedition,
  VOYAGE_MILESTONES
} from './simulation.js?v=5';
import { createExpeditionStore } from './store.js?v=6';
import { applyShipOperation, getShipStationView } from './ship-operations.js?v=2';
import { getUniverseDestinations, registerUniverseRuntimeDestination, resolveUniverseAddress } from '../universe/catalog.js?v=11';
import { registerExpeditionSolidWorld } from '../planetary/solid-world-runtime.js?v=8';
import { ensurePlayerBackpackInventory } from '../urban-sandbox/equipment-model.js?v=9';

let activeContext = null;
let activeExpedition = null;
let store = null;
let localTransitRefreshTimer = 0;

function formatYears(value) {
  const years = Number(value) || 0;
  return years >= 100 ? `${Math.round(years).toLocaleString()} years` : `${years.toFixed(years >= 10 ? 1 : 2)} years`;
}

function formatMass(value) {
  const kg = Math.max(0, Number(value) || 0);
  if (kg >= 1_000_000) return `${(kg / 1_000_000).toFixed(2)} million kg`;
  if (kg >= 1000) return `${Math.round(kg / 1000).toLocaleString()} t`;
  return `${Math.round(kg).toLocaleString()} kg`;
}

function ensureStylesheet() {
  if (document.getElementById('expeditionStyles')) return;
  const link = document.createElement('link');
  link.id = 'expeditionStyles';
  link.rel = 'stylesheet';
  link.href = 'styles/expedition.css?v=5';
  document.head.appendChild(link);
}

function availableDestinations() {
  return getUniverseDestinations().filter((item) => ['planetary_system', 'black_hole'].includes(item.objectClass) && item.id !== 'sol');
}

function registerExpeditionContact(expedition, contact) {
  if (!contact?.id || !Number.isInteger(Number(contact.stableSeed))) return null;
  const seed = Number(contact.stableSeed) >>> 0;
  const stellarProfiles = [
    { mass: 0.16, temperature: 3050, kind: 'red-dwarf', color: 0xff805b },
    { mass: 0.72, temperature: 4750, kind: 'k-star', color: 0xffbd79 },
    { mass: 0.28, temperature: 3320, kind: 'red-dwarf', color: 0xff9169 },
    { mass: 0.52, temperature: 3920, kind: 'k-star', color: 0xffa66f }
  ];
  const star = stellarProfiles[seed % stellarProfiles.length];
  const radiusEarth = 0.78 + ((seed >>> 5) % 92) / 100;
  const massEarth = Math.max(0.38, radiusEarth ** 2.7);
  const orbitDays = 28 + (seed % 410);
  const semiMajorAxisAu = 0.12 + ((seed >>> 9) % 130) / 100;
  const destination = registerUniverseRuntimeDestination({
    id: contact.id,
    name: contact.designation,
    objectClass: 'planetary_system',
    parentId: 'milky-way',
    address: `universe/local-group/milky-way/expedition/${contact.id}`,
    accuracy: 'model-derived expedition contact',
    canonicalPosition: { frame: 'expedition-route', distanceLy: Math.max(0.01, Number(expedition?.calculation?.distanceLy || 1) * Math.max(0.05, Number(expedition?.progress || 0.5))) },
    physical: { hostMassSolar: star.mass, hostTemperatureK: star.temperature },
    visualProfile: { kind: star.kind, color: star.color, seed },
    generatedFlags: ['stable-expedition-contact', 'model-derived-appearance'],
    uncertainty: { classification: 'Survey classification remains subject to local observation.' },
    provenance: [],
    children: [{
      id: `${contact.id}-i`,
      name: `${contact.designation} I`,
      objectClass: 'exoplanet',
      radiusEarth,
      massEarth,
      orbitDays,
      semiMajorAxisAu,
      accuracy: 'model-derived expedition world',
      exploration: { landingMode: 'solid_surface', surfaceClass: contact.worldClass, surfaceAuthority: 'expedition-modeled-surface-v1' },
      uncertainty: { resourceSignature: contact.resourceSignature }
    }]
  });
  const world = resolveUniverseAddress(`${contact.id}-i`);
  registerExpeditionSolidWorld({
    ...world,
    seed,
    parentSystemId: contact.id,
    starMassSolar: star.mass
  });
  return destination;
}

function syncExpeditionContacts(expedition = activeExpedition) {
  return (expedition?.routeContacts || []).map((contact) => registerExpeditionContact(expedition, contact)).filter(Boolean);
}

function updateContact(contactId, changes) {
  const contacts = (activeExpedition?.routeContacts || []).map((contact) => Object.freeze(contact.id === contactId ? { ...contact, ...changes } : { ...contact }));
  return Object.freeze(contacts);
}

function appendMissionLog(expedition, kind, message) {
  return Object.freeze([...(expedition?.log || []), Object.freeze({ atMissionS: Number(expedition?.strategicElapsedS || 0), kind, message })]);
}

function recoveryRequirement(expedition) {
  const repairable = ['propulsion', 'power', 'life-support', 'thermal', 'fabrication', 'sensors', 'hull'];
  const damaged = Object.entries(expedition?.systems || {})
    .filter(([id, system]) => repairable.includes(id) && Number(system?.condition ?? 1) < 0.72)
    .sort((a, b) => Number(a[1]?.condition ?? 1) - Number(b[1]?.condition ?? 1))[0];
  const maintenanceKg = Math.max(0, Number(expedition?.resources?.maintenanceKg || 0));
  const feedstockKg = Math.max(0, Number(expedition?.resources?.feedstockKg || 0));
  if (!damaged || (maintenanceKg >= 12 && feedstockKg >= 25)) return null;
  return Object.freeze({
    kind: 'repair-feedstock',
    systemId: damaged[0],
    conditionBefore: Number(damaged[1]?.condition || 0),
    maintenanceShortfallKg: Math.max(0, 12 - maintenanceKg),
    fabricationFeedstockShortfallKg: Math.max(0, 25 - feedstockKg),
    recoveredFeedstockKg: 3,
    processingResidueKg: 1,
    sampleMassKg: 4
  });
}

function beginLocalContact(contactId) {
  const contact = activeExpedition?.routeContacts?.find((entry) => entry.id === contactId);
  if (!contact || !['available', 'returned'].includes(contact.localOperationState)) return false;
  const destination = registerExpeditionContact(activeExpedition, contact);
  if (!destination) return false;
  const returnFrameId = activeContext?.universeRuntime?.current?.id || activeExpedition.originId || 'sol';
  const previous = activeExpedition;
  const requirement = recoveryRequirement(activeExpedition);
  activeExpedition = withExpeditionChanges(activeExpedition, {
    voyagePhase: 'local-operation',
    activeLocalContactId: contact.id,
    localOperation: Object.freeze({
      contactId: contact.id,
      returnFrameId,
      state: 'local-space',
      startedAtMissionS: Number(activeExpedition.strategicElapsedS || 0),
      recoveryRequirement: requirement
    }),
    routeContacts: updateContact(contact.id, { localOperationState: 'local-entered', status: 'local-operation' }),
    log: appendMissionLog(activeExpedition, 'local-operation', `${contact.designation} local survey began.`)
  });
  store.save(activeExpedition);
  closeExpeditionPlanner();
  const accepted = activeContext?.travelToUniverseDestination?.(destination.id, {
    kind: 'expedition-local-operation',
    routeLabel: contact.designation
  });
  if (accepted) return true;
  activeExpedition = previous;
  store.save(activeExpedition);
  openExpeditionPlanner(activeContext);
  activeContext?.showSpaceFlightMessage?.('The local route is not available from the current flight state.', '#f59e0b');
  return false;
}

function returnFromLocalContact() {
  const operation = activeExpedition?.localOperation;
  const contact = activeExpedition?.routeContacts?.find((entry) => entry.id === operation?.contactId);
  if (!operation || !contact) return false;
  if (activeContext?.universeRuntime?.transition) {
    activeContext?.showSpaceFlightMessage?.('Complete the local approach before returning to Surveyor.', '#f59e0b');
    return false;
  }
  const previous = activeExpedition;
  activeExpedition = withExpeditionChanges(activeExpedition, {
    voyagePhase: 'route-resume',
    activeLocalContactId: null,
    localOperation: null,
    routeContacts: updateContact(contact.id, { localOperationState: 'returned', status: 'surveyed' }),
    log: appendMissionLog(activeExpedition, 'local-operation', `${contact.designation} local survey ended. Surveyor resumed the voyage.`)
  });
  store.save(activeExpedition);
  closeExpeditionPlanner();
  const accepted = activeContext?.travelToUniverseDestination?.(operation.returnFrameId || activeExpedition.originId || 'sol', {
    kind: 'expedition-route-return',
    routeLabel: 'Return to Surveyor'
  });
  if (accepted) return true;
  activeExpedition = previous;
  store.save(activeExpedition);
  openExpeditionPlanner(activeContext);
  activeContext?.showSpaceFlightMessage?.('Surveyor could not recover the prior route frame.', '#f59e0b');
  return false;
}

function collectExpeditionGeologySample(activity) {
  const operation = activeExpedition?.localOperation;
  const contact = activeExpedition?.routeContacts?.find((entry) => entry.id === operation?.contactId);
  if (!operation || !contact || activity?.bodyId !== `${contact.id}-i`) return false;
  const inventory = activeContext ? ensurePlayerBackpackInventory(activeContext) : null;
  if (!inventory) return false;
  const catalogId = `expedition-sample-${activity.bodyId}`;
  inventory.registerDefinitions?.([{
    id: catalogId,
    label: `${contact.designation} geology sample`,
    category: 'geology-sample',
    icon: 'ROCK',
    verbs: ['inspect'],
    stackLimit: 1
  }]);
  if (!inventory.has?.(catalogId)) {
    inventory.upsertItem?.({
      instanceId: `${activeExpedition.id}:${catalogId}`,
      catalogId,
      quantity: 1,
      authority: 'expedition-field-operation',
      provenance: 'modeled-expedition-surface-sample',
      sourceEventId: `${activeExpedition.id}:${activity.id}:sample`,
      tradeable: false,
      acquiredAt: Date.now(),
      metadata: {
        label: `${contact.designation} geology sample`,
        category: 'geology-sample',
        icon: 'ROCK',
        bodyId: activity.bodyId,
        contactId: contact.id,
        massKg: 4,
        resourceSignature: contact.resourceSignature,
        recoveryKind: operation.recoveryRequirement?.kind || null,
        truthClass: 'modeled-game-world-material'
      }
    });
    activeContext?.playerBackpackStore?.save?.(inventory.exportState?.());
  }
  activeExpedition = withExpeditionChanges(activeExpedition, {
    localOperation: Object.freeze({ ...operation, state: 'surface-sampled', sampleCatalogId: catalogId }),
    log: appendMissionLog(activeExpedition, operation.recoveryRequirement ? 'resupply' : 'science', operation.recoveryRequirement
      ? `${contact.designation} field team secured one 4 kg feedstock sample for the ${operation.recoveryRequirement.systemId.replaceAll('-', ' ')} repair.`
      : `${contact.designation} field team collected one 4 kg modeled geology sample.`)
  });
  store.save(activeExpedition);
  activeContext?.showToast?.(`${contact.designation} sample secured in Backpack.`);
  return true;
}

function leaveExpeditionSurface(bodyId) {
  const operation = activeExpedition?.localOperation;
  const contact = activeExpedition?.routeContacts?.find((entry) => entry.id === operation?.contactId);
  if (!operation || !contact || bodyId !== `${contact.id}-i`) return false;
  const inventory = activeContext ? ensurePlayerBackpackInventory(activeContext) : null;
  const catalogId = operation.sampleCatalogId;
  if (!catalogId || !inventory?.has?.(catalogId)) {
    activeContext?.showToast?.('Collect the geology sample before returning to Surveyor.');
    return false;
  }
  const item = inventory.snapshot?.().items?.find((entry) => entry.catalogId === catalogId);
  if (!item || Number(item.quantity) < 1) return false;
  const departureStarted = activeContext?.startSpaceFlightFromExpeditionSurface?.({
    frameId: contact.id,
    courseDestinationId: bodyId,
    onReady: () => returnFromLocalContact()
  }) === true;
  if (!departureStarted) {
    activeContext?.showToast?.('Surveyor could not begin the return flight. The sample remains in your Backpack.');
    return false;
  }
  const consumed = inventory.consumeItem?.(catalogId, 1) ?? inventory.consume?.(catalogId, 1);
  if (!consumed) return false;
  activeContext?.playerBackpackStore?.save?.(inventory.exportState?.());
  const sample = Object.freeze({
    id: `${activeExpedition.id}:${catalogId}:cargo`,
    catalogId,
    label: item.label,
    contactId: contact.id,
    bodyId,
    massKg: 4,
    processed: false,
    recoveryRequirement: operation.recoveryRequirement || null,
    resourceSignature: contact.resourceSignature,
    truthClass: 'modeled-game-world-material'
  });
  activeExpedition = withExpeditionChanges(activeExpedition, {
    scienceSamples: Object.freeze([...(activeExpedition.scienceSamples || []), sample]),
    resources: Object.freeze({
      ...activeExpedition.resources,
      scienceCargoKg: Number(activeExpedition.resources?.scienceCargoKg || 0) + sample.massKg
    }),
    localOperation: Object.freeze({ ...operation, state: 'cargo-loaded', transferredSampleId: sample.id }),
    log: appendMissionLog(activeExpedition, 'science', `Transferred one ${sample.massKg} kg ${contact.designation} sample from Backpack to Surveyor cargo.`)
  });
  store.save(activeExpedition);
  activeContext?.updateExpeditionShipRecord?.(activeExpedition);
  return true;
}

function destinationTypeLabel(destination) {
  return destination.objectClass === 'black_hole' ? 'Black-hole expedition' : 'Star system';
}

function overlay() {
  return document.getElementById('expeditionOverlay');
}

function selectedValue(id, fallback = '') {
  return String(document.getElementById(id)?.value || fallback);
}

function renderPlanner() {
  const root = overlay();
  if (!root) return;
  const destinationOptions = availableDestinations().map((destination) =>
    `<option value="${destination.id}">${destination.name} · ${destinationTypeLabel(destination)}</option>`
  ).join('');
  const propulsionOptions = PROPULSION_PROFILES.filter((profile) => profile.crewedInterstellarEligible).map((profile) =>
    `<option value="${profile.id}">${profile.name} · ${profile.classification}</option>`
  ).join('');
  const shipOptions = SHIP_PROFILES.filter((profile) => String(profile.releaseStatus).startsWith('playable-')).map((profile) =>
    `<option value="${profile.id}">${profile.name}</option>`
  ).join('');
  root.innerHTML = `
    <section class="expeditionPanel" role="dialog" aria-modal="true" aria-labelledby="expeditionTitle">
      <header class="expeditionHeader">
        <div style="min-width:0"><span>SPACE EXPLORER</span><h2 id="expeditionTitle" style="max-width:270px">Interstellar Expedition</h2></div>
        <button id="expeditionClose" type="button" aria-label="Close Expedition" style="flex:0 0 42px">×</button>
      </header>
      <p class="expeditionIntro">Plan a persistent long-range voyage. Ordinary Space Flight remains available when this panel is closed.</p>
      <div class="expeditionPlannerGrid">
        <label>Destination<select id="expeditionDestination">${destinationOptions}</select></label>
        <label>Travel model<select id="expeditionRealism"><option value="science-inspired">Science-inspired</option><option value="custom">Custom</option></select></label>
        <label>Survival<select id="expeditionSurvival"><option value="forgiving">Forgiving</option><option value="severe">Severe</option></select></label>
        <label>Ship<select id="expeditionShip">${shipOptions}</select></label>
        <label class="expeditionWide">Propulsion<select id="expeditionPropulsion">${propulsionOptions}</select></label>
      </div>
      <button id="expeditionPlan" class="expeditionPrimary" type="button">Assess expedition</button>
      <div id="expeditionMission" class="expeditionMission" aria-live="polite"></div>
    </section>`;
  root.querySelector('#expeditionDestination').value = 'proxima-centauri';
  root.querySelector('#expeditionPropulsion').value = 'radiant-plasma-field-drive';
  root.querySelector('#expeditionShip').addEventListener('change', (event) => {
    const ship = getShipProfile(event.target.value);
    const propulsion = root.querySelector('#expeditionPropulsion');
    if (ship && !ship.supportedPropulsionIds.includes(propulsion.value)) propulsion.value = ship.supportedPropulsionIds[0];
  });
  root.querySelector('#expeditionClose').addEventListener('click', closeExpeditionPlanner);
  root.querySelector('#expeditionPlan').addEventListener('click', () => {
    activeExpedition = createExpeditionPlan({
      destinationId: selectedValue('expeditionDestination', 'proxima-centauri'),
      shipId: selectedValue('expeditionShip', 'long-range-research-vessel'),
      propulsionId: selectedValue('expeditionPropulsion', 'radiant-plasma-field-drive'),
      realism: selectedValue('expeditionRealism', 'science-inspired'),
      survival: selectedValue('expeditionSurvival', 'forgiving'),
      crew: DEFAULT_CREW
    });
    store.save(activeExpedition);
    renderMission();
  });
  if (activeExpedition) renderMission();
}

function readinessMarkup(expedition) {
  const destination = resolveUniverseAddress(expedition.destinationId);
  const readiness = expedition.readiness;
  const issues = [...readiness.failures, ...readiness.warnings];
  const assessment = expedition.state === 'planned'
    ? readiness.status.toUpperCase()
    : expedition.state === 'failed'
      ? 'MISSION LOST'
      : expedition.state === 'arrived' ? 'ARRIVED' : 'UNDERWAY';
  const assessmentClass = expedition.state === 'failed' ? 'insufficient' : readiness.status;
  const ship = getShipProfile(expedition.ship?.profileId);
  const longDuration = expedition.longDuration || { kind: 'standard' };
  const populationCopy = longDuration.kind === 'generation'
    ? `${Number(longDuration.population || expedition.crewPopulation).toLocaleString()} aboard · ${expedition.crew.length} active watch representatives`
    : longDuration.kind === 'cryogenic'
      ? `${expedition.crew.length} active · ${(longDuration.reserveCrew || []).filter((member) => member.status === 'cryogenic').length} reserve specialists asleep`
      : `${expedition.crew.length} ${expedition.state === 'planned' ? 'assigned' : 'aboard'}`;
  const architecture = longDuration.kind === 'generation'
    ? `<section class="expeditionLongDuration"><h3>Generation continuity</h3><p>Generation ${longDuration.generationIndex} · ${Number(longDuration.population || 0).toLocaleString()} population · ${Math.round(Number(longDuration.roleContinuity || 0) * 100)}% role continuity · ${Math.round(Number(longDuration.knowledgePreservation || 0) * 100)}% knowledge archive</p><small>${longDuration.uncertainty}</small></section>`
    : longDuration.kind === 'cryogenic'
      ? `<section class="expeditionLongDuration"><h3>Cryogenic reserve</h3><p>${(longDuration.reserveCrew || []).filter((member) => member.status === 'cryogenic').length} specialists asleep · wake cycle uses ${longDuration.wakeCost.medicalUnits} medical units and ${longDuration.wakeCost.powerMWh} MWh</p><small>Human long-duration suspension remains speculative. Wake-up has a medical cost and recovery period.</small></section>`
      : '';
  return `
    <div class="expeditionSummary">
      <div><span>Destination</span><strong>${destination?.name || expedition.destinationId}</strong></div>
      <div><span>Distance</span><strong>${expedition.calculation.distanceLy.toFixed(2)} ly</strong></div>
      <div><span>Mission time</span><strong>${formatYears(expedition.calculation.externalYears)}</strong></div>
      <div><span>Crew time</span><strong>${formatYears(expedition.calculation.properYears)}</strong></div>
      <div><span>Peak speed</span><strong>${(expedition.calculation.peakVelocityFractionC * 100).toFixed(1)}% c</strong></div>
      <div><span>Status</span><strong class="is-${assessmentClass}">${assessment}</strong></div>
    </div>
    <div class="expeditionManifest">
      <section><h3>Crew</h3><p>${populationCopy} · command, navigation, engineering, medical, life support, and science covered.</p></section>
      <section><h3>Supplies</h3><p>${formatMass(expedition.resources.foodKg)} food · ${formatMass(expedition.resources.waterKg)} water reserve · ${formatMass(expedition.resources.maintenanceKg)} maintenance material.</p></section>
      <section><h3>Ship</h3><p>${expedition.ship?.name || ship?.name} · ${ship?.name || 'expedition vessel'} · bounded walkable operations decks connect crew and ship work.</p></section>
    </div>
    ${architecture}
    <section class="expeditionLongDuration"><h3>Relativistic travel</h3><p>External time ${formatYears(expedition.calculation.externalYears)} · crew proper time ${formatYears(expedition.calculation.properYears)} · peak Lorentz factor ${Number(expedition.calculation.peakLorentzFactor || 1).toFixed(4)}</p><small>Physical distance remains ${expedition.calculation.distanceLy.toFixed(2)} light-years; player-time compression does not alter it.</small></section>
    ${issues.length ? `<ul class="expeditionIssues">${issues.map((issue) => `<li>${issue}</li>`).join('')}</ul>` : ''}`;
}

function renderMission() {
  const host = document.getElementById('expeditionMission');
  if (!host || !activeExpedition) return;
  if (localTransitRefreshTimer) {
    window.clearTimeout(localTransitRefreshTimer);
    localTransitRefreshTimer = 0;
  }
  const expedition = activeExpedition;
  let action = '';
  if (expedition.activeLocalContactId) {
    const activeContact = expedition.routeContacts?.find((contact) => contact.id === expedition.activeLocalContactId);
    const localTransitActive = Boolean(activeContext?.universeRuntime?.transition);
    const recovery = expedition.localOperation?.recoveryRequirement;
    const purpose = recovery
      ? `Engineering needs suitable feedstock before it can restore ${recovery.systemId.replaceAll('-', ' ')}. The current cargo is ${Math.round(recovery.fabricationFeedstockShortfallKg)} kg short of a fabrication batch.`
      : 'The field team can collect a documented geology sample for Surveyor science.';
    action = `<div class="expeditionEvent"><span>LOCAL SURVEY</span><h3>${activeContact?.designation || 'Route contact'}</h3><p>${purpose} Surveyor will hold this voyage chapter while you fly, land, and return.</p><div>${localTransitActive ? '' : `<button id="expeditionSetSurveyCourse" class="expeditionChoice" type="button">Set course to ${activeContact?.designation || 'contact'} I</button>`}<button id="expeditionReturnFromContact" class="expeditionChoice" type="button" ${localTransitActive ? 'disabled' : ''}>${localTransitActive ? 'Local approach in progress' : 'Return to Surveyor'}</button></div></div>`;
    if (localTransitActive) {
      localTransitRefreshTimer = window.setTimeout(() => {
        localTransitRefreshTimer = 0;
        if (!document.getElementById('expeditionOverlay')?.hidden && activeExpedition?.activeLocalContactId) renderMission();
      }, 250);
    }
  } else if (expedition.state === 'planned') {
    action = `<button id="expeditionDepart" class="expeditionPrimary" type="button" ${expedition.readiness.status === 'insufficient' ? 'disabled' : ''}>Depart on Surveyor</button>`;
  } else if (expedition.pendingEvent) {
    const options = expedition.pendingEvent.options || expedition.pendingEvent.choices.map((id) => ({ id, label: id.replaceAll('-', ' '), enabled: true, reason: '' }));
    const choices = options.map((option) => `<div class="expeditionChoiceRow"><button class="expeditionChoice" data-choice="${option.id}" type="button" ${option.enabled ? '' : 'disabled'}>${option.label}</button>${option.reason ? `<small>${option.reason}</small>` : ''}</div>`).join('');
    action = `<div class="expeditionEvent"><span>${expedition.pendingEvent.kind}</span><h3>${expedition.pendingEvent.title}</h3><p>${expedition.pendingEvent.message}</p><small>Respond from ${String(expedition.pendingEvent.roomId || 'the ship').replaceAll('-', ' ')}.</small><div>${choices}</div></div>`;
  } else if (expedition.state === 'traveling') {
    action = `<button id="expeditionAdvance" class="expeditionPrimary" type="button">Continue to next watch or event</button>`;
  } else if (expedition.state === 'arrived') {
    action = `<button id="expeditionArrive" class="expeditionPrimary" type="button">Continue in local Space</button>`;
  } else if (expedition.state === 'failed') {
    const report = expedition.failureReport;
    action = `<div class="expeditionEvent expeditionFailure"><span>MISSION ENDED</span><h3>${report?.summary || 'Surveyor could not continue.'}</h3>${report?.causes?.length ? `<ol>${report.causes.map((cause) => `<li>${cause}</li>`).join('')}</ol>` : '<p>The Captain’s Log retains the mission record.</p>'}</div>`;
  }
  const log = [...(expedition.log || [])].reverse().slice(0, 6);
  const reachedCount = Math.min(VOYAGE_MILESTONES.length, Number(expedition.voyageDirector?.nextSlotIndex || 0));
  const contacts = expedition.routeContacts || [];
  const shipAction = expedition.readiness.status !== 'insufficient' && expedition.state !== 'failed'
    ? `<div class="expeditionShipAction"><button id="expeditionEnterShip" class="expeditionPrimary" type="button">Enter Surveyor</button><small>Walk the ship, meet the crew, inspect systems, and return to the same flight.</small></div>`
    : '';
  host.innerHTML = `
    ${readinessMarkup(expedition)}
    ${expedition.state !== 'planned' ? `<div class="expeditionProgress"><span style="width:${Math.round(expedition.progress * 100)}%"></span></div><p class="expeditionProgressCopy">${Math.round(expedition.progress * 100)}% of crew-experienced travel complete · ${expedition.state}</p>` : ''}
    ${expedition.state !== 'planned' ? `<section class="expeditionVoyage"><header><span>VOYAGE</span><strong>${String(expedition.voyagePhase || 'departure').replaceAll('-', ' ')}</strong></header><div>${VOYAGE_MILESTONES.map((milestone, index) => `<i class="${index < reachedCount ? 'reached' : index === reachedCount ? 'next' : ''}" title="${String(milestone.phase || milestone.id).replaceAll('-', ' ')}"></i>`).join('')}</div><small>${reachedCount} of ${VOYAGE_MILESTONES.length} voyage chapters reached</small></section>` : ''}
    ${action}
    ${shipAction}
    ${contacts.length ? `<section class="expeditionContacts"><h3>Route Contacts</h3>${contacts.map((contact) => `<p><strong>${contact.designation}</strong><span>${contact.spectralClass} · ${contact.worldClass} · ${String(contact.status).replaceAll('-', ' ')}</span>${!expedition.activeLocalContactId && ['available', 'returned'].includes(contact.localOperationState) ? `<button type="button" data-enter-contact="${contact.id}">Enter local Space</button>` : ''}</p>`).join('')}</section>` : ''}
    <section class="expeditionLog"><h3>Captain's Log</h3>${log.map((entry) => `<p><span>${entry.kind}</span>${entry.message}</p>`).join('')}</section>`;

  document.getElementById('expeditionDepart')?.addEventListener('click', () => {
    activeExpedition = startExpedition(activeExpedition);
    store.save(activeExpedition);
    renderMission();
  });
  document.getElementById('expeditionAdvance')?.addEventListener('click', () => {
    activeExpedition = advanceToNextMilestone(activeExpedition);
    store.save(activeExpedition);
    renderMission();
  });
  host.querySelectorAll('.expeditionChoice').forEach((button) => button.addEventListener('click', () => {
    activeExpedition = resolveExpeditionEvent(activeExpedition, button.dataset.choice);
    store.save(activeExpedition);
    renderMission();
  }));
  document.getElementById('expeditionArrive')?.addEventListener('click', () => {
    const destinationId = activeExpedition.destinationId;
    closeExpeditionPlanner();
    const accepted = activeContext?.travelToUniverseDestination?.(destinationId, {
      kind: 'expedition-arrival',
      routeLabel: 'Surveyor arrival'
    });
    if (!accepted) activeContext?.showSpaceFlightMessage?.('Open Wayfinder to continue at the destination.', '#8ab4ff');
  });
  document.getElementById('expeditionReturnFromContact')?.addEventListener('click', returnFromLocalContact);
  document.getElementById('expeditionSetSurveyCourse')?.addEventListener('click', () => {
    const bodyId = `${activeExpedition?.activeLocalContactId || ''}-i`;
    if (activeContext?.travelToUniverseDestination?.(bodyId, { kind: 'expedition-surface-approach', routeLabel: 'Survey site' })) {
      closeExpeditionPlanner();
      activeContext?.showSpaceFlightMessage?.('SURVEY COURSE SET · APPROACH THE WORLD TO LAND', '#6fe8ff');
    }
  });
  host.querySelectorAll('[data-enter-contact]').forEach((button) => button.addEventListener('click', () => beginLocalContact(button.dataset.enterContact)));
  document.getElementById('expeditionEnterShip')?.addEventListener('click', () => void enterActiveShip());
}

function closeShipStationPanel() {
  document.getElementById('shipStationPanel')?.classList.remove('show');
}

async function recordBaselineInJournal() {
  await activeContext?.recordExplorerEvent?.({
    eventId: `event:space-expedition:${activeExpedition.id}:ship-survey`,
    eventType: 'interstellar-ship-survey',
    sourceSystem: 'interstellar-expedition',
    sourceId: `${activeExpedition.id}:ship-survey`,
    pathId: 'travel',
    name: 'Surveyor stellar baseline',
    detail: 'A stellar baseline was recorded from the Surveyor science lab.',
    regionId: activeExpedition.destinationId,
    regionLabel: String(activeExpedition.destinationId).replaceAll('-', ' '),
    worldIdentity: activeExpedition.destinationId,
    environment: 'SPACE_FLIGHT',
    points: 8,
    firstCompletion: true,
    projections: { journal: true, profile: true, place: false, fieldGuide: false }
  });
}

function renderShipStationPanel(interaction) {
  if (!interaction || !activeExpedition) return false;
  let panel = document.getElementById('shipStationPanel');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'shipStationPanel';
    document.body.appendChild(panel);
  }
  const view = getShipStationView(activeExpedition, interaction.id);
  const voyageEvent = activeExpedition.pendingEvent?.roomId === interaction.roomId ? activeExpedition.pendingEvent : null;
  const voyageEventMarkup = voyageEvent ? `<section class="ship-voyage-response">
    <span>ACTIVE VOYAGE EVENT</span><h3>${voyageEvent.title}</h3><p>${voyageEvent.message}</p>
    <div>${(voyageEvent.options || []).map((option) => `<div><button type="button" data-voyage-response="${option.id}" ${option.enabled ? '' : 'disabled'}>${option.label}</button>${option.reason ? `<small>${option.reason}</small>` : ''}</div>`).join('')}</div>
  </section>` : '';
  panel.innerHTML = `<div class="ship-station-card" role="dialog" aria-modal="true" aria-labelledby="shipStationTitle">
    <header><div><span>SURVEYOR SYSTEM</span><strong id="shipStationTitle">${view.title}</strong></div><button type="button" data-close-station aria-label="Close station">×</button></header>
    <p>${view.summary}</p>
    ${voyageEventMarkup}
    <div class="ship-station-metrics">${view.metrics.map((metric) => `<div><span>${metric.label}</span><strong>${metric.value}</strong></div>`).join('')}</div>
    ${view.actions.length ? `<div class="ship-station-actions">${view.actions.map((action) => `<button type="button" data-ship-action="${action.id}" ${action.enabled ? '' : 'disabled'}>${action.label}</button>${action.reason ? `<small>${action.reason}</small>` : ''}`).join('')}</div>` : '<small class="ship-station-readonly">This station is informational during the current voyage state.</small>'}
  </div>`;
  panel.classList.add('show');
  panel.querySelector('[data-close-station]')?.addEventListener('click', closeShipStationPanel);
  panel.querySelectorAll('[data-ship-action]').forEach((button) => button.addEventListener('click', async () => {
    const actionId = button.dataset.shipAction;
    const result = applyShipOperation(activeExpedition, actionId);
    if (!result.changed) {
      activeContext?.showToast?.(result.message);
      return;
    }
    activeExpedition = result.expedition;
    store.save(activeExpedition);
    activeContext?.updateExpeditionShipRecord?.(activeExpedition);
    activeContext?.playExpeditionShipAction?.({ actionId, message: result.message, interaction });
    if (actionId === 'record-baseline') await recordBaselineInJournal();
    activeContext?.showToast?.(result.message);
    renderShipStationPanel(interaction);
  }));
  panel.querySelectorAll('[data-voyage-response]').forEach((button) => button.addEventListener('click', () => {
    const previousId = activeExpedition.pendingEvent?.id;
    const next = resolveExpeditionEvent(activeExpedition, button.dataset.voyageResponse);
    if (next === activeExpedition || next.pendingEvent?.id === previousId) {
      activeContext?.showToast?.('That response is not available with the current crew and stores.');
      return;
    }
    activeExpedition = next;
    store.save(activeExpedition);
    activeContext?.updateExpeditionShipRecord?.(activeExpedition);
    activeContext?.playExpeditionShipAction?.({
      actionId: 'event-response',
      kind: activeExpedition.failureReport ? 'alert' : 'operation',
      message: activeExpedition.log.at(-1)?.message || 'The crew completed the response.',
      interaction
    });
    activeContext?.showToast?.(activeExpedition.log.at(-1)?.message || 'The crew completed the response.');
    renderShipStationPanel(interaction);
  }));
  return true;
}

async function handleShipInteraction(interaction) {
  return renderShipStationPanel(interaction);
}

async function enterActiveShip() {
  if (!activeExpedition || !activeContext?.spaceFlight?.active) return false;
  const ship = await import('./ship-interior.js?v=7');
  closeExpeditionPlanner();
  const entered = ship.enterSurveyorInterior({
    expedition: activeExpedition,
    onInteraction: handleShipInteraction
  });
  if (!entered) {
    openExpeditionPlanner(activeContext);
    activeContext?.showSpaceFlightMessage?.('The Surveyor interior is unavailable right now.', '#f59e0b');
  }
  return entered;
}

function openExpeditionPlanner(appContext) {
  activeContext = appContext || activeContext;
  if (activeContext) Object.assign(activeContext, {
    collectExpeditionGeologySample,
    getInterstellarExpeditionSnapshot: getExpeditionSnapshot,
    leaveExpeditionSurface
  });
  store ||= createExpeditionStore();
  activeExpedition = store.load();
  syncExpeditionContacts(activeExpedition);
  ensureStylesheet();
  let root = overlay();
  if (!root) {
    root = document.createElement('div');
    root.id = 'expeditionOverlay';
    root.className = 'expeditionOverlay';
    document.body.appendChild(root);
  }
  root.hidden = false;
  renderPlanner();
  window.setTimeout(() => root.querySelector('select,button')?.focus(), 0);
  return true;
}

function closeExpeditionPlanner() {
  if (localTransitRefreshTimer) {
    window.clearTimeout(localTransitRefreshTimer);
    localTransitRefreshTimer = 0;
  }
  const root = overlay();
  if (root) root.hidden = true;
  return true;
}

function getExpeditionSnapshot() {
  return activeExpedition ? JSON.parse(JSON.stringify(activeExpedition)) : null;
}

export { closeExpeditionPlanner, getExpeditionSnapshot, openExpeditionPlanner };
