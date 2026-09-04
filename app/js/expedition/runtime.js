import { DEFAULT_CREW, getPropulsionProfile, getShipProfile, PROPULSION_PROFILES, SHIP_PROFILES } from './catalog.js?v=2';
import { assessExpeditionReadiness, createExpeditionPlan, totalCargoMass, withExpeditionChanges } from './model.js?v=11';
import {
  advanceToNextMilestone,
  resolveExpeditionEvent,
  startExpedition,
  VOYAGE_MILESTONES
} from './simulation.js?v=8';
import { createExpeditionStore } from './store.js?v=11';
import { applyShipOperation, getShipStationView } from './ship-operations.js?v=7';
import { getUniverseDestinations, resolveUniverseAddress } from '../universe/catalog.js?v=11';
import { ensurePlayerBackpackInventory } from '../urban-sandbox/equipment-model.js?v=9';
import { constructOutpost, constructionAvailability, createOutpostSite, serviceOutpost } from './outpost.js?v=1';
import { registerExpeditionDiscovery } from './contact-authority.js?v=4';
import { createPodJourney, POD_PHASE, POD_ROUTE_KIND, transitionPodJourney } from './pod-journey-authority.js?v=2';
import { approvedSampleTradeValue, summarizeExpeditionTransfers } from '../resources/material-catalog.js?v=2';
import { SHIP_STATIONS } from './ship-layout.js?v=5';
import { consumeStagedEarthPod, getStagedEarthPodSnapshot, playSurfacePodLaunch, stageEarthPod } from '../planetary/surface-pod-launch.js?v=8';
import { SPACE_CRAFT_IDENTITY } from '../space/craft-identity.js?v=1';
import { SPACE_TRAVEL_LOCATION, SPACE_TRAVEL_PHASE } from '../space/travel-session.js?v=1';

const STARSHIP_NAME = SPACE_CRAFT_IDENTITY.starship.name;

let activeContext = null;
let activeExpedition = null;
let store = null;
let localTransitRefreshTimer = 0;
let sharedAuthority = null;
let sharedAuthorityRoomCode = '';
let sharedAuthorityLoading = false;
let sharedState = null;
let activePodJourney = null;
let podCourseTimer = 0;
let podRecoveryTimer = 0;

function bindRuntimeContext(appContext) {
  activeContext = appContext || activeContext;
  if (!activeContext) return null;
  Object.assign(activeContext, {
    attemptExpeditionPodDocking,
    boardSolisReachDirect,
    collectExpeditionGeologySample,
    getExpeditionPodDockingTarget,
    getInterstellarExpeditionSnapshot: getExpeditionSnapshot,
    getStagedEarthPodSnapshot,
    leaveExpeditionSurface,
    leaveDestinationMissionSurface,
    launchEarthPathfinderToSolisReach,
    markExpeditionPodDescent,
    markExpeditionPodLanded,
    markExpeditionPodSurfaceLaunch,
    stageEarthPathfinder
  });
  return activeContext;
}

function prepareSolisReachSurfaceRendezvous(appContext, bodyId = 'earth') {
  bindRuntimeContext(appContext);
  const expedition = ensureTransitExpedition();
  if (!activeContext || !expedition) return false;
  const normalizedBodyId = String(bodyId || 'earth').trim().toLowerCase() || 'earth';
  const journeyMatches = activePodJourney?.bodyId === normalizedBodyId;
  if (!journeyMatches || [POD_PHASE.ABOARD, POD_PHASE.RECOVERED, POD_PHASE.FAILED].includes(activePodJourney?.phase)) {
    setPodJourney(createPodJourney({
      expeditionId: expedition.id,
      contactId: `solar-system:${normalizedBodyId}`,
      bodyId: normalizedBodyId,
      returnFrameId: 'sol',
      initialPhase: POD_PHASE.SURFACE
    }));
  }
  if (activePodJourney?.phase === POD_PHASE.SURFACE) advancePodJourney('launch');
  if (activePodJourney?.phase === POD_PHASE.SURFACE_LAUNCH) advancePodJourney('rendezvous');
  return activePodJourney?.phase === POD_PHASE.RENDEZVOUS;
}

function setPodJourney(next) {
  activePodJourney = next || null;
  if (activeExpedition && store) {
    activeExpedition = withExpeditionChanges(activeExpedition, { podJourney: activePodJourney });
    store.save(activeExpedition);
  }
  syncSpaceSessionToPodJourney(activePodJourney);
  return activePodJourney;
}

function syncSpaceSessionToPodJourney(journey) {
  const session = activeContext?.getSpaceTravelSession?.();
  if (!session?.active || !journey) return;
  const phaseMap = {
    [POD_PHASE.SHIP_LAUNCH]: SPACE_TRAVEL_PHASE.LAUNCH,
    [POD_PHASE.LOCAL_FLIGHT]: SPACE_TRAVEL_PHASE.APPROACH,
    [POD_PHASE.DESCENT]: SPACE_TRAVEL_PHASE.DESCENT,
    [POD_PHASE.SURFACE]: SPACE_TRAVEL_PHASE.LANDED,
    [POD_PHASE.SURFACE_LAUNCH]: SPACE_TRAVEL_PHASE.ASCENT,
    [POD_PHASE.RENDEZVOUS]: SPACE_TRAVEL_PHASE.RENDEZVOUS
  };
  if (journey.phase === POD_PHASE.RECOVERED) {
    activeContext.updateSpaceTravelSession?.({
      activeCraftId: SPACE_CRAFT_IDENTITY.starship.id,
      location: SPACE_TRAVEL_LOCATION.STARSHIP,
      phase: SPACE_TRAVEL_PHASE.DOCKED,
      destination: null,
      reason: 'pathfinder-recovered'
    });
    activeContext.setSolisReachFlightPresentation?.(true);
    return;
  }
  const travelPhase = phaseMap[journey.phase];
  if (!travelPhase) return;
  activeContext.updateSpaceTravelSession?.({
    activeCraftId: SPACE_CRAFT_IDENTITY.pod.id,
    location: travelPhase === SPACE_TRAVEL_PHASE.LANDED ? SPACE_TRAVEL_LOCATION.SURFACE : SPACE_TRAVEL_LOCATION.LOCAL_SPACE,
    phase: travelPhase,
    sourceBodyId: journey.bodyId || session.sourceBodyId,
    destination: travelPhase === SPACE_TRAVEL_PHASE.RENDEZVOUS
      ? { id: SPACE_CRAFT_IDENTITY.starship.id, kind: 'starship', name: STARSHIP_NAME }
      : journey.bodyId
        ? { id: journey.bodyId, kind: 'body', name: journey.bodyId.replaceAll('-', ' ') }
        : session.destination,
    reason: `pathfinder-${travelPhase}`
  });
  activeContext.setExpeditionPodFlightPresentation?.(true);
}

function advancePodJourney(event, details = {}) {
  if (!activePodJourney) return false;
  const result = transitionPodJourney(activePodJourney, event, details);
  if (!result.accepted) return false;
  setPodJourney(result.journey);
  return true;
}

function earthShuttleJourney() {
  return activePodJourney?.routeKind === POD_ROUTE_KIND.EARTH_SHUTTLE
    && activePodJourney?.bodyId === 'earth'
    ? activePodJourney
    : null;
}

function currentEarthAnchorId() {
  const location = activeContext?.customLoc?.name
    || activeContext?.LOCS?.[activeContext?.selLoc]?.name
    || activeContext?.selLoc
    || 'current-location';
  return `earth:${String(location).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'current-location'}`;
}

function ensureTransitExpedition() {
  store ||= createExpeditionStore();
  activeExpedition = store.load();
  if (!activeExpedition || activeExpedition.state === 'failed') {
    activeExpedition = createExpeditionPlan({
      destinationId: 'proxima-centauri',
      shipId: 'long-range-research-vessel',
      propulsionId: 'radiant-plasma-field-drive',
      realism: 'science-inspired',
      survival: 'forgiving',
      crew: DEFAULT_CREW
    });
    store.save(activeExpedition);
  }
  activePodJourney = activeExpedition?.podJourney?.type === 'ExpeditionPodJourney'
    ? Object.freeze({ ...activeExpedition.podJourney })
    : null;
  syncExpeditionContacts(activeExpedition);
  return activeExpedition;
}

