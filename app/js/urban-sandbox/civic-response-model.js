const PHASE_DURATION = Object.freeze({
  observed: 2.4,
  reporting: 3.6,
  cooling: 8
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function civicAgencyForLocation(request = {}) {
  const label = String(request.location?.name || request.selection?.name || request.name || '').trim();
  const normalized = label.toLowerCase();
  if (/national park|state park|forest|preserve|wilderness/.test(normalized)) return 'Ranger service';
  if (/campus|university|college/.test(normalized)) return 'Campus safety';
  if (label) return `${label.replace(/,.*$/, '')} civic response`;
  return 'Local civic response';
}

function eventLabel(kind) {
  if (kind === 'vehicle_taken') return 'Vehicle takeover witnessed';
  if (kind === 'reckless_driving') return 'Reckless driving witnessed';
  if (kind === 'collision') return 'Collision witnessed';
  if (kind === 'trespass') return 'Restricted-area entry witnessed';
  return 'Incident witnessed';
}

function createCivicResponseModel(options = {}) {
  const agency = String(options.agency || civicAgencyForLocation(options.request));
  const state = {
    phase: 'clear',
    level: 0,
    phaseRemaining: 0,
    searchCenter: null,
    lastEvent: null,
    lastIgnoredEvent: null,
    witnesses: [],
    events: [],
    sequence: 0
  };

  const searchRadius = () => 70 + state.level * 35;
  const distanceFromSearch = (position) => state.searchCenter && position
    ? Math.hypot(Number(position.x || 0) - state.searchCenter.x, Number(position.z || 0) - state.searchCenter.z)
    : 0;

  const observe = (event = {}, witnesses = []) => {
    const position = event.position;
    const validPosition = position && Number.isFinite(position.x) && Number.isFinite(position.z);
    const normalizedWitnesses = Array.isArray(witnesses) ? witnesses.filter((entry) => entry?.id).slice(0, 4) : [];
    if (!validPosition || normalizedWitnesses.length === 0) {
      state.lastIgnoredEvent = Object.freeze({
        kind: String(event.kind || 'incident'),
        reason: validPosition ? 'no_valid_witness' : 'invalid_position'
      });
      return Object.freeze({ accepted: false, reason: state.lastIgnoredEvent.reason, snapshot: snapshot() });
    }
    const severity = clamp(event.severity || 1, 1, 3);
    const alreadyActive = state.phase !== 'clear';
    state.level = clamp(Math.max(state.level, severity) + (alreadyActive ? 1 : 0), 1, 3);
    state.phase = 'observed';
    state.phaseRemaining = PHASE_DURATION.observed;
    state.searchCenter = Object.freeze({ x: Number(position.x), z: Number(position.z) });
    state.witnesses = normalizedWitnesses.map((entry) => Object.freeze({
      id: String(entry.id),
      distance: Number(entry.distance || 0),
      reaction: String(entry.reaction || '')
    }));
    state.lastEvent = Object.freeze({
      id: `civic-event:${++state.sequence}`,
      kind: String(event.kind || 'incident'),
      label: eventLabel(event.kind),
      vehicleId: String(event.vehicleId || ''),
      severity,
      witnessCount: state.witnesses.length,
      position: state.searchCenter
    });
    state.events.push(state.lastEvent);
    if (state.events.length > 6) state.events.shift();
    return Object.freeze({ accepted: true, event: state.lastEvent, snapshot: snapshot() });
  };

  const update = (dt, actorPosition = null) => {
    const step = clamp(dt, 0, .25);
    if (state.phase === 'clear' || step <= 0) return snapshot();
    let decay = step;
    if (state.phase === 'searching' && distanceFromSearch(actorPosition) > searchRadius()) decay *= 2.5;
    state.phaseRemaining = Math.max(0, state.phaseRemaining - decay);
    if (state.phaseRemaining > 0) return snapshot();
    if (state.phase === 'observed') {
      state.phase = 'reporting';
      state.phaseRemaining = PHASE_DURATION.reporting;
    } else if (state.phase === 'reporting') {
      state.phase = 'searching';
      state.phaseRemaining = 14 + state.level * 8;
    } else if (state.phase === 'searching') {
      state.phase = 'cooling';
      state.phaseRemaining = PHASE_DURATION.cooling;
    } else {
      state.phase = 'clear';
      state.level = 0;
      state.phaseRemaining = 0;
      state.searchCenter = null;
      state.witnesses = [];
    }
    return snapshot();
  };

  const status = () => {
    if (state.phase === 'clear') return Object.freeze({ visible: false, title: '', detail: '' });
    if (state.phase === 'observed') return Object.freeze({
      visible: true,
      title: state.lastEvent?.label || 'Incident witnessed',
      detail: `${state.witnesses.length} witness${state.witnesses.length === 1 ? '' : 'es'} noticed`
    });
    if (state.phase === 'reporting') return Object.freeze({
      visible: true,
      title: 'Witness reporting',
      detail: agency
    });
    if (state.phase === 'searching') return Object.freeze({
      visible: true,
      title: 'Local search active',
      detail: distanceFromSearch(options.getActorPosition?.()) > searchRadius() ? 'Search is weakening' : agency
    });
    return Object.freeze({ visible: true, title: 'Attention fading', detail: 'Keep exploring calmly' });
  };

  function snapshot() {
    return Object.freeze({
      phase: state.phase,
      level: state.level,
      agency,
      phaseRemaining: Number(state.phaseRemaining.toFixed(2)),
      searchRadius: state.phase === 'clear' ? 0 : searchRadius(),
      searchCenter: state.searchCenter,
      witnesses: Object.freeze([...state.witnesses]),
      lastEvent: state.lastEvent,
      lastIgnoredEvent: state.lastIgnoredEvent,
      recentEvents: Object.freeze([...state.events]),
      status: status()
    });
  }

  const clear = () => {
    state.phase = 'clear';
    state.level = 0;
    state.phaseRemaining = 0;
    state.searchCenter = null;
    state.witnesses = [];
    return snapshot();
  };

  return Object.freeze({ agency, clear, observe, snapshot, status, update });
}

export { PHASE_DURATION, civicAgencyForLocation, createCivicResponseModel, eventLabel };
