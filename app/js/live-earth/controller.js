import { ctx as appCtx } from "../shared-context.js?v=55";
import { resolveObservedEarthLocation, haversineKm } from "../earth-location.js?v=2";
import { getWeatherSnapshotForLocation } from "../weather.js?v=8";
import { getWeatherSampleSnapshots } from "./weather-samples.js?v=2";
import { aircraftService } from "../geospatial/aircraft.js?v=1";
import { marineService } from "../geospatial/marine.js?v=1";
import { streetImageryService } from "../geospatial/street-imagery.js?v=1";
import { createMarineState, ensureSelectedMarineData } from "./marine-state.js?v=1";
import { LIVE_EARTH_CATEGORIES, LIVE_EARTH_LAYERS, getLiveEarthLayer } from "./registry.js?v=10";
import { getSatelliteLookAngles, getSatelliteSnapshot, getSatelliteTrack, refreshSatelliteCatalog } from "./satellites.js?v=6";
import { buildEarthquakeReplayProfile, refreshEarthquakes } from "./earthquakes.js?v=2";
import { buildAircraftTrafficSnapshot, buildShipTrafficSnapshot } from "./transport.js?v=3";
import { updateLocalSatelliteVisual as syncLocalSatelliteVisual } from "./local-satellite.js?v=1";
import {
  bindLocalPanelActions as bindLiveEarthLocalPanelActions,
  travelToEvent as focusLiveEarthEvent,
  travelToSatellite as focusLiveEarthSatellite,
  updateEarthquakeReplay as animateEarthquakeReplay,
  updateLocalEventContext as syncLocalEventContext
} from "./local-events.js?v=2";
import { renderGlobeLayers } from "./render-globe.js?v=5";
import {
  bindSelectorUi,
  handleGlobePick,
  onSelectorSelectionChanged,
  refreshForOpenSelector,
  renderLiveEarthUi,
  setActiveLayer,
  setPanelMode,
  updateSelectorFrame
} from "./controller-ui.js?v=11";

const SATELLITE_POSITION_REFRESH_MS = 15000;
const EARTHQUAKE_UI_REFRESH_MS = 5 * 60 * 1000;
const WEATHER_SAMPLE_REFRESH_MS = 15 * 60 * 1000;
const TRANSPORT_REFRESH_MS = 4000;
const AIRCRAFT_REFRESH_MS = 60 * 1000;
const LOCAL_EVENT_CHECK_MS = 1500;
const LOCAL_EVENT_RANGE_KM = 120;
const WEATHER_SAMPLE_LOCATIONS = [
  { id: 'newyork', label: 'New York', lat: 40.7128, lon: -74.0060 },
  { id: 'london', label: 'London', lat: 51.5074, lon: -0.1278 },
  { id: 'tokyo', label: 'Tokyo', lat: 35.6762, lon: 139.6503 },
  { id: 'dubai', label: 'Dubai', lat: 25.2048, lon: 55.2708 },
  { id: 'miami', label: 'Miami', lat: 25.7617, lon: -80.1918 },
  { id: 'sanfrancisco', label: 'San Francisco', lat: 37.7749, lon: -122.4194 },
  { id: 'monaco', label: 'Monaco', lat: 43.7384, lon: 7.4246 },
  { id: 'chicago', label: 'Chicago', lat: 41.8781, lon: -87.6298 }
];
const OCEAN_SAMPLE_IDS = new Set(['newyork', 'london', 'tokyo', 'dubai', 'miami', 'sanfrancisco', 'monaco']);
function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>\"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char] || char);
}

function colorForMagnitude(magnitude = 0) {
  if (magnitude >= 6.5) return 0xff5b4d;
  if (magnitude >= 5) return 0xff8a3d;
  if (magnitude >= 4) return 0xffc642;
  return 0xffe6a8;
}

