import { ctx as appCtx } from "../shared-context.js?v=55";
import { resolveObservedEarthLocation, haversineKm } from "../earth-location.js?v=3";
import { getWeatherSnapshotForLocation } from "../weather.js?v=2";
import { LIVE_EARTH_CATEGORIES, LIVE_EARTH_LAYERS, getLayersForCategory, getLiveEarthLayer } from "./registry.js?v=5";
import { CURATED_SATELLITES, getSatelliteLookAngles, getSatelliteSnapshot, getSatelliteTrack, refreshSatelliteCatalog } from "./satellites.js?v=4";
import { buildEarthquakeReplayProfile, refreshEarthquakes } from "./earthquakes.js?v=1";
import { buildAircraftTrafficSnapshot, buildShipTrafficSnapshot, nearestRouteContext } from "./transport.js?v=3";

const SATELLITE_POSITION_REFRESH_MS = 15000;
const EARTHQUAKE_UI_REFRESH_MS = 5 * 60 * 1000;
const WEATHER_SAMPLE_REFRESH_MS = 15 * 60 * 1000;
const TRANSPORT_REFRESH_MS = 4000;
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
const STATIC_PREVIEW_LAYER_ITEMS = Object.freeze({
  'near-earth-objects': [
    {
      id: 'apophis',
      label: '99942 Apophis',
      meta: 'Close-approach awareness • April 2029',
      description: 'A well-known near-Earth asteroid used as a good public-awareness reference for close approach geometry.'
    },
    {
      id: 'bennu',
      label: '101955 Bennu',
      meta: 'OSIRIS-REx target',
      description: 'Useful for explaining how Earth-observation and asteroid science overlap in the near-Earth neighborhood.'
    },
    {
      id: 'didymos',
      label: '65803 Didymos',
      meta: 'DART target system',
      description: 'A practical reference object for impact-redirection research and public NEO education.'
    }
  ],
  'rocket-launches': [
    {
      id: 'cape-canaveral',
      label: 'Cape Canaveral',
      meta: 'Florida • Active orbital launch range',
      description: 'The primary US east-coast orbital range for crew, commercial, and science launches.'
    },
    {
      id: 'vandenberg',
      label: 'Vandenberg',
      meta: 'California • Polar launch corridor',
      description: 'A key west-coast launch region for polar and sun-synchronous missions.'
    },
    {
      id: 'kourou',
      label: 'Kourou',
      meta: 'French Guiana • Equatorial access',
      description: 'An equatorial launch site useful for geostationary and heavy-lift trajectories.'
    },
    {
      id: 'boca-chica',
      label: 'Starbase / Boca Chica',
      meta: 'Texas • Test + launch development',
      description: 'A modern launch-development region useful for following heavy-lift testing and coastal operations.'
    }
  ],
  volcanoes: [
    {
      id: 'kilauea',
      label: 'Kilauea',
      meta: 'Hawaii • Shield volcano',
      description: 'A major basaltic volcanic system that is useful for broad public monitoring and travel awareness.'
    },
    {
      id: 'etna',
      label: 'Mount Etna',
      meta: 'Sicily • Persistent activity',
      description: 'One of the most recognizable active volcanic systems with frequent observatory reporting.'
    },
    {
      id: 'popocatepetl',
      label: 'Popocatepetl',
      meta: 'Mexico • Populated-region impact',
      description: 'Important for showing how volcanic monitoring connects to nearby city populations.'
    },
    {
      id: 'fagradalsfjall',
      label: 'Fagradalsfjall',
      meta: 'Iceland • Rift activity',
      description: 'A good example of modern fissure-style volcanic events that capture global attention.'
    }
  ],
  ships: [
    {
      id: 'singapore-port',
      label: 'Port of Singapore',
      meta: 'Global shipping hub',
      description: 'A major maritime node for explaining why marine traffic layers matter at planetary scale.'
    },
    {
      id: 'rotterdam',
      label: 'Port of Rotterdam',
      meta: 'North Sea gateway',
      description: 'A high-value port region for European shipping and coastal logistics context.'
    },
    {
      id: 'los-angeles',
      label: 'Los Angeles / Long Beach',
      meta: 'Pacific cargo corridor',
      description: 'A strong west-coast reference region for container traffic and port operations.'
    }
  ],
  aircraft: [
    {
      id: 'atlanta',
      label: 'Atlanta',
      meta: 'Global hub airport region',
      description: 'A major passenger hub that helps explain dense flight-corridor activity.'
    },
    {
      id: 'heathrow',
      label: 'London Heathrow',
      meta: 'Transatlantic connector',
      description: 'Useful for understanding long-haul corridor concentration and European airspace density.'
    },
    {
      id: 'dubai',
      label: 'Dubai',
      meta: 'Long-haul transfer hub',
      description: 'A strong midpoint example for global east-west aviation flows.'
    }
  ],
  'live-media': [
    {
      id: 'times-square',
      label: 'Times Square',
      meta: 'High-visibility city media node',
      description: 'A good example of the kind of public-viewing location a curated live-media layer can surface.'
    },
    {
      id: 'shibuya',
      label: 'Shibuya Crossing',
      meta: 'Dense public-facing urban scene',
      description: 'Represents places where a curated camera or media window system makes sense.'
    },
    {
      id: 'monaco-harbor',
      label: 'Monaco Harbor',
      meta: 'Waterfront event region',
      description: 'Shows how scenic waterfront places can anchor future public media windows.'
    }
  ]
});

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

function horizontalToWorldVector(azimuthDeg, elevationDeg) {
  const azimuth = (Number(azimuthDeg) || 0) * Math.PI / 180;
  const altitude = (Number(elevationDeg) || 0) * Math.PI / 180;
  const azimuthFromNorth = azimuth + Math.PI;
  const cosAltitude = Math.cos(altitude);
  return new THREE.Vector3(
    cosAltitude * Math.sin(azimuthFromNorth),
    Math.sin(altitude),
    -cosAltitude * Math.cos(azimuthFromNorth)
  ).normalize();
}

function buildLiveEarthState() {
  return {
    ready: true,
    panelMode: 'explore',
    activeCategoryId: LIVE_EARTH_CATEGORIES[0].id,
    activeLayerId: 'satellites',
    satelliteFilter: 'all',
    selectedSatelliteId: '',
    selectedEarthquakeId: '',
    selectedWeatherSampleId: '',
    selectionWeather: null,
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
    selectorSatelliteTickAt: 0,
    localEvent: null,
    localEventDismissedId: '',
    localCheckAt: 0,
    localSatelliteLook: null,
    localSatelliteLookAt: 0,
    localSatelliteObserverKey: '',
    previewSelections: {},
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
    localSatelliteVisual: null,
    scaffoldedLayerNotes: {
      'space-weather': 'Future solar wind and geomagnetic conditions layer.',
      'near-earth-objects': 'Future close-approach and object awareness layer.',
      'rocket-launches': 'Future launch schedule and ascent tracking layer.',
      volcanoes: 'Future observatory-fed volcanic activity layer.',
      wildfires: 'Future fire detection and smoke integration layer.',
      storms: 'Future storm-track and alert-grade weather layer.',
      'ocean-state': 'Future swell, currents, and marine state layer.',
      'live-media': 'Future curated public camera and media windows.'
    }
  };
}

function ensureSelectorGroups(state) {
  const selector = state.selector;
  const api = selector.api;
  if (!api?.globeRoot || selector.group) return;
  selector.group = new THREE.Group();
  selector.group.name = 'LiveEarthOverlayGroup';
  selector.satelliteGroup = new THREE.Group();
  selector.earthquakeGroup = new THREE.Group();
  selector.weatherGroup = new THREE.Group();
  selector.transportRouteGroup = new THREE.Group();
  selector.transportMarkerGroup = new THREE.Group();
  selector.group.add(selector.satelliteGroup);
  selector.group.add(selector.earthquakeGroup);
  selector.group.add(selector.weatherGroup);
  selector.group.add(selector.transportRouteGroup);
  selector.group.add(selector.transportMarkerGroup);
  api.globeRoot.add(selector.group);
}