async function launchEarthPathfinderToSolisReach(options = {}) {
  if (!activeExpedition || activeContext?.getEnv?.() !== activeContext?.ENV?.EARTH) return false;
  const existing = earthShuttleJourney();
  if (existing && ![POD_PHASE.SURFACE, POD_PHASE.FAILED, POD_PHASE.RECOVERED].includes(existing.phase)) return false;
  if (!existing || [POD_PHASE.FAILED, POD_PHASE.RECOVERED].includes(existing.phase)) {
    setPodJourney(createPodJourney({
      expeditionId: activeExpedition.id,
      contactId: currentEarthAnchorId(),
      bodyId: 'earth',
      returnFrameId: 'sol',
      routeKind: POD_ROUTE_KIND.EARTH_SHUTTLE,
      initialPhase: POD_PHASE.SURFACE
    }));
  }
  if (!advancePodJourney('launch')) return false;
  closeExpeditionPlanner();
  const stagedPod = options.pod || null;
  const launchVisible = playSurfacePodLaunch(activeContext, {
    bodyId: 'earth',
    pod: stagedPod,
    onCommit: async () => {
      const started = await activeContext?.startSpaceFlightToSolisReach?.({
        onReady: () => {
          if (activePodJourney?.phase === POD_PHASE.SURFACE_LAUNCH) advancePodJourney('rendezvous');
        }
      });
      if (started !== true) {
        advancePodJourney('fail', { reason: 'earth-pod-launch-unavailable' });
        openExpeditionPlanner(activeContext);
        return false;
      }
      return true;
    },
    onFailure: () => {
      if (activePodJourney?.phase === POD_PHASE.SURFACE_LAUNCH) advancePodJourney('fail', { reason: 'earth-pod-launch-presentation-failed' });
      openExpeditionPlanner(activeContext);
    }
  });
  if (!launchVisible) {
    advancePodJourney('fail', { reason: 'earth-pod-launch-presentation-unavailable' });
    openExpeditionPlanner(activeContext);
    return false;
  }
  if (stagedPod) consumeStagedEarthPod(stagedPod);
  return true;
}

function stageEarthPathfinder(appContext) {
  bindRuntimeContext(appContext);
  if (!activeContext || activeContext.getEnv?.() !== activeContext.ENV?.EARTH) {
    activeContext?.showToast?.('Pathfinder can be deployed from an active Earth location.');
    return false;
  }
  const expedition = ensureTransitExpedition();
  if (!expedition) {
    activeContext.showToast?.('Pathfinder could not connect to the orbital starship.');
    return false;
  }
  const existing = earthShuttleJourney();
  if (existing && ![POD_PHASE.SURFACE, POD_PHASE.FAILED, POD_PHASE.RECOVERED].includes(existing.phase)) {
    activeContext.showToast?.('Pathfinder is already committed to the current Solis Reach flight.');
    return false;
  }
  activeContext.setTravelMode?.('walk', {
    source: 'pathfinder_deploy',
    force: true,
    emitTutorial: false
  });
  const pod = stageEarthPod(activeContext, {
    onBoard: (boardingPod) => launchEarthPathfinderToSolisReach({ pod: boardingPod })
  });
  if (!pod) {
    activeContext.showToast?.('Pathfinder could not be placed at this location.');
    return false;
  }
  closeExpeditionPlanner();
  activeContext.showToast?.('Pathfinder is ready nearby. Approach the hatch and press E to board.');
  return true;
}

async function boardSolisReachDirect(appContext) {
  bindRuntimeContext(appContext);
  const expedition = ensureTransitExpedition();
  if (!activeContext || !expedition) return false;
  closeExpeditionPlanner();
  if (activeContext.spaceFlight?.active) {
    activeContext.ensureSolisReachDockTarget?.();
    activeContext.setExpeditionPodFlightPresentation?.(false);
    return enterActiveShip();
  }
  if (activeContext.getEnv?.() !== activeContext.ENV?.EARTH) return false;
  return (await activeContext.startSpaceFlightToSolisReach?.({
    pathfinder: false,
    onReady: () => {
      void enterActiveShip();
    }
  })) === true;
}

function getExpeditionPodDockingTarget() {
  const session = activeContext?.getSpaceTravelSession?.();
  if (session?.activeCraftId !== SPACE_CRAFT_IDENTITY.pod.id || session.phase !== SPACE_TRAVEL_PHASE.RENDEZVOUS) return null;
  if (activePodJourney && activePodJourney.phase !== POD_PHASE.RENDEZVOUS) return null;
  if (activeContext?.spaceFlight?.rocket?.userData?.spaceCraftId !== SPACE_CRAFT_IDENTITY.pod.id) return null;
  const target = activeContext?.getSolisReachDockTarget?.();
  const rocket = activeContext?.spaceFlight?.rocket;
  if (!target?.position || !rocket) return null;
  const distance = rocket.position.distanceTo(target.position);
  const relativeSpeed = activeContext.spaceFlight.velocity?.length?.() || Number(activeContext.spaceFlight.speed || 0);
  return {
    ...target,
    distance,
    relativeSpeed,
    canDock: distance < target.radius + 24 && relativeSpeed <= 1.35
  };
}

function attemptExpeditionPodDocking() {
  const target = getExpeditionPodDockingTarget();
  if (!target?.canDock) return false;
  if (activePodJourney && !advancePodJourney('recover')) return false;
  if (!activeExpedition) activeExpedition = ensureTransitExpedition();
  activeContext?.setSolisReachFlightPresentation?.(true);
  activeContext?.updateSpaceTravelSession?.({
    activeCraftId: SPACE_CRAFT_IDENTITY.starship.id,
    location: SPACE_TRAVEL_LOCATION.STARSHIP,
    phase: SPACE_TRAVEL_PHASE.DOCKED,
    destination: null,
    reason: 'pathfinder-docked'
  });
  activeContext?.showSpaceFlightMessage?.(`PATHFINDER SECURED · ENTERING ${STARSHIP_NAME.toUpperCase()}`, '#83e6a6');
  window.setTimeout(() => { void enterActiveShip(); }, 180);
  return true;
}

function cancelPodCourseTimer() {
  if (!podCourseTimer) return;
  window.clearTimeout(podCourseTimer);
  podCourseTimer = 0;
}

function schedulePodRecovery(returnFrameId, startedAt = performance.now(), minimumVisibleMs = 700) {
  if (podRecoveryTimer) window.clearTimeout(podRecoveryTimer);
  const attempt = () => {
    podRecoveryTimer = 0;
    if (!activePodJourney || activePodJourney.phase !== POD_PHASE.RENDEZVOUS) return;
    const runtime = activeContext?.universeRuntime;
    if (performance.now() - startedAt >= minimumVisibleMs && !runtime?.transition && (!returnFrameId || runtime?.current?.id === returnFrameId)) {
      // Universe arrival owns the transfer phase while frames are changing.
      // Hand the session back to the pod journey before exposing the dock so
      // the target, HUD, and docking action cannot disappear after arrival.
      syncSpaceSessionToPodJourney(activePodJourney);
      activeContext?.ensureSolisReachDockTarget?.({ nearActiveCraft: true });
      activeContext?.showSpaceFlightMessage?.(`${STARSHIP_NAME.toUpperCase()} ACQUIRED · FLY TO THE DOCKING LIGHTS`, '#83e6a6');
      return;
    }
    if (performance.now() - startedAt >= 20_000) {
      activeContext?.showSpaceFlightMessage?.(`Hold near ${STARSHIP_NAME} while docking guidance reacquires.`, '#f59e0b');
      return;
    }
    podRecoveryTimer = window.setTimeout(attempt, 120);
  };
  podRecoveryTimer = window.setTimeout(attempt, 120);
}

function schedulePodPlanetCourse(contact, startedAt = performance.now()) {
  cancelPodCourseTimer();
  const bodyId = `${contact.id}-i`;
  const attempt = () => {
    podCourseTimer = 0;
    if (!activePodJourney || activePodJourney.bodyId !== bodyId || activePodJourney.phase === POD_PHASE.FAILED) return;
    const runtime = activeContext?.universeRuntime;
    if (!runtime?.transition && runtime?.current?.id === contact.id) {
      const accepted = activeContext?.travelToUniverseDestination?.(bodyId, {
        kind: 'expedition-pod-surface-approach',
        routeLabel: `${contact.designation} I`
      });
      if (accepted) {
        advancePodJourney('course_acquired');
        activeContext?.showSpaceFlightMessage?.(`POD COURSE SET · ${contact.designation.toUpperCase()} I · MANUAL APPROACH`, '#6fe8ff');
        return;
      }
    }
    if (performance.now() - startedAt >= 20_000) {
      advancePodJourney('fail', { reason: 'pod-course-acquisition-timeout' });
      activeContext?.showSpaceFlightMessage?.('Pod course could not be acquired. Manual Space remains available.', '#f59e0b');
      return;
    }
    podCourseTimer = window.setTimeout(attempt, 120);
  };
  podCourseTimer = window.setTimeout(attempt, 120);
}

function currentRoom() {
  return activeContext?.getCurrentMultiplayerRoom?.() || null;
}

function sharedParticipant() {
  return sharedState?.participants?.[sharedAuthority?.userUid] || null;
}

function connectedSharedCrew() {
  return Object.values(sharedState?.participants || {}).filter((participant) => participant.connected !== false);
}

