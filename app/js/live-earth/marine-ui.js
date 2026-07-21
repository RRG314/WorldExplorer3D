function formatNumber(value, digits = 1) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : '--';
}

function formatObservationAge(observedAt) {
  const ageMs = Date.now() - new Date(observedAt || 0).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'recent';
  const minutes = Math.round(ageMs / 60000);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} hr ago`;
}

function relevantTidePredictions(predictions = []) {
  const threshold = Date.now() - (3 * 60 * 60 * 1000);
  const upcoming = predictions.filter((entry) => new Date(entry.validAt).getTime() >= threshold);
  return (upcoming.length ? upcoming : predictions.slice(-4)).slice(0, 4);
}

function renderMarineDetails(ctx, state) {
  const marine = state.marineSnapshot;
  const model = marine?.model || null;
  const hasModelGuidance = model?.hasGuidance === true;
  const station = marine?.station || null;
  const observation = marine?.observation || null;
  const samples = ctx.oceanSamples(state);
  const selectedLocation = ctx.selectorSelection(state);
  const localWorld = typeof ctx.appCtx.getWeatherSnapshot === 'function' ? ctx.appCtx.getWeatherSnapshot() : null;
  const localSeaState = String(ctx.appCtx.boatMode?.seaState || 'moderate').replace(/_/g, ' ');
  const localIntensity = Math.round(ctx.stateWaveIntensity() * 100);
  const waveLine = model?.waveHeightM != null
    ? `Wave ${formatNumber(model.waveHeightM)} m · from ${formatNumber(model.waveDirectionDeg, 0)}° · ${formatNumber(model.wavePeriodS)} s period`
    : 'Wave guidance is unavailable at this model grid.';
  const modelDetails = [
    model?.seaSurfaceTemperatureC != null ? `surface ${formatNumber(model.seaSurfaceTemperatureC)}°C` : '',
    model?.currentVelocityKph != null ? `current ${formatNumber(model.currentVelocityKph)} km/h toward ${formatNumber(model.currentDirectionDeg, 0)}°` : '',
    model?.seaLevelHeightMslM != null ? `modeled sea level ${formatNumber(model.seaLevelHeightMslM, 2)} m MSL` : ''
  ].filter(Boolean).join(' · ');
  const tideList = relevantTidePredictions(marine?.predictions).map((prediction) => `
    <div class="globe-selector-live-list-item">
      <span>${ctx.escapeHtml(`${prediction.type === 'high' ? 'High' : 'Low'} tide · ${formatNumber(prediction.valueM, 2)} m ${prediction.datum}`)}</span>
      <small>${ctx.escapeHtml(new Date(prediction.validAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }))} · predicted</small>
    </div>
  `).join('');
  const stationDetails = station ? `
    <div class="globe-selector-live-detail-heading">NOAA station · ${ctx.escapeHtml(station.name)}</div>
    <div class="globe-selector-live-detail-meta">${ctx.escapeHtml(`${formatNumber(station.distanceKm, 0)} km from selection · station ${station.id}`)}</div>
    ${observation ? `<div class="globe-selector-live-detail-copy">${ctx.escapeHtml(`Observed water level ${formatNumber(observation.valueM, 2)} m ${observation.datum}`)}</div>
      <div class="globe-selector-live-detail-meta">${ctx.escapeHtml(`${observation.quality} · ${formatObservationAge(observation.observedAt)} · NOAA CO-OPS observation`)}</div>` : '<div class="globe-selector-live-detail-meta">The station did not return a current water-level observation.</div>'}
    ${tideList ? `<div class="globe-selector-live-list">${tideList}</div>` : '<div class="globe-selector-live-detail-meta">No tide predictions are available for this station.</div>'}
    <div class="globe-selector-live-detail-actions"><a class="globe-selector-live-action-btn secondary" href="https://tidesandcurrents.noaa.gov/stationhome.html?id=${encodeURIComponent(station.id)}" target="_blank" rel="noopener noreferrer">Open NOAA Station</a></div>
  ` : `<div class="globe-selector-live-detail-meta">No active NOAA water-level station is within ${marine?.noaaCoverageKm || 250} km.${hasModelGuidance ? ' Global model guidance remains available.' : ''}</div>`;
  ctx.setDetailsHtml(state, `
    <div class="globe-selector-live-detail-card">
      <div class="globe-selector-live-detail-heading">${ctx.escapeHtml(selectedLocation?.name || 'Selected marine conditions')}</div>
      ${state.marineLoading ? '<div class="globe-selector-live-loading">Loading marine model and station coverage…</div>' : ''}
      ${state.marineError ? `<div class="globe-selector-live-detail-meta">${ctx.escapeHtml(state.marineError)}</div>` : ''}
      ${hasModelGuidance ? `<div class="globe-selector-live-detail-copy">${ctx.escapeHtml(waveLine)}</div>
        ${modelDetails ? `<div class="globe-selector-live-detail-meta">${ctx.escapeHtml(modelDetails)}</div>` : ''}
        <div class="globe-selector-live-detail-meta">${ctx.escapeHtml(`Open-Meteo Marine model · grid ${formatNumber(model.gridDistanceKm, 1)} km from selection · modeled guidance, not for navigation`)}</div>` : ''}
      ${model && !hasModelGuidance ? '<div class="globe-selector-live-detail-copy">No Open-Meteo marine guidance is available for this inland model cell.</div>' : ''}
      ${stationDetails}
      <div class="globe-selector-live-detail-heading">World simulation</div>
      <div class="globe-selector-live-detail-meta">${ctx.escapeHtml(`Current 3D world sea state: ${localSeaState} · wave intensity ${localIntensity}%`)}</div>
      ${localWorld ? `<div class="globe-selector-live-detail-meta">${ctx.escapeHtml(`Local wind ${Math.round(localWorld.windMph || 0)} mph · ${localWorld.conditionLabel || 'Weather'}`)}</div>` : ''}
      <div class="globe-selector-live-detail-meta">${ctx.escapeHtml(`${samples.length} regional weather samples support the globe view. Runtime wave physics remain a separate simulation owner.`)}</div>
    </div>
  `);
}

export { renderMarineDetails };