function removeChildren(group) {
  if (!group) return;
  while (group.children.length) {
    const child = group.children.pop();
    if (!child) continue;
    group.remove(child);
    if (child.geometry?.dispose) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((entry) => entry?.dispose?.());
      else child.material.dispose?.();
    }
  }
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
  const samples = await Promise.all(WEATHER_SAMPLE_LOCATIONS.map(async (sample) => {
    try {
      const snapshot = await getWeatherSnapshotForLocation(sample.lat, sample.lon, { force });
      return {
        id: sample.id,
        label: sample.label,
        lat: sample.lat,
        lon: sample.lon,
        snapshot
      };
    } catch {
      return {
        id: sample.id,
        label: sample.label,
        lat: sample.lat,
        lon: sample.lon,
        snapshot: null
      };
    }
  }));
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

function warmImplementedLayers(state, force = false) {
  if (state.warmPromise && !force) return state.warmPromise;
  state.warmPromise = Promise.allSettled([
    ensureSatelliteData(state, force).then(() => ensureSatellitePositions(state, force)),
    ensureEarthquakeData(state, force),
    ensureWeatherSamples(state, force)
  ]).then(() => {
    renderGlobeLayers(state);
    renderLiveEarthUi(state);
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
  if (!force && state.aircraftItems.length && (now - state.aircraftLoadedAt) < TRANSPORT_REFRESH_MS) {
    return state.aircraftItems;
  }
  const snapshot = buildAircraftTrafficSnapshot(new Date(now));
  state.aircraftRoutes = snapshot.routes || [];
  state.aircraftItems = snapshot.items || [];
  state.aircraftLoadedAt = now;
  if (!state.selectedAircraftId && state.aircraftItems[0]) state.selectedAircraftId = state.aircraftItems[0].id;
  return state.aircraftItems;
}

function weatherLikeSelection(state, items = []) {
  if (!Array.isArray(items) || !items.length) return null;
  return items.find((entry) => entry.id === state.selectedWeatherSampleId) || items[0] || null;
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

function fireWeatherRisk(snapshot = null) {
  if (!snapshot) return 0;
  const temp = Number(snapshot.temperatureF) || 0;
  const humidity = Number(snapshot.humidityPct) || 0;
  const wind = Number(snapshot.windMph) || 0;
  const precip = Number(snapshot.precipitationMm) || 0;
  let score = 0;
  if (temp >= 95) score += 3;
  else if (temp >= 85) score += 2;
  else if (temp >= 76) score += 1;
  if (humidity <= 20) score += 3;
  else if (humidity <= 30) score += 2;
  else if (humidity <= 40) score += 1;
  if (wind >= 24) score += 3;
  else if (wind >= 16) score += 2;
  else if (wind >= 10) score += 1;
  if (precip <= 0.3) score += 1;
  return score;
}

function fireWeatherSamples(state) {
  return state.weatherSamples
    .map((sample) => ({
      ...sample,
      fireRisk: fireWeatherRisk(sample.snapshot)
    }))
    .filter((sample) => sample.fireRisk > 0)
    .sort((a, b) => b.fireRisk - a.fireRisk);
}

function normalizePreviewId(value) {
  return String(value || '').trim().toLowerCase();
}

function previewLayerItems(state, layerId = '') {
  if (layerId === 'space-weather') {
    const localWeather = typeof appCtx.getWeatherSnapshot === 'function' ? appCtx.getWeatherSnapshot() : null;
    const look = state.localSatelliteLook;
    const visibleState = look && Number.isFinite(look.elevationDeg)
      ? (look.elevationDeg >= 0 ? 'Selected satellite is above your local horizon.' : 'Selected satellite is below your local horizon right now.')
      : 'Open Satellites to check above-horizon passes for your current world location.';
    return [
      {
        id: 'orbital-context',
        label: 'Orbital Context',
        meta: `${filteredSatelliteItems(state).length} curated satellites loaded`,
        description: 'Use the curated orbital catalog to understand when overhead passes or weather-satellite coverage matter for your current place.'
      },
      {
        id: 'local-sky',
        label: 'Local Sky Readiness',
        meta: visibleState,
        description: 'Live Earth now ties local sky visibility, horizon checks, and orbital context together in one place.'
      },
      {
        id: 'viewing-conditions',
        label: 'Viewing Conditions',
        meta: localWeather ? `${localWeather.conditionLabel || 'Weather'} • ${Math.round(localWeather.cloudCover || 0)}% clouds` : 'Waiting on local weather',
        description: 'Cloud cover, haze, and local visibility still matter for any sky-based observing or space-weather awareness.'
      }
    ];
  }
  if (layerId === 'wildfires') {
    return fireWeatherSamples(state).slice(0, 6).map((sample) => ({
      id: sample.id,
      label: sample.label,
      meta: `Risk ${sample.fireRisk} • ${sample.snapshot?.conditionLabel || 'Dry pattern'} • wind ${Math.round(sample.snapshot?.windMph || 0)} mph`,
      description: 'This beta wildfire preview is currently a fire-weather watchpoint layer based on heat, dryness, and wind in the sampled region.'
    }));
  }
  return STATIC_PREVIEW_LAYER_ITEMS[layerId] || [];
}

function previewSelection(state, layerId = '') {
  const items = previewLayerItems(state, layerId);
  const selectedId = normalizePreviewId(state.previewSelections?.[layerId] || '');
  return items.find((entry) => normalizePreviewId(entry.id) === selectedId) || items[0] || null;
}

function setPreviewSelection(state, layerId = '', itemId = '') {
  if (!state.previewSelections || typeof state.previewSelections !== 'object') {
    state.previewSelections = {};
  }
  state.previewSelections[layerId] = normalizePreviewId(itemId);
}

function relatedImplementedLayer(layerId = '') {
  if (['space-weather', 'near-earth-objects', 'rocket-launches'].includes(layerId)) return 'satellites';
  if (['volcanoes', 'wildfires'].includes(layerId)) return 'earthquakes';
  if (['ships', 'aircraft', 'live-media'].includes(layerId)) return 'weather';
  return '';
}

function renderPreviewLayerDetails(state, layer) {
  const ui = state.selector.ui;
  const items = previewLayerItems(state, layer.id);
  const selected = previewSelection(state, layer.id);
  const relatedLayerId = relatedImplementedLayer(layer.id);
  const relatedLayer = relatedLayerId ? getLiveEarthLayer(relatedLayerId) : null;
  const list = items.length
    ? items.map((entry) => {
        const active = normalizePreviewId(entry.id) === normalizePreviewId(selected?.id) ? ' active' : '';
        return `<button class="globe-selector-live-list-item${active}" type="button" data-live-earth-action="select-preview" data-layer="${escapeHtml(layer.id)}" data-id="${escapeHtml(entry.id)}">
          <span>${escapeHtml(entry.label)}</span>
          <small>${escapeHtml(entry.meta || '')}</small>
        </button>`;
      }).join('')
    : '<div class="globe-selector-live-placeholder">No preview entries are available for this layer right now.</div>';
  setDetailsHtml(state, `
    <div class="globe-selector-live-detail-card">
      <div class="globe-selector-live-detail-heading">${escapeHtml(selected?.label || layer.label)}</div>
      <div class="globe-selector-live-detail-copy">${escapeHtml(selected?.description || layer.summary)}</div>
      <div class="globe-selector-live-detail-meta">${escapeHtml(selected?.meta || layer.localSummary || layer.summary)}</div>
      <div class="globe-selector-live-detail-meta">${escapeHtml(layer.localSummary || 'This preview layer is live in the UI now and ready for a future data-feed upgrade.')}</div>
      ${relatedLayer ? `
        <div class="globe-selector-live-detail-actions">
          <button class="globe-selector-live-action-btn secondary" type="button" data-live-earth-action="open-related-layer" data-id="${escapeHtml(relatedLayer.id)}">
            Open ${escapeHtml(relatedLayer.label)}
          </button>
        </div>
      ` : ''}
      <div class="globe-selector-live-list">${list}</div>
    </div>
  `);
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

function renderSatelliteGlobe(state) {
  ensureSelectorGroups(state);
  const selector = state.selector;
  const api = selector.api;
  removeChildren(selector.satelliteGroup);
  selector.markerRecords = selector.markerRecords.filter((entry) => entry.type !== 'satellite');
  if (state.panelMode !== 'live-earth' || state.activeLayerId !== 'satellites') {
    selector.satelliteGroup.visible = false;
    if (selector.trackLine) selector.trackLine.visible = false;
    return;
  }
  selector.satelliteGroup.visible = true;

  filteredSatelliteItems(state).forEach((entry) => {
    const position = state.satellitePositions.find((item) => item.id === entry.id);
    if (!position) return;
    const altitudeScale = 1.065 + clamp01(position.altitudeKm / 42000) * 0.12;
    const point = api.latLonToLocalPoint(position.lat, position.lon, altitudeScale);
    const isSelected = entry.id === state.selectedSatelliteId;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(isSelected ? 0.017 : 0.011, 12, 10),
      new THREE.MeshBasicMaterial({
        color: String(entry.classLabel || '').toLowerCase() === 'weather' ? 0x4fc3ff : 0xffffff
      })
    );
    mesh.position.set(point.x, point.y, point.z);
    mesh.userData.liveEarth = { type: 'satellite', id: entry.id };
    selector.satelliteGroup.add(mesh);
    selector.markerRecords.push({ type: 'satellite', id: entry.id, mesh });
  });

  if (selector.trackLine) {
    selector.group.remove(selector.trackLine);
    selector.trackLine.geometry?.dispose?.();
    selector.trackLine.material?.dispose?.();
    selector.trackLine = null;
  }

  if (!state.satelliteTrackPoints.length) return;
  const points = state.satelliteTrackPoints.map((entry) => {
    const radius = 1.05 + clamp01(Number(entry.altitudeKm) / 42000) * 0.14;
    const point = api.latLonToLocalPoint(entry.lat, entry.lon, radius);
    return new THREE.Vector3(point.x, point.y, point.z);
  });
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  selector.trackLine = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color: 0x80d5ff, transparent: true, opacity: 0.8 })
  );
  selector.group.add(selector.trackLine);
}