async function ensureSharedAuthority() {
  const room = currentRoom();
  const roomCode = String(room?.code || room?.id || '').trim().toUpperCase();
  if (!roomCode) {
    sharedAuthority?.dispose?.();
    sharedAuthority = null;
    sharedAuthorityRoomCode = '';
    sharedState = null;
    return null;
  }
  if (sharedAuthority && sharedAuthorityRoomCode === roomCode) return sharedAuthority;
  if (sharedAuthorityLoading) return null;
  sharedAuthority?.dispose?.();
  sharedAuthority = null;
  sharedState = null;
  sharedAuthorityLoading = true;
  try {
    const module = await import('./shared-authority.js?v=3');
    const authority = module.createSharedExpeditionAuthority({
      room,
      onState(next) {
        sharedState = next;
        if (next?.expedition) {
          activeExpedition = next.expedition;
          store?.save?.(activeExpedition);
          syncExpeditionContacts(activeExpedition);
          activeContext?.updateExpeditionShipRecord?.(activeExpedition);
        }
        if (!overlay()?.hidden) renderMission();
      },
      onError() {
        activeContext?.showToast?.('Shared Expedition is reconnecting. The last confirmed ship state remains visible.');
      }
    });
    sharedAuthority = authority;
    sharedAuthorityRoomCode = authority ? roomCode : '';
    return authority;
  } finally {
    sharedAuthorityLoading = false;
  }
}

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
  link.href = '/app/styles/expedition.css?v=8';
  document.head.appendChild(link);
}

function availableDestinations() {
  return getUniverseDestinations().filter((item) =>
    ['planetary_system', 'black_hole'].includes(item.objectClass)
    && item.id !== 'sol'
    && !item.generatedFlags?.includes('stable-expedition-contact')
  );
}

function registerExpeditionContact(expedition, contact) {
  const outpost = (expedition?.outposts || []).find((entry) => entry.contactId === contact.id) || null;
  return registerExpeditionDiscovery({
    contact,
    distanceLy: expedition?.calculation?.distanceLy,
    routeProgress: expedition?.progress,
    outpost
  }, { returnMode: 'expedition-contact' });
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

function beginLocalContact(contactId, options = {}) {
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
    kind: options.viaPod ? 'expedition-pod-launch' : 'expedition-local-operation',
    routeLabel: contact.designation
  });
  if (accepted) {
    if (options.viaPod) schedulePodPlanetCourse(contact);
    return true;
  }
  activeExpedition = previous;
  store.save(activeExpedition);
  openExpeditionPlanner(activeContext);
  activeContext?.showSpaceFlightMessage?.('The local route is not available from the current flight state.', '#f59e0b');
  return false;
}

function launchPodToContact(contactId) {
  const contact = activeExpedition?.routeContacts?.find((entry) => entry.id === contactId);
  if (!contact || !['available', 'returned'].includes(contact.localOperationState)) return false;
  const returnFrameId = activeContext?.universeRuntime?.current?.id || activeExpedition.originId || 'sol';
  setPodJourney(createPodJourney({
    expeditionId: activeExpedition.id,
    contactId: contact.id,
    bodyId: `${contact.id}-i`,
    returnFrameId
  }));
  advancePodJourney('launch');
  activeContext?.setExpeditionPodFlightPresentation?.(true);
  closeShipStationPanel();
  const exited = activeContext?.exitExpeditionShipInterior?.() === true;
  if (!exited) {
    advancePodJourney('fail', { reason: 'ship-interior-exit-failed' });
    return false;
  }
  window.requestAnimationFrame(() => {
    if (!beginLocalContact(contact.id, { viaPod: true })) {
      advancePodJourney('fail', { reason: 'pod-launch-route-unavailable' });
    }
  });
  return true;
}

function launchDestinationMissionPod() {
  const mission = activeContext?.getDestinationMissionSnapshot?.();
  if (!activeExpedition || !mission?.surfaceRequired || mission.phase !== 'fieldwork' || !mission.atDestination) return false;
  if (!activeContext?.prepareDestinationMissionSurface?.(mission.destinationId)) return false;
  const returnFrameId = activeContext?.universeRuntime?.current?.id || activeExpedition.originId || 'sol';
  setPodJourney(createPodJourney({
    expeditionId: activeExpedition.id,
    contactId: `destination-mission:${mission.destinationId}`,
    bodyId: mission.destinationId,
    returnFrameId
  }));
  advancePodJourney('launch');
  activeContext?.setExpeditionPodFlightPresentation?.(true);
  closeShipStationPanel();
  const exited = activeContext?.exitExpeditionShipInterior?.() === true;
  if (!exited) {
    advancePodJourney('fail', { reason: 'ship-interior-exit-failed' });
    return false;
  }
  window.requestAnimationFrame(() => {
    if (!activePodJourney || activePodJourney.bodyId !== mission.destinationId) return;
    advancePodJourney('course_acquired');
    activeContext?.showSpaceFlightMessage?.(`POD RELEASED · ${mission.destinationId.replaceAll('-', ' ').toUpperCase()} · MANUAL APPROACH`, '#6fe8ff');
  });
  return true;
}

function launchPodToEarth() {
  if (!activeExpedition || activeContext?.universeRuntime?.current?.id !== 'sol' || activeContext?.universeRuntime?.transition) return false;
  setPodJourney(createPodJourney({
    expeditionId: activeExpedition.id,
    contactId: currentEarthAnchorId(),
    bodyId: 'earth',
    returnFrameId: 'sol',
    routeKind: POD_ROUTE_KIND.EARTH_SHUTTLE
  }));
  if (!advancePodJourney('launch')) return false;
  activeContext?.ensureSolisReachDockTarget?.();
  activeContext?.positionSpacecraftAtSolisReachDock?.();
  activeContext?.clearRenderedSpaceJourney?.();
  activeContext.spaceFlight.destination = 'earth';
  activeContext.spaceFlight._manualLandingTarget = 'Earth';
  activeContext.spaceFlight._autopilotTarget = null;
  activeContext?.setExpeditionPodFlightPresentation?.(true);
  activeContext?.updateSpaceTravelSession?.({
    activeCraftId: SPACE_CRAFT_IDENTITY.pod.id,
    location: SPACE_TRAVEL_LOCATION.LOCAL_SPACE,
    phase: SPACE_TRAVEL_PHASE.LAUNCH,
    destination: { id: 'earth', kind: 'body', name: 'Earth' },
    reason: 'pathfinder-earth-departure'
  });
  closeShipStationPanel();
  if (activeContext?.exitExpeditionShipInterior?.() !== true) {
    advancePodJourney('fail', { reason: 'ship-interior-exit-failed' });
    return false;
  }
  window.requestAnimationFrame(() => {
    if (activePodJourney?.phase !== POD_PHASE.SHIP_LAUNCH) return;
    advancePodJourney('course_acquired');
    activeContext?.setSpaceFlightLandingTarget?.('Earth');
    activeContext?.showSpaceFlightMessage?.('EARTH COURSE SET · MANUAL APPROACH · CURRENT LOCATION SAVED', '#6fe8ff');
  });
  return true;
}

function returnFromLocalContact() {
  const operation = activeExpedition?.localOperation;
  const contact = activeExpedition?.routeContacts?.find((entry) => entry.id === operation?.contactId);
  if (!operation || !contact) return false;
  if (activeContext?.universeRuntime?.transition) {
    activeContext?.showSpaceFlightMessage?.(`Complete the local approach before returning to ${STARSHIP_NAME}.`, '#f59e0b');
    return false;
  }
  const previous = activeExpedition;
  activeExpedition = withExpeditionChanges(activeExpedition, {
    voyagePhase: 'route-resume',
    activeLocalContactId: null,
    localOperation: null,
    routeContacts: updateContact(contact.id, { localOperationState: 'returned', status: 'surveyed' }),
    log: appendMissionLog(activeExpedition, 'local-operation', `${contact.designation} local survey ended. ${STARSHIP_NAME} resumed the voyage.`)
  });
  store.save(activeExpedition);
  closeExpeditionPlanner();
  const accepted = activeContext?.travelToUniverseDestination?.(operation.returnFrameId || activeExpedition.originId || 'sol', {
    kind: 'expedition-route-return',
    routeLabel: `Return to ${STARSHIP_NAME}`
  });
  if (accepted) {
    if (activePodJourney?.phase === POD_PHASE.RENDEZVOUS) schedulePodRecovery(operation.returnFrameId || activeExpedition.originId || 'sol');
    return true;
  }
  activeExpedition = previous;
  store.save(activeExpedition);
  openExpeditionPlanner(activeContext);
  activeContext?.showSpaceFlightMessage?.(`${STARSHIP_NAME} could not recover the prior route frame.`, '#f59e0b');
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
    activeContext?.showToast?.(`Collect the geology sample before returning to ${STARSHIP_NAME}.`);
    return false;
  }
  const item = inventory.snapshot?.().items?.find((entry) => entry.catalogId === catalogId);
  if (!item || Number(item.quantity) < 1) return false;
  if (!markExpeditionPodSurfaceLaunch(bodyId)) return false;
  const launchVisible = playSurfacePodLaunch(activeContext, {
    bodyId,
    pod: activeContext?.getActivePlanetaryReturnPod?.(),
    onCommit: () => {
      const departureStarted = activeContext?.startSpaceFlightFromExpeditionSurface?.({
        frameId: contact.id,
        courseDestinationId: bodyId,
        onReady: () => {
          if (activePodJourney?.phase === POD_PHASE.SURFACE_LAUNCH) advancePodJourney('rendezvous');
          returnFromLocalContact();
        }
      }) === true;
      if (!departureStarted) {
        advancePodJourney('fail', { reason: 'expedition-surface-launch-unavailable' });
        activeContext?.showToast?.(`${STARSHIP_NAME} could not begin the return flight. The sample remains in your Backpack.`);
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
        log: appendMissionLog(activeExpedition, 'science', `Transferred one ${sample.massKg} kg ${contact.designation} sample from Backpack to ${STARSHIP_NAME} cargo.`)
      });
      store.save(activeExpedition);
      activeContext?.updateExpeditionShipRecord?.(activeExpedition);
      return true;
    },
    onFailure: () => activeContext?.showToast?.('The pod remained on the surface. Your sample is still in your Backpack.')
  });
  if (!launchVisible) {
    advancePodJourney('fail', { reason: 'expedition-surface-launch-presentation-unavailable' });
    return false;
  }
  return true;
}

