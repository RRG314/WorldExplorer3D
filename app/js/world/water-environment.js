import { ctx as appCtx } from '../shared-context.js?v=55';
import { marineService } from '../geospatial/marine.js?v=2';
import { resolveWaterOpticsEvidence } from './water-optics-evidence.js?v=2';

let requestSequence = 0;
let lastLocationKey = '';
let lastRefreshMs = 0;
let pending = null;
const REFRESH_MS = 15 * 60 * 1000;

function activeLocation() {
  const selected = appCtx.selLoc === 'custom' ? appCtx.customLoc : appCtx.LOC;
  const lat = Number(selected?.lat);
  const lon = Number(selected?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function locationKey(location) {
  return `${location.lat.toFixed(4)}:${location.lon.toFixed(4)}`;
}

function nearestWaterBody() {
  const areas = Array.isArray(appCtx.waterAreas) ? appCtx.waterAreas : [];
  return areas.slice().sort((left, right) =>
    Math.hypot(Number(left?.centerX) || 0, Number(left?.centerZ) || 0) -
    Math.hypot(Number(right?.centerX) || 0, Number(right?.centerZ) || 0)
  )[0] || null;
}

function publishEvidence(location, marine, sequence, state = 'ready') {
  if (sequence !== requestSequence) return appCtx.activeWaterOpticsEvidence || null;
  const evidence = resolveWaterOpticsEvidence({ marine, waterBody: nearestWaterBody() });
  lastRefreshMs = Date.now();
  appCtx.activeMarineSnapshot = marine;
  appCtx.activeWaterOpticsEvidence = evidence;
  appCtx.waterEnvironmentStatus = Object.freeze({
    state,
    location,
    refreshedAt: lastRefreshMs,
    waveTruthType: evidence.wave.truthType,
    waveRenderUsable: evidence.wave.renderUsable === true,
    gridDistanceKm: evidence.wave.gridDistanceKm ?? null
  });
  appCtx.updateWaterWaveVisuals?.();
  return evidence;
}

async function refreshWaterEnvironmentEvidence(force = false) {
  const location = activeLocation();
  if (!location) return null;
  const key = locationKey(location);
  const now = Date.now();
  if (!force && key === lastLocationKey && now - lastRefreshMs < REFRESH_MS && appCtx.activeWaterOpticsEvidence) {
    return appCtx.activeWaterOpticsEvidence;
  }
  if (!force && pending?.key === key) return pending.promise;
  const sequence = ++requestSequence;
  appCtx.waterEnvironmentStatus = Object.freeze({ state: 'loading', location, requestedAt: now });
  const promise = marineService.modelAt(location, { force }).then((model) => {
    const partialMarine = Object.freeze({ model, station: null, observation: null, predictions: [], warnings: [] });
    const evidence = publishEvidence(location, partialMarine, sequence, 'ready-wave-model');
    lastLocationKey = key;
    void marineService.selected(location, { force: false }).then((marine) => {
      publishEvidence(location, marine, sequence, 'ready');
    }).catch(() => {});
    return evidence;
  }).catch((error) => {
    if (sequence === requestSequence) {
      appCtx.waterEnvironmentStatus = Object.freeze({
        state: 'unavailable',
        location,
        refreshedAt: Date.now(),
        error: String(error?.message || error)
      });
    }
    return null;
  }).finally(() => {
    if (pending?.sequence === sequence) pending = null;
  });
  pending = { key, sequence, promise };
  return promise;
}

Object.assign(appCtx, { refreshWaterEnvironmentEvidence });

export { refreshWaterEnvironmentEvidence };
