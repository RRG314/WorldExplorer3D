import { getDestinationMission } from './mission-catalog.js?v=1';
import { createDestinationMissionStore, DESTINATION_MISSION_PHASE } from './mission-authority.js?v=1';

let activeContext = null;
let missionStore = null;
let scanTimer = 0;

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
    action = `<button type="button" class="universe-action primary" data-mission-field ${missionAtDestination(mission) && !scanTimer ? '' : 'disabled'}>${scanTimer ? 'Survey in progress…' : missionAtDestination(mission) ? 'Run mission survey' : 'Reach the marked survey position'}</button>`;
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
  return true;
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
  const started = activeContext?.playDestinationMissionScan?.(mission.destinationId, mission.operation) !== false;
  if (!started) return false;
  activeContext?.showSpaceFlightMessage?.(`SURVEY ACTIVE · ${mission.destinationName.toUpperCase()}`, '#8fe7ff');
  scanTimer = window.setTimeout(() => {
    scanTimer = 0;
    const result = missionStore.advance(mission, 'complete_fieldwork', { evidenceId: `${mission.id}:${mission.operation}` });
    if (result.accepted) {
      activeContext?.showSpaceFlightMessage?.('SURVEY EVIDENCE SECURED · RETURN TO SURVEYOR ANALYSIS', '#83e6a6');
      if (!document.getElementById('destinationMissionPanel')?.hidden) renderDestinationMission(mission.destinationId);
    }
  }, 2200);
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
    title: mission.title,
    phase: state.phase,
    currentObjective: phaseObjective(mission, state),
    atDestination: missionAtDestination(mission),
    habitability: mission.habitability ? {
      zone: mission.habitability.zone,
      candidate: mission.habitability.candidate,
      lifeEvidence: mission.habitability.lifeEvidence
    } : null
  };
}

function initDestinationMissionRuntime(appContext) {
  activeContext = appContext || activeContext;
  missionStore ||= createDestinationMissionStore();
  if (activeContext) Object.assign(activeContext, {
    completeDestinationMissionAnalysis,
    getDestinationMissionSnapshot: destinationMissionSnapshot,
    openDestinationMission,
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
  performDestinationMissionFieldwork,
  updateDestinationMissionRuntime
};
