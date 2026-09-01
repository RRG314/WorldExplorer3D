const ACTIVE_FIELD_PHASES = new Set([
  'sweeping', 'signal', 'classified', 'excavating', 'seeking', 'observing', 'revealed'
]);

const POD_PHASE_COPY = Object.freeze({
  ship_launch: ['Leave Surveyor', 'Fly Pathfinder clear of the ship and acquire your local course.'],
  local_flight: ['Fly Pathfinder', 'Follow the selected course or continue under manual control.'],
  descent: ['Land Pathfinder', 'Complete the approach and touch down on the selected surface.'],
  surface: ['Explore the surface', 'Complete the marked fieldwork, then return to Pathfinder.'],
  surface_launch: ['Return to Surveyor', 'Climb away from the surface and follow the rendezvous course.'],
  rendezvous: ['Dock with Surveyor', 'Approach the docking collar at low relative speed.'],
  recovered: ['Continue aboard Surveyor', 'Review the returned work and prepare the next voyage step.']
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
  if (next) {
    const distance = Number(next.distanceMeters);
    const route = Number.isFinite(distance) ? `${Math.ceil(distance)} m away` : 'Ready when you are';
    return {
      eyebrow: expedition.completedCount > 0 ? `TODAY'S ROUTE · ${expedition.completedCount}/${expedition.objectiveCount}` : "TODAY'S ROUTE",
      title: text(next.targetLabel, 'Choose a nearby activity'),
      detail: `${route}. Open Today to begin this stop or choose another activity.`,
      actionLabel: 'Open Today',
      action: () => appCtx.openWorldDiscoverySection?.('today')
    };
  }
  return {
    eyebrow: 'EXPLORE THIS PLACE',
    title: 'Choose what interests you',
    detail: 'Find a nearby activity, continue your Journal, or plan where to travel next.',
    actionLabel: 'Explore',
    action: () => appCtx.openWorldDiscoverySection?.('today')
  };
}

function deriveSpaceJourney(appCtx) {
  const expedition = safeSnapshot(appCtx.getInterstellarExpeditionSnapshot);
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
      title: expedition.state === 'planned' ? 'Prepare the Expedition' : `Continue toward ${titleCase(expedition.destinationId, 'the destination')}`,
      detail: 'Check the current watch, speak with the crew, or use the marked station.',
      actionLabel: 'Ship Map',
      action: () => appCtx.toggleExpeditionShipMap?.(true)
    };
  }
  if (!appCtx.spaceFlight?.active) return null;
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
  let currentAction = null;
  let elapsed = 1;
  let signature = '';

  action?.addEventListener('click', () => currentAction?.());

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
      if (eyebrow) eyebrow.textContent = journey.eyebrow;
      if (title) title.textContent = journey.title;
      if (detail) detail.textContent = journey.detail;
      if (action) action.textContent = journey.actionLabel;
    }
    currentAction = journey.action;
    if (card) card.hidden = false;
  }

  return Object.freeze({ update });
}

export { createCurrentJourneyUi };
