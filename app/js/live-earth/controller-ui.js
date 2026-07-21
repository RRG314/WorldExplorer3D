import { LIVE_EARTH_CATEGORIES, getLayersForCategory, getLiveEarthLayer } from "./registry.js?v=10";
import { CURATED_SATELLITES } from "./satellites.js?v=6";
import { nearestRouteContext } from "./transport.js?v=3";
import { startEarthquakeReplay as startLocalEarthquakeReplay } from "./local-events.js?v=2";
import { renderStreetImageryDetails } from "./street-imagery-ui.js?v=1";
import { renderMarineDetails } from "./marine-ui.js?v=1";
import { collectLiveEarthProviderHealth } from "./provider-health.js?v=1";
import {
  renderGlobeLayers,
  renderSatelliteGlobe,
  renderTransportGlobe,
  renderWeatherGlobe
} from "./render-globe.js?v=5";

function selectedLayerCount(ctx, state, layerId) {
  if (layerId === 'overview') return 6;
  if (layerId === 'satellites') return ctx.filteredSatelliteItems(state).length;
  if (layerId === 'earthquakes') return state.earthquakeItems.length;
  if (layerId === 'weather') return state.weatherSamples.length;
  if (layerId === 'storms') return ctx.stormSamples(state).length;
  if (layerId === 'ocean-state') {
    const snapshot = state.marineSnapshot;
    return Number(snapshot?.model?.hasGuidance === true) + Number(Boolean(snapshot?.observation)) + Number(Boolean(snapshot?.predictions?.length));
  }
  if (layerId === 'ships') return state.shipItems.length;
  if (layerId === 'aircraft') return state.aircraftItems.length;
  if (layerId === 'street-imagery') return state.streetImageryItems.length;
  return 0;
}

function layerCountLabel(ctx, state, layer) {
  const count = selectedLayerCount(ctx, state, layer.id);
  if (layer.id === 'overview') return `${count} systems`;
  if (layer.id === 'aircraft') return `${count} ${state.aircraftSourceMode === 'observed' ? 'observed' : 'reference'}`;
  if (layer.id === 'ships') return `${count} reference`;
  if (layer.id === 'ocean-state') return state.marineLoading ? 'loading' : `${count} ${count === 1 ? 'source' : 'sources'}`;
  if (layer.id === 'storms') return `${count} derived`;
  if (layer.id === 'satellites') {
    const observed = state.satelliteItems.filter((entry) => entry.dataSource === 'live').length;
    return observed === count ? `${count} observed` : `${observed}/${count} observed`;
  }
  if (layer.status === 'current') return `${count} current`;
  return `${count} observed`;
}

function formatWeatherLine(snapshot) {
  if (!snapshot) return 'Loading weather…';
  const temp = Number.isFinite(snapshot.temperatureF) ? `${Math.round(snapshot.temperatureF)}°F` : '--';
  return `${snapshot.icon || '🌦️'} ${snapshot.conditionLabel || 'Weather'} • ${temp}`;
}

function formatSatelliteVisibility(state, snapshot) {
  if (!snapshot) return 'Position unavailable';
  const look = state.localSatelliteLook;
  if (!look || !Number.isFinite(look.elevationDeg)) return `${Math.round(snapshot.altitudeKm)} km altitude`;
  const horizon = look.elevationDeg >= 0 ? 'Above local horizon' : 'Below local horizon';
  return `${horizon} • ${Math.round(snapshot.altitudeKm)} km altitude`;
}

function selectionRouteContext(ctx, state, layerId) {
  const selection = ctx.selectorSelection(state);
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
  state.selector.api?.setCameraDistance?.(item.dataSource === 'opensky' ? 1.16 : 1.9);
}