function colorForWeatherCategory(category = '') {
  switch (String(category || '').toLowerCase()) {
    case 'clear': return 0xf4b63f;
    case 'cloudy': return 0xa3b8ca;
    case 'overcast': return 0x7e8fa5;
    case 'rain': return 0x4f81c9;
    case 'snow': return 0xdde9ff;
    case 'fog': return 0xb8c0c8;
    case 'storm': return 0x6e68b5;
    default: return 0x7fb7ff;
  }
}

function buildLiveEarthState() {
  return {
    ready: true,
    panelMode: 'explore',
    activeCategoryId: LIVE_EARTH_CATEGORIES[0].id,
    activeLayerId: 'overview',
    satelliteFilter: 'all',
    selectedSatelliteId: '',
    selectedEarthquakeId: '',
    selectedWeatherSampleId: '',
    selectionWeather: null,
    ...createMarineState(),
    weatherSamples: [],
    weatherSamplesLoadedAt: 0,
    warmPromise: null,
    lastErrorMessage: '',
    earthquakeItems: [],
    earthquakesLoadedAt: 0,
    satelliteItems: [],
    satellitesLoadedAt: 0,
    satellitePositions: [],
    satellitePositionsAt: 0,
    satelliteTrackPoints: [],
    shipItems: [],
    shipRoutes: [],
    shipsLoadedAt: 0,
    selectedShipId: '',
    aircraftItems: [],
    aircraftRoutes: [],
    aircraftLoadedAt: 0,
    selectedAircraftId: '',
    aircraftQueryKey: '',
    aircraftSourceMode: 'pending',
    aircraftError: '',
    streetImageryProviderId: 'panoramax',
    streetImageryItems: [],
    streetImageryLoadedAt: 0,
    streetImageryQueryKey: '',
    streetImageryLoading: false,
    streetImageryError: '',
    streetImageryExternalUrl: '',
    streetImageryRadiusM: 350,
    selectedStreetImageId: '',
    streetImageryRequestToken: 0,
    selectorSatelliteTickAt: 0,
    localEvent: null,
    localEventDismissedId: '',
    localCheckAt: 0,
    localSatelliteLook: null,
    localSatelliteLookAt: 0,
    localSatelliteObserverKey: '',
    earthquakeReplay: {
      active: false,
      startedAtMs: 0,
      durationMs: 0,
      amplitude: 0,
      frequency: 0,
      eventId: ''
    },
    selector: {
      api: null,
      ui: null,
      bound: false,
      group: null,
      satelliteGroup: null,
      earthquakeGroup: null,
      weatherGroup: null,
      trackLine: null,
      markerRecords: [],
      detailsScrollTopByLayer: {}
    },
    localSatelliteVisual: null
  };
}

function buildLiveEarthModuleContext() {
  return {
    appCtx,
    clamp01,
    escapeHtml,
    colorForMagnitude,
    colorForStormSeverity,
    colorForWeatherCategory,
    ensureAircraftTrafficData,
    ensureEarthquakeData,
    ensureMarineData,
    ensureSelectionWeather,
    ensureSatelliteData,
    ensureSatellitePositions,
    ensureShipTrafficData,
    ensureStreetImagery,
    ensureWeatherSamples,
    filteredSatelliteItems,
    getLiveEarthLayer,
    getSatelliteLookAngles,
    haversineKm,
    LOCAL_EVENT_CHECK_MS,
    LOCAL_EVENT_RANGE_KM,
    oceanSamples,
    refreshSatelliteTrack,
    renderLiveEarthUi,
    resolveObservedEarthLocation,
    rememberDetailsScroll,
    selectedAircraft,
    selectedEarthquake,
    selectedSatelliteEntry,
    selectedSatellitePosition,
    selectedShip,
    selectedStreetImage,
    selectorSelection,
    setDetailsHtml,
    stateWaveIntensity,
    stormSamples,
    travelToEvent,
    travelToSatellite,
    warmImplementedLayers,
    buildEarthquakeReplayProfile
  };
}

function selectorSelection(state) {
  return typeof state.selector.api?.getSelection === 'function' ? state.selector.api.getSelection() : null;
}

