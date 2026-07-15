function ensureLocalEarthquakePanel() {
  return {
    panel: document.getElementById('liveEarthLocalPanel'),
    title: document.getElementById('liveEarthLocalTitle'),
    meta: document.getElementById('liveEarthLocalMeta'),
    replayBtn: document.getElementById('liveEarthReplayBtn'),
    dismissBtn: document.getElementById('liveEarthDismissBtn')
  };
}

function updateLocalEarthquakePanel(state) {
  const ui = ensureLocalEarthquakePanel();
  if (!ui.panel || !ui.title || !ui.meta) return;
  const event = state.localEvent;
  if (!event || state.localEventDismissedId === event.id) {
    ui.panel.classList.remove('show');
    return;
  }
  ui.title.textContent = event.title;
  ui.meta.textContent = `${event.depthLabel} • ${event.ageLabel}`;
  ui.panel.classList.add('show');
}

function dismissLocalEvent(state) {
  if (state.localEvent) state.localEventDismissedId = state.localEvent.id;
  updateLocalEarthquakePanel(state);
}

export function startEarthquakeReplay(ctx, state, event) {
  if (!event) return;
  const profile = ctx.buildEarthquakeReplayProfile(event);
  state.earthquakeReplay = {
    active: true,
    startedAtMs: Date.now(),
    durationMs: profile.durationMs,
    amplitude: profile.amplitude,
    frequency: profile.frequency,
    eventId: event.id
  };
}

export function updateEarthquakeReplay(ctx, state) {
  const replay = state.earthquakeReplay;
  if (!replay?.active || !ctx.appCtx.camera) return;
  const elapsed = Date.now() - replay.startedAtMs;
  if (elapsed >= replay.durationMs) {
    replay.active = false;
    return;
  }
  const progress = ctx.clamp01(elapsed / replay.durationMs);
  const fade = 1 - progress;
  const shake = replay.amplitude * fade;
  const t = elapsed / 1000;
  ctx.appCtx.camera.position.x += Math.sin(t * replay.frequency * 8.2) * shake;
  ctx.appCtx.camera.position.y += Math.sin(t * replay.frequency * 9.4) * shake * 0.42;
  ctx.appCtx.camera.position.z += Math.cos(t * replay.frequency * 7.3) * shake;
  ctx.appCtx.camera.rotation.z += Math.sin(t * replay.frequency * 6.1) * shake * 0.02;
}

export function updateLocalEventContext(ctx, state) {
  const now = Date.now();
  if ((now - state.localCheckAt) < ctx.LOCAL_EVENT_CHECK_MS) {
    updateLocalEarthquakePanel(state);
    return;
  }
  state.localCheckAt = now;
  const observer = ctx.resolveObservedEarthLocation();
  const event = ctx.selectedEarthquake(state) || state.localEvent;
  if (!event || !Number.isFinite(observer?.lat) || !Number.isFinite(observer?.lon)) {
    state.localEvent = null;
    updateLocalEarthquakePanel(state);
    return;
  }
  const distanceKm = ctx.haversineKm(observer.lat, observer.lon, event.lat, event.lon);
  if (distanceKm <= ctx.LOCAL_EVENT_RANGE_KM) {
    if (!state.localEvent || state.localEvent.id !== event.id) {
      state.localEvent = event;
      state.localEventDismissedId = '';
      startEarthquakeReplay(ctx, state, event);
    }
  } else if (state.localEvent?.id === event.id && distanceKm > ctx.LOCAL_EVENT_RANGE_KM * 1.5) {
    state.localEvent = null;
  }
  updateLocalEarthquakePanel(state);
}

export function travelToEvent(ctx, state, event) {
  if (!event) return;
  state.selectedEarthquakeId = event.id;
  state.localEvent = event;
  state.localEventDismissedId = '';
  if (ctx.appCtx.globeSelector && typeof ctx.appCtx.globeSelector.setSelection === 'function') {
    ctx.appCtx.globeSelector.setSelection(event.lat, event.lon, {
      name: event.place || event.title,
      focus: true,
      skipAutoFavorite: true
    });
  }
  if (ctx.appCtx.globeSelector && typeof ctx.appCtx.globeSelector.startHere === 'function') {
    ctx.appCtx.globeSelector.startHere();
  }
}

export function travelToSatellite(ctx, state, satellite) {
  if (!satellite || !Number.isFinite(satellite.lat) || !Number.isFinite(satellite.lon)) return;
  state.selectedSatelliteId = satellite.id;
  if (ctx.appCtx.globeSelector && typeof ctx.appCtx.globeSelector.setSelection === 'function') {
    ctx.appCtx.globeSelector.setSelection(satellite.lat, satellite.lon, {
      name: `${satellite.label || 'Satellite'} subpoint`,
      focus: true,
      skipAutoFavorite: true
    });
  }
  if (ctx.appCtx.globeSelector && typeof ctx.appCtx.globeSelector.startHere === 'function') {
    ctx.appCtx.globeSelector.startHere();
  }
}

export function bindLocalPanelActions(ctx, state) {
  const ui = ensureLocalEarthquakePanel();
  ui.replayBtn?.addEventListener('click', () => {
    if (state.localEvent) startEarthquakeReplay(ctx, state, state.localEvent);
  });
  ui.dismissBtn?.addEventListener('click', () => dismissLocalEvent(state));
}