function renderTransportDetails(ctx, state, layerId) {
  const isShipLayer = layerId === 'ships';
  const items = isShipLayer ? state.shipItems : state.aircraftItems;
  const routes = isShipLayer ? state.shipRoutes : state.aircraftRoutes;
  const selected = isShipLayer ? ctx.selectedShip(state) : ctx.selectedAircraft(state);
  const localContext = selectionRouteContext(ctx, state, layerId);
  const relatedLayer = getLiveEarthLayer(isShipLayer ? 'ocean-state' : 'weather');
  const list = items.map((item) => {
    const active = item.id === selected?.id ? ' active' : '';
    const detail = !isShipLayer && item.dataSource === 'opensky'
      ? `${item.meta || ''} • observed ${item.observedAt ? new Date(item.observedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'recently'}`
      : `${item.meta || ''} • ${item.progressPct}% along route`;
    return `<button class="globe-selector-live-list-item${active}" type="button" data-live-earth-action="${isShipLayer ? 'select-ship' : 'select-aircraft'}" data-id="${ctx.escapeHtml(item.id)}">
      <span>${ctx.escapeHtml(item.label)} • ${ctx.escapeHtml(item.routeLabel)}</span>
      <small>${ctx.escapeHtml(detail)}</small>
    </button>`;
  }).join('');
  const observedAircraft = !isShipLayer && state.aircraftSourceMode === 'observed';
  const sourceSummary = observedAircraft
    ? `${items.length} current OpenSky state vectors near the selected location.`
    : `${items.length} reference markers across ${routes.length} major ${isShipLayer ? 'shipping corridors' : 'air corridors'}.`;
  const sourceCaveat = observedAircraft
    ? 'Observed ADS-B and Mode S positions. Callsigns, altitude, and velocity can be unavailable when not reported.'
    : (isShipLayer ? 'Reference layer only. Live vessel identity and position require a licensed AIS provider.' : `${state.aircraftError || 'OpenSky is unavailable in this area.'} Showing labeled reference routes.`);
  ctx.setDetailsHtml(state, `
    <div class="globe-selector-live-detail-card">
      <div class="globe-selector-live-detail-heading">${ctx.escapeHtml(selected?.label || (isShipLayer ? 'Select a ship corridor' : 'Select an airway flight'))}</div>
      <div class="globe-selector-live-detail-copy">${ctx.escapeHtml(selected?.routeSummary || getLiveEarthLayer(layerId)?.summary || '')}</div>
      <div class="globe-selector-live-detail-meta">${ctx.escapeHtml(sourceSummary)}</div>
      <div class="globe-selector-live-detail-meta">${ctx.escapeHtml(sourceCaveat)}</div>
      ${selected ? `<div class="globe-selector-live-detail-meta">${ctx.escapeHtml(`${selected.operator || ''} • ${selected.speedKt} kt • heading ${Math.round(selected.headingDeg || 0)}°`)}</div>` : ''}
      ${selected ? `<div class="globe-selector-live-detail-meta">${ctx.escapeHtml(`${selected.routeLabel} • ${selected.region}`)}</div>` : ''}
      ${selected && !isShipLayer ? `<div class="globe-selector-live-detail-meta">${ctx.escapeHtml(`${Number(selected.lat).toFixed(4)}°, ${Number(selected.lon).toFixed(4)}° • reported aircraft position`)}</div>` : ''}
      ${localContext ? `<div class="globe-selector-live-detail-meta">${ctx.escapeHtml(`Closest selected-world corridor: ${localContext.routeLabel} • ${Math.round(localContext.distanceKm)} km away`)}</div>` : ''}
      <div class="globe-selector-live-detail-actions">
        <button class="globe-selector-live-action-btn" type="button" data-live-earth-action="focus-transport"${selected ? '' : ' disabled'}>Focus Marker</button>
        <button class="globe-selector-live-action-btn secondary" type="button" data-live-earth-action="open-related-layer" data-id="${ctx.escapeHtml(relatedLayer?.id || '')}">${ctx.escapeHtml(`Open ${relatedLayer?.label || 'Related Layer'}`)}</button>
      </div>
      <div class="globe-selector-live-list">${list}</div>
    </div>
  `);
}