function renderEarthquakeGlobe(state) {
  ensureSelectorGroups(state);
  const selector = state.selector;
  const api = selector.api;
  removeChildren(selector.earthquakeGroup);
  selector.markerRecords = selector.markerRecords.filter((entry) => entry.type !== 'earthquake');
  if (state.panelMode !== 'live-earth' || state.activeLayerId !== 'earthquakes') {
    selector.earthquakeGroup.visible = false;
    return;
  }
  selector.earthquakeGroup.visible = true;
  state.earthquakeItems.slice(0, 100).forEach((event) => {
    const point = api.latLonToLocalPoint(event.lat, event.lon, 1.018);
    const radius = 0.008 + clamp01((Number(event.magnitude) || 0) / 8) * 0.018;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 10, 9),
      new THREE.MeshBasicMaterial({
        color: colorForMagnitude(event.magnitude)
      })
    );
    mesh.position.set(point.x, point.y, point.z);
    mesh.userData.liveEarth = { type: 'earthquake', id: event.id };
    selector.earthquakeGroup.add(mesh);
    selector.markerRecords.push({ type: 'earthquake', id: event.id, mesh });
  });
}

function renderWeatherGlobe(state) {
  ensureSelectorGroups(state);
  const selector = state.selector;
  const api = selector.api;
  removeChildren(selector.weatherGroup);
  selector.markerRecords = selector.markerRecords.filter((entry) => entry.type !== 'weather');
  const layerId = state.activeLayerId;
  if (state.panelMode !== 'live-earth' || !['weather', 'storms', 'ocean-state'].includes(layerId)) {
    selector.weatherGroup.visible = false;
    return;
  }
  selector.weatherGroup.visible = true;
  const sourceItems = layerId === 'storms'
    ? stormSamples(state)
    : layerId === 'ocean-state'
      ? oceanSamples(state)
      : state.weatherSamples;

  sourceItems.forEach((sample) => {
    const point = api.latLonToLocalPoint(sample.lat, sample.lon, 1.02);
    const isSelected = sample.id === state.selectedWeatherSampleId;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(isSelected ? 0.016 : 0.011, 12, 10),
      new THREE.MeshBasicMaterial({
        color: layerId === 'storms'
          ? colorForStormSeverity(sample.stormSeverity)
          : layerId === 'ocean-state'
            ? sample.oceanState?.color || 0x67e8f9
            : colorForWeatherCategory(sample.snapshot?.category)
      })
    );
    mesh.position.set(point.x, point.y, point.z);
    mesh.userData.liveEarth = { type: 'weather', id: sample.id };
    selector.weatherGroup.add(mesh);
    selector.markerRecords.push({ type: 'weather', id: sample.id, mesh });
  });

  const selection = selectorSelection(state);
  if (Number.isFinite(selection?.lat) && Number.isFinite(selection?.lon)) {
    const selectionPoint = api.latLonToLocalPoint(selection.lat, selection.lon, 1.028);
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.016, 0.028, 20),
      new THREE.MeshBasicMaterial({
        color: colorForWeatherCategory(state.selectionWeather?.category),
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide
      })
    );
    marker.position.set(selectionPoint.x, selectionPoint.y, selectionPoint.z);
    marker.lookAt(0, 0, 0);
    selector.weatherGroup.add(marker);
  }
}

function renderTransportGlobe(state) {
  ensureSelectorGroups(state);
  const selector = state.selector;
  const api = selector.api;
  removeChildren(selector.transportRouteGroup);
  removeChildren(selector.transportMarkerGroup);
  selector.markerRecords = selector.markerRecords.filter((entry) => entry.type !== 'ship' && entry.type !== 'aircraft');
  const layerId = state.activeLayerId;
  if (state.panelMode !== 'live-earth' || !['ships', 'aircraft'].includes(layerId)) {
    selector.transportRouteGroup.visible = false;
    selector.transportMarkerGroup.visible = false;
    return;
  }

  selector.transportRouteGroup.visible = true;
  selector.transportMarkerGroup.visible = true;
  const routes = layerId === 'ships' ? state.shipRoutes : state.aircraftRoutes;
  const items = layerId === 'ships' ? state.shipItems : state.aircraftItems;
  const selectedId = layerId === 'ships' ? state.selectedShipId : state.selectedAircraftId;

  routes.forEach((route) => {
    const points = (route.renderPoints || []).map((entry) => {
      const point = api.latLonToLocalPoint(entry.lat, entry.lon, entry.altitude);
      return new THREE.Vector3(point.x, point.y, point.z);
    });
    if (points.length < 2) return;
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: route.color || (layerId === 'ships' ? 0x67e8f9 : 0xfbbf24),
      transparent: true,
      opacity: route.id === (items.find((entry) => entry.id === selectedId)?.routeId || '') ? 0.96 : 0.34
    });
    const line = new THREE.Line(geometry, material);
    selector.transportRouteGroup.add(line);
  });

  items.forEach((item) => {
    const point = api.latLonToLocalPoint(item.lat, item.lon, item.altitude || (layerId === 'ships' ? 1.018 : 1.055));
    const selected = item.id === selectedId;
    const color = layerId === 'ships' ? 0x9de5ff : 0xffd166;
    const mesh = new THREE.Mesh(
      layerId === 'ships'
        ? new THREE.ConeGeometry(selected ? 0.015 : 0.011, selected ? 0.05 : 0.036, 6)
        : new THREE.ConeGeometry(selected ? 0.013 : 0.01, selected ? 0.054 : 0.04, 5),
      new THREE.MeshBasicMaterial({
        color
      })
    );
    mesh.position.set(point.x, point.y, point.z);
    mesh.lookAt(0, 0, 0);
    mesh.rotateX(Math.PI * 0.5);
    mesh.rotateY((Number(item.headingDeg) || 0) * Math.PI / 180);
    mesh.userData.liveEarth = { type: layerId === 'ships' ? 'ship' : 'aircraft', id: item.id };
    selector.transportMarkerGroup.add(mesh);
    selector.markerRecords.push({ type: layerId === 'ships' ? 'ship' : 'aircraft', id: item.id, mesh });
  });
}