function rememberDetailsScroll(state) {
  const details = state.selector.ui?.details;
  if (!details) return 0;
  const scrollTop = Math.max(0, Number(details.scrollTop) || 0);
  state.selector.detailsScrollTopByLayer[state.activeLayerId] = scrollTop;
  return scrollTop;
}

function restoreDetailsScroll(state) {
  const details = state.selector.ui?.details;
  if (!details) return;
  const layerId = state.activeLayerId;
  const scrollTop = Math.max(0, Number(state.selector.detailsScrollTopByLayer?.[layerId]) || 0);
  requestAnimationFrame(() => {
    if (state.activeLayerId !== layerId || state.selector.ui?.details !== details) return;
    details.scrollTop = scrollTop;
  });
}

function setDetailsHtml(state, html = '') {
  const details = state.selector.ui?.details;
  if (!details) return;
  rememberDetailsScroll(state);
  details.innerHTML = html;
  restoreDetailsScroll(state);
}

async function ensureSatelliteData(state, force = false) {
  if (!force && state.satelliteItems.length) return state.satelliteItems;
  state.satelliteItems = await refreshSatelliteCatalog(force);
  state.satellitesLoadedAt = Date.now();
  if (!state.selectedSatelliteId && state.satelliteItems[0]) {
    state.selectedSatelliteId = state.satelliteItems[0].id;
  }
  return state.satelliteItems;
}

async function ensureSatellitePositions(state, force = false) {
  const now = Date.now();
  await ensureSatelliteData(state, force);
  if (!force && state.satellitePositions.length && (now - state.satellitePositionsAt) < SATELLITE_POSITION_REFRESH_MS) {
    return state.satellitePositions;
  }
  state.satellitePositions = await getSatelliteSnapshot(new Date(), force);
  state.satellitePositionsAt = now;
  state.satellitesLoadedAt = now;
  return state.satellitePositions;
}

async function ensureEarthquakeData(state, force = false) {
  const now = Date.now();
  if (!force && state.earthquakeItems.length && (now - state.earthquakesLoadedAt) < EARTHQUAKE_UI_REFRESH_MS) {
    return state.earthquakeItems;
  }
  state.earthquakeItems = await refreshEarthquakes(force);
  state.earthquakesLoadedAt = now;
  if (!state.selectedEarthquakeId && state.earthquakeItems[0]) {
    state.selectedEarthquakeId = state.earthquakeItems[0].id;
  }
  return state.earthquakeItems;
}

async function ensureWeatherSamples(state, force = false) {
  const now = Date.now();
  if (!force && state.weatherSamples.length && (now - state.weatherSamplesLoadedAt) < WEATHER_SAMPLE_REFRESH_MS) {
    return state.weatherSamples;
  }
  let samples = [];
  try {
    samples = await getWeatherSampleSnapshots(WEATHER_SAMPLE_LOCATIONS, force);
  } catch {
    samples = WEATHER_SAMPLE_LOCATIONS.map((sample) => ({ ...sample, snapshot: null }));
  }
  state.weatherSamples = samples;
  state.weatherSamplesLoadedAt = now;
  if (!state.selectedWeatherSampleId && samples[0]) state.selectedWeatherSampleId = samples[0].id;
  return samples;
}

async function ensureSelectionWeather(state, force = false) {
  const selected = selectorSelection(state);
  if (!Number.isFinite(selected?.lat) || !Number.isFinite(selected?.lon)) {
    state.selectionWeather = null;
    return null;
  }
  const current = state.selectionWeather;
  if (!force && current && Math.abs(current.lat - selected.lat) < 0.01 && Math.abs(current.lon - selected.lon) < 0.01) {
    return current;
  }
  try {
    state.selectionWeather = await getWeatherSnapshotForLocation(selected.lat, selected.lon, { force });
  } catch {
    state.selectionWeather = null;
  }
  return state.selectionWeather;
}

async function ensureMarineData(state, force = false) {
  return ensureSelectedMarineData({ marineService, selectorSelection }, state, force);
}