function renderOverviewDetails(ctx, state) {
  const observedSatellites = state.satelliteItems.filter((entry) => entry.dataSource === 'live').length;
  const health = collectLiveEarthProviderHealth(state);
  const sourceRows = [
    { id: 'satellites', label: 'Satellites', value: `${observedSatellites}/${state.satelliteItems.length} observed`, source: 'CelesTrak GP orbital elements', health: health.satellites.label },
    { id: 'earthquakes', label: 'Earthquakes', value: `${state.earthquakeItems.length} observed`, source: 'USGS GeoJSON feed', health: health.earthquakes.label },
    { id: 'weather', label: 'Weather', value: `${state.weatherSamples.length} current`, source: 'Open-Meteo current conditions', health: health.weather.label },
    { id: 'street-imagery', label: 'Street imagery', value: 'selected location', source: 'Panoramax and KartaView community observations', health: health.streetImagery.label },
    { id: 'aircraft', label: 'Aircraft', value: `${state.aircraftItems.length} ${state.aircraftSourceMode === 'observed' ? 'observed' : 'reference'}`, source: state.aircraftSourceMode === 'observed' ? 'OpenSky current state vectors' : 'Modeled route fallback', health: state.aircraftSourceMode === 'observed' ? health.aircraft.label : 'Fallback active · OpenSky observations unavailable' },
    { id: 'ships', label: 'Marine traffic', value: `${state.shipItems.length} reference`, source: 'Major corridor context, not live AIS', health: 'Reference only · AIS provider not configured' }
  ];
  const list = sourceRows.map((entry) => `
    <button class="globe-selector-live-list-item" type="button" data-live-earth-action="layer" data-id="${entry.id}">
      <span>${ctx.escapeHtml(entry.label)} · ${ctx.escapeHtml(entry.value)}</span>
      <small>${ctx.escapeHtml(entry.source)}</small>
      <small>${ctx.escapeHtml(entry.health)}</small>
    </button>
  `).join('');
  ctx.setDetailsHtml(state, `
    <div class="globe-selector-live-detail-card">
      <div class="globe-selector-live-detail-heading">Operational Earth Overview</div>
      <div class="globe-selector-live-detail-copy">Observed science feeds and clearly labeled transport reference layers are visible together. Open a layer for details and actions.</div>
      <div class="globe-selector-live-detail-meta">Observed, derived, and reference data are never presented as the same thing.</div>
      <div class="globe-selector-live-list">${list}</div>
    </div>
  `);
}