function renderGlobeLayers(state) {
  renderSatelliteGlobe(state);
  renderEarthquakeGlobe(state);
  renderWeatherGlobe(state);
  renderTransportGlobe(state);
}

function selectedLayerCount(state, layerId) {
  if (layerId === 'satellites') return filteredSatelliteItems(state).length;
  if (layerId === 'earthquakes') return state.earthquakeItems.length;
  if (layerId === 'weather') return state.weatherSamples.length;
  if (layerId === 'storms') return stormSamples(state).length;
  if (layerId === 'ocean-state') return oceanSamples(state).length;
  if (layerId === 'ships') return state.shipItems.length;
  if (layerId === 'aircraft') return state.aircraftItems.length;
  if (getLiveEarthLayer(layerId)?.status === 'preview') return previewLayerItems(state, layerId).length;
  return 0;
}

function formatWeatherLine(snapshot) {
  if (!snapshot) return 'Loading weather…';
  const temp = Number.isFinite(snapshot.temperatureF) ? `${Math.round(snapshot.temperatureF)}°F` : '--';
  return `${snapshot.icon || '🌦️'} ${snapshot.conditionLabel || 'Weather'} • ${temp}`;
}

function formatSatelliteVisibility(state, snapshot) {
  if (!snapshot) return 'Position unavailable';
  const observer = resolveObservedEarthLocation();
  const look = state.localSatelliteLook;
  if (!look || !Number.isFinite(look.elevationDeg)) return `${Math.round(snapshot.altitudeKm)} km altitude`;
  const horizon = look.elevationDeg >= 0 ? 'Above local horizon' : 'Below local horizon';
  return `${horizon} • ${Math.round(snapshot.altitudeKm)} km altitude`;
}

function selectionRouteContext(state, layerId) {
  const selection = selectorSelection(state);
  if (!Number.isFinite(selection?.lat) || !Number.isFinite(selection?.lon)) return null;
  const routes = layerId === 'ships' ? state.shipRoutes : state.aircraftRoutes;
  return nearestRouteContext(routes, selection.lat, selection.lon);
}

function focusTransportSelection(state, item) {
  if (!item || typeof state.selector.api?.setSelection !== 'function') return;
  state.selector.api.setSelection(item.lat, item.lon, {
    name: item.routeLabel || item.label,
    focus: true
  });
}

function renderTransportDetails(state, layerId) {
  const isShipLayer = layerId === 'ships';
  const items = isShipLayer ? state.shipItems : state.aircraftItems;
  const routes = isShipLayer ? state.shipRoutes : state.aircraftRoutes;
  const selected = isShipLayer ? selectedShip(state) : selectedAircraft(state);
  const localContext = selectionRouteContext(state, layerId);
  const relatedLayer = getLiveEarthLayer(isShipLayer ? 'ocean-state' : 'weather');
  const list = items.map((item) => {
    const active = item.id === selected?.id ? ' active' : '';
    return `<button class="globe-selector-live-list-item${active}" type="button" data-live-earth-action="${isShipLayer ? 'select-ship' : 'select-aircraft'}" data-id="${escapeHtml(item.id)}">
      <span>${escapeHtml(item.label)} • ${escapeHtml(item.routeLabel)}</span>
      <small>${escapeHtml(item.meta || '')} • ${escapeHtml(`${item.progressPct}% along route`)}</small>
    </button>`;
  }).join('');
  setDetailsHtml(state, `
    <div class="globe-selector-live-detail-card">
      <div class="globe-selector-live-detail-heading">${escapeHtml(selected?.label || (isShipLayer ? 'Select a ship corridor' : 'Select an airway flight'))}</div>
      <div class="globe-selector-live-detail-copy">${escapeHtml(selected?.routeSummary || getLiveEarthLayer(layerId)?.summary || '')}</div>
      <div class="globe-selector-live-detail-meta">${escapeHtml(`${items.length} live markers across ${routes.length} major ${isShipLayer ? 'shipping corridors' : 'air corridors'}.`)}</div>
      ${selected ? `<div class="globe-selector-live-detail-meta">${escapeHtml(`${selected.operator || ''} • ${selected.speedKt} kt • heading ${Math.round(selected.headingDeg || 0)}°`)}</div>` : ''}
      ${selected ? `<div class="globe-selector-live-detail-meta">${escapeHtml(`${selected.routeLabel} • ${selected.region}`)}</div>` : ''}
      ${localContext ? `<div class="globe-selector-live-detail-meta">${escapeHtml(`Closest selected-world corridor: ${localContext.routeLabel} • ${Math.round(localContext.distanceKm)} km away`)}</div>` : ''}
      <div class="globe-selector-live-detail-actions">
        <button class="globe-selector-live-action-btn" type="button" data-live-earth-action="focus-transport"${selected ? '' : ' disabled'}>Focus Marker</button>
        <button class="globe-selector-live-action-btn secondary" type="button" data-live-earth-action="open-related-layer" data-id="${escapeHtml(relatedLayer?.id || '')}">${escapeHtml(`Open ${relatedLayer?.label || 'Related Layer'}`)}</button>
      </div>
      <div class="globe-selector-live-list">${list}</div>
    </div>
  `);
}