async function ensureStreetImagery(state, force = false) {
  const selected = selectorSelection(state);
  if (!Number.isFinite(selected?.lat) || !Number.isFinite(selected?.lon)) {
    state.streetImageryItems = [];
    state.streetImageryError = 'Choose a point on the globe before checking street imagery.';
    return [];
  }
  const providerId = state.streetImageryProviderId || 'panoramax';
  const queryKey = `${providerId}:${selected.lat.toFixed(4)}:${selected.lon.toFixed(4)}`;
  if (!force && queryKey === state.streetImageryQueryKey && state.streetImageryLoadedAt) return state.streetImageryItems;
  const token = ++state.streetImageryRequestToken;
  state.streetImageryLoading = true;
  state.streetImageryError = '';
  state.streetImageryExternalUrl = streetImageryService.externalViewerUrl(providerId, selected.lat, selected.lon);
  try {
    const result = await streetImageryService.search(providerId, {
      lat: selected.lat,
      lon: selected.lon,
      radiusM: state.streetImageryRadiusM,
      limit: 8
    }, { force });
    if (token !== state.streetImageryRequestToken) return state.streetImageryItems;
    state.streetImageryItems = result.items;
    state.streetImageryExternalUrl = result.externalViewerUrl || state.streetImageryExternalUrl;
    state.streetImageryQueryKey = queryKey;
    state.streetImageryLoadedAt = Date.now();
    if (!result.items.some((item) => item.id === state.selectedStreetImageId)) {
      state.selectedStreetImageId = result.items[0]?.id || '';
    }
  } catch (error) {
    if (token !== state.streetImageryRequestToken) return state.streetImageryItems;
    state.streetImageryItems = [];
    state.selectedStreetImageId = '';
    state.streetImageryQueryKey = queryKey;
    state.streetImageryLoadedAt = Date.now();
    state.streetImageryError = error?.message || 'Street imagery is unavailable right now.';
  } finally {
    if (token === state.streetImageryRequestToken) state.streetImageryLoading = false;
  }
  return state.streetImageryItems;
}

function warmImplementedLayers(state, force = false) {
  if (state.warmPromise && !force) return state.warmPromise;
  state.warmPromise = Promise.allSettled([
    ensureSatelliteData(state, force).then(() => ensureSatellitePositions(state, force)),
    ensureEarthquakeData(state, force),
    ensureWeatherSamples(state, force),
    ensureShipTrafficData(state, force),
    ensureAircraftTrafficData(state, force)
  ]).then(() => {
    const ctx = buildLiveEarthModuleContext();
    renderGlobeLayers(ctx, state);
    renderLiveEarthUi(ctx, state);
  }).finally(() => {
    state.warmPromise = null;
  });
  return state.warmPromise;
}

function filteredSatelliteItems(state) {
  const filter = state.satelliteFilter || 'all';
  if (filter === 'all') return state.satelliteItems;
  return state.satelliteItems.filter((entry) => {
    const klass = String(entry.classLabel || '').toLowerCase();
    if (filter === 'stations') return klass === 'station';
    if (filter === 'weather') return klass === 'weather';
    if (filter === 'earth') return klass === 'earth observation' || klass === 'science';
    return true;
  });
}

function selectedSatellitePosition(state) {
  return state.satellitePositions.find((entry) => entry.id === state.selectedSatelliteId) || null;
}

function selectedSatelliteEntry(state) {
  return state.satelliteItems.find((entry) => entry.id === state.selectedSatelliteId) || null;
}

function selectedEarthquake(state) {
  return state.earthquakeItems.find((entry) => entry.id === state.selectedEarthquakeId) || null;
}

function selectedWeatherSample(state) {
  return state.weatherSamples.find((entry) => entry.id === state.selectedWeatherSampleId) || null;
}

function selectedShip(state) {
  return state.shipItems.find((entry) => entry.id === state.selectedShipId) || null;
}

