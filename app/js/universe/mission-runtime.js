import { getDestinationMission } from './mission-catalog.js?v=2';
import { createDestinationMissionStore, DESTINATION_MISSION_PHASE } from './mission-authority.js?v=2';
import { resolveUniverseAddress } from './catalog.js?v=11';
import { DEFAULT_CREW } from '../expedition/catalog.js?v=2';
import { createExpeditionPlan } from '../expedition/model.js?v=8';
import { startExpedition } from '../expedition/simulation.js?v=7';
import { createExpeditionStore } from '../expedition/store.js?v=8';

let activeContext = null;
let missionStore = null;
let scanTimer = 0;
let fieldEvidenceBound = false;

const SURFACE_EVIDENCE = Object.freeze(['photograph', 'geology-inspect', 'habitat-survey']);
const THERMAL_ORBIT_EVIDENCE = Object.freeze(['dayside', 'terminator', 'nightside']);
const SURFACE_MISSION_PLANS = Object.freeze({
  'trappist-1-e': Object.freeze([
    Object.freeze({ activityId: 'photograph', evidenceId: 'terminator-panorama', label: 'Photograph the light-and-shadow boundary', family: 'places', description: 'Record the modeled terminator terrain while treating surface and atmosphere as unresolved.' }),
    Object.freeze({ activityId: 'geology-inspect', evidenceId: 'surface-chemistry', label: 'Inspect weathering-sensitive material', family: 'rock', description: 'Compare modeled surface material against the mission chemistry baseline without claiming a real sample.' }),
    Object.freeze({ activityId: 'habitat-survey', evidenceId: 'climate-boundary', label: 'Measure the local energy boundary', family: 'places', description: 'Record the modeled thermal and radiation environment across the survey valley.' })
  ]),
  'trappist-1-f': Object.freeze([
    Object.freeze({ activityId: 'photograph', evidenceId: 'volatile-panorama', label: 'Photograph the cold highland margin', family: 'places', description: 'Record fractured highlands where modeled volatile stability changes with exposure.' }),
    Object.freeze({ activityId: 'geology-inspect', evidenceId: 'volatile-sample', label: 'Inspect a volatile-bearing surface analog', family: 'mineral', description: 'Inspect modeled cold-surface material without asserting ice, ocean, or atmosphere is present.' }),
    Object.freeze({ activityId: 'habitat-survey', evidenceId: 'thermal-gradient', label: 'Measure the highland thermal gradient', family: 'places', description: 'Compare modeled temperature and radiation conditions between the valley and exposed ridge.' })
  ])
});

function surfaceEvidencePlan(mission) {
  const authored = SURFACE_MISSION_PLANS[mission?.destinationId];
  if (authored) return authored;
  return Object.freeze(SURFACE_EVIDENCE.map((activityId) => Object.freeze({
    activityId,
    evidenceId: activityId,
    label: activityId === 'photograph' ? 'Photograph the landing area' : activityId === 'geology-inspect' ? 'Inspect a surface sample' : 'Measure the field environment',
    family: activityId === 'geology-inspect' ? 'rock' : 'places',
    description: activityId === 'photograph'
      ? 'Record the modeled landing area and preserve its game-world context.'
      : activityId === 'geology-inspect'
        ? 'Inspect modeled surface material without claiming a real sample from this planet.'
        : 'Record radiation and thermal conditions derived from the mission model, with atmosphere and life unresolved.'
  })));
}

function currentDefinition() {
  const missionId = missionStore?.load?.().activeMissionId;
  const destinationId = missionId?.startsWith('mission:') ? missionId.slice(8) : '';
  return getDestinationMission(destinationId);
}

function assessmentLabel(mission) {
  const assessment = mission?.habitability;
  if (!assessment) return mission?.scope === 'system' ? 'Stellar-system mission' : 'Planetary mission';
  if (assessment.candidate) return assessment.zone === 'conservative-zone-candidate' ? 'Temperate rocky-world candidate' : 'Outer habitability candidate';
  if (assessment.zone === 'interior-hot') return 'High-irradiation world';
  if (assessment.zone === 'exterior-cold') return 'Low-insolation world';
  return 'Planetary environment unresolved';
}