function leaveDestinationMissionSurface(bodyId) {
  const mission = activeContext?.getDestinationMissionSnapshot?.();
  if (!activePodJourney || activePodJourney.bodyId !== bodyId || mission?.destinationId !== bodyId) return false;
  if (mission.phase !== 'analysis') {
    activeContext?.showToast?.(`Complete all three marked field records before returning to ${STARSHIP_NAME}.`);
    return false;
  }
  if (!markExpeditionPodSurfaceLaunch(bodyId)) return false;
  const launchVisible = playSurfacePodLaunch(activeContext, {
    bodyId,
    pod: activeContext?.getActivePlanetaryReturnPod?.(),
    onCommit: () => {
      const departureStarted = activeContext?.startSpaceFlightFromExpeditionSurface?.({
        frameId: mission.systemId || activePodJourney.returnFrameId,
        courseDestinationId: bodyId,
        onReady: () => {
          if (activePodJourney?.phase === POD_PHASE.SURFACE_LAUNCH) advancePodJourney('rendezvous');
          if (activePodJourney?.phase === POD_PHASE.RENDEZVOUS) {
            activeContext?.showSpaceFlightMessage?.(`RENDEZVOUS APPROACH · ${STARSHIP_NAME.toUpperCase()} DOCKING LIGHTS ACQUIRED`, '#6fe8ff');
            schedulePodRecovery(mission.systemId || activePodJourney.returnFrameId, performance.now(), 1100);
          }
        }
      }) === true;
      if (!departureStarted) advancePodJourney('fail', { reason: 'destination-surface-launch-unavailable' });
      return departureStarted;
    }
  });
  if (!launchVisible) {
    advancePodJourney('fail', { reason: 'destination-surface-launch-presentation-unavailable' });
    return false;
  }
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
        <div style="min-width:0"><span>SPACE EXPLORER</span><h2 id="expeditionTitle" style="max-width:270px">Interstellar Expedition</h2><small class="expeditionReleaseStatus">Alpha preview</small></div>
        <button id="expeditionClose" type="button" aria-label="Close Expedition" style="flex:0 0 42px">×</button>
      </header>
      <p class="expeditionIntro">Begin an evolving long-range voyage aboard ${STARSHIP_NAME}. Progress is saved, and ordinary Space Flight remains available when this panel is closed.</p>
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

function sharedMissionMarkup() {
  const room = currentRoom();
  if (!room) return '';
  const roomLabel = String(room.name || room.code || room.id || 'current room');
  if (!sharedState) {
    return `<section class="expeditionShared"><span>ROOM EXPEDITION</span><h3>${roomLabel}</h3><p>Share this voyage with the crew already in your multiplayer room.</p>${activeExpedition ? '<button id="expeditionShareCreate" type="button">Share this Expedition</button>' : ''}</section>`;
  }
  const participant = sharedParticipant();
  const connected = connectedSharedCrew();
  const ready = connected.filter((member) => member.readyForRevision === sharedState.revision).length;
  const crew = Object.values(sharedState.participants || {}).map((member) =>
    `<li class="${member.connected === false ? 'is-offline' : ''}"><strong>${member.displayName}</strong><span>${String(member.role || 'crew').replaceAll('-', ' ')} · ${member.connected === false ? 'away' : member.readyForRevision === sharedState.revision ? 'ready' : 'aboard'}</span></li>`
  ).join('');
  return `<section class="expeditionShared"><span>ROOM EXPEDITION · REVISION ${sharedState.revision}</span><h3>${roomLabel}</h3><p>${connected.length} connected · ${ready} ready for the next watch</p><ul>${crew}</ul>${participant ? `<button id="expeditionShareReady" type="button">${participant.readyForRevision === sharedState.revision ? 'Not ready yet' : 'Ready for next watch'}</button>` : '<button id="expeditionShareJoin" type="button">Join this crew</button>'}</section>`;
}

async function applyExpeditionMutation(next, mutationKind, command = null) {
  if (!next || next === activeExpedition) return false;
  if (sharedState) {
    if (!sharedParticipant()) throw new Error('Join the room crew before changing its Expedition.');
    if (!command) throw new Error('That shared Expedition action is not available yet.');
    const response = await sharedAuthority?.commit?.(command);
    if (response?.state?.expedition) {
      sharedState = response.state;
      activeExpedition = response.state.expedition;
    }
  } else {
    activeExpedition = next;
  }
  store.save(activeExpedition);
  activeContext?.updateExpeditionShipRecord?.(activeExpedition);
  return true;
}

function reportSharedMutationError(error) {
  const message = String(error?.message || 'Shared Expedition could not be updated.');
  activeContext?.showToast?.(message);
  renderMission();
}

function outpostMarkup(expedition) {
  const contacts = expedition.routeContacts || [];
  const rows = contacts.map((contact) => {
    const outpost = (expedition.outposts || []).find((entry) => entry.contactId === contact.id);
    if (!outpost) {
      const surveyed = contact.status === 'surveyed' || contact.localOperationState === 'returned';
      return surveyed ? `<article><div><strong>${contact.designation} Field Station</strong><span>Survey site ready for a persistent base</span></div><button type="button" data-plan-outpost="${contact.id}">Reserve site</button></article>` : '';
    }
    const availability = constructionAvailability(expedition, outpost);
    const condition = Math.round(Number(outpost.condition || 0) * 100);
    const details = outpost.state === 'operational'
      ? `${String(outpost.operationsStatus || 'operational').replaceAll('-', ' ')} · ${outpost.assignedCrewIds.length} crew · ${condition}% condition · ${Number(outpost.power?.storedMWh || 0).toFixed(1)} MWh · ${Math.round(Number(outpost.stores?.waterKg || 0))} kg water`
      : `Planned at the existing survey-world address · ${outpost.blueprint.length} structural records`;
    const action = outpost.state === 'planned'
      ? `<button type="button" data-build-outpost="${outpost.id}" ${availability.enabled ? '' : 'disabled'}>Build field station</button>${availability.reason ? `<small>${availability.reason}</small>` : ''}`
      : `<button type="button" data-service-outpost="${outpost.id}">Service station</button><button type="button" data-enter-contact="${contact.id}">Visit station</button>`;
    return `<article><div><strong>${outpost.name}</strong><span>${details}</span></div><div>${action}</div></article>`;
  }).filter(Boolean).join('');
  return rows ? `<section class="expeditionOutposts"><h3>Field Stations</h3>${rows}</section>` : '';
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
      : `The field team can collect a documented geology sample for ${STARSHIP_NAME} science.`;
    action = `<div class="expeditionEvent"><span>LOCAL SURVEY</span><h3>${activeContact?.designation || 'Route contact'}</h3><p>${purpose} ${STARSHIP_NAME} will hold this voyage chapter while you fly, land, and return.</p><div>${localTransitActive ? '' : `<button id="expeditionSetSurveyCourse" class="expeditionChoice" type="button">Set course to ${activeContact?.designation || 'contact'} I</button>`}<button id="expeditionReturnFromContact" class="expeditionChoice" type="button" ${localTransitActive ? 'disabled' : ''}>${localTransitActive ? 'Local approach in progress' : `Return to ${STARSHIP_NAME}`}</button></div></div>`;
    if (localTransitActive) {
      localTransitRefreshTimer = window.setTimeout(() => {
        localTransitRefreshTimer = 0;
        if (!document.getElementById('expeditionOverlay')?.hidden && activeExpedition?.activeLocalContactId) renderMission();
      }, 250);
    }
  } else if (expedition.state === 'planned') {
    action = `<button id="expeditionDepart" class="expeditionPrimary" type="button" ${expedition.readiness.status === 'insufficient' ? 'disabled' : ''}>Depart on ${STARSHIP_NAME}</button>`;
  } else if (expedition.pendingEvent) {
    const responseRoom = String(expedition.pendingEvent.roomId || 'the ship').replaceAll('-', ' ');
    action = `<div class="expeditionEvent"><span>${expedition.pendingEvent.kind}</span><h3>${expedition.pendingEvent.title}</h3><p>${expedition.pendingEvent.message}</p><small>Response location: ${responseRoom}. Enter ${STARSHIP_NAME}; the ship map and warning beacon are already set to the affected station.</small></div>`;
  } else if (expedition.state === 'traveling') {
    action = `<button id="expeditionAdvance" class="expeditionPrimary" type="button">Continue to next watch or event</button>`;
  } else if (expedition.state === 'arrived') {
    action = `<button id="expeditionArrive" class="expeditionPrimary" type="button">Continue in local Space</button>`;
  } else if (expedition.state === 'failed') {
    const report = expedition.failureReport;
    action = `<div class="expeditionEvent expeditionFailure"><span>MISSION ENDED</span><h3>${report?.summary || `${STARSHIP_NAME} could not continue.`}</h3>${report?.causes?.length ? `<ol>${report.causes.map((cause) => `<li>${cause}</li>`).join('')}</ol>` : '<p>The Captain’s Log retains the mission record.</p>'}</div>`;
  }
  const log = [...(expedition.log || [])].reverse().slice(0, 6);
  const reachedCount = Math.min(VOYAGE_MILESTONES.length, Number(expedition.voyageDirector?.nextSlotIndex || 0));
  const contacts = expedition.routeContacts || [];
  const onEarth = activeContext?.getEnv?.() === activeContext?.ENV?.EARTH;
  const earthPodReady = earthShuttleJourney()?.phase === POD_PHASE.SURFACE;
  const shipAction = expedition.readiness.status !== 'insufficient' && expedition.state !== 'failed'
    ? onEarth
      ? `<div class="expeditionShipAction"><button id="expeditionEarthPod" class="expeditionPrimary" type="button">${earthPodReady ? `Return to ${STARSHIP_NAME} in Pathfinder` : `Launch Pathfinder to ${STARSHIP_NAME}`}</button><small>Depart from the currently loaded Earth location, fly manually to ${STARSHIP_NAME}, and dock with the same saved Expedition.</small></div>`
      : `<div class="expeditionShipAction"><button id="expeditionEnterShip" class="expeditionPrimary" type="button">${expedition.pendingEvent ? `Respond aboard ${STARSHIP_NAME}` : `Enter ${STARSHIP_NAME}`}</button><small>${expedition.pendingEvent ? `Follow the highlighted route to ${String(expedition.pendingEvent.roomId || 'the affected station').replaceAll('-', ' ')} and interact with the equipment there.` : 'Walk the ship, meet the crew, inspect systems, and return to the same flight.'}</small></div>`
    : '';
  host.innerHTML = `
    ${readinessMarkup(expedition)}
    ${sharedMissionMarkup()}
    ${expedition.state !== 'planned' ? `<div class="expeditionProgress"><span style="width:${Math.round(expedition.progress * 100)}%"></span></div><p class="expeditionProgressCopy">${Math.round(expedition.progress * 100)}% of crew-experienced travel complete · ${expedition.state}</p>` : ''}
    ${expedition.state !== 'planned' ? `<section class="expeditionVoyage"><header><span>VOYAGE</span><strong>${String(expedition.voyagePhase || 'departure').replaceAll('-', ' ')}</strong></header><div>${VOYAGE_MILESTONES.map((milestone, index) => `<i class="${index < reachedCount ? 'reached' : index === reachedCount ? 'next' : ''}" title="${String(milestone.phase || milestone.id).replaceAll('-', ' ')}"></i>`).join('')}</div><small>${reachedCount} of ${VOYAGE_MILESTONES.length} voyage chapters reached</small></section>` : ''}
    ${action}
    ${shipAction}
    ${contacts.length ? `<section class="expeditionContacts"><h3>Route Contacts</h3>${contacts.map((contact) => `<p><strong>${contact.designation}</strong><span>${contact.spectralClass} · ${contact.worldClass} · ${String(contact.status).replaceAll('-', ' ')}</span>${!expedition.activeLocalContactId && ['available', 'returned'].includes(contact.localOperationState) ? `<button type="button" data-enter-contact="${contact.id}">Enter local Space</button>` : ''}</p>`).join('')}</section>` : ''}
    ${outpostMarkup(expedition)}
    <section class="expeditionLog"><h3>Captain's Log</h3>${log.map((entry) => `<p><span>${entry.kind}</span>${entry.message}</p>`).join('')}</section>`;

  document.getElementById('expeditionShareCreate')?.addEventListener('click', async () => {
    try {
      const authority = await ensureSharedAuthority();
      if (!authority) throw new Error('Sign in and join the current multiplayer room first.');
      const response = await authority.create({
        destinationId: activeExpedition.destinationId,
        shipId: activeExpedition.ship?.profileId,
        propulsionId: activeExpedition.propulsionId,
        realism: activeExpedition.realism,
        survival: activeExpedition.survival
      }, 'command');
      if (response?.state) sharedState = response.state;
      renderMission();
    } catch (error) { reportSharedMutationError(error); }
  });
  document.getElementById('expeditionShareJoin')?.addEventListener('click', async () => {
    try {
      const response = await sharedAuthority?.join?.();
      if (response?.state) sharedState = response.state;
      renderMission();
    } catch (error) { reportSharedMutationError(error); }
  });
  document.getElementById('expeditionShareReady')?.addEventListener('click', async () => {
    try {
      const participant = sharedParticipant();
      const response = await sharedAuthority?.setReady?.(participant?.readyForRevision !== sharedState?.revision);
      if (response?.state) sharedState = response.state;
      renderMission();
    } catch (error) { reportSharedMutationError(error); }
  });
  document.getElementById('expeditionDepart')?.addEventListener('click', async () => {
    try {
      await applyExpeditionMutation(startExpedition(activeExpedition), 'operation', { type: 'start' });
      renderMission();
    } catch (error) { reportSharedMutationError(error); }
  });
  document.getElementById('expeditionAdvance')?.addEventListener('click', async () => {
    try {
      await applyExpeditionMutation(advanceToNextMilestone(activeExpedition), 'advance', { type: 'advance' });
      renderMission();
    } catch (error) { reportSharedMutationError(error); }
  });
  document.getElementById('expeditionArrive')?.addEventListener('click', () => {
    const destinationId = activeExpedition.destinationId;
    closeExpeditionPlanner();
    const accepted = activeContext?.travelToUniverseDestination?.(destinationId, {
      kind: 'expedition-arrival',
      routeLabel: `${STARSHIP_NAME} arrival`
    });
    if (!accepted) activeContext?.showSpaceFlightMessage?.('Open Wayfinder to continue at the destination.', '#8ab4ff');
  });
  document.getElementById('expeditionReturnFromContact')?.addEventListener('click', returnFromLocalContact);
  document.getElementById('expeditionEarthPod')?.addEventListener('click', async () => {
    if (!await launchEarthPathfinderToSolisReach()) activeContext?.showToast?.('Pathfinder cannot launch from this Earth session yet.');
  });
  document.getElementById('expeditionSetSurveyCourse')?.addEventListener('click', () => {
    const bodyId = `${activeExpedition?.activeLocalContactId || ''}-i`;
    if (activeContext?.travelToUniverseDestination?.(bodyId, { kind: 'expedition-surface-approach', routeLabel: 'Survey site' })) {
      closeExpeditionPlanner();
      activeContext?.showSpaceFlightMessage?.('SURVEY COURSE SET · APPROACH THE WORLD TO LAND', '#6fe8ff');
    }
  });
  host.querySelectorAll('[data-enter-contact]').forEach((button) => button.addEventListener('click', () => beginLocalContact(button.dataset.enterContact)));
  host.querySelectorAll('[data-plan-outpost]').forEach((button) => button.addEventListener('click', async () => {
    try {
      const result = createOutpostSite(activeExpedition, button.dataset.planOutpost);
      if (!result.changed) return activeContext?.showToast?.(result.message);
      await applyExpeditionMutation(result.expedition, 'operation', { type: 'outpost-plan', contactId: button.dataset.planOutpost });
      syncExpeditionContacts(activeExpedition);
      activeContext?.showToast?.(result.message);
      renderMission();
    } catch (error) { reportSharedMutationError(error); }
  }));
  host.querySelectorAll('[data-build-outpost]').forEach((button) => button.addEventListener('click', async () => {
    try {
      const result = constructOutpost(activeExpedition, button.dataset.buildOutpost);
      if (!result.changed) return activeContext?.showToast?.(result.message);
      await applyExpeditionMutation(result.expedition, 'operation', { type: 'outpost-build', outpostId: button.dataset.buildOutpost });
      syncExpeditionContacts(activeExpedition);
      activeContext?.showToast?.(result.message);
      renderMission();
    } catch (error) { reportSharedMutationError(error); }
  }));
  host.querySelectorAll('[data-service-outpost]').forEach((button) => button.addEventListener('click', async () => {
    try {
      const result = serviceOutpost(activeExpedition, button.dataset.serviceOutpost);
      if (!result.changed) return activeContext?.showToast?.(result.message);
      await applyExpeditionMutation(result.expedition, 'operation', { type: 'outpost-service', outpostId: button.dataset.serviceOutpost });
      syncExpeditionContacts(activeExpedition);
      activeContext?.showToast?.(result.message);
      renderMission();
    } catch (error) { reportSharedMutationError(error); }
  }));
  document.getElementById('expeditionEnterShip')?.addEventListener('click', () => void enterActiveShip());
}

