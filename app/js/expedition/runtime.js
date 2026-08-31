import { DEFAULT_CREW, PROPULSION_PROFILES, SHIP_PROFILES } from './catalog.js?v=2';
import { createExpeditionPlan, withExpeditionChanges } from './model.js?v=2';
import {
  advanceToNextMilestone,
  resolveExpeditionEvent,
  startExpedition
} from './simulation.js?v=2';
import { createExpeditionStore } from './store.js?v=3';
import { getUniverseDestinations, resolveUniverseAddress } from '../universe/catalog.js?v=10';

let activeContext = null;
let activeExpedition = null;
let store = null;

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
  link.href = 'styles/expedition.css?v=2';
  document.head.appendChild(link);
}

function availableDestinations() {
  return getUniverseDestinations().filter((item) => item.objectClass === 'planetary_system' && item.id !== 'sol');
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
    `<option value="${destination.id}">${destination.name}</option>`
  ).join('');
  const propulsionOptions = PROPULSION_PROFILES.filter((profile) => profile.crewedInterstellarEligible).map((profile) =>
    `<option value="${profile.id}">${profile.name} · ${profile.classification}</option>`
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
        <label>Ship<select id="expeditionShip"><option value="${SHIP_PROFILES[0].id}">${SHIP_PROFILES[0].name}</option></select></label>
        <label class="expeditionWide">Propulsion<select id="expeditionPropulsion">${propulsionOptions}</select></label>
      </div>
      <button id="expeditionPlan" class="expeditionPrimary" type="button">Assess expedition</button>
      <div id="expeditionMission" class="expeditionMission" aria-live="polite"></div>
    </section>`;
  root.querySelector('#expeditionDestination').value = 'proxima-centauri';
  root.querySelector('#expeditionPropulsion').value = 'radiant-plasma-field-drive';
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
  return `
    <div class="expeditionSummary">
      <div><span>Destination</span><strong>${destination?.name || expedition.destinationId}</strong></div>
      <div><span>Distance</span><strong>${expedition.calculation.distanceLy.toFixed(2)} ly</strong></div>
      <div><span>Mission time</span><strong>${formatYears(expedition.calculation.externalYears)}</strong></div>
      <div><span>Crew time</span><strong>${formatYears(expedition.calculation.properYears)}</strong></div>
      <div><span>Peak speed</span><strong>${(expedition.calculation.peakVelocityFractionC * 100).toFixed(1)}% c</strong></div>
      <div><span>Assessment</span><strong class="is-${readiness.status}">${readiness.status.toUpperCase()}</strong></div>
    </div>
    <div class="expeditionManifest">
      <section><h3>Crew</h3><p>${expedition.crew.length} ${expedition.state === 'planned' ? 'assigned' : 'aboard'} · command, navigation, engineering, medical, life support, and science covered.</p></section>
      <section><h3>Supplies</h3><p>${formatMass(expedition.resources.foodKg)} food · ${formatMass(expedition.resources.waterKg)} water reserve · ${formatMass(expedition.resources.maintenanceKg)} maintenance material.</p></section>
      <section><h3>Ship</h3><p>Surveyor · the walkable main deck connects the bridge, engineering, life support, quarters, medical, cargo/fabrication, science, and local-craft bay.</p></section>
    </div>
    ${issues.length ? `<ul class="expeditionIssues">${issues.map((issue) => `<li>${issue}</li>`).join('')}</ul>` : ''}`;
}

function renderMission() {
  const host = document.getElementById('expeditionMission');
  if (!host || !activeExpedition) return;
  const expedition = activeExpedition;
  let action = '';
  if (expedition.state === 'planned') {
    action = `<button id="expeditionDepart" class="expeditionPrimary" type="button" ${expedition.readiness.status === 'insufficient' ? 'disabled' : ''}>Depart on Surveyor</button>`;
  } else if (expedition.pendingEvent) {
    const choices = expedition.pendingEvent.choices.map((choice) => `<button class="expeditionChoice" data-choice="${choice}" type="button">${choice === 'replace' ? 'Replace pump' : choice === 'reduce-load' ? 'Reduce reactor load' : choice === 'observe' ? 'Observe object' : 'Continue on course'}</button>`).join('');
    action = `<div class="expeditionEvent"><span>${expedition.pendingEvent.kind}</span><h3>${expedition.pendingEvent.title}</h3><p>${expedition.pendingEvent.message}</p><div>${choices}</div></div>`;
  } else if (expedition.state === 'traveling') {
    action = `<button id="expeditionAdvance" class="expeditionPrimary" type="button">Advance to next event or milestone</button>`;
  } else if (expedition.state === 'arrived') {
    action = `<button id="expeditionArrive" class="expeditionPrimary" type="button">Continue in local Space</button>`;
  }
  const log = [...(expedition.log || [])].reverse().slice(0, 6);
  const shipAction = expedition.readiness.status !== 'insufficient'
    ? `<div class="expeditionShipAction"><button id="expeditionEnterShip" class="expeditionPrimary" type="button">Enter Surveyor</button><small>Walk the ship, meet the crew, inspect systems, and return to the same flight.</small></div>`
    : '';
  host.innerHTML = `
    ${readinessMarkup(expedition)}
    ${expedition.state !== 'planned' ? `<div class="expeditionProgress"><span style="width:${Math.round(expedition.progress * 100)}%"></span></div><p class="expeditionProgressCopy">${Math.round(expedition.progress * 100)}% of crew-experienced travel complete · ${expedition.state}</p>` : ''}
    ${action}
    ${shipAction}
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
  document.getElementById('expeditionEnterShip')?.addEventListener('click', () => void enterActiveShip());
}