function evidenceProfile(mission) {
  if (mission?.truthClass === 'fictional-game-world') return 'Original World Explorer destination';
  if (mission?.truthClass === 'observed-context-with-modeled-gameplay') return 'Astronomical observations · simulated fieldwork';
  return 'Published orbital data · simulated fieldwork';
}

function phaseObjective(mission, state) {
  const index = {
    [DESTINATION_MISSION_PHASE.AVAILABLE]: 0,
    [DESTINATION_MISSION_PHASE.APPROACH]: 1,
    [DESTINATION_MISSION_PHASE.FIELDWORK]: 2,
    [DESTINATION_MISSION_PHASE.ANALYSIS]: 3,
    [DESTINATION_MISSION_PHASE.COMPLETE]: 4
  }[state.phase] ?? 0;
  return index >= mission.stages.length ? 'Mission complete.' : mission.stages[index].label;
}

function requiresSurfaceMission(mission) {
  return Boolean(mission?.scope === 'planet' && mission.operation.includes('surface'));
}

function orbitalEvidencePlan(mission) {
  if (mission?.operation === 'thermal-orbital-survey') return THERMAL_ORBIT_EVIDENCE;
  if (mission?.operation === 'transit-network-survey') return mission.observationTargets;
  return null;
}

function thermalObservationZone(mission) {
  const target = activeContext?.getUniverseHudTarget?.();
  const rocket = activeContext?.spaceFlight?.rocket;
  const star = activeContext?.universeRuntime?.frameGroup?.userData?.destinationMeshes?.get?.(mission?.systemId);
  if (!target?.position || !rocket || !star) return null;
  const starPosition = new THREE.Vector3();
  star.getWorldPosition(starPosition);
  const observerDirection = rocket.position.clone().sub(target.position).normalize();
  const starDirection = starPosition.sub(target.position).normalize();
  const illumination = observerDirection.dot(starDirection);
  if (illumination > 0.35) return 'dayside';
  if (illumination < -0.35) return 'nightside';
  return 'terminator';
}

function nextOrbitalEvidence(mission, state) {
  return orbitalEvidencePlan(mission)?.find((id) => !state.evidence.includes(id)) || null;
}

function transitObservationReady(mission, destinationId) {
  const universe = activeContext?.universeRuntime;
  if (!destinationId || universe?.transition || universe?.current?.id !== mission?.systemId) return false;
  if (universe?.course?.destination?.id !== destinationId) return false;
  const target = activeContext?.getUniverseHudTarget?.();
  const rocket = activeContext?.spaceFlight?.rocket;
  return Boolean(
    target?.destinationId === destinationId
    && rocket
    && rocket.position.distanceTo(target.position) <= Math.max(180, Number(target.radius || 6) * 20)
  );
}

function destinationLabel(destinationId) {
  return resolveUniverseAddress(destinationId)?.name || String(destinationId || '').replaceAll('-', ' ');
}