function selectedAircraft(state) {
  return state.aircraftItems.find((entry) => entry.id === state.selectedAircraftId) || null;
}

function selectedStreetImage(state) {
  return state.streetImageryItems.find((entry) => entry.id === state.selectedStreetImageId) || state.streetImageryItems[0] || null;
}

async function ensureShipTrafficData(state, force = false) {
  const now = Date.now();
  if (!force && state.shipItems.length && (now - state.shipsLoadedAt) < TRANSPORT_REFRESH_MS) {
    return state.shipItems;
  }
  const snapshot = buildShipTrafficSnapshot(new Date(now));
  state.shipRoutes = snapshot.routes || [];
  state.shipItems = snapshot.items || [];
  state.shipsLoadedAt = now;
  if (!state.selectedShipId && state.shipItems[0]) state.selectedShipId = state.shipItems[0].id;
  return state.shipItems;
}

async function ensureAircraftTrafficData(state, force = false) {
  const now = Date.now();
  const selection = selectorSelection(state);
  const lat = Number(selection?.lat);
  const lon = Number(selection?.lon);
  const queryKey = Number.isFinite(lat) && Number.isFinite(lon) ? `${lat.toFixed(2)}:${lon.toFixed(2)}` : '';
  if (!force && state.aircraftItems.length && queryKey === state.aircraftQueryKey && (now - state.aircraftLoadedAt) < AIRCRAFT_REFRESH_MS) {
    return state.aircraftItems;
  }
  if (queryKey) {
    try {
      const result = await aircraftService.search({ lat, lon, radiusKm: 160, limit: 80 }, { force });
      if (result.items.length) {
        const providerLabel = result.items[0]?.dataSource === 'adsb-lol' ? 'ADSB.lol' : 'OpenSky';
        state.aircraftRoutes = [];
        state.aircraftItems = result.items.map((item) => ({
          ...item,
          type: 'aircraft',
          operator: item.originCountry,
          routeId: '',
          routeLabel: `${providerLabel} observation`,
          routeSummary: `Current aircraft state vector observed by ${providerLabel}.`,
          region: `${item.distanceKm} km from selected point`,
          speedKt: item.velocityKt || 0,
          progressPct: null,
          meta: `${item.onGround ? 'On ground' : `${Math.round(item.altitudeM || 0).toLocaleString()} m`} • ${item.velocityKt ?? '--'} kt`
        }));
        state.aircraftLoadedAt = now;
        state.aircraftQueryKey = queryKey;
        state.aircraftSourceMode = 'observed';
        state.aircraftError = '';
        if (!state.aircraftItems.some((item) => item.id === state.selectedAircraftId)) {
          state.selectedAircraftId = state.aircraftItems[0]?.id || '';
        }
        return state.aircraftItems;
      }
      state.aircraftError = 'No current aircraft positions were reported in this area.';
    } catch (error) {
      state.aircraftError = error?.message || 'Live aircraft observations are unavailable.';
    }
  }
  const snapshot = buildAircraftTrafficSnapshot(new Date(now));
  state.aircraftRoutes = snapshot.routes || [];
  state.aircraftItems = (snapshot.items || []).map((item) => ({ ...item, dataSource: 'reference' }));
  state.aircraftLoadedAt = now;
  state.aircraftQueryKey = queryKey;
  state.aircraftSourceMode = 'reference';
  if (!state.aircraftItems.some((item) => item.id === state.selectedAircraftId)) {
    state.selectedAircraftId = state.aircraftItems[0]?.id || '';
  }
  return state.aircraftItems;
}

function stormSeverity(snapshot = null) {
  if (!snapshot) return 0;
  const category = String(snapshot.category || '').toLowerCase();
  const wind = Number(snapshot.windMph) || 0;
  const precip = Number(snapshot.precipitationMm) || 0;
  const cloud = Number(snapshot.cloudCover) || 0;
  let score = 0;
  if (category === 'storm') score += 4;
  else if (category === 'rain') score += 2;
  if (wind >= 28) score += 3;
  else if (wind >= 18) score += 2;
  else if (wind >= 12) score += 1;
  if (precip >= 3) score += 2;
  else if (precip >= 1.2) score += 1;
  if (cloud >= 88) score += 1;
  return score;
}

