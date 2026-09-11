const CONTACT_DISTANCE = 13;
const CONTACT_RESOLUTION_SECONDS = 3;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function responderAgencyProfile(agency = '') {
  const label = String(agency || 'Local civic response');
  if (/ranger/i.test(label)) {
    return Object.freeze({ id: 'ranger', label, vehicleLabel: 'Ranger response SUV', color: 0x31523f, accent: 0xd7c36a, bodyStyle: 'crossover' });
  }
  if (/campus/i.test(label)) {
    return Object.freeze({ id: 'campus', label, vehicleLabel: 'Campus safety vehicle', color: 0x344f69, accent: 0xe8e8df, bodyStyle: 'crossover' });
  }
  return Object.freeze({ id: 'civic', label, vehicleLabel: 'Civic response sedan', color: 0x1f354d, accent: 0xe8ecef, bodyStyle: 'sedan' });
}

function responderCountForLevel(level, mobile = false) {
  if (Number(level) <= 0) return 0;
  return mobile ? 1 : Number(level) >= 2 ? 2 : 1;
}

function outcomeForLevel(level) {
  if (Number(level) >= 3) return Object.freeze({ type: 'recovery', label: 'Vehicle recovery required' });
  if (Number(level) >= 2) return Object.freeze({ type: 'arrest', label: 'Taken into custody' });
  return Object.freeze({ type: 'warning', label: 'Warning issued' });
}

function responderApproachSpeed(input = {}) {
  const distance = Math.max(0, Number(input.distance) || 0);
  const level = clamp(input.level, 1, 3);
  const stopDistance = Math.max(0, Number(input.stopDistance) || 0);
  if (distance <= stopDistance) return 0;
  const normalSpeed = Math.min(22 + level * 2, 7 + distance * .24);
  const headingError = Math.min(Math.PI, Math.abs(Number(input.headingError) || 0));
  const forwardAlignment = Math.max(0, Math.cos(headingError));
  const maneuverSpeed = 4.5 + normalSpeed * forwardAlignment;
  return Math.min(normalSpeed, maneuverSpeed);
}

function createResponderResponseModel(options = {}) {
  const state = {
    phase: 'idle',
    eventId: '',
    contactElapsed: 0,
    lastOutcome: null,
    sequence: 0
  };
  const mobile = options.mobile === true;

  function snapshot(extra = {}) {
    const phase = state.phase;
    const activeCount = Math.max(0, Math.floor(Number(extra.activeCount) || 0));
    const status = phase === 'dispatched'
      ? { visible: true, title: 'Responders dispatched', detail: `${activeCount} unit${activeCount === 1 ? '' : 's'} approaching` }
      : phase === 'pursuit'
        ? { visible: true, title: 'Responders nearby', detail: 'Slow down or leave the search area' }
        : phase === 'searching'
          ? { visible: true, title: 'Local search active', detail: 'Your last known area is being checked' }
          : phase === 'contact'
            ? { visible: true, title: 'Responder contact', detail: 'Remain stopped' }
            : phase === 'returning'
              ? { visible: true, title: 'Response ending', detail: 'Units are clearing the area' }
              : { visible: false, title: '', detail: '' };
    return Object.freeze({
      phase,
      eventId: state.eventId,
      contactElapsed: Number(state.contactElapsed.toFixed(2)),
      lastOutcome: state.lastOutcome,
      activeCount,
      dispatchCount: Math.max(0, Math.floor(Number(extra.dispatchCount) || 0)),
      resolution: extra.resolution || null,
      status: Object.freeze(status)
    });
  }

  function update(dt, input = {}) {
    const civic = input.civic || {};
    const activeCount = Math.max(0, Math.floor(Number(input.activeCount) || 0));
    const level = clamp(civic.level, 0, 3);
    const civicPhase = String(civic.phase || 'clear');
    const eventId = String(civic.lastEvent?.id || state.eventId || '');
    if (eventId) state.eventId = eventId;

    if (civicPhase === 'clear' || civicPhase === 'cooling') {
      state.phase = activeCount > 0 ? 'returning' : 'idle';
      state.contactElapsed = 0;
      return snapshot({ activeCount });
    }
    if (civicPhase === 'observed' || civicPhase === 'reporting') {
      state.phase = activeCount > 0 ? 'dispatched' : 'queued';
      state.contactElapsed = 0;
      return snapshot({ activeCount });
    }

    const desiredCount = responderCountForLevel(level, mobile);
    const dispatchCount = Math.max(0, desiredCount - activeCount);
    if (dispatchCount > 0) {
      state.phase = 'dispatched';
      state.contactElapsed = 0;
      return snapshot({ activeCount, dispatchCount });
    }

    const actorWithinSearch = input.actorWithinSearch !== false;
    const nearestDistance = Number.isFinite(Number(input.nearestDistance)) ? Number(input.nearestDistance) : Infinity;
    const actorMoving = input.actorMoving === true;
    if (!actorWithinSearch) {
      state.phase = 'searching';
      state.contactElapsed = 0;
      return snapshot({ activeCount });
    }
    if (nearestDistance > CONTACT_DISTANCE) {
      state.phase = nearestDistance > 38 ? 'dispatched' : 'pursuit';
      state.contactElapsed = 0;
      return snapshot({ activeCount });
    }
    if (actorMoving) {
      state.phase = 'pursuit';
      state.contactElapsed = 0;
      return snapshot({ activeCount });
    }

    state.phase = 'contact';
    state.contactElapsed += clamp(dt, 0, .25);
    if (state.contactElapsed < CONTACT_RESOLUTION_SECONDS) return snapshot({ activeCount });
    const outcome = Object.freeze({
      ...outcomeForLevel(level),
      eventId: state.eventId,
      sequence: ++state.sequence
    });
    state.lastOutcome = outcome;
    state.contactElapsed = 0;
    return snapshot({ activeCount, resolution: outcome });
  }

  function clear() {
    state.phase = 'idle';
    state.eventId = '';
    state.contactElapsed = 0;
    state.lastOutcome = null;
    return snapshot({ activeCount: 0 });
  }

  return Object.freeze({ clear, snapshot, update });
}

export {
  CONTACT_DISTANCE,
  CONTACT_RESOLUTION_SECONDS,
  createResponderResponseModel,
  outcomeForLevel,
  responderApproachSpeed,
  responderAgencyProfile,
  responderCountForLevel
};