function closeShipStationPanel() {
  const panel = document.getElementById('shipStationPanel');
  panel?.classList.remove('show');
  if (panel?.contains(document.activeElement)) document.activeElement?.blur?.();
}

function crewPortraitPosition(crewId) {
  if (['crew-science', 'crew-life'].includes(crewId)) return '36% center';
  if (crewId === 'crew-med') return '67% center';
  if (['crew-eng', 'crew-systems'].includes(crewId)) return '96% center';
  return '4% center';
}

function crewMissionAdvice(crew) {
  const pending = activeExpedition?.pendingEvent;
  if (pending?.roomId) {
    const station = SHIP_STATIONS.find((entry) => entry.roomId === pending.roomId && !entry.id.startsWith('deck-lift:'));
    return Object.freeze({
      stationId: station?.id || 'navigation-course',
      title: pending.title,
      message: station
        ? `${crew.name} recommends going to ${station.label} now. The ship map will guide you to the correct deck and station.`
        : `${crew.name} recommends following the active response marker and completing each physical procedure in order.`
    });
  }
  const mission = activeContext?.getDestinationMissionSnapshot?.();
  if (mission?.phase === 'analysis') return Object.freeze({ stationId: 'analysis-review', title: mission.currentObjective || mission.title, message: `${crew.name} recommends taking the returned field record to Analysis & Data before continuing.` });
  if (mission?.phase === 'fieldwork' && mission.surfaceRequired && mission.atDestination) return Object.freeze({ stationId: 'craft-bay-status', title: mission.currentObjective || mission.title, message: `${crew.name} recommends taking the lift to Engineering, boarding the pod at its side hatch, and checking the landing objective before launch.` });
  if (mission?.phase === 'approach' || mission?.phase === 'available') return Object.freeze({ stationId: 'bridge-flight', title: mission.currentObjective || mission.title, message: `${crew.name} recommends returning to the bridge flight controls and following the selected destination course.` });
  if ((activeExpedition?.routeContacts || []).some((contact) => ['available', 'returned'].includes(contact.localOperationState))) return Object.freeze({ stationId: 'craft-bay-status', title: 'Surveyed world available', message: `${crew.name} recommends using the Pod Launch Bay for the local surface operation.` });
  if (activeExpedition?.state === 'planned') return Object.freeze({ stationId: 'bridge-flight', title: `${STARSHIP_NAME} is ready`, message: `${crew.name} recommends returning to flight controls when you are ready to depart.` });
  const roles = new Set(crew.roles || []);
  if (roles.has('engineering')) return Object.freeze({ stationId: 'engineering-status', title: 'Engineering watch', message: `${crew.name} recommends reviewing the lowest ship-system margin before the next voyage chapter.` });
  if (roles.has('medical')) return Object.freeze({ stationId: 'medical-status', title: 'Crew readiness', message: `${crew.name} recommends checking fatigue and treatment reserves before the next watch.` });
  if (roles.has('life-support')) return Object.freeze({ stationId: 'life-support-status', title: 'Life-support watch', message: `${crew.name} recommends checking atmosphere, water recovery, and stored reserves.` });
  if (roles.has('science')) return Object.freeze({ stationId: 'science-survey', title: 'Science watch', message: `${crew.name} recommends recording a local baseline while the voyage is stable.` });
  return Object.freeze({ stationId: 'navigation-course', title: 'Navigation watch', message: `${crew.name} recommends reviewing the active route and arrival margins.` });
}

