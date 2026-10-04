// Owns and cancels asynchronous evidence for the selected place. Generation
// guards still reject late results from providers that ignore cancellation.
export function createWaterEnvironmentController({ appCtx, marineService, resolveEvidence, now = Date.now }) {
  let sequence = 0;
  let lastKey = '';
  let refreshedAt = 0;
  let pending = null;
  let requestController = null;
  function cancel(clear = false) {
    sequence++;
    requestController?.abort();
    requestController = null;
    pending = null;
    if (clear) { lastKey = ''; clearEvidence(); }
  }
  const keyFor = location => `${location.lat.toFixed(4)}:${location.lon.toFixed(4)}`;
  function location() {
    const selected = appCtx.oceanMode?.active ? appCtx.oceanMode.launchSite : appCtx.selLoc === 'custom' ? appCtx.customLoc : appCtx.LOC;
    if (selected?.lat == null || selected?.lon == null || selected.lat === '' || selected.lon === '') return null;
    const lat = Number(selected.lat), lon = Number(selected.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? {lat, lon} : null;
  }
  function clearEvidence() {
    appCtx.activeMarineSnapshot = null;
    appCtx.activeWaterOpticsEvidence = null;
    appCtx.updateWaterWaveVisuals?.();
  }
  function isCurrent(id, key) {
    const selected = location();
    return id === sequence && selected && keyFor(selected) === key;
  }
  function publish(place, marine, id, state) {
    const key = keyFor(place);
    if (!isCurrent(id, key)) return null;
    const areas = Array.isArray(appCtx.waterAreas) ? appCtx.waterAreas : [];
    const waterBody = areas.reduce((best, body) => !best || Math.hypot(body.centerX || 0, body.centerZ || 0) < Math.hypot(best.centerX || 0, best.centerZ || 0) ? body : best, null);
    const evidence = resolveEvidence({marine, waterBody});
    lastKey = key;
    refreshedAt = now();
    appCtx.activeMarineSnapshot = marine;
    appCtx.activeWaterOpticsEvidence = evidence;
    appCtx.waterEnvironmentStatus = Object.freeze({state, location:place, refreshedAt,
      waveTruthType:evidence.wave.truthType, waveRenderUsable:evidence.wave.renderUsable === true,
      gridDistanceKm:evidence.wave.gridDistanceKm ?? null});
    appCtx.updateWaterWaveVisuals?.();
    return evidence;
  }
  function refresh(force = false) {
    const place = location();
    if (!place) {
      cancel(true);
      appCtx.waterEnvironmentStatus = Object.freeze({state:'unavailable', reason:'invalid-location'});
      return Promise.resolve(null);
    }
    const key = keyFor(place);
    // A pending request for another place must not defeat returning to a cached
    // place. Invalidate it before considering that cache reusable.
    if (pending && pending.key !== key) cancel();
    if (!force && key === lastKey && now() - refreshedAt < 15 * 60 * 1000 && appCtx.activeWaterOpticsEvidence) return Promise.resolve(appCtx.activeWaterOpticsEvidence);
    if (!force && pending?.key === key) return pending.promise;
    cancel();
    const id = sequence;
    const controller = requestController = new AbortController();
    const signal = controller.signal;
    if (key !== lastKey) clearEvidence();
    appCtx.waterEnvironmentStatus = Object.freeze({state:'loading', location:place, requestedAt:now()});
    const promise = Promise.resolve().then(() => marineService.modelAt(place, {force, signal})).then(model => {
      if (!isCurrent(id, key)) return null;
      const evidence = publish(place, {model, station:null, observation:null, predictions:[], warnings:[]}, id, 'ready-wave-model');
      void Promise.resolve().then(() => marineService.selected(place, {force:false, signal})).then(marine => publish(place, marine, id, 'ready')).catch(() => {});
      return evidence;
    }).catch(error => {
      if (isCurrent(id, key)) {
        clearEvidence();
        appCtx.waterEnvironmentStatus = Object.freeze({state:'unavailable', location:place, refreshedAt:now(), error:String(error?.message || error)});
      }
      return null;
    }).finally(() => { if (pending?.id === id) pending = null; });
    pending = {id, key, promise};
    return promise;
  }
  return Object.freeze({refresh, cancel});
}