function renderLiveEarthDetails(state) {
  const ui = state.selector.ui;
  if (!ui?.details) return;
  const layer = getLiveEarthLayer(state.activeLayerId);
  if (!layer) {
    setDetailsHtml(state, '<div class="globe-selector-live-placeholder">Select a Live Earth layer.</div>');
    return;
  }

  if (layer.status === 'preview') {
    renderPreviewLayerDetails(state, layer);
    return;
  }

  if (layer.status !== 'implemented') {
    setDetailsHtml(state, '<div class="globe-selector-live-placeholder">This Live Earth layer is unavailable right now.</div>');
    return;
  }

  if (layer.id === 'satellites') {
    const selectedEntry = selectedSatelliteEntry(state);
    const selected = selectedSatellitePosition(state);
    const selectedSubpoint = selected ? `${selected.lat.toFixed(1)}°, ${selected.lon.toFixed(1)}°` : '';
    const list = filteredSatelliteItems(state).map((entry) => {
      const snapshot = state.satellitePositions.find((item) => item.id === entry.id);
      const active = entry.id === state.selectedSatelliteId ? ' active' : '';
      const meta = snapshot ? `${Math.round(snapshot.altitudeKm)} km • ${escapeHtml(entry.classLabel)}` : escapeHtml(entry.classLabel);
      return `<button class="globe-selector-live-list-item${active}" type="button" data-live-earth-action="select-satellite" data-id="${entry.id}">
        <span>${escapeHtml(entry.label)}</span>
        <small>${meta}</small>
      </button>`;
    }).join('');
    setDetailsHtml(state, `
      <div class="globe-selector-live-detail-card">
      <div class="globe-selector-live-filter-row">
          <button class="globe-selector-live-filter${state.satelliteFilter === 'all' ? ' active' : ''}" type="button" data-live-earth-action="sat-filter" data-filter="all">All</button>
          <button class="globe-selector-live-filter${state.satelliteFilter === 'stations' ? ' active' : ''}" type="button" data-live-earth-action="sat-filter" data-filter="stations">Stations</button>
          <button class="globe-selector-live-filter${state.satelliteFilter === 'weather' ? ' active' : ''}" type="button" data-live-earth-action="sat-filter" data-filter="weather">Weather</button>
          <button class="globe-selector-live-filter${state.satelliteFilter === 'earth' ? ' active' : ''}" type="button" data-live-earth-action="sat-filter" data-filter="earth">Earth Obs</button>
        </div>
        <div class="globe-selector-live-detail-heading">${escapeHtml(selectedEntry?.label || 'Select a satellite')}</div>
        <div class="globe-selector-live-detail-copy">${escapeHtml(selectedEntry?.description || layer.summary)}</div>
        ${selectedEntry && selected ? `<div class="globe-selector-live-detail-meta">${escapeHtml(selectedEntry.operator || '')} • ${escapeHtml(formatSatelliteVisibility(state, selected))}</div>` : ''}
        ${selectedEntry && selected ? `<div class="globe-selector-live-detail-meta">${escapeHtml(`Subpoint ${selectedSubpoint} • ${Math.round(selected.altitudeKm)} km altitude`)}</div>` : ''}
        ${selectedEntry && selected ? `<div class="globe-selector-live-detail-meta">${escapeHtml((state.localSatelliteLook?.elevationDeg >= 0 ? 'Visible in local sky now' : 'Not above your current horizon') || '')}</div>` : ''}
        <div class="globe-selector-live-detail-actions">
          <button class="globe-selector-live-action-btn" type="button" data-live-earth-action="travel-satellite"${selected ? '' : ' disabled'}>Travel To Satellite</button>
        </div>
        <div class="globe-selector-live-list">${list}</div>
      </div>
    `);
    return;
  }

  if (layer.id === 'earthquakes') {
    const selected = selectedEarthquake(state);
    const list = state.earthquakeItems.slice(0, 14).map((event) => {
      const active = event.id === state.selectedEarthquakeId ? ' active' : '';
      return `<button class="globe-selector-live-list-item${active}" type="button" data-live-earth-action="select-earthquake" data-id="${event.id}">
        <span>M ${Number.isFinite(event.magnitude) ? event.magnitude.toFixed(1) : '?'} · ${escapeHtml(event.place)}</span>
        <small>${escapeHtml(event.ageLabel)} • ${escapeHtml(event.depthLabel)}</small>
      </button>`;
    }).join('');
    setDetailsHtml(state, `
      <div class="globe-selector-live-detail-card">
        <div class="globe-selector-live-detail-heading">${escapeHtml(selected?.title || 'Select an earthquake')}</div>
        <div class="globe-selector-live-detail-copy">${escapeHtml(selected?.place || layer.summary)}</div>
        ${selected ? `<div class="globe-selector-live-detail-meta">${escapeHtml(`Magnitude ${selected.magnitude?.toFixed?.(1) || '?'} • ${selected.depthLabel} • ${selected.ageLabel}`)}</div>` : ''}
        ${selected?.alert ? `<div class="globe-selector-live-detail-meta">${escapeHtml(`USGS alert: ${selected.alert.toUpperCase()}`)}</div>` : ''}
        <div class="globe-selector-live-detail-actions">
          <button class="globe-selector-live-action-btn" type="button" data-live-earth-action="travel-earthquake"${selected ? '' : ' disabled'}>Travel To Event</button>
          <button class="globe-selector-live-action-btn secondary" type="button" data-live-earth-action="replay-earthquake"${selected ? '' : ' disabled'}>Replay Local Shake</button>
        </div>
        <div class="globe-selector-live-list">${list}</div>
      </div>
    `);
    return;
  }

  if (layer.id === 'weather') {
    const selected = state.selectionWeather;
    const sampleList = state.weatherSamples.map((sample) => {
      const active = sample.id === state.selectedWeatherSampleId ? ' active' : '';
      return `<button class="globe-selector-live-list-item${active}" type="button" data-live-earth-action="select-weather" data-id="${sample.id}">
        <span>${escapeHtml(sample.label)}${sample.snapshot ? ` • ${escapeHtml(sample.snapshot.conditionLabel || '')}` : ''}</span>
        <small>${escapeHtml(sample.snapshot ? `${Math.round(sample.snapshot.temperatureF || 0)}°F` : 'Loading…')}</small>
      </button>`;
    }).join('');
    const localWorld = typeof appCtx.getWeatherSnapshot === 'function' ? appCtx.getWeatherSnapshot() : null;
    setDetailsHtml(state, `
      <div class="globe-selector-live-detail-card">
        <div class="globe-selector-live-detail-heading">${escapeHtml(selected?.locationDisplay || selectorSelection(state)?.name || 'Selected globe weather')}</div>
        <div class="globe-selector-live-detail-copy">${escapeHtml(formatWeatherLine(selected))}</div>
        ${selected ? `<div class="globe-selector-live-detail-meta">${escapeHtml(`Feels like ${Math.round(selected.apparentF || 0)}°F • ${Math.round(selected.humidityPct || 0)}% humidity • ${Math.round(selected.cloudCover || 0)}% clouds`)}</div>` : ''}
        ${localWorld ? `<div class="globe-selector-live-detail-meta">${escapeHtml(`Current 3D world: ${localWorld.conditionLabel || 'Weather'} • ${Math.round(localWorld.temperatureF || 0)}°F`)}</div>` : ''}
        <div class="globe-selector-live-list">${sampleList}</div>
      </div>
    `);
    return;
  }

  if (layer.id === 'storms') {
    const samples = stormSamples(state);
    const selected = weatherLikeSelection(state, samples);
    if (!samples.length) {
      setDetailsHtml(state, `
        <div class="globe-selector-live-detail-card">
          <div class="globe-selector-live-detail-heading">Storm Watch</div>
          <div class="globe-selector-live-detail-copy">No major storm-like conditions are showing in the current regional sample set.</div>
          <div class="globe-selector-live-detail-meta">The feed is still live. Open Weather for the broader condition map.</div>
        </div>
      `);
      return;
    }
    const sampleList = samples.map((sample) => {
      const active = sample.id === selected?.id ? ' active' : '';
      return `<button class="globe-selector-live-list-item${active}" type="button" data-live-earth-action="select-weather" data-id="${sample.id}">
        <span>${escapeHtml(sample.label)} • ${escapeHtml(sample.snapshot?.conditionLabel || 'Storm Watch')}</span>
        <small>${escapeHtml(`Wind ${Math.round(sample.snapshot?.windMph || 0)} mph • ${Math.round(sample.snapshot?.cloudCover || 0)}% clouds`)}</small>
      </button>`;
    }).join('');
    setDetailsHtml(state, `
      <div class="globe-selector-live-detail-card">
        <div class="globe-selector-live-detail-heading">${escapeHtml(selected?.label || 'Storm Watch')}</div>
        <div class="globe-selector-live-detail-copy">${escapeHtml(selected?.snapshot?.conditionLabel || layer.summary)}</div>
        ${selected ? `<div class="globe-selector-live-detail-meta">${escapeHtml(`Wind ${Math.round(selected.snapshot?.windMph || 0)} mph • ${Math.round(selected.snapshot?.precipitationMm || 0)} mm precip • ${Math.round(selected.snapshot?.cloudCover || 0)}% clouds`)}</div>` : ''}
        <div class="globe-selector-live-list">${sampleList}</div>
      </div>
    `);
    return;
  }

  if (layer.id === 'ocean-state') {
    const samples = oceanSamples(state);
    const selected = weatherLikeSelection(state, samples);
    const localWorld = typeof appCtx.getWeatherSnapshot === 'function' ? appCtx.getWeatherSnapshot() : null;
    const localSeaState = String(appCtx.boatMode?.seaState || 'moderate').replace(/_/g, ' ');
    const localIntensity = Math.round(stateWaveIntensity() * 100);
    const sampleList = samples.map((sample) => {
      const active = sample.id === selected?.id ? ' active' : '';
      return `<button class="globe-selector-live-list-item${active}" type="button" data-live-earth-action="select-weather" data-id="${sample.id}">
        <span>${escapeHtml(sample.label)} • ${escapeHtml(sample.oceanState?.label || 'Moderate')}</span>
        <small>${escapeHtml(`Wind ${Math.round(sample.snapshot?.windMph || 0)} mph • ${sample.snapshot?.conditionLabel || 'Marine weather'}`)}</small>
      </button>`;
    }).join('');
    setDetailsHtml(state, `
      <div class="globe-selector-live-detail-card">
        <div class="globe-selector-live-detail-heading">${escapeHtml(selected?.label || 'Ocean State')}</div>
        <div class="globe-selector-live-detail-copy">${escapeHtml(selected?.oceanState?.summary || layer.summary)}</div>
        <div class="globe-selector-live-detail-meta">${escapeHtml(`Current 3D world sea state: ${localSeaState} • wave intensity ${localIntensity}%`)}</div>
        ${localWorld ? `<div class="globe-selector-live-detail-meta">${escapeHtml(`Local wind ${Math.round(localWorld.windMph || 0)} mph • ${localWorld.conditionLabel || 'Weather'}`)}</div>` : ''}
        <div class="globe-selector-live-list">${sampleList || '<div class="globe-selector-live-placeholder">No marine sample points are available right now.</div>'}</div>
      </div>
    `);
    return;
  }

  if (layer.id === 'ships' || layer.id === 'aircraft') {
    renderTransportDetails(state, layer.id);
  }
}