function renderCrewInteractionPanel(interaction) {
  const crew = (activeExpedition?.crew || []).find((entry) => entry.id === interaction?.crewId);
  if (!crew) return false;
  let panel = document.getElementById('shipStationPanel');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'shipStationPanel';
    document.body.appendChild(panel);
  }
  const advice = crewMissionAdvice(crew);
  const roles = (crew.roles || []).map((role) => String(role).replaceAll('-', ' ')).join(' · ');
  panel.innerHTML = `<div class="ship-station-card ship-crew-card" role="dialog" aria-modal="true" aria-labelledby="shipStationTitle">
    <header><div><span>${STARSHIP_NAME.toUpperCase()} CREW</span><strong id="shipStationTitle">${crew.name}</strong></div><button type="button" data-close-station aria-label="Close crew conversation">×</button></header>
    <div class="ship-crew-conversation"><figure><img src="assets/expedition/crew/space-crew-reference-v1.png" alt="${STARSHIP_NAME} crew member" style="object-position:${crewPortraitPosition(crew.id)}"></figure><div><span>${roles}</span><h3>${advice.title}</h3><p>${advice.message}</p><dl><div><dt>Assignment</dt><dd>${String(crew.assignment || 'active watch').replaceAll('-', ' ')}</dd></div><div><dt>Health</dt><dd>${Math.round(Number(crew.health || 0) * 100)}%</dd></div><div><dt>Fatigue</dt><dd>${Math.round(Number(crew.fatigue || 0) * 100)}%</dd></div></dl></div></div>
    <div class="ship-station-actions"><button type="button" data-crew-route="${advice.stationId}">Show route</button><small>The route uses the existing ship objective, map, lift, door, and station authorities.</small></div>
  </div>`;
  panel.classList.add('show');
  panel.querySelector('[data-close-station]')?.addEventListener('click', closeShipStationPanel);
  panel.querySelector('[data-crew-route]')?.addEventListener('click', (event) => {
    closeShipStationPanel();
    if (!activeContext?.setExpeditionShipGuidanceTarget?.(event.currentTarget.dataset.crewRoute)) activeContext?.showToast?.('That ship station is not available right now.');
  });
  return true;
}

async function commitVoyageResponse(choiceId, interaction) {
  const previousId = activeExpedition?.pendingEvent?.id;
  const next = resolveExpeditionEvent(activeExpedition, choiceId);
  if (next === activeExpedition || next.pendingEvent?.id === previousId) {
    activeContext?.showToast?.('That response is not available with the current crew and stores.');
    return false;
  }
  try {
    await applyExpeditionMutation(next, 'event', { type: 'event-response', choiceId });
  } catch (error) {
    reportSharedMutationError(error);
    return false;
  }
  activeContext?.playExpeditionShipAction?.({
    actionId: 'event-response',
    kind: activeExpedition.failureReport ? 'alert' : 'operation',
    message: activeExpedition.log.at(-1)?.message || 'The crew completed the response.',
    interaction
  });
  activeContext?.showToast?.(activeExpedition.log.at(-1)?.message || 'The crew completed the response.');
  return true;
}

async function recordBaselineInJournal() {
  await activeContext?.recordExplorerEvent?.({
    eventId: `event:space-expedition:${activeExpedition.id}:ship-survey`,
    eventType: 'interstellar-ship-survey',
    sourceSystem: 'interstellar-expedition',
    sourceId: `${activeExpedition.id}:ship-survey`,
    pathId: 'travel',
    name: `${STARSHIP_NAME} stellar baseline`,
    detail: `A stellar baseline was recorded from the ${STARSHIP_NAME} science lab.`,
    regionId: activeExpedition.destinationId,
    regionLabel: String(activeExpedition.destinationId).replaceAll('-', ' '),
    worldIdentity: activeExpedition.destinationId,
    environment: 'SPACE_FLIGHT',
    points: 8,
    firstCompletion: true,
    projections: { journal: true, profile: true, place: false, fieldGuide: false }
  });
}

async function loadBackpackMaterialsToShip() {
  if (sharedState) {
    return Object.freeze({ changed: false, message: 'Shared-room cargo transfer needs one server-authorized Backpack and ship transaction before it can be enabled.' });
  }
  const inventory = activeContext ? ensurePlayerBackpackInventory(activeContext) : null;
  const before = inventory?.snapshot?.();
  const transfer = summarizeExpeditionTransfers(before?.items || []);
  if (!inventory || transfer.transfers.length === 0) {
    return Object.freeze({ changed: false, message: 'No compatible material bundles are in the Backpack.' });
  }
  const resources = { ...(activeExpedition.resources || {}) };
  Object.entries(transfer.resources).forEach(([key, amount]) => {
    resources[key] = Number(resources[key] || 0) + Number(amount || 0);
  });
  const ship = getShipProfile(activeExpedition.ship?.profileId);
  if (ship && totalCargoMass(resources) > Number(ship.cargoCapacityKg || 0)) {
    return Object.freeze({ changed: false, message: `${STARSHIP_NAME} does not have enough cargo capacity for those Backpack materials.` });
  }
  const originals = transfer.transfers.map((entry) => before.items.find((item) => item.instanceId === entry.instanceId)).filter(Boolean);
  const restoreBackpack = () => {
    originals.forEach((item) => inventory.upsertItem?.(item));
    activeContext?.playerBackpackStore?.save?.(inventory.exportState?.());
  };
  for (const entry of transfer.transfers) {
    if (!inventory.consumeItem?.(entry.instanceId, entry.quantity)) {
      restoreBackpack();
      return Object.freeze({ changed: false, message: 'The Backpack changed before the cargo transfer could finish.' });
    }
  }
  activeContext?.playerBackpackStore?.save?.(inventory.exportState?.());
  const manifest = transfer.transfers.map((entry) => `${entry.quantity} × ${entry.label}`).join(', ');
  const message = `${transfer.totalMassKg.toFixed(1)} kg moved from the Backpack into ${STARSHIP_NAME} stores: ${manifest}.`;
  const readiness = assessExpeditionReadiness({
    ship,
    propulsion: getPropulsionProfile(activeExpedition.propulsionId),
    crew: activeExpedition.crew,
    crewPopulation: activeExpedition.crewPopulation,
    resources,
    calculation: activeExpedition.calculation
  });
  const next = withExpeditionChanges(activeExpedition, {
    resources: Object.freeze(resources),
    readiness,
    materialLedger: Object.freeze({
      ...(activeExpedition.materialLedger || {}),
      earthLoadedKg: Number(activeExpedition.materialLedger?.earthLoadedKg || 0) + transfer.totalMassKg
    }),
    log: Object.freeze([...(activeExpedition.log || []), Object.freeze({
      atMissionS: Number(activeExpedition.strategicElapsedS) || 0,
      kind: 'cargo',
      message
    })])
  });
  try {
    await applyExpeditionMutation(next, 'cargo-transfer');
    return Object.freeze({ changed: true, message, transfer });
  } catch (error) {
    restoreBackpack();
    return Object.freeze({ changed: false, message: String(error?.message || 'The cargo transfer could not be saved, so the Backpack was restored.') });
  }
}

