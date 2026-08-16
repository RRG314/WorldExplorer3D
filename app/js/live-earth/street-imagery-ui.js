import { getDataSource } from '../geospatial/data-contract.js?v=3';

function selectedStreetImage(state) {
  return state.streetImageryItems.find((item) => item.id === state.selectedStreetImageId) || state.streetImageryItems[0] || null;
}

function formatCaptureDate(value) {
  if (!value) return 'Capture date unavailable';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Capture date unavailable';
  return `Captured ${date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}`;
}

function renderProviderButtons(ctx, state) {
  return ['panoramax', 'kartaview'].map((providerId) => {
    const source = getDataSource(providerId);
    const active = providerId === state.streetImageryProviderId ? ' active' : '';
    return `<button class="globe-selector-live-filter${active}" type="button" data-live-earth-action="street-provider" data-id="${providerId}">${ctx.escapeHtml(source?.label || providerId)}</button>`;
  }).join('');
}

function renderImageList(ctx, state) {
  return state.streetImageryItems.map((item) => {
    const active = item.id === state.selectedStreetImageId ? ' active' : '';
    const distance = Number.isFinite(item.distanceM) ? `${Math.round(item.distanceM)} m away` : 'Nearby';
    return `<button class="globe-selector-street-thumb${active}" type="button" data-live-earth-action="select-street-image" data-id="${ctx.escapeHtml(item.id)}">
      <img src="${ctx.escapeHtml(item.thumbnailUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">
      <span>${ctx.escapeHtml(formatCaptureDate(item.capturedAt))}</span>
      <small>${ctx.escapeHtml(distance)}</small>
    </button>`;
  }).join('');
}

export function renderStreetImageryDetails(ctx, state) {
  const source = getDataSource(state.streetImageryProviderId);
  const selected = selectedStreetImage(state);
  const selection = ctx.selectorSelection(state);
  const providerButtons = renderProviderButtons(ctx, state);
  const externalUrl = state.streetImageryExternalUrl || '';

  if (state.streetImageryLoading) {
    ctx.setDetailsHtml(state, `
      <div class="globe-selector-live-detail-card">
        <div class="globe-selector-live-filter-row">${providerButtons}</div>
        <div class="globe-selector-live-detail-heading">Street imagery near ${ctx.escapeHtml(selection?.name || 'the selected point')}</div>
        <div class="globe-selector-live-loading">Checking ${ctx.escapeHtml(source?.label || 'the provider')} coverage…</div>
      </div>
    `);
    return;
  }

  if (!selected) {
    const status = state.streetImageryError
      ? state.streetImageryError
      : `No ${source?.label || 'street'} imagery was found within ${state.streetImageryRadiusM} m.`;
    ctx.setDetailsHtml(state, `
      <div class="globe-selector-live-detail-card">
        <div class="globe-selector-live-filter-row">${providerButtons}</div>
        <div class="globe-selector-live-detail-heading">Street imagery near ${ctx.escapeHtml(selection?.name || 'the selected point')}</div>
        <div class="globe-selector-live-detail-copy">${ctx.escapeHtml(status)}</div>
        <div class="globe-selector-live-detail-meta">${ctx.escapeHtml(source?.label || '')} · ${ctx.escapeHtml(source?.licenseId || '')} · community-observed imagery</div>
        ${externalUrl ? `<div class="globe-selector-live-detail-actions"><a class="globe-selector-live-action-btn secondary" href="${ctx.escapeHtml(externalUrl)}" target="_blank" rel="noopener noreferrer">Open Coverage Map</a></div>` : ''}
      </div>
    `);
    return;
  }

  const heading = Number.isFinite(selected.headingDeg) ? ` · heading ${Math.round(selected.headingDeg)}°` : '';
  const distance = Number.isFinite(selected.distanceM) ? `${Math.round(selected.distanceM)} m from selection` : 'Near selection';
  ctx.setDetailsHtml(state, `
    <div class="globe-selector-live-detail-card">
      <div class="globe-selector-live-filter-row">${providerButtons}</div>
      <div class="globe-selector-live-detail-heading">${ctx.escapeHtml(selection?.name || 'Selected street imagery')}</div>
      <a class="globe-selector-street-image" href="${ctx.escapeHtml(selected.viewerUrl)}" target="_blank" rel="noopener noreferrer">
        <img src="${ctx.escapeHtml(selected.imageUrl || selected.thumbnailUrl)}" alt="Street-level view near ${ctx.escapeHtml(selection?.name || 'the selected location')}" loading="eager" referrerpolicy="no-referrer">
      </a>
      <div class="globe-selector-live-detail-copy">${ctx.escapeHtml(`${formatCaptureDate(selected.capturedAt)}${heading}`)}</div>
      <div class="globe-selector-live-detail-meta">${ctx.escapeHtml(`${distance} · ${selected.contributor}`)}</div>
      <div class="globe-selector-live-detail-meta">${ctx.escapeHtml(`${selected.provenance.sourceLabel} · ${selected.provenance.licenseId} · ${selected.provenance.truthType}`)}</div>
      <div class="globe-selector-live-detail-actions">
        <a class="globe-selector-live-action-btn" href="${ctx.escapeHtml(selected.viewerUrl)}" target="_blank" rel="noopener noreferrer">Open Sequence</a>
        <button class="globe-selector-live-action-btn secondary" type="button" data-live-earth-action="focus-street-image">Focus Location</button>
      </div>
      <div class="globe-selector-street-list">${renderImageList(ctx, state)}</div>
    </div>
  `);
}

export { selectedStreetImage };
