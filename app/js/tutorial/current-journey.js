const ACTIVE_FIELD_PHASES = new Set([
  'sweeping', 'signal', 'classified', 'excavating', 'seeking', 'observing', 'revealed'
]);
const AMBIENT_JOURNEY_RADIUS_METERS = 45;
const AMBIENT_JOURNEY_VISIBLE_MS = 6500;

const POD_PHASE_COPY = Object.freeze({
  ship_launch: ['Leave Solis Reach', 'Fly Pathfinder clear of the ship and acquire your local course.'],
  local_flight: ['Fly Pathfinder', 'Follow the selected course or continue under manual control.'],
  descent: ['Land Pathfinder', 'Complete the approach and touch down on the selected surface.'],
  surface: ['Explore the surface', 'Complete the marked fieldwork, then return to Pathfinder.'],
  surface_launch: ['Return to Solis Reach', 'Climb away from the surface and follow the rendezvous course.'],
  rendezvous: ['Dock with Solis Reach', 'Approach the docking collar at low relative speed.'],
  recovered: ['Continue aboard Solis Reach', 'Review the returned work and prepare the next voyage step.']
});

function text(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function titleCase(value, fallback = '') {
  const normalized = text(value, fallback).replaceAll('_', ' ').replaceAll('-', ' ');
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeSnapshot(fn) {
  if (typeof fn !== 'function') return null;
  try { return fn(); } catch { return null; }
}

function deriveFieldJourney(appCtx) {
  const field = safeSnapshot(appCtx.worldDiscoveryRuntimeSnapshot);
  if (!field?.active) return null;
  const activity = field.actions?.find?.((entry) => entry.id === field.activeActivityId);
  const phase = text(field.interaction?.phase, 'idle');
  if (ACTIVE_FIELD_PHASES.has(phase)) {
    const ready = phase === 'revealed';
    const distance = Number(field.interaction?.distanceMeters);
    const bearing = Number(field.interaction?.bearingDegrees);
    const direction = Number.isFinite(distance) && Number.isFinite(bearing)
      ? `${Math.ceil(distance)} m · ${Math.round(bearing)}°`
      : '';
    return {
      eyebrow: ready ? 'RESULT READY' : 'FIELD ACTIVITY',
      title: ready ? `Record ${text(field.interaction?.targetName, activity?.label || 'your finding')}` : text(activity?.label, 'Follow the field lead'),
      detail: ready ? 'Save the result to your Journal and Field Guide.' : text(field.interaction?.message, direction || 'Follow the world cue and continue the activity.'),
      actionLabel: ready ? 'Record' : 'Resume',
      action: () => appCtx.openWorldDiscoverySection?.('today')
    };
  }
  const expedition = field.fieldExpedition;
  const next = expedition?.objectives?.find?.((entry) => !entry.complete);
  if (next && Number.isFinite(Number(next.distanceMeters)) && Number(next.distanceMeters) <= AMBIENT_JOURNEY_RADIUS_METERS) {
    const distance = Number(next.distanceMeters);
    const route = Number.isFinite(distance) ? `${Math.ceil(distance)} m away` : 'Ready when you are';
    return {
      eyebrow: 'NEARBY',
      title: text(next.targetLabel, 'Choose a nearby activity'),
      detail: `${route}. Open Today if you want to explore it.`,
      actionLabel: 'Open Today',
      action: () => appCtx.openWorldDiscoverySection?.('today'),
      transient: true
    };
  }
  return null;
}

function deriveSpaceJourney(appCtx) {
  const expedition = safeSnapshot(appCtx.getInterstellarExpeditionSnapshot);
  const destinationMission = safeSnapshot(appCtx.getDestinationMissionSnapshot);
  const openExpedition = () => document.getElementById('sfExpeditionBtn')?.click();
  const podPhase = text(expedition?.podJourney?.phase);
  if (podPhase && POD_PHASE_COPY[podPhase]) {
    const [title, detail] = POD_PHASE_COPY[podPhase];
    return {
      eyebrow: 'PATHFINDER JOURNEY', title, detail,
      actionLabel: appCtx.activeShipInterior ? 'Ship Map' : 'Wayfinder',
      action: () => appCtx.activeShipInterior ? appCtx.toggleExpeditionShipMap?.(true) : document.getElementById('universeToggle')?.click()
    };
  }
  if (appCtx.activeShipInterior && expedition) {
    if (expedition.pendingEvent) {
      const room = titleCase(expedition.pendingEvent.roomId, 'the affected room');
      return {
        eyebrow: 'SURVEYOR RESPONSE',
        title: text(expedition.pendingEvent.title, 'Ship response needed'),
        detail: `Go to ${room}. The ship map marks the route and the working station.`,
        actionLabel: 'Ship Map',
        action: () => appCtx.toggleExpeditionShipMap?.(true)
      };
    }
    return {
      eyebrow: 'ABOARD SURVEYOR',
      title: expedition.state === 'completed' ? 'First Light mission complete' : expedition.state === 'planned' ? 'Prepare the Expedition' : `Continue toward ${titleCase(expedition.destinationId, 'the destination')}`,
      detail: expedition.state === 'completed' ? 'The destination report has been published. Review the mission result or continue exploring.' : 'Check the current watch, speak with the crew, or use the marked station.',
      actionLabel: 'Ship Map',
      action: () => appCtx.toggleExpeditionShipMap?.(true)
    };
  }
  if (!appCtx.spaceFlight?.active) return null;
  if (expedition?.state === 'completed') {
    return {
      eyebrow: 'MISSION SUCCESS',
      title: 'First Light: Proxima complete',
      detail: `${Number(expedition.campaignResult?.totalPoints || 100)} total points. Review the report or continue in Free Space Flight.`,
      actionLabel: 'Expedition',
      action: openExpedition
    };
  }
  if (expedition?.state === 'failed') {
    return {
      eyebrow: 'MISSION ENDED',
      title: text(expedition.failureReport?.summary, 'The expedition could not continue'),
      detail: 'The mission record is preserved. Review it before explicitly preparing a new expedition.',
      actionLabel: 'Review',
      action: openExpedition
    };
  }
  if (expedition?.state === 'arrived') {
    const conductingMission = destinationMission && destinationMission.systemId === expedition.destinationId;
    return {
      eyebrow: conductingMission ? 'DESTINATION OPERATIONS' : 'FINAL APPROACH',
      title: conductingMission ? text(destinationMission.title, 'Complete the destination survey') : `Enter ${titleCase(expedition.destinationId)}`,
      detail: conductingMission ? text(destinationMission.currentObjective, 'Complete the required science work and return the evidence to the ship.') : 'Complete the system transfer, then begin the required Proxima b survey.',
      actionLabel: 'Expedition',
      action: openExpedition
    };
  }
  if (expedition?.state === 'traveling') {
    const watch = Math.min(14, Number(expedition.voyageDirector?.nextSlotIndex || 0) + (expedition.pendingEvent ? 0 : 1));
    return {
      eyebrow: `INTERSTELLAR TRANSIT · WATCH ${watch}/14`,
      title: expedition.pendingEvent ? text(expedition.pendingEvent.title, 'Ship response needed') : `Continue toward ${titleCase(expedition.destinationId)}`,
      detail: expedition.pendingEvent ? text(expedition.pendingEvent.message) : 'Advance the next watch while protecting the crew, ship systems, and arrival reserves.',
      actionLabel: 'Expedition',
      action: openExpedition
    };
  }
  if (expedition?.state === 'planned') {
    return {
      eyebrow: 'FIRST LIGHT CAMPAIGN',
      title: 'Prepare the Proxima expedition',
      detail: 'Assess the crew, ship, propulsion, and supply reserve before departure.',
      actionLabel: 'Expedition',
      action: openExpedition
    };
  }
  const target = safeSnapshot(appCtx.getUniverseHudTarget);
  const course = target?.course;
  if (course?.destination) {
    const assisted = course.guidance === 'assisted';
    return {
      eyebrow: assisted ? 'WAYFINDER ASSIST' : 'ACTIVE COURSE',
      title: text(course.destination.name, 'Selected destination'),
      detail: assisted ? 'Guidance is steering toward the selected course. Manual input remains available.' : 'The course marker and flight display show the selected direction.',
      actionLabel: 'Wayfinder',
      action: () => document.getElementById('universeToggle')?.click()
    };
  }
  return {
    eyebrow: 'SPACE FLIGHT',
    title: 'Choose a destination or fly freely',
    detail: 'Open Wayfinder to set a course. Assistance is optional and manual flight remains available.',
    actionLabel: 'Wayfinder',
    action: () => document.getElementById('universeToggle')?.click()
  };
}

function createCurrentJourneyUi(appCtx, options = {}) {
  const card = document.getElementById('currentJourneyCard');
  const eyebrow = document.getElementById('currentJourneyEyebrow');
  const title = document.getElementById('currentJourneyTitle');
  const detail = document.getElementById('currentJourneyDetail');
  const action = document.getElementById('currentJourneyAction');
  const dismiss = document.getElementById('currentJourneyDismiss');
  let currentAction = null;
  let elapsed = 1;
  let signature = '';
  let dismissedSignature = '';
  let shownAt = 0;

  action?.addEventListener('click', () => currentAction?.());
  dismiss?.addEventListener('click', () => {
    dismissedSignature = signature;
    if (card) card.hidden = true;
  });

  function update(dt = 0) {
    elapsed += Math.max(0, Number(dt) || 0);
    if (elapsed < 0.25) return;
    elapsed = 0;
    const tutorial = options.getTutorialSnapshot?.() || null;
    const hiddenForFirstJourney = tutorial?.enabled && !tutorial.completed && !tutorial.skipped;
    if (!appCtx.gameStarted || hiddenForFirstJourney) {
      if (card) card.hidden = true;
      return;
    }
    const journey = deriveSpaceJourney(appCtx) || deriveFieldJourney(appCtx);
    if (!journey) {
      if (card) card.hidden = true;
      return;
    }
    const nextSignature = [journey.eyebrow, journey.title, journey.detail, journey.actionLabel].join('|');
    if (nextSignature !== signature) {
      signature = nextSignature;
      shownAt = Date.now();
      if (eyebrow) eyebrow.textContent = journey.eyebrow;
      if (title) title.textContent = journey.title;
      if (detail) detail.textContent = journey.detail;
      if (action) action.textContent = journey.actionLabel;
    }
    currentAction = journey.action;
    const preferredVisibleMs = globalThis.getWorldExplorerAccessibilityNoticeMs?.(AMBIENT_JOURNEY_VISIBLE_MS)
      ?? AMBIENT_JOURNEY_VISIBLE_MS;
    const expired = journey.transient === true && Number.isFinite(preferredVisibleMs) && Date.now() - shownAt >= preferredVisibleMs;
    if (card) card.hidden = dismissedSignature === signature || expired;
  }

  return Object.freeze({ update });
}

export {
  AMBIENT_JOURNEY_RADIUS_METERS,
  AMBIENT_JOURNEY_VISIBLE_MS,
  createCurrentJourneyUi,
  deriveFieldJourney,
  deriveSpaceJourney
};