function stormSamples(state) {
  return state.weatherSamples
    .map((sample) => ({
      ...sample,
      stormSeverity: stormSeverity(sample.snapshot)
    }))
    .filter((sample) => sample.stormSeverity > 0)
    .sort((a, b) => b.stormSeverity - a.stormSeverity);
}

function colorForStormSeverity(severity = 0) {
  if (severity >= 7) return 0xef4444;
  if (severity >= 5) return 0xf97316;
  if (severity >= 3) return 0xf59e0b;
  return 0xfacc15;
}

function oceanStateProfile(snapshot = null) {
  const wind = Number(snapshot?.windMph) || 0;
  const precip = Number(snapshot?.precipitationMm) || 0;
  const category = String(snapshot?.category || '').toLowerCase();
  const localWave = stateWaveIntensity();
  let roughness = wind / 8 + precip * 0.9 + localWave * 1.8;
  if (category === 'storm') roughness += 2.8;
  else if (category === 'rain') roughness += 1.1;
  if (roughness >= 6) return { label: 'Heavy', color: 0x2563eb, summary: 'Rougher marine motion with strong surface energy.' };
  if (roughness >= 3.2) return { label: 'Moderate', color: 0x0ea5e9, summary: 'A normal working-day ocean feel with visible motion.' };
  return { label: 'Calm', color: 0x67e8f9, summary: 'Sheltered or lighter water movement.' };
}

function stateWaveIntensity() {
  return clamp01(Number(appCtx.boatMode?.waveIntensity || 0.46));
}

function oceanSamples(state) {
  return state.weatherSamples
    .filter((sample) => OCEAN_SAMPLE_IDS.has(sample.id))
    .map((sample) => ({
      ...sample,
      oceanState: oceanStateProfile(sample.snapshot)
    }));
}

async function refreshSatelliteTrack(state, force = false) {
  if (!state.selectedSatelliteId) {
    state.satelliteTrackPoints = [];
    return state.satelliteTrackPoints;
  }
  if (!force && state.satelliteTrackPoints.length && state.satelliteTrackPoints[0]?.satelliteId === state.selectedSatelliteId) {
    return state.satelliteTrackPoints;
  }
  const points = await getSatelliteTrack(state.selectedSatelliteId, {});
  state.satelliteTrackPoints = points.map((entry) => ({ ...entry, satelliteId: state.selectedSatelliteId }));
  return state.satelliteTrackPoints;
}

function updateLocalSatelliteVisual(state) {
  syncLocalSatelliteVisual(buildLiveEarthModuleContext(), state);
}

function updateEarthquakeReplay(state) {
  animateEarthquakeReplay(buildLiveEarthModuleContext(), state);
}

function updateLocalEventContext(state) {
  syncLocalEventContext(buildLiveEarthModuleContext(), state);
}

function travelToEvent(state, event) {
  focusLiveEarthEvent(buildLiveEarthModuleContext(), state, event);
}

function travelToSatellite(state, satellite) {
  focusLiveEarthSatellite(buildLiveEarthModuleContext(), state, satellite);
}

function bindLocalPanelActions(state) {
  bindLiveEarthLocalPanelActions(buildLiveEarthModuleContext(), state);
}

function bindGlobeSelector(state, api) {
  state.selector.api = api;
  state.selector.ui = api?.liveEarthUi || null;
  bindSelectorUi(buildLiveEarthModuleContext(), state);
  setPanelMode(state, state.panelMode);
  renderLiveEarthUi(buildLiveEarthModuleContext(), state);
}