export function renderLiveEarthDetails(ctx, state) {
  const ui = state.selector.ui;
  if (!ui?.details) return;
  const layer = getLiveEarthLayer(state.activeLayerId);
  if (!layer) {
    ctx.setDetailsHtml(state, '<div class="globe-selector-live-loading">Live Earth data is unavailable. Choose another category or refresh.</div>');
    return;
  }

  if (layer.id === 'overview') {
    renderOverviewDetails(ctx, state);
    return;
  }

  if (layer.id === 'street-imagery') {
    renderStreetImageryDetails(ctx, state);
    return;
  }

  if (layer.id === 'satellites') {
    const selectedEntry = ctx.selectedSatelliteEntry(state);
    const selected = ctx.selectedSatellitePosition(state);
    const selectedSubpoint = selected ? `${selected.lat.toFixed(1)}°, ${selected.lon.toFixed(1)}°` : '';
    const list = ctx.filteredSatelliteItems(state).map((entry) => {
      const snapshot = state.satellitePositions.find((item) => item.id === entry.id);
      const active = entry.id === state.selectedSatelliteId ? ' active' : '';
      const meta = snapshot ? `${Math.round(snapshot.altitudeKm)} km • ${ctx.escapeHtml(entry.classLabel)}` : ctx.escapeHtml(entry.classLabel);
      return `<button class="globe-selector-live-list-item${active}" type="button" data-live-earth-action="select-satellite" data-id="${entry.id}">
        <span>${ctx.escapeHtml(entry.label)}</span>
        <small>${meta}</small>
      </button>`;
    }).join('');
    ctx.setDetailsHtml(state, `
      <div class="globe-selector-live-detail-card">
      <div class="globe-selector-live-filter-row">
          <button class="globe-selector-live-filter${state.satelliteFilter === 'all' ? ' active' : ''}" type="button" data-live-earth-action="sat-filter" data-filter="all">All</button>
          <button class="globe-selector-live-filter${state.satelliteFilter === 'stations' ? ' active' : ''}" type="button" data-live-earth-action="sat-filter" data-filter="stations">Stations</button>
          <button class="globe-selector-live-filter${state.satelliteFilter === 'weather' ? ' active' : ''}" type="button" data-live-earth-action="sat-filter" data-filter="weather">Weather</button>
          <button class="globe-selector-live-filter${state.satelliteFilter === 'earth' ? ' active' : ''}" type="button" data-live-earth-action="sat-filter" data-filter="earth">Earth Obs</button>
        </div>
        <div class="globe-selector-live-detail-heading">${ctx.escapeHtml(selectedEntry?.label || 'Select a satellite')}</div>
        <div class="globe-selector-live-detail-copy">${ctx.escapeHtml(selectedEntry?.description || layer.summary)}</div>
        ${selectedEntry && selected ? `<div class="globe-selector-live-detail-meta">${ctx.escapeHtml(selectedEntry.operator || '')} • ${ctx.escapeHtml(formatSatelliteVisibility(state, selected))}</div>` : ''}
        ${selectedEntry ? `<div class="globe-selector-live-detail-meta">${ctx.escapeHtml(selectedEntry.dataSource === 'live' ? 'Observed source: CelesTrak GP orbital elements' : 'Calculated fallback orbit: live orbital elements unavailable')}</div>` : ''}
        ${selectedEntry && selected ? `<div class="globe-selector-live-detail-meta">${ctx.escapeHtml(`Subpoint ${selectedSubpoint} • ${Math.round(selected.altitudeKm)} km altitude`)}</div>` : ''}
        ${selectedEntry && selected ? `<div class="globe-selector-live-detail-meta">${ctx.escapeHtml((state.localSatelliteLook?.elevationDeg >= 0 ? 'Visible in local sky now' : 'Not above your current horizon') || '')}</div>` : ''}
        <div class="globe-selector-live-detail-actions">
          <button class="globe-selector-live-action-btn" type="button" data-live-earth-action="travel-satellite"${selected ? '' : ' disabled'}>Travel To Satellite</button>
        </div>
        <div class="globe-selector-live-list">${list}</div>
      </div>
    `);
    return;
  }

  if (layer.id === 'earthquakes') {
    const selected = ctx.selectedEarthquake(state);
    const list = state.earthquakeItems.slice(0, 14).map((event) => {
      const active = event.id === state.selectedEarthquakeId ? ' active' : '';
      return `<button class="globe-selector-live-list-item${active}" type="button" data-live-earth-action="select-earthquake" data-id="${event.id}">
        <span>M ${Number.isFinite(event.magnitude) ? event.magnitude.toFixed(1) : '?'} · ${ctx.escapeHtml(event.place)}</span>
        <small>${ctx.escapeHtml(event.ageLabel)} • ${ctx.escapeHtml(event.depthLabel)}</small>
      </button>`;
    }).join('');
    ctx.setDetailsHtml(state, `
      <div class="globe-selector-live-detail-card">
        <div class="globe-selector-live-detail-heading">${ctx.escapeHtml(selected?.title || 'Select an earthquake')}</div>
        <div class="globe-selector-live-detail-copy">${ctx.escapeHtml(selected?.place || layer.summary)}</div>
        ${selected ? `<div class="globe-selector-live-detail-meta">${ctx.escapeHtml(`Magnitude ${selected.magnitude?.toFixed?.(1) || '?'} • ${selected.depthLabel} • ${selected.ageLabel}`)}</div>` : ''}
        ${selected?.alert ? `<div class="globe-selector-live-detail-meta">${ctx.escapeHtml(`USGS alert: ${selected.alert.toUpperCase()}`)}</div>` : ''}
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
        <span>${ctx.escapeHtml(sample.label)}${sample.snapshot ? ` • ${ctx.escapeHtml(sample.snapshot.conditionLabel || '')}` : ''}</span>
        <small>${ctx.escapeHtml(sample.snapshot ? `${Math.round(sample.snapshot.temperatureF || 0)}°F` : 'Loading…')}</small>
      </button>`;
    }).join('');
    const localWorld = typeof ctx.appCtx.getWeatherSnapshot === 'function' ? ctx.appCtx.getWeatherSnapshot() : null;
    ctx.setDetailsHtml(state, `
      <div class="globe-selector-live-detail-card">
        <div class="globe-selector-live-detail-heading">${ctx.escapeHtml(selected?.locationDisplay || ctx.selectorSelection(state)?.name || 'Selected globe weather')}</div>
        <div class="globe-selector-live-detail-copy">${ctx.escapeHtml(formatWeatherLine(selected))}</div>
        ${selected ? `<div class="globe-selector-live-detail-meta">${ctx.escapeHtml(`Feels like ${Math.round(selected.apparentF || 0)}°F • ${Math.round(selected.humidityPct || 0)}% humidity • ${Math.round(selected.cloudCover || 0)}% clouds`)}</div>` : ''}
        ${localWorld ? `<div class="globe-selector-live-detail-meta">${ctx.escapeHtml(`Current 3D world: ${localWorld.conditionLabel || 'Weather'} • ${Math.round(localWorld.temperatureF || 0)}°F`)}</div>` : ''}
        <div class="globe-selector-live-list">${sampleList}</div>
      </div>
    `);
    return;
  }

  if (layer.id === 'storms') {
    const samples = ctx.stormSamples(state);
    const selected = samples.find((entry) => entry.id === state.selectedWeatherSampleId) || samples[0] || null;
    if (!samples.length) {
      ctx.setDetailsHtml(state, `
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
        <span>${ctx.escapeHtml(sample.label)} • ${ctx.escapeHtml(sample.snapshot?.conditionLabel || 'Storm Watch')}</span>
        <small>${ctx.escapeHtml(`Wind ${Math.round(sample.snapshot?.windMph || 0)} mph • ${Math.round(sample.snapshot?.cloudCover || 0)}% clouds`)}</small>
      </button>`;
    }).join('');
    ctx.setDetailsHtml(state, `
      <div class="globe-selector-live-detail-card">
        <div class="globe-selector-live-detail-heading">${ctx.escapeHtml(selected?.label || 'Storm Watch')}</div>
        <div class="globe-selector-live-detail-copy">${ctx.escapeHtml(selected?.snapshot?.conditionLabel || layer.summary)}</div>
        ${selected ? `<div class="globe-selector-live-detail-meta">${ctx.escapeHtml(`Wind ${Math.round(selected.snapshot?.windMph || 0)} mph • ${Math.round(selected.snapshot?.precipitationMm || 0)} mm precip • ${Math.round(selected.snapshot?.cloudCover || 0)}% clouds`)}</div>` : ''}
        <div class="globe-selector-live-list">${sampleList}</div>
      </div>
    `);
    return;
  }

  if (layer.id === 'ocean-state') {
    renderMarineDetails(ctx, state);
    return;
  }

  if (layer.id === 'ships' || layer.id === 'aircraft') {
    renderTransportDetails(ctx, state, layer.id);
  }
}