function appendShipLog(kind, message) {
  if (!activeExpedition) return false;
  const duplicate = (activeExpedition.log || []).some((entry) => entry.kind === kind && entry.message === message);
  if (duplicate) return false;
  activeExpedition = withExpeditionChanges(activeExpedition, {
    log: Object.freeze([...(activeExpedition.log || []), Object.freeze({
      atMissionS: Number(activeExpedition.strategicElapsedS) || 0,
      kind,
      message
    })])
  });
  store.save(activeExpedition);
  return true;
}

async function handleShipInteraction(interaction) {
  if (!interaction || !activeExpedition) return false;
  const statusById = {
    'bridge-log': `${activeExpedition.state === 'planned' ? 'Expedition staged' : 'Mission underway'} · ${Math.round((activeExpedition.progress || 0) * 100)}% complete.`,
    'medical-status': `${activeExpedition.crew.filter((member) => member.status !== 'dead').length} crew accounted for · medical system ${activeExpedition.systems.medical?.status || 'optimal'}.`,
    'life-support-status': `Life support ${activeExpedition.systems['life-support']?.status || 'optimal'} · ${formatMass(activeExpedition.resources.waterKg)} water reserve.`,
    'fabricator-status': `${formatMass(activeExpedition.resources.maintenanceKg)} maintenance material · ${formatMass(activeExpedition.resources.feedstockKg)} feedstock.`,
    'craft-bay-status': 'Local survey craft secured. Deployment becomes available at supported destination operations.',
    'engineering-status': `Propulsion ${activeExpedition.systems.propulsion?.status || 'optimal'} · thermal ${activeExpedition.systems.thermal?.status || 'optimal'} · power ${activeExpedition.systems.power?.status || 'optimal'}.`
  };
  if (interaction.id === 'science-survey') {
    const message = 'Surveyor stellar baseline recorded from the main science lab.';
    const added = appendShipLog('ship-survey', message);
    if (added) {
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
    activeContext?.showToast?.(added ? 'Stellar baseline saved to the Captain\'s Log and Explorer Journal.' : 'This stellar baseline is already in the log.');
    return true;
  }
  activeContext?.showToast?.(statusById[interaction.id] || interaction.label || 'Surveyor station ready.');
  return true;
}

async function enterActiveShip() {
  if (!activeExpedition || !activeContext?.spaceFlight?.active) return false;
  const ship = await import('./ship-interior.js?v=2');
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
  if (activeContext) activeContext.getInterstellarExpeditionSnapshot = getExpeditionSnapshot;
  store ||= createExpeditionStore();
  activeExpedition = store.load();
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
  const root = overlay();
  if (root) root.hidden = true;
  return true;
}

function getExpeditionSnapshot() {
  return activeExpedition ? JSON.parse(JSON.stringify(activeExpedition)) : null;
}

export { closeExpeditionPlanner, getExpeditionSnapshot, openExpeditionPlanner };