function renderLiveEarthUi(state) {
  const ui = state.selector.ui;
  if (!ui?.categoryChips || !ui?.layerList) return;
  ui.categoryChips.innerHTML = LIVE_EARTH_CATEGORIES.map((category) => `
    <button class="globe-selector-live-chip${category.id === state.activeCategoryId ? ' active' : ''}" type="button" data-live-earth-action="category" data-id="${category.id}">
      ${escapeHtml(category.label)}
    </button>
  `).join('');

  ui.layerList.innerHTML = getLayersForCategory(state.activeCategoryId).map((layer) => {
    const active = layer.id === state.activeLayerId ? ' active' : '';
    const status = layer.status === 'implemented'
      ? `${selectedLayerCount(state, layer.id)} live`
      : layer.status === 'preview'
        ? `${selectedLayerCount(state, layer.id)} preview`
        : 'Planned';
    return `
      <button class="globe-selector-live-layer${active}" type="button" data-live-earth-action="layer" data-id="${layer.id}">
        <span class="globe-selector-live-layer-label">${escapeHtml(layer.label)}</span>
        <span class="globe-selector-live-layer-status ${layer.status}">${escapeHtml(status)}</span>
        <small>${escapeHtml(layer.summary)}</small>
      </button>
    `;
  }).join('');

  if (renderLiveEarthStatus(state) === false) {
    renderLiveEarthDetails(state);
    return;
  }

  renderLiveEarthDetails(state);
}

function renderLiveEarthStatus(state) {
  const ui = state.selector.ui;
  if (!ui?.status) return true;
  if (state.lastErrorMessage) {
    ui.status.textContent = state.lastErrorMessage;
    return false;
  }
  const layer = getLiveEarthLayer(state.activeLayerId);
  const lastUpdate = layer?.id === 'satellites' ? state.satellitesLoadedAt :
    layer?.id === 'earthquakes' ? state.earthquakesLoadedAt :
    layer?.id === 'ships' ? state.shipsLoadedAt :
    layer?.id === 'aircraft' ? state.aircraftLoadedAt :
    layer?.id === 'weather' ? state.weatherSamplesLoadedAt :
    0;
  const stamp = lastUpdate ? new Date(lastUpdate).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Pending';
  ui.status.textContent = `Live feed updates cached for stability. Last refresh: ${stamp}`;
  return true;
}

function setPanelMode(state, mode = 'explore') {
  state.panelMode = mode === 'live-earth' ? 'live-earth' : 'explore';
  const ui = state.selector.ui;
  if (ui?.exploreModeBtn) ui.exploreModeBtn.classList.toggle('active', state.panelMode === 'explore');
  if (ui?.liveEarthModeBtn) ui.liveEarthModeBtn.classList.toggle('active', state.panelMode === 'live-earth');
  if (ui?.explorePanel) ui.explorePanel.classList.toggle('active', state.panelMode === 'explore');
  if (ui?.liveEarthPanel) ui.liveEarthPanel.classList.toggle('active', state.panelMode === 'live-earth');
  if (ui?.explorePanel) ui.explorePanel.hidden = state.panelMode !== 'explore';
  if (ui?.liveEarthPanel) ui.liveEarthPanel.hidden = state.panelMode !== 'live-earth';
  if (ui?.hint) {
    ui.hint.textContent = state.panelMode === 'live-earth' ?
      'Drag to rotate · Scroll to zoom · Tap markers to inspect live Earth systems' :
      'Drag to rotate · Scroll to zoom · Tap/Click to pick';
  }
}

async function refreshActiveLayer(state, force = false) {
  try {
    const layerId = state.activeLayerId;
    if (layerId === 'satellites') {
      await ensureSatelliteData(state, force);
      await ensureSatellitePositions(state, force);
      await refreshSatelliteTrack(state, force);
    } else if (layerId === 'earthquakes') {
      await ensureEarthquakeData(state, force);
    } else if (layerId === 'ships') {
      await ensureShipTrafficData(state, force);
    } else if (layerId === 'aircraft') {
      await ensureAircraftTrafficData(state, force);
    } else if (layerId === 'weather' || layerId === 'storms' || layerId === 'ocean-state') {
      await ensureWeatherSamples(state, force);
      await ensureSelectionWeather(state, force);
    }
    state.lastErrorMessage = '';
  } catch (error) {
    console.warn('[live-earth] refresh failed:', error?.message || error);
    state.lastErrorMessage = `Live feed refresh failed: ${error?.message || error}`;
  }
  renderGlobeLayers(state);
  renderLiveEarthUi(state);
}

async function setActiveLayer(state, layerId, force = false) {
  const layer = getLiveEarthLayer(layerId);
  if (!layer) return;
  state.activeCategoryId = layer.categoryId;
  state.activeLayerId = layer.id;
  if (layer.id === 'satellites' && !state.selectedSatelliteId && CURATED_SATELLITES[0]) {
    state.selectedSatelliteId = CURATED_SATELLITES[0].id;
  }
  if (layer.id === 'ships' && !state.selectedShipId) {
    state.selectedShipId = state.shipItems[0]?.id || '';
  }
  if (layer.id === 'aircraft' && !state.selectedAircraftId) {
    state.selectedAircraftId = state.aircraftItems[0]?.id || '';
  }
  await refreshActiveLayer(state, force);
}

async function handleUiAction(state, action, value, aux = '') {
  if (action === 'category') {
    state.activeCategoryId = value;
    const nextLayer = getLayersForCategory(value)[0];
    if (nextLayer) await setActiveLayer(state, nextLayer.id);
    else renderLiveEarthUi(state);
    return;
  }
  if (action === 'layer') {
    await setActiveLayer(state, value);
    return;
  }
  if (action === 'sat-filter') {
    state.satelliteFilter = value || 'all';
    renderGlobeLayers(state);
    renderLiveEarthUi(state);
    return;
  }
  if (action === 'select-satellite') {
    state.selectedSatelliteId = value;
    await refreshSatelliteTrack(state, true);
    renderGlobeLayers(state);
    renderLiveEarthUi(state);
    return;
  }
  if (action === 'select-earthquake') {
    state.selectedEarthquakeId = value;
    renderGlobeLayers(state);
    renderLiveEarthUi(state);
    return;
  }
  if (action === 'select-weather') {
    state.selectedWeatherSampleId = value;
    renderLiveEarthUi(state);
    return;
  }
  if (action === 'select-ship') {
    state.selectedShipId = value;
    renderGlobeLayers(state);
    renderLiveEarthUi(state);
    return;
  }
  if (action === 'select-aircraft') {
    state.selectedAircraftId = value;
    renderGlobeLayers(state);
    renderLiveEarthUi(state);
    return;
  }
  if (action === 'select-preview') {
    setPreviewSelection(state, value || state.activeLayerId, aux || '');
    renderLiveEarthUi(state);
    return;
  }
  if (action === 'open-related-layer') {
    await setActiveLayer(state, value);
    return;
  }
  if (action === 'focus-transport') {
    focusTransportSelection(state, state.activeLayerId === 'ships' ? selectedShip(state) : selectedAircraft(state));
    return;
  }
  if (action === 'travel-satellite') {
    const satellite = selectedSatellitePosition(state);
    if (satellite) travelToSatellite(state, satellite);
    return;
  }
  if (action === 'travel-earthquake') {
    const event = selectedEarthquake(state);
    if (event) travelToEvent(state, event);
    return;
  }
  if (action === 'replay-earthquake') {
    const event = selectedEarthquake(state) || state.localEvent;
    if (event) startEarthquakeReplay(state, event);
  }
}