export function renderLiveEarthStatus(ctx, state) {
  const ui = state.selector.ui;
  if (!ui?.status) return true;
  if (state.lastErrorMessage) {
    ui.status.textContent = state.lastErrorMessage;
    return false;
  }
  const layer = getLiveEarthLayer(state.activeLayerId);
  const lastUpdate = layer?.id === 'overview' ? Math.max(state.satellitesLoadedAt, state.earthquakesLoadedAt, state.weatherSamplesLoadedAt, state.shipsLoadedAt, state.aircraftLoadedAt) :
    layer?.id === 'satellites' ? state.satellitesLoadedAt :
    layer?.id === 'earthquakes' ? state.earthquakesLoadedAt :
    layer?.id === 'ships' ? state.shipsLoadedAt :
    layer?.id === 'aircraft' ? state.aircraftLoadedAt :
    layer?.id === 'street-imagery' ? state.streetImageryLoadedAt :
    layer?.id === 'ocean-state' ? Math.max(state.weatherSamplesLoadedAt, state.marineLoadedAt) :
    ['weather', 'storms'].includes(layer?.id) ? state.weatherSamplesLoadedAt :
    0;
  const stamp = lastUpdate ? new Date(lastUpdate).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Pending';
  const qualifier = layer?.id === 'aircraft' && state.aircraftSourceMode === 'reference'
    ? 'Reference fallback'
    : layer?.id === 'aircraft'
      ? 'Observed OpenSky feed'
      : layer?.id === 'overview'
        ? 'Mixed-source overview'
      : layer?.status === 'mixed'
        ? 'Modeled, observed, and predicted data'
      : layer?.status === 'reference'
    ? 'Reference layer'
    : layer?.status === 'derived'
      ? 'Derived layer'
      : layer?.status === 'current'
          ? 'Current conditions'
          : 'Observed feed';
  ui.status.textContent = `${qualifier}. Cached for stability. Last refresh: ${stamp}`;
  return true;
}