function initLiveEarth() {
  if (appCtx.liveEarth?.ready) return appCtx.liveEarth;
  const state = buildLiveEarthState();

  const liveEarth = {
    ready: true,
    state,
    categories: LIVE_EARTH_CATEGORIES,
    layers: LIVE_EARTH_LAYERS,
    bindGlobeSelector(api) {
      bindGlobeSelector(state, api);
    },
    handleGlobePick(raycaster) {
      return handleGlobePick(buildLiveEarthModuleContext(), state, raycaster);
    },
    onSelectorOpen() {
      refreshForOpenSelector(buildLiveEarthModuleContext(), state);
    },
    onSelectorClose() {},
    onSelectorSelectionChanged() {
      onSelectorSelectionChanged(buildLiveEarthModuleContext(), state);
    },
    setPanelMode(mode) {
      setPanelMode(state, mode);
      if (state.panelMode === 'live-earth') refreshForOpenSelector(buildLiveEarthModuleContext(), state);
      else renderGlobeLayers(buildLiveEarthModuleContext(), state);
    },
    getPanelMode() {
      return state.panelMode;
    },
    async setActiveLayer(layerId) {
      await setActiveLayer(buildLiveEarthModuleContext(), state, layerId, false);
    },
    updateFrame() {
      updateLocalSatelliteVisual(state);
      updateLocalEventContext(state);
      updateEarthquakeReplay(state);
    },
    updateSelectorFrame() {
      updateSelectorFrame(buildLiveEarthModuleContext(), state);
    },
    openLiveEarth(layerId = 'overview') {
      if (typeof appCtx.openGlobeSelector === 'function') appCtx.openGlobeSelector();
      setPanelMode(state, 'live-earth');
      void setActiveLayer(buildLiveEarthModuleContext(), state, layerId, false);
    },
    getSummary() {
      return {
        activeLayerId: state.activeLayerId,
        activeCategoryId: state.activeCategoryId,
        satellites: state.satelliteItems.length,
        earthquakes: state.earthquakeItems.length,
        weatherSamples: state.weatherSamples.length,
        ships: state.shipItems.length,
        aircraft: state.aircraftItems.length,
        aircraftSourceMode: state.aircraftSourceMode,
        streetImagery: state.streetImageryItems.length,
        localEventId: state.localEvent?.id || '',
        selectedSatelliteId: state.selectedSatelliteId || '',
        selectedEarthquakeId: state.selectedEarthquakeId || '',
        selectedShipId: state.selectedShipId || '',
        selectedAircraftId: state.selectedAircraftId || '',
        aircraftMarkers: state.selector.markerRecords.filter((entry) => entry.type === 'aircraft').map((entry) => ({
          id: entry.id, lat: entry.lat, lon: entry.lon, altitude: entry.altitude, dataSource: entry.dataSource
        })),
        selectedStreetImageId: state.selectedStreetImageId || '',
        streetImageryProviderId: state.streetImageryProviderId || 'panoramax'
      };
    },
    inspectState() {
      return {
        ...this.getSummary(),
        panelMode: state.panelMode,
        selectedWeatherSampleId: state.selectedWeatherSampleId || '',
        localSatelliteLook: state.localSatelliteLook ? {
          azimuthDeg: Number(state.localSatelliteLook.azimuthDeg || 0),
          elevationDeg: Number(state.localSatelliteLook.elevationDeg || 0),
          rangeKm: Number(state.localSatelliteLook.rangeKm || 0)
        } : null,
        selectionWeather: state.selectionWeather ? {
          conditionLabel: state.selectionWeather.conditionLabel || '',
          temperatureF: Number(state.selectionWeather.temperatureF || 0),
          cloudCover: Number(state.selectionWeather.cloudCover || 0)
        } : null
      };
    }
  };

  bindLocalPanelActions(state);
  appCtx.liveEarth = liveEarth;
  appCtx.openLiveEarthSelector = (layerId = 'overview') => liveEarth.openLiveEarth(layerId);
  appCtx.getLiveEarthSummary = () => liveEarth.getSummary();
  appCtx.inspectLiveEarthState = () => liveEarth.inspectState();
  return liveEarth;
}

initLiveEarth();

export { initLiveEarth };