function syncSelectionWeather(state, force = false) {
  if (!['weather', 'storms', 'ocean-state'].includes(state.activeLayerId)) return;
  void ensureSelectionWeather(state, force).then(() => {
    renderWeatherGlobe(state);
    renderLiveEarthUi(state);
  });
}

function bindSelectorUi(state) {
  const ui = state.selector.ui;
  if (!ui || ui.bound) return;
  ui.bound = true;
  ui.exploreModeBtn?.addEventListener('click', () => setPanelMode(state, 'explore'));
  ui.liveEarthModeBtn?.addEventListener('click', () => {
    setPanelMode(state, 'live-earth');
    void warmImplementedLayers(state, false);
    void refreshActiveLayer(state, false);
  });
  ui.refreshBtn?.addEventListener('click', () => {
    void refreshActiveLayer(state, true);
  });
  ui.categoryChips?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-live-earth-action][data-id]') : null;
    if (!(target instanceof HTMLElement)) return;
    void handleUiAction(state, target.dataset.liveEarthAction, target.dataset.id);
  });
  ui.layerList?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-live-earth-action][data-id]') : null;
    if (!(target instanceof HTMLElement)) return;
    void handleUiAction(state, target.dataset.liveEarthAction, target.dataset.id);
  });
  ui.details?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-live-earth-action]') : null;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.liveEarthAction === 'select-preview') {
      void handleUiAction(state, 'select-preview', target.dataset.layer || state.activeLayerId, target.dataset.id || '');
      return;
    }
    void handleUiAction(state, target.dataset.liveEarthAction, target.dataset.id || target.dataset.filter || '');
  });
  ui.details?.addEventListener('scroll', () => {
    rememberDetailsScroll(state);
  }, { passive: true });
}

function handleGlobePick(state, raycaster) {
  if (state.panelMode !== 'live-earth') return false;
  const meshes = state.selector.markerRecords.map((entry) => entry.mesh).filter(Boolean);
  if (!meshes.length) return false;
  const hits = raycaster.intersectObjects(meshes, false);
  const hit = hits && hits.length ? hits[0] : null;
  const meta = hit?.object?.userData?.liveEarth || null;
  if (!meta) return false;
  if (meta.type === 'satellite') {
    void handleUiAction(state, 'select-satellite', meta.id);
    return true;
  }
  if (meta.type === 'earthquake') {
    void handleUiAction(state, 'select-earthquake', meta.id);
    return true;
  }
  if (meta.type === 'weather') {
    void handleUiAction(state, 'select-weather', meta.id);
    return true;
  }
  if (meta.type === 'ship') {
    void handleUiAction(state, 'select-ship', meta.id);
    return true;
  }
  if (meta.type === 'aircraft') {
    void handleUiAction(state, 'select-aircraft', meta.id);
    return true;
  }
  return false;
}

function ensureLocalSatelliteVisual(state) {
  if (state.localSatelliteVisual || !appCtx.scene) return;
  const group = new THREE.Group();
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(8, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0x9ed9ff, transparent: true, opacity: 0.34, depthWrite: false, fog: false, toneMapped: false })
  );
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false, fog: false, toneMapped: false })
  );
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.26, 18, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.38, depthWrite: false, fog: false, toneMapped: false })
  );
  beacon.rotation.z = Math.PI * 0.5;
  beacon.position.y = -2;
  group.add(glow);
  group.add(core);
  group.add(beacon);
  group.visible = false;
  group.renderOrder = 999;
  group.traverse((child) => {
    child.frustumCulled = false;
    child.renderOrder = 999;
  });
  appCtx.scene.add(group);
  state.localSatelliteVisual = group;
}

function disposeSprite(sprite) {
  if (!sprite) return;
  sprite.material?.map?.dispose?.();
  sprite.material?.dispose?.();
}

function createSatelliteLabelSprite(label = 'Satellite') {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const text = String(label || 'Satellite').trim() || 'Satellite';
  const x = 42;
  const y = 34;
  const w = canvas.width - x * 2;
  const h = 168;
  const r = 42;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(6,12,24,0.94)';
  ctx.strokeStyle = 'rgba(194,236,255,0.98)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  let fontSize = 124;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  while (fontSize > 56) {
    ctx.font = `700 ${fontSize}px Poppins, Inter, sans-serif`;
    if (ctx.measureText(text).width <= (w - 160)) break;
    fontSize -= 6;
  }

  ctx.strokeStyle = 'rgba(4, 10, 20, 0.96)';
  ctx.lineWidth = Math.max(10, Math.round(fontSize * 0.18));
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 3;
  ctx.strokeText(text, canvas.width / 2, y + h / 2 + 4);
  ctx.fillText(text, canvas.width / 2, y + h / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  if ('encoding' in texture && THREE.sRGBEncoding) {
    texture.encoding = THREE.sRGBEncoding;
  }
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    sizeAttenuation: false,
    fog: false,
    toneMapped: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(620, 156, 1);
  sprite.position.set(0, 82, 0);
  sprite.renderOrder = 999;
  sprite.frustumCulled = false;
  sprite.userData.labelText = text;
  return sprite;
}

function updateLocalSatelliteLabel(state) {
  const group = state.localSatelliteVisual;
  if (!group) return;
  const label = selectedSatelliteEntry(state)?.label || 'Satellite';
  const current = group.userData?.labelSprite || null;
  if (current?.userData?.labelText === label) return;
  if (current) {
    group.remove(current);
    disposeSprite(current);
  }
  const next = createSatelliteLabelSprite(label);
  if (!group.userData) group.userData = {};
  group.userData.labelSprite = next;
  if (next) group.add(next);
}

function positionLocalSatelliteVisual(state, look) {
  if (!state.localSatelliteVisual || !look || !appCtx.camera) return;
  const vector = horizontalToWorldVector(look.azimuthDeg, look.elevationDeg);
  const anchor = 1180;
  state.localSatelliteVisual.position.set(
    appCtx.camera.position.x + vector.x * anchor,
    appCtx.camera.position.y + vector.y * anchor,
    appCtx.camera.position.z + vector.z * anchor
  );
  state.localSatelliteVisual.lookAt(appCtx.camera.position);
  state.localSatelliteVisual.visible = true;
}

function updateLocalSatelliteVisual(state) {
  if (!state.selectedSatelliteId || !appCtx.camera || appCtx.onMoon || appCtx.travelingToMoon) {
    if (state.localSatelliteVisual) state.localSatelliteVisual.visible = false;
    return;
  }
  ensureLocalSatelliteVisual(state);
  updateLocalSatelliteLabel(state);
  const observer = resolveObservedEarthLocation();
  if (!Number.isFinite(observer?.lat) || !Number.isFinite(observer?.lon)) {
    if (state.localSatelliteVisual) state.localSatelliteVisual.visible = false;
    return;
  }
  const observerKey = `${state.selectedSatelliteId}:${observer.lat.toFixed(2)}:${observer.lon.toFixed(2)}`;
  const now = Date.now();
  if (state.localSatelliteLook && state.localSatelliteObserverKey === observerKey && (now - state.localSatelliteLookAt) < 5000) {
    const look = state.localSatelliteLook;
    if (!state.localSatelliteVisual || !look || look.elevationDeg < 4) {
      if (state.localSatelliteVisual) state.localSatelliteVisual.visible = false;
      return;
    }
    positionLocalSatelliteVisual(state, look);
    return;
  }
  getSatelliteLookAngles(state.selectedSatelliteId, observer, new Date()).then((look) => {
    state.localSatelliteLook = look;
    state.localSatelliteLookAt = now;
    state.localSatelliteObserverKey = observerKey;
    if (!state.localSatelliteVisual || !look || look.elevationDeg < 4) {
      if (state.localSatelliteVisual) state.localSatelliteVisual.visible = false;
      renderLiveEarthUi(state);
      return;
    }
    positionLocalSatelliteVisual(state, look);
    renderLiveEarthUi(state);
  }).catch(() => {
    if (state.localSatelliteVisual) state.localSatelliteVisual.visible = false;
  });
}

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