export function renderLiveEarthUi(ctx, state) {
  const ui = state.selector.ui;
  if (!ui?.categoryChips || !ui?.layerList) return;
  ui.categoryChips.innerHTML = LIVE_EARTH_CATEGORIES.map((category) => `
    <button class="globe-selector-live-chip${category.id === state.activeCategoryId ? ' active' : ''}" type="button" data-live-earth-action="category" data-id="${category.id}">
      ${ctx.escapeHtml(category.label)}
    </button>
  `).join('');

  ui.layerList.innerHTML = getLayersForCategory(state.activeCategoryId).map((layer) => {
    const active = layer.id === state.activeLayerId ? ' active' : '';
    const status = layerCountLabel(ctx, state, layer);
    return `
      <button class="globe-selector-live-layer${active}" type="button" data-live-earth-action="layer" data-id="${layer.id}">
        <span class="globe-selector-live-layer-label">${ctx.escapeHtml(layer.label)}</span>
        <span class="globe-selector-live-layer-status ${layer.status}">${ctx.escapeHtml(status)}</span>
        <small>${ctx.escapeHtml(layer.summary)}</small>
      </button>
    `;
  }).join('');

  if (renderLiveEarthStatus(ctx, state) === false) {
    renderLiveEarthDetails(ctx, state);
    return;
  }

  renderLiveEarthDetails(ctx, state);
}

export function setPanelMode(state, mode = 'explore') {
  state.panelMode = mode === 'live-earth' ? 'live-earth' : 'explore';
  const ui = state.selector.ui;
  if (ui?.exploreModeBtn) ui.exploreModeBtn.classList.toggle('active', state.panelMode === 'explore');
  if (ui?.liveEarthModeBtn) ui.liveEarthModeBtn.classList.toggle('active', state.panelMode === 'live-earth');
  if (ui?.explorePanel) ui.explorePanel.classList.toggle('active', state.panelMode === 'explore');
  if (ui?.liveEarthPanel) ui.liveEarthPanel.classList.toggle('active', state.panelMode === 'live-earth');
  if (ui?.explorePanel) ui.explorePanel.hidden = state.panelMode !== 'explore';
  if (ui?.liveEarthPanel) ui.liveEarthPanel.hidden = state.panelMode !== 'live-earth';
  if (ui?.hint) {
    ui.hint.textContent = state.panelMode === 'live-earth'
      ? 'Drag to rotate · Scroll to zoom · Tap markers to inspect live Earth systems'
      : 'Drag to rotate · Scroll to zoom · Tap/Click to pick';
  }
}

export async function refreshActiveLayer(ctx, state, force = false) {
  try {
    const layerId = state.activeLayerId;
    if (layerId === 'overview') {
      await ctx.warmImplementedLayers(state, force);
    } else if (layerId === 'satellites') {
      await ctx.ensureSatelliteData(state, force);
      await ctx.ensureSatellitePositions(state, force);
      await ctx.refreshSatelliteTrack(state, force);
    } else if (layerId === 'earthquakes') {
      await ctx.ensureEarthquakeData(state, force);
    } else if (layerId === 'ships') {
      await ctx.ensureShipTrafficData(state, force);
    } else if (layerId === 'aircraft') {
      await ctx.ensureAircraftTrafficData(state, force);
    } else if (layerId === 'street-imagery') {
      const pending = ctx.ensureStreetImagery(state, force);
      renderLiveEarthUi(ctx, state);
      await pending;
    } else if (layerId === 'ocean-state') {
      const pending = ctx.ensureMarineData(state, force);
      renderLiveEarthUi(ctx, state);
      await Promise.all([pending, ctx.ensureWeatherSamples(state, force), ctx.ensureSelectionWeather(state, force)]);
    } else if (layerId === 'weather' || layerId === 'storms') {
      await ctx.ensureWeatherSamples(state, force);
      await ctx.ensureSelectionWeather(state, force);
    }
    state.lastErrorMessage = '';
  } catch (error) {
    console.warn('[live-earth] refresh failed:', error?.message || error);
    state.lastErrorMessage = `Live feed refresh failed: ${error?.message || error}`;
  }
  renderGlobeLayers(ctx, state);
  renderLiveEarthUi(ctx, state);
}

export async function setActiveLayer(ctx, state, layerId, force = false) {
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
  if (layer.id === 'aircraft') state.selector.api?.setCameraDistance?.(1.18);
  await refreshActiveLayer(ctx, state, force);
}