function stableSeed(value) {
  let hash = 2166136261;
  for (const character of String(value || '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function ensureDestinationExpedition(mission) {
  const store = createExpeditionStore();
  const current = store.load();
  if (current) return current;
  const now = Date.now();
  const planned = createExpeditionPlan({
    destinationId: mission.systemId,
    crew: DEFAULT_CREW,
    createdAtMs: now,
    id: `destination-expedition-${mission.systemId}-${now}`
  });
  const started = startExpedition(planned, now + 1);
  store.save(started);
  return started;
}

function prepareDestinationMissionSurface(destinationId = currentDefinition()?.destinationId) {
  const mission = getDestinationMission(destinationId);
  if (!requiresSurfaceMission(mission) || typeof activeContext?.registerExpeditionSolidWorld !== 'function') return null;
  const destination = resolveUniverseAddress(mission.destinationId);
  const system = resolveUniverseAddress(mission.systemId);
  if (!destination || !system) return null;
  const originalGameWorld = mission.truthClass === 'fictional-game-world';
  return activeContext.registerExpeditionSolidWorld({
    id: destination.id,
    name: destination.name,
    seed: stableSeed(destination.id),
    parentSystemId: system.id,
    radiusEarth: destination.radiusEarth,
    massEarth: destination.massEarth,
    starMassSolar: system.physical?.hostMassSolar,
    semiMajorAxisAu: destination.semiMajorAxisAu,
    equilibriumTemperatureK: mission.habitability?.equilibriumTemperatureK,
    habitabilityCandidate: mission.habitability?.candidate === true,
    originalGameWorld,
    returnMode: 'destination-mission',
    context: originalGameWorld
      ? `${mission.title} · original game-world field survey`
      : `${mission.title} · protected field survey · atmosphere unresolved`,
    representation: originalGameWorld
      ? 'Original World Explorer terrain, atmosphere, and weather model'
      : 'Modeled terrain based on published orbital parameters · no observed surface imagery',
    source: {
      title: `${destination.name} mission surface model`,
      provider: 'World Explorer 3D',
      attribution: 'Modeled from the destination catalog and mission parameters',
      rights: 'World Explorer 3D generated game content',
      processing: 'Local relief and appearance are generated for gameplay. They do not depict an observed landing site.'
    },
    fieldNotes: surfaceEvidencePlan(mission).map((entry) => [entry.label, entry.activityId, entry.family, entry.description])
  });
}

function isDestinationMissionSurfaceTarget(destinationId) {
  const mission = currentDefinition();
  return Boolean(
    requiresSurfaceMission(mission)
    && mission.destinationId === String(destinationId || '')
    && [DESTINATION_MISSION_PHASE.FIELDWORK, DESTINATION_MISSION_PHASE.ANALYSIS].includes(missionStore?.get?.(mission)?.phase)
  );
}

function ensurePanel() {
  let panel = document.getElementById('destinationMissionPanel');
  if (panel) return panel;
  panel = document.createElement('section');
  panel.id = 'destinationMissionPanel';
  panel.className = 'destination-mission-panel';
  panel.hidden = true;
  document.body.appendChild(panel);
  return panel;
}

function closeDestinationMission() {
  const panel = document.getElementById('destinationMissionPanel');
  if (panel) panel.hidden = true;
}

function missionAtDestination(mission) {
  const universe = activeContext?.universeRuntime;
  if (!mission || !universe || universe.transition) return false;
  if (activeContext?.activePlanetaryBodyId === mission.destinationId) return true;
  if (mission.scope === 'system') return universe.current?.id === mission.destinationId;
  if (mission.scope === 'planet') {
    if (universe.current?.id !== mission.systemId || universe.course?.destination?.id !== mission.destinationId) return false;
    const target = activeContext?.getUniverseHudTarget?.();
    const rocket = activeContext?.spaceFlight?.rocket;
    return Boolean(target?.destinationId === mission.destinationId && rocket && rocket.position.distanceTo(target.position) <= Math.max(180, Number(target.radius || 6) * 20));
  }
  return activeContext?.activePlanetaryBodyId === mission.destinationId;
}

function renderDestinationMission(destinationId = '') {
  const mission = getDestinationMission(destinationId) || currentDefinition();
  if (!mission || !missionStore) return false;
  const panel = ensurePanel();
  const state = missionStore.get(mission);
  const assessment = mission.habitability;
  const evidence = assessment
    ? `<div class="destination-mission-evidence"><span>${assessmentLabel(mission)}</span><strong>${assessment.insolationEarth == null ? 'Energy unknown' : `${assessment.insolationEarth.toFixed(2)}× Earth energy`} · ${assessment.rockyLikelihood} rocky confidence</strong><small>${assessment.caveat}</small></div>`
    : `<div class="destination-mission-evidence"><span>${assessmentLabel(mission)}</span><strong>${evidenceProfile(mission)}</strong><small>${mission.lifePolicy}</small></div>`;
  const stageRows = mission.stages.map((stage, index) => {
    const currentIndex = ['available', 'approach', 'fieldwork', 'analysis', 'complete'].indexOf(state.phase);
    const status = index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'locked';
    return `<li class="${status}"><i aria-hidden="true">${status === 'complete' ? '✓' : index + 1}</i><span>${stage.label}</span></li>`;
  }).join('');
  let action = '';
  if (state.phase === DESTINATION_MISSION_PHASE.AVAILABLE) {
    action = '<button type="button" class="universe-action primary" data-mission-begin>Begin mission</button>';
  } else if (state.phase === DESTINATION_MISSION_PHASE.APPROACH) {
    action = `<button type="button" class="universe-action primary" data-mission-course>${missionAtDestination(mission) ? 'Local frame acquired' : `Set course for ${mission.destinationName}`}</button>`;
  } else if (state.phase === DESTINATION_MISSION_PHASE.FIELDWORK) {
    if (requiresSurfaceMission(mission)) {
      const evidencePlan = surfaceEvidencePlan(mission);
      const evidenceCount = evidencePlan.filter((entry) => state.evidence.includes(entry.evidenceId)).length;
      action = activeContext?.activePlanetaryBodyId === mission.destinationId
        ? `<button type="button" class="universe-action" disabled>Surface record ${evidenceCount} of ${evidencePlan.length} · use the marked field stations</button>`
        : `<button type="button" class="universe-action" disabled>${missionAtDestination(mission) ? 'Board Surveyor and launch from the Pod Bay' : 'Reach the marked planet before launching the pod'}</button>`;
    } else if (orbitalEvidencePlan(mission)) {
      const nextEvidence = nextOrbitalEvidence(mission, state);
      if (mission.operation === 'transit-network-survey') {
        const selected = activeContext?.universeRuntime?.course?.destination?.id === nextEvidence;
        const ready = transitObservationReady(mission, nextEvidence) && !scanTimer;
        const label = scanTimer
          ? 'Transit record in progress…'
          : !selected
            ? `Set local course for ${destinationLabel(nextEvidence)}`
            : ready
              ? `Record ${destinationLabel(nextEvidence)} transit`
              : `Approach ${destinationLabel(nextEvidence)} · flight assist is available`;
        const actionAttribute = !selected ? 'data-mission-local-course' : ready ? 'data-mission-field' : 'disabled';
        action = `<button type="button" class="universe-action ${!selected || ready ? 'primary' : ''}" ${actionAttribute}>${label}</button>`;
      } else {
        const currentZone = missionAtDestination(mission) ? thermalObservationZone(mission) : null;
        const ready = nextEvidence && currentZone === nextEvidence && !scanTimer;
        const label = scanTimer
          ? 'Thermal pass in progress…'
          : !missionAtDestination(mission)
            ? 'Reach the marked observation orbit'
            : ready
              ? `Scan the ${nextEvidence}`
              : `Move to the ${nextEvidence} observation angle · now ${currentZone || 'unresolved'}`;
        action = `<button type="button" class="universe-action ${ready ? 'primary' : ''}" data-mission-field ${ready ? '' : 'disabled'}>${label}</button>`;
      }
    } else {
      action = `<button type="button" class="universe-action primary" data-mission-field ${missionAtDestination(mission) && !scanTimer ? '' : 'disabled'}>${scanTimer ? 'Survey in progress…' : missionAtDestination(mission) ? 'Run mission survey' : 'Reach the marked survey position'}</button>`;
    }
  } else if (state.phase === DESTINATION_MISSION_PHASE.ANALYSIS) {
    action = '<button type="button" class="universe-action" disabled>Complete analysis in Surveyor’s Analysis Lab</button>';
  } else {
    action = '<button type="button" class="universe-action" disabled>Mission recorded in the Captain’s Log</button>';
  }
  panel.innerHTML = `<article class="destination-mission-card" role="dialog" aria-modal="true" aria-labelledby="destinationMissionTitle">
    <header><div><span>DESTINATION MISSION · ${mission.destinationName}</span><h2 id="destinationMissionTitle">${mission.title}</h2></div><button type="button" class="universe-icon-button" data-mission-close aria-label="Close mission">×</button></header>
    <p>${mission.premise}</p>${evidence}
    <div class="destination-mission-current"><span>CURRENT OBJECTIVE</span><strong>${phaseObjective(mission, state)}</strong></div>
    <ol>${stageRows}</ol>
    <div class="destination-mission-actions">${action}</div>
  </article>`;
  panel.hidden = false;
  panel.querySelector('[data-mission-close]')?.addEventListener('click', closeDestinationMission);
  panel.querySelector('[data-mission-begin]')?.addEventListener('click', () => {
    ensureDestinationExpedition(mission);
    missionStore.activate(mission);
    missionStore.advance(mission, 'review_briefing', { evidenceId: `${mission.id}:briefing` });
    activeContext?.showSpaceFlightMessage?.(`MISSION READY · ${mission.title.toUpperCase()}`, '#6fe8ff');
    renderDestinationMission(mission.destinationId);
  });
  panel.querySelector('[data-mission-course]')?.addEventListener('click', () => {
    if (missionAtDestination(mission)) return renderDestinationMission(mission.destinationId);
    const accepted = activeContext?.travelToUniverseDestination?.(mission.destinationId, { kind: 'destination-mission', routeLabel: mission.title });
    if (accepted) closeDestinationMission();
    else activeContext?.showSpaceFlightMessage?.('Finish the current flight transition before setting this mission course.', '#f59e0b');
  });
  panel.querySelector('[data-mission-field]')?.addEventListener('click', () => performDestinationMissionFieldwork());
  panel.querySelector('[data-mission-local-course]')?.addEventListener('click', () => {
    const targetId = nextOrbitalEvidence(mission, missionStore.get(mission));
    const accepted = activeContext?.travelToUniverseDestination?.(targetId, {
      kind: 'destination-mission-local-target',
      routeLabel: mission.title
    });
    if (accepted) renderDestinationMission(mission.destinationId);
  });
  return true;
}

function recordSurfaceMissionEvidence(event) {
  const activity = event?.detail?.activity;
  const mission = currentDefinition();
  if (!activity || !requiresSurfaceMission(mission) || activity.bodyId !== mission.destinationId) return false;
  const state = missionStore.get(mission);
  const evidencePlan = surfaceEvidencePlan(mission);
  const objective = evidencePlan.find((entry) => entry.activityId === activity.activityId);
  if (state.phase !== DESTINATION_MISSION_PHASE.FIELDWORK || !objective) return false;
  missionStore.recordEvidence(mission, objective.evidenceId, { evidenceId: activity.id });
  const updated = missionStore.get(mission);
  const secured = evidencePlan.filter((entry) => updated.evidence.includes(entry.evidenceId));
  if (secured.length < evidencePlan.length) {
    activeContext?.showSpaceFlightMessage?.(`FIELD RECORD ${secured.length}/${evidencePlan.length} · ${activity.label.toUpperCase()}`, '#83e6a6');
    return true;
  }
  const result = missionStore.advance(mission, 'complete_fieldwork', { evidenceId: `${mission.id}:surface-field-package` });
  if (result.accepted) activeContext?.showSpaceFlightMessage?.('SURFACE SURVEY COMPLETE · RETURN TO SURVEYOR ANALYSIS', '#83e6a6');
  return result.accepted;
}

function openDestinationMission(destinationId) {
  return renderDestinationMission(destinationId);
}

function markMissionArrived(mission) {
  const state = missionStore.get(mission);
  if (state.phase !== DESTINATION_MISSION_PHASE.APPROACH) return false;
  const result = missionStore.advance(mission, 'arrive', { evidenceId: `${mission.id}:local-frame` });
  if (!result.accepted) return false;
  activeContext?.showSpaceFlightMessage?.(`MISSION AREA ACQUIRED · ${mission.title.toUpperCase()}`, '#68d8c0');
  return true;
}

function updateDestinationMissionRuntime() {
  const mission = currentDefinition();
  if (!mission || !missionStore) return;
  if (missionStore.get(mission).phase === DESTINATION_MISSION_PHASE.APPROACH && missionAtDestination(mission)) {
    markMissionArrived(mission);
  }
}

function performDestinationMissionFieldwork() {
  const mission = currentDefinition();
  if (!mission || !missionStore || missionStore.get(mission).phase !== DESTINATION_MISSION_PHASE.FIELDWORK || !missionAtDestination(mission) || scanTimer) return false;
  const state = missionStore.get(mission);
  const orbitEvidence = nextOrbitalEvidence(mission, state);
  if (mission.operation === 'thermal-orbital-survey' && orbitEvidence && thermalObservationZone(mission) !== orbitEvidence) return false;
  if (mission.operation === 'transit-network-survey' && orbitEvidence && !transitObservationReady(mission, orbitEvidence)) return false;
  const operation = orbitEvidence ? `${mission.operation}:${orbitEvidence}` : mission.operation;
  const scanDestinationId = mission.operation === 'transit-network-survey' ? orbitEvidence : mission.destinationId;
  const started = activeContext?.playDestinationMissionScan?.(scanDestinationId, operation) !== false;
  if (!started) return false;
  activeContext?.showSpaceFlightMessage?.(`SURVEY ACTIVE · ${mission.destinationName.toUpperCase()}`, '#8fe7ff');
  scanTimer = window.setTimeout(() => {
    scanTimer = 0;
    if (orbitEvidence) missionStore.recordEvidence(mission, orbitEvidence, { evidenceId: `${mission.id}:${orbitEvidence}` });
    const remainingEvidence = nextOrbitalEvidence(mission, missionStore.get(mission));
    if (remainingEvidence) {
      activeContext?.showSpaceFlightMessage?.(`${orbitEvidence.toUpperCase()} RECORD SECURED · MOVE TO ${remainingEvidence.toUpperCase()}`, '#83e6a6');
      if (!document.getElementById('destinationMissionPanel')?.hidden) renderDestinationMission(mission.destinationId);
      return;
    }
    const result = missionStore.advance(mission, 'complete_fieldwork', { evidenceId: `${mission.id}:${mission.operation}` });
    if (result.accepted) {
      activeContext?.showSpaceFlightMessage?.('SURVEY EVIDENCE SECURED · RETURN TO SURVEYOR ANALYSIS', '#83e6a6');
      if (!document.getElementById('destinationMissionPanel')?.hidden) renderDestinationMission(mission.destinationId);
    }
  }, orbitEvidence ? 1400 : 2200);
  renderDestinationMission(mission.destinationId);
  return true;
}

async function completeDestinationMissionAnalysis() {
  const mission = currentDefinition();
  if (!mission || !missionStore || missionStore.get(mission).phase !== DESTINATION_MISSION_PHASE.ANALYSIS) return false;
  const result = missionStore.advance(mission, 'complete_analysis', { evidenceId: `${mission.id}:analysis` });
  if (!result.accepted) return false;
  await activeContext?.recordExplorerEvent?.({
    eventId: `event:destination-mission:${mission.destinationId}`,
    eventType: 'destination-mission-complete',
    sourceSystem: 'destination-missions',
    sourceId: mission.id,
    pathId: 'space-science',
    name: mission.title,
    detail: `${mission.destinationName}: ${mission.premise}`,
    regionId: mission.systemId,
    regionLabel: mission.destinationName,
    worldIdentity: mission.destinationId,
    environment: 'SPACE_FLIGHT',
    points: 30,
    firstCompletion: true,
    projections: { journal: true, profile: true, place: false, fieldGuide: true }
  });
  activeContext?.showToast?.(`${mission.title} completed and recorded.`);
  return true;
}

function destinationMissionSnapshot() {
  if (!missionStore) return null;
  const mission = currentDefinition();
  if (!mission) return { activeMissionId: null, coverage: null };
  const state = missionStore.get(mission);
  return {
    activeMissionId: mission.id,
    destinationId: mission.destinationId,
    systemId: mission.systemId,
    title: mission.title,
    phase: state.phase,
    currentObjective: phaseObjective(mission, state),
    atDestination: missionAtDestination(mission),
    surfaceRequired: requiresSurfaceMission(mission),
    habitability: mission.habitability ? {
      zone: mission.habitability.zone,
      candidate: mission.habitability.candidate,
      lifeEvidence: mission.habitability.lifeEvidence
    } : null,
    evidence: [...state.evidence],
    evidenceRequired: requiresSurfaceMission(mission)
      ? surfaceEvidencePlan(mission).map((entry) => entry.evidenceId)
      : orbitalEvidencePlan(mission) ? [...orbitalEvidencePlan(mission)] : []
  };
}

function initDestinationMissionRuntime(appContext) {
  activeContext = appContext || activeContext;
  missionStore ||= createDestinationMissionStore();
  if (!fieldEvidenceBound) {
    fieldEvidenceBound = true;
    globalThis.addEventListener?.('we3d:planetary-field-recorded', recordSurfaceMissionEvidence);
  }
  if (activeContext) Object.assign(activeContext, {
    completeDestinationMissionAnalysis,
    getDestinationMissionSnapshot: destinationMissionSnapshot,
    isDestinationMissionSurfaceTarget,
    openDestinationMission,
    prepareDestinationMissionSurface,
    performDestinationMissionFieldwork,
    updateDestinationMissionRuntime
  });
  ensurePanel();
  return missionStore;
}

export {
  closeDestinationMission,
  completeDestinationMissionAnalysis,
  destinationMissionSnapshot,
  initDestinationMissionRuntime,
  openDestinationMission,
  isDestinationMissionSurfaceTarget,
  prepareDestinationMissionSurface,
  performDestinationMissionFieldwork,
  updateDestinationMissionRuntime
};