function startEarthquakeReplay(state, event) {
  if (!event) return;
  const profile = buildEarthquakeReplayProfile(event);
  state.earthquakeReplay = {
    active: true,
    startedAtMs: Date.now(),
    durationMs: profile.durationMs,
    amplitude: profile.amplitude,
    frequency: profile.frequency,
    eventId: event.id
  };
}

function updateEarthquakeReplay(state) {
  const replay = state.earthquakeReplay;
  if (!replay?.active || !appCtx.camera) return;
  const elapsed = Date.now() - replay.startedAtMs;
  if (elapsed >= replay.durationMs) {
    replay.active = false;
    return;
  }
  const progress = clamp01(elapsed / replay.durationMs);
  const fade = 1 - progress;
  const shake = replay.amplitude * fade;
  const t = elapsed / 1000;
  appCtx.camera.position.x += Math.sin(t * replay.frequency * 8.2) * shake;
  appCtx.camera.position.y += Math.sin(t * replay.frequency * 9.4) * shake * 0.42;
  appCtx.camera.position.z += Math.cos(t * replay.frequency * 7.3) * shake;
  appCtx.camera.rotation.z += Math.sin(t * replay.frequency * 6.1) * shake * 0.02;
}

function updateLocalEventContext(state) {
  const now = Date.now();
  if ((now - state.localCheckAt) < LOCAL_EVENT_CHECK_MS) {
    updateLocalEarthquakePanel(state);
    return;
  }
  state.localCheckAt = now;
  const observer = resolveObservedEarthLocation();
  const event = selectedEarthquake(state) || state.localEvent;
  if (!event || !Number.isFinite(observer?.lat) || !Number.isFinite(observer?.lon)) {
    state.localEvent = null;
    updateLocalEarthquakePanel(state);
    return;
  }
  const distanceKm = haversineKm(observer.lat, observer.lon, event.lat, event.lon);
  if (distanceKm <= LOCAL_EVENT_RANGE_KM) {
    if (!state.localEvent || state.localEvent.id !== event.id) {
      state.localEvent = event;
      state.localEventDismissedId = '';
      startEarthquakeReplay(state, event);
    }
  } else if (state.localEvent?.id === event.id && distanceKm > LOCAL_EVENT_RANGE_KM * 1.5) {
    state.localEvent = null;
  }
  updateLocalEarthquakePanel(state);
}

function travelToEvent(state, event) {
  if (!event) return;
  state.selectedEarthquakeId = event.id;
  state.localEvent = event;
  state.localEventDismissedId = '';
  if (appCtx.globeSelector && typeof appCtx.globeSelector.setSelection === 'function') {
    appCtx.globeSelector.setSelection(event.lat, event.lon, {
      name: event.place || event.title,
      focus: true,
      skipAutoFavorite: true
    });
  }
  if (appCtx.globeSelector && typeof appCtx.globeSelector.startHere === 'function') {
    appCtx.globeSelector.startHere();
  }
}

function travelToSatellite(state, satellite) {
  if (!satellite || !Number.isFinite(satellite.lat) || !Number.isFinite(satellite.lon)) return;
  state.selectedSatelliteId = satellite.id;
  if (appCtx.globeSelector && typeof appCtx.globeSelector.setSelection === 'function') {
    appCtx.globeSelector.setSelection(satellite.lat, satellite.lon, {
      name: `${satellite.label || 'Satellite'} subpoint`,
      focus: true,
      skipAutoFavorite: true
    });
  }
  if (appCtx.globeSelector && typeof appCtx.globeSelector.startHere === 'function') {
    appCtx.globeSelector.startHere();
  }
}

function bindLocalPanelActions(state) {
  const ui = ensureLocalEarthquakePanel();
  ui.replayBtn?.addEventListener('click', () => {
    if (state.localEvent) startEarthquakeReplay(state, state.localEvent);
  });
  ui.dismissBtn?.addEventListener('click', () => dismissLocalEvent(state));
}

function bindGlobeSelector(state, api) {
  state.selector.api = api;
  state.selector.ui = api?.liveEarthUi || null;
  bindSelectorUi(state);
  ensureSelectorGroups(state);
  setPanelMode(state, state.panelMode);
  renderLiveEarthUi(state);
}

function onSelectorSelectionChanged(state) {
  if (state.panelMode === 'live-earth' && ['weather', 'storms', 'ocean-state'].includes(state.activeLayerId)) {
    syncSelectionWeather(state, true);
    return;
  }
  if (state.panelMode === 'live-earth' && ['ships', 'aircraft'].includes(state.activeLayerId)) {
    renderLiveEarthUi(state);
  }
}

function updateSelectorFrame(state) {
  if (!state.selector.api?.isOpen?.() || state.panelMode !== 'live-earth') return;
  if (state.activeLayerId === 'satellites') {
    if ((Date.now() - state.selectorSatelliteTickAt) < 1500) return;
    state.selectorSatelliteTickAt = Date.now();
    void ensureSatellitePositions(state, false).then(() => {
      renderSatelliteGlobe(state);
    });
    return;
  }
  if (state.activeLayerId === 'ships') {
    if ((Date.now() - state.shipsLoadedAt) < 1400) return;
    void ensureShipTrafficData(state, true).then(() => {
      renderTransportGlobe(state);
      renderLiveEarthStatus(state);
    });
    return;
  }
  if (state.activeLayerId === 'aircraft') {
    if ((Date.now() - state.aircraftLoadedAt) < 1400) return;
    void ensureAircraftTrafficData(state, true).then(() => {
      renderTransportGlobe(state);
      renderLiveEarthStatus(state);
    });
  }
}

function refreshForOpenSelector(state) {
  if (!state.selector.api?.isOpen?.() || state.panelMode !== 'live-earth') return;
  void warmImplementedLayers(state, false);
  void refreshActiveLayer(state, false);
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
      return handleGlobePick(state, raycaster);
    },
    onSelectorOpen() {
      refreshForOpenSelector(state);
    },
    onSelectorClose() {},
    onSelectorSelectionChanged() {
      onSelectorSelectionChanged(state);
    },
    setPanelMode(mode) {
      setPanelMode(state, mode);
      if (state.panelMode === 'live-earth') refreshForOpenSelector(state);
      else renderGlobeLayers(state);
    },
    getPanelMode() {
      return state.panelMode;
    },
    async setActiveLayer(layerId) {
      await setActiveLayer(state, layerId, false);
    },
    updateFrame() {
      updateLocalSatelliteVisual(state);
      updateLocalEventContext(state);
      updateEarthquakeReplay(state);
    },
    updateSelectorFrame() {
      updateSelectorFrame(state);
    },
    openLiveEarth(layerId = 'satellites') {
      if (typeof appCtx.openGlobeSelector === 'function') appCtx.openGlobeSelector();
      setPanelMode(state, 'live-earth');
      void setActiveLayer(state, layerId, false);
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
        localEventId: state.localEvent?.id || '',
        selectedSatelliteId: state.selectedSatelliteId || '',
        selectedEarthquakeId: state.selectedEarthquakeId || '',
        selectedShipId: state.selectedShipId || '',
        selectedAircraftId: state.selectedAircraftId || ''
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
  appCtx.openLiveEarthSelector = (layerId = 'satellites') => liveEarth.openLiveEarth(layerId);
  appCtx.getLiveEarthSummary = () => liveEarth.getSummary();
  appCtx.inspectLiveEarthState = () => liveEarth.inspectState();
  return liveEarth;
}

initLiveEarth();

export { initLiveEarth };