export async function handleUiAction(ctx, state, action, value) {
  if (action === 'category') {
    state.activeCategoryId = value;
    const nextLayer = getLayersForCategory(value)[0];
    if (nextLayer) await setActiveLayer(ctx, state, nextLayer.id);
    else renderLiveEarthUi(ctx, state);
    return;
  }
  if (action === 'layer') {
    await setActiveLayer(ctx, state, value);
    return;
  }
  if (action === 'sat-filter') {
    state.satelliteFilter = value || 'all';
    renderGlobeLayers(ctx, state);
    renderLiveEarthUi(ctx, state);
    return;
  }
  if (action === 'select-satellite') {
    state.selectedSatelliteId = value;
    await ctx.refreshSatelliteTrack(state, true);
    renderGlobeLayers(ctx, state);
    renderLiveEarthUi(ctx, state);
    return;
  }
  if (action === 'select-earthquake') {
    state.selectedEarthquakeId = value;
    renderGlobeLayers(ctx, state);
    renderLiveEarthUi(ctx, state);
    return;
  }
  if (action === 'select-weather') {
    state.selectedWeatherSampleId = value;
    renderLiveEarthUi(ctx, state);
    return;
  }
  if (action === 'select-ship') {
    state.selectedShipId = value;
    renderGlobeLayers(ctx, state);
    renderLiveEarthUi(ctx, state);
    return;
  }
  if (action === 'select-aircraft') {
    state.selectedAircraftId = value;
    renderGlobeLayers(ctx, state);
    renderLiveEarthUi(ctx, state);
    return;
  }
  if (action === 'street-provider') {
    state.streetImageryProviderId = value === 'kartaview' ? 'kartaview' : 'panoramax';
    state.streetImageryQueryKey = '';
    const pending = ctx.ensureStreetImagery(state, false);
    renderLiveEarthUi(ctx, state);
    await pending;
    renderLiveEarthUi(ctx, state);
    return;
  }
  if (action === 'select-street-image') {
    state.selectedStreetImageId = value;
    renderLiveEarthUi(ctx, state);
    return;
  }
  if (action === 'focus-street-image') {
    const image = ctx.selectedStreetImage(state);
    if (image && typeof state.selector.api?.setSelection === 'function') {
      state.selector.api.setSelection(image.lat, image.lon, { name: 'Street imagery', focus: true });
    }
    return;
  }
  if (action === 'open-related-layer') {
    await setActiveLayer(ctx, state, value);
    return;
  }
  if (action === 'focus-transport') {
    focusTransportSelection(state, state.activeLayerId === 'ships' ? ctx.selectedShip(state) : ctx.selectedAircraft(state));
    return;
  }
  if (action === 'travel-satellite') {
    const satellite = ctx.selectedSatellitePosition(state);
    if (satellite) ctx.travelToSatellite(state, satellite);
    return;
  }
  if (action === 'travel-earthquake') {
    const event = ctx.selectedEarthquake(state);
    if (event) ctx.travelToEvent(state, event);
    return;
  }
  if (action === 'replay-earthquake') {
    const event = ctx.selectedEarthquake(state) || state.localEvent;
    if (event) startLocalEarthquakeReplay(ctx, state, event);
  }
}

export function syncSelectionWeather(ctx, state, force = false) {
  if (!['weather', 'storms', 'ocean-state'].includes(state.activeLayerId)) return;
  void ctx.ensureSelectionWeather(state, force).then(() => {
    renderWeatherGlobe(ctx, state);
    renderLiveEarthUi(ctx, state);
  });
}

function syncSelectionMarine(ctx, state, force = false) {
  state.marineQueryKey = '';
  const pending = ctx.ensureMarineData(state, force);
  renderLiveEarthUi(ctx, state);
  void pending.then(() => renderLiveEarthUi(ctx, state));
}

export function bindSelectorUi(ctx, state) {
  const ui = state.selector.ui;
  if (!ui || ui.bound) return;
  ui.bound = true;
  ui.exploreModeBtn?.addEventListener('click', () => setPanelMode(state, 'explore'));
  ui.liveEarthModeBtn?.addEventListener('click', () => {
    setPanelMode(state, 'live-earth');
    void ctx.warmImplementedLayers(state, false);
    void refreshActiveLayer(ctx, state, false);
  });
  ui.refreshBtn?.addEventListener('click', () => {
    void refreshActiveLayer(ctx, state, true);
  });
  ui.categoryChips?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-live-earth-action][data-id]') : null;
    if (!(target instanceof HTMLElement)) return;
    void handleUiAction(ctx, state, target.dataset.liveEarthAction, target.dataset.id);
  });
  ui.layerList?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-live-earth-action][data-id]') : null;
    if (!(target instanceof HTMLElement)) return;
    void handleUiAction(ctx, state, target.dataset.liveEarthAction, target.dataset.id);
  });
  ui.details?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-live-earth-action]') : null;
    if (!(target instanceof HTMLElement)) return;
    void handleUiAction(ctx, state, target.dataset.liveEarthAction, target.dataset.id || target.dataset.filter || '');
  });
  ui.details?.addEventListener('scroll', () => {
    ctx.rememberDetailsScroll(state);
  }, { passive: true });
}