async function transferApprovedSampleToBackpack() {
  if (!activeExpedition) return Object.freeze({ changed: false, message: 'No Expedition cargo is active.' });
  if (sharedState) return Object.freeze({ changed: false, message: 'Room sample export stays locked until ship cargo and player inventory can commit in one server transaction.' });
  const sample = (activeExpedition.scienceSamples || []).find((entry) =>
    entry.processed === true && entry.analysisApproved === true && !entry.recoveryRequirement && entry.exported !== true
  );
  if (!sample) return Object.freeze({ changed: false, message: 'Process and approve a science sample before moving it to the Backpack.' });
  const massKg = Math.max(0, Number(sample.massKg || 0));
  if (massKg <= 0 || Number(activeExpedition.resources?.scienceCargoKg || 0) + 1e-9 < massKg) {
    return Object.freeze({ changed: false, message: 'The approved sample does not match the current science-cargo manifest.' });
  }
  const value = approvedSampleTradeValue(sample);
  if (value <= 0) return Object.freeze({ changed: false, message: 'This sample has not passed the required game-world trade review.' });
  const inventory = activeContext ? ensurePlayerBackpackInventory(activeContext) : null;
  if (!inventory) return Object.freeze({ changed: false, message: 'The shared Backpack is unavailable.' });
  const catalogId = `approved-space-sample:${String(sample.id).replace(/[^a-z0-9:_-]+/gi, '-').toLowerCase()}`;
  const instanceId = `${catalogId}:lot`;
  const definition = Object.freeze({
    id: catalogId,
    label: `${sample.label} · approved lot`,
    category: 'research-sample',
    icon: 'SAMPLE',
    verbs: Object.freeze(['inspect']),
    stackLimit: 1,
    description: `A sealed game-world research sample approved aboard ${STARSHIP_NAME}. Its value is a game rule, not a real commodity price.`
  });
  inventory.registerDefinitions?.([definition]);
  const priorItem = inventory.snapshot?.().items?.find((entry) => entry.instanceId === instanceId) || null;
  if (priorItem) return Object.freeze({ changed: false, message: 'That approved lot is already in the Backpack.' });
  inventory.upsertItem?.({
    instanceId,
    catalogId,
    quantity: 1,
    authority: 'expedition-cargo-transfer',
    provenance: 'approved-solis-reach-science-cargo',
    sourceEventId: sample.id,
    tradeable: true,
    acquiredAt: Date.now(),
    metadata: {
      label: definition.label,
      category: definition.category,
      icon: definition.icon,
      description: definition.description,
      sampleId: sample.id,
      bodyId: sample.bodyId,
      contactId: sample.contactId,
      massKg,
      truthClass: sample.truthClass,
      commerceSellValue: value,
      allowedCommerceKinds: ['pawn', 'hardware', 'outdoor']
    }
  }, { definition });
  activeContext?.playerBackpackStore?.save?.(inventory.exportState?.());
  const samples = (activeExpedition.scienceSamples || []).map((entry) => Object.freeze(entry.id === sample.id ? {
    ...entry,
    exported: true,
    exportedAtMissionS: Number(activeExpedition.strategicElapsedS || 0),
    exportedCatalogId: catalogId,
    gameTradeValue: value
  } : { ...entry }));
  const next = withExpeditionChanges(activeExpedition, {
    scienceSamples: Object.freeze(samples),
    resources: Object.freeze({
      ...activeExpedition.resources,
      scienceCargoKg: Math.max(0, Number(activeExpedition.resources.scienceCargoKg || 0) - massKg)
    }),
    log: appendMissionLog(activeExpedition, 'science', `Transferred the approved ${sample.label} lot from ${STARSHIP_NAME} science cargo to the Explorer Backpack.`)
  });
  try {
    await applyExpeditionMutation(next, 'operation');
  } catch (error) {
    inventory.consumeItem?.(instanceId, 1);
    activeContext?.playerBackpackStore?.save?.(inventory.exportState?.());
    return Object.freeze({ changed: false, message: String(error?.message || 'The approved sample transfer could not be committed.') });
  }
  return Object.freeze({ changed: true, message: `${definition.label} moved to the Backpack. Eligible research buyers offer ${value} Explorer Credits.` });
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
    <header><div><span>${STARSHIP_NAME.toUpperCase()} SYSTEM</span><strong id="shipStationTitle">${view.title}</strong></div><button type="button" data-close-station aria-label="Close station">×</button></header>
    <p>${view.summary}</p>
    ${voyageEventMarkup}
    <div class="ship-station-metrics">${view.metrics.map((metric) => `<div><span>${metric.label}</span><strong>${metric.value}</strong></div>`).join('')}</div>
    ${view.actions.length ? `<div class="ship-station-actions">${view.actions.map((action) => `<button type="button" data-ship-action="${action.id}" ${action.enabled ? '' : 'disabled'}>${action.label}</button>${action.reason ? `<small>${action.reason}</small>` : ''}`).join('')}</div>` : '<small class="ship-station-readonly">This station is informational during the current voyage state.</small>'}
  </div>`;
  panel.classList.add('show');
  panel.querySelector('[data-close-station]')?.addEventListener('click', closeShipStationPanel);
  panel.querySelectorAll('[data-ship-action]').forEach((button) => button.addEventListener('click', async () => {
    const actionId = button.dataset.shipAction;
    if (actionId === 'load-backpack-materials') {
      const result = await loadBackpackMaterialsToShip();
      activeContext?.showToast?.(result.message);
      if (result.changed) renderShipStationPanel(interaction);
      return;
    }
    if (actionId === 'transfer-approved-sample') {
      const result = await transferApprovedSampleToBackpack();
      activeContext?.showToast?.(result.message);
      if (result.changed) renderShipStationPanel(interaction);
      return;
    }
    const result = applyShipOperation(activeExpedition, actionId);
    if (!result.changed) {
      activeContext?.showToast?.(result.message);
      return;
    }
    try {
      await applyExpeditionMutation(result.expedition, 'operation', { type: 'ship-operation', operationId: actionId });
    } catch (error) {
      reportSharedMutationError(error);
      return;
    }
    activeContext?.playExpeditionShipAction?.({ actionId, message: result.message, interaction });
    if (actionId === 'record-baseline') await recordBaselineInJournal();
    activeContext?.showToast?.(result.message);
    renderShipStationPanel(interaction);
  }));
  panel.querySelectorAll('[data-voyage-response]').forEach((button) => button.addEventListener('click', async () => {
    const pending = activeExpedition.pendingEvent;
    const choiceId = button.dataset.voyageResponse;
    const started = activeContext?.startExpeditionIncidentProcedure?.({
      eventId: pending?.id,
      choiceId,
      choiceLabel: button.textContent?.trim() || 'Complete ship response',
      complete: () => commitVoyageResponse(choiceId, interaction)
    });
    if (started) return;
    if (await commitVoyageResponse(choiceId, interaction)) renderShipStationPanel(interaction);
  }));
  return true;
}

function podReadyContacts() {
  return (activeExpedition?.routeContacts || []).filter((contact) => ['available', 'returned'].includes(contact.localOperationState));
}

function renderPodLaunchPanel(interaction) {
  if (!interaction || !activeExpedition) return false;
  let panel = document.getElementById('shipStationPanel');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'shipStationPanel';
    document.body.appendChild(panel);
  }
  const contacts = podReadyContacts();
  const mission = activeContext?.getDestinationMissionSnapshot?.();
  const missionReady = Boolean(mission?.surfaceRequired && mission.phase === 'fieldwork' && mission.atDestination);
  const blockedByTransit = Boolean(activeContext?.universeRuntime?.transition);
  const earthReady = activeContext?.universeRuntime?.current?.id === 'sol';
  const targetMarkup = contacts.length || missionReady || earthReady
    ? `<div class="ship-station-actions">${earthReady ? `<button type="button" data-pod-earth ${blockedByTransit ? 'disabled' : ''}>Launch for Earth</button><small>Manual descent · return to the saved Earth location · Pathfinder remains available for the flight back</small>` : ''}${missionReady ? `<button type="button" data-pod-mission ${blockedByTransit ? 'disabled' : ''}>Launch for ${mission.destinationId.split('-').map((word) => word ? word[0].toUpperCase() + word.slice(1) : '').join(' ')}</button><small>${mission.title} · manual approach · three surface field records · return to ${STARSHIP_NAME}</small>` : ''}${contacts.map((contact) => `<button type="button" data-pod-contact="${contact.id}" ${blockedByTransit ? 'disabled' : ''}>Launch for ${contact.designation} I</button><small>${contact.worldClass} · manual orbital and atmospheric approach · surface return pod</small>`).join('')}</div>`
    : '<small class="ship-station-readonly">No surveyed surface target is available in this voyage chapter. Continue the Expedition until the crew identifies a local world.</small>';
  panel.innerHTML = `<div class="ship-station-card pod-launch-card" role="dialog" aria-modal="true" aria-labelledby="shipStationTitle">
    <header><div><span>${STARSHIP_NAME.toUpperCase()} FLIGHT DECK</span><strong id="shipStationTitle">Pod Launch Bay</strong></div><button type="button" data-close-station aria-label="Close pod launch">×</button></header>
    <p>Board Pathfinder and launch from ${STARSHIP_NAME}. The pod enters the existing local Space world under manual control; approach and landing preserve the destination body's modeled environment, collision, and surface authorities.</p>
    <div class="ship-station-metrics"><div><span>Pod</span><strong>Sealed · fueled · surface capable</strong></div><div><span>Flight</span><strong>Manual after bay departure</strong></div><div><span>Landing</span><strong>Descent masks surface preparation</strong></div><div><span>Return</span><strong>Board the same pod on the surface</strong></div></div>
    ${targetMarkup}
  </div>`;
  panel.classList.add('show');
  panel.querySelector('[data-close-station]')?.addEventListener('click', closeShipStationPanel);
  panel.querySelectorAll('[data-pod-contact]').forEach((button) => button.addEventListener('click', () => {
    if (!launchPodToContact(button.dataset.podContact)) activeContext?.showToast?.('That pod route is not available from the current ship position.');
  }));
  panel.querySelector('[data-pod-mission]')?.addEventListener('click', () => {
    if (!launchDestinationMissionPod()) activeContext?.showToast?.('The destination mission pod route is not ready.');
  });
  panel.querySelector('[data-pod-earth]')?.addEventListener('click', () => {
    if (!launchPodToEarth()) activeContext?.showToast?.('The Earth pod route is not ready from this ship position.');
  });
  return true;
}

function renderDestinationMissionAnalysisPanel(interaction) {
  const mission = activeContext?.getDestinationMissionSnapshot?.();
  if (!interaction || !mission || mission.phase !== 'analysis') return false;
  let panel = document.getElementById('shipStationPanel');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'shipStationPanel';
    document.body.appendChild(panel);
  }
  const destinationName = mission.destinationId.split('-').map((word) => word ? `${word[0].toUpperCase()}${word.slice(1)}` : '').join(' ');
  const lifeFinding = mission.habitability?.lifeEvidence === 'none-confirmed'
    ? 'No confirmed evidence of life'
    : mission.habitability?.lifeEvidence || 'No confirmed extraterrestrial life';
  const outcomes = mission.analysisOutcomes || [];
  const outcomeActions = outcomes.map((outcome) => `<button type="button" data-complete-destination-analysis="${outcome.id}" ${outcome.available ? '' : 'disabled'}>${outcome.label}</button><small>${outcome.consequence}${outcome.requiresScienceLead ? ` · ${outcome.crewLeadName ? `${outcome.crewLeadName} can lead the review` : 'Science lead unavailable'}` : ''}</small>`).join('');
  panel.innerHTML = `<div class="ship-station-card destination-analysis-card" role="dialog" aria-modal="true" aria-labelledby="shipStationTitle">
    <header><div><span>${STARSHIP_NAME.toUpperCase()} ANALYSIS LAB</span><strong id="shipStationTitle">${mission.title}</strong></div><button type="button" data-close-station aria-label="Close analysis">×</button></header>
    <p>The field package is aboard. Compare the instrument record, preserve uncertainty, and publish the destination report to the Captain’s Log and Explorer Journal.</p>
    <div class="ship-station-metrics"><div><span>Destination</span><strong>${destinationName}</strong></div><div><span>Evidence</span><strong>Field survey secured</strong></div><div><span>Life finding</span><strong>${lifeFinding}</strong></div></div>
    <div class="ship-station-actions">${outcomeActions || '<small>The evidence package is not ready for a supported result.</small>'}</div>
  </div>`;
  panel.classList.add('show');
  panel.querySelector('[data-close-station]')?.addEventListener('click', closeShipStationPanel);
  panel.querySelectorAll('[data-complete-destination-analysis]').forEach((button) => button.addEventListener('click', async () => {
    const completed = await activeContext?.completeDestinationMissionAnalysis?.(button.dataset.completeDestinationAnalysis);
    if (!completed) return activeContext?.showToast?.('That analysis result is not supported by the current evidence and crew readiness.');
    activeContext?.playExpeditionShipAction?.({ actionId: 'destination-analysis', kind: 'science', message: `${mission.title} analysis complete.`, interaction });
    closeShipStationPanel();
  }));
  return true;
}

function markExpeditionPodDescent(bodyId) {
  if (!activePodJourney || String(bodyId || '').toLowerCase() !== activePodJourney.bodyId.toLowerCase()) return false;
  return activePodJourney.phase === POD_PHASE.LOCAL_FLIGHT ? advancePodJourney('begin_descent') : activePodJourney.phase === POD_PHASE.DESCENT;
}

function markExpeditionPodLanded(bodyId) {
  if (!activePodJourney || String(bodyId || '').toLowerCase() !== activePodJourney.bodyId.toLowerCase()) return false;
  if (activePodJourney.phase === POD_PHASE.LOCAL_FLIGHT) advancePodJourney('begin_descent');
  return activePodJourney.phase === POD_PHASE.DESCENT ? advancePodJourney('surface_ready') : activePodJourney.phase === POD_PHASE.SURFACE;
}

function markExpeditionPodSurfaceLaunch(bodyId) {
  if (!activePodJourney || String(bodyId || '').toLowerCase() !== activePodJourney.bodyId.toLowerCase()) return false;
  const launched = activePodJourney.phase === POD_PHASE.SURFACE ? advancePodJourney('launch') : activePodJourney.phase === POD_PHASE.SURFACE_LAUNCH;
  if (launched) activeContext?.setExpeditionPodFlightPresentation?.(true);
  return launched;
}

async function handleShipInteraction(interaction) {
  if (interaction?.kind === 'ship-crew') return renderCrewInteractionPanel(interaction);
  if (interaction?.id === 'bridge-flight') {
    closeShipStationPanel();
    return activeContext?.exitExpeditionShipInterior?.() === true;
  }
  if (interaction?.id === 'craft-bay-status') return renderPodLaunchPanel(interaction);
  if (interaction?.id === 'analysis-review' && activeContext?.getDestinationMissionSnapshot?.()?.phase === 'analysis') {
    return renderDestinationMissionAnalysisPanel(interaction);
  }
  return renderShipStationPanel(interaction);
}

async function enterActiveShip() {
  if (!activeExpedition || !activeContext?.spaceFlight?.active) return false;
  activeContext?.setSolisReachFlightPresentation?.(true);
  activeContext?.updateSpaceTravelSession?.({
    activeCraftId: SPACE_CRAFT_IDENTITY.starship.id,
    location: SPACE_TRAVEL_LOCATION.STARSHIP,
    phase: SPACE_TRAVEL_PHASE.INTERIOR,
    reason: 'solis-reach-interior-entered'
  });
  ensureStylesheet();
  const ship = await import('./ship-interior.js?v=21');
  closeExpeditionPlanner();
  const entered = ship.enterSolisReachInterior({
    expedition: activeExpedition,
    onInteraction: handleShipInteraction
  });
  if (!entered) {
    openExpeditionPlanner(activeContext);
    activeContext?.showSpaceFlightMessage?.(`The ${STARSHIP_NAME} interior is unavailable right now.`, '#f59e0b');
  }
  return entered;
}

function openExpeditionPlanner(appContext) {
  bindRuntimeContext(appContext);
  store ||= createExpeditionStore();
  activeExpedition = store.load();
  activePodJourney = activeExpedition?.podJourney?.type === 'ExpeditionPodJourney'
    ? Object.freeze({ ...activeExpedition.podJourney })
    : null;
  syncExpeditionContacts(activeExpedition);
  void ensureSharedAuthority();
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
  if (!activeExpedition) return null;
  return {
    ...JSON.parse(JSON.stringify(activeExpedition)),
    podJourney: activePodJourney ? { ...activePodJourney } : null
  };
}

export {
  boardSolisReachDirect,
  closeExpeditionPlanner,
  getExpeditionSnapshot,
  openExpeditionPlanner,
  prepareSolisReachSurfaceRendezvous,
  stageEarthPathfinder
};