export function handleGlobePick(ctx, state, raycaster) {
  if (state.panelMode !== 'live-earth') return false;
  const meshes = state.selector.markerRecords.map((entry) => entry.mesh).filter(Boolean);
  if (!meshes.length) return false;
  const hits = raycaster.intersectObjects(meshes, false);
  const hit = hits && hits.length ? hits[0] : null;
  const meta = hit?.object?.userData?.liveEarth || null;
  if (!meta) return false;
  if (meta.type === 'satellite') {
    void handleUiAction(ctx, state, 'select-satellite', meta.id);
    return true;
  }
  if (meta.type === 'earthquake') {
    void handleUiAction(ctx, state, 'select-earthquake', meta.id);
    return true;
  }
  if (meta.type === 'weather') {
    void handleUiAction(ctx, state, 'select-weather', meta.id);
    return true;
  }
  if (meta.type === 'ship') {
    void handleUiAction(ctx, state, 'select-ship', meta.id);
    return true;
  }
  if (meta.type === 'aircraft') {
    void handleUiAction(ctx, state, 'select-aircraft', meta.id);
    return true;
  }
  return false;
}

export function onSelectorSelectionChanged(ctx, state) {
  if (state.panelMode === 'live-earth' && state.activeLayerId === 'street-imagery') {
    state.streetImageryQueryKey = '';
    const pending = ctx.ensureStreetImagery(state, true);
    renderLiveEarthUi(ctx, state);
    void pending.then(() => renderLiveEarthUi(ctx, state));
    return;
  }
  if (state.panelMode === 'live-earth' && ['weather', 'storms', 'ocean-state'].includes(state.activeLayerId)) {
    if (state.activeLayerId === 'ocean-state') syncSelectionMarine(ctx, state, true);
    syncSelectionWeather(ctx, state, true);
    return;
  }
  if (state.panelMode === 'live-earth' && state.activeLayerId === 'aircraft') {
    state.aircraftQueryKey = '';
    void ctx.ensureAircraftTrafficData(state, true).then(() => {
      renderTransportGlobe(ctx, state);
      renderLiveEarthUi(ctx, state);
    });
    return;
  }
  if (state.panelMode === 'live-earth' && ['ships', 'aircraft'].includes(state.activeLayerId)) {
    renderLiveEarthUi(ctx, state);
  }
}

export function updateSelectorFrame(ctx, state) {
  if (!state.selector.api?.isOpen?.() || state.panelMode !== 'live-earth') return;
  if (state.activeLayerId === 'overview') {
    if ((Date.now() - state.selectorSatelliteTickAt) < 1500) return;
    state.selectorSatelliteTickAt = Date.now();
    void Promise.all([
      ctx.ensureSatellitePositions(state, false),
      ctx.ensureShipTrafficData(state, true),
      ctx.ensureAircraftTrafficData(state, false)
    ]).then(() => {
      renderGlobeLayers(ctx, state);
      renderLiveEarthStatus(ctx, state);
    });
    return;
  }
  if (state.activeLayerId === 'satellites') {
    if ((Date.now() - state.selectorSatelliteTickAt) < 1500) return;
    state.selectorSatelliteTickAt = Date.now();
    void ctx.ensureSatellitePositions(state, false).then(() => {
      renderSatelliteGlobe(ctx, state);
    });
    return;
  }
  if (state.activeLayerId === 'ships') {
    if ((Date.now() - state.shipsLoadedAt) < 1400) return;
    void ctx.ensureShipTrafficData(state, true).then(() => {
      renderTransportGlobe(ctx, state);
      renderLiveEarthStatus(ctx, state);
    });
    return;
  }
  if (state.activeLayerId === 'aircraft') {
    if ((Date.now() - state.aircraftLoadedAt) < 60000) return;
    void ctx.ensureAircraftTrafficData(state, false).then(() => {
      renderTransportGlobe(ctx, state);
      renderLiveEarthStatus(ctx, state);
    });
  }
}

export function refreshForOpenSelector(ctx, state) {
  if (!state.selector.api?.isOpen?.() || state.panelMode !== 'live-earth') return;
  void ctx.warmImplementedLayers(state, false);
  void refreshActiveLayer(ctx, state, false);
}
