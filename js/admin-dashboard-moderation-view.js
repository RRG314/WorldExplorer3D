import {
  buildOsmUrl,
  buildWorldUrl,
  escapeHtml,
  finiteNumber,
  formatDateTime,
  formatRelative,
  optionMarkup,
  pluralize,
  sanitizeText
} from './admin-dashboard-format.js?v=1';

const PRESET_OPTIONS = [
  ['all', 'All presets'],
  ['road', 'Road'],
  ['footway', 'Footpath'],
  ['cycleway', 'Bike Path'],
  ['railway', 'Railway'],
  ['building', 'Building'],
  ['entrance', 'Entrance'],
  ['parking', 'Parking'],
  ['water', 'Water'],
  ['landuse_park', 'Landuse / Park'],
  ['tree', 'Tree'],
  ['poi_marker', 'POI / Marker'],
  ['interior_room', 'Interior Room'],
  ['corridor', 'Corridor'],
  ['stairs', 'Stairs'],
  ['elevator', 'Elevator']
];

const LEGACY_TYPE_OPTIONS = [
  ['all', 'All legacy types'],
  ['place_info', 'Place Info'],
  ['artifact_marker', 'Artifact Marker'],
  ['building_note', 'Building Note'],
  ['interior_seed', 'Interior Seed'],
  ['photo_point', 'Photo Contribution']
];

export function createAdminModerationView(state, refs) {
function selectedOverlayItem() {
  return state.overlayItems.find((item) => item.featureId === state.overlaySelectedId) || null;
}

function selectedLegacyItem() {
  return state.legacyItems.find((item) => item.id === state.legacySelectedId) || null;
}

function renderModerationFilters() {
  if (state.currentModerationMode === 'overlay') {
    refs.moderationFilters.innerHTML = `
      <label>
        Review State
        <select id="overlayReviewState">
          ${optionMarkup([
            ['submitted', 'Submitted'],
            ['approved', 'Approved'],
            ['needs_changes', 'Needs Changes'],
            ['rejected', 'Rejected'],
            ['draft', 'Draft'],
            ['all', 'All states']
          ], state.overlayFilters.reviewState)}
        </select>
      </label>
      <label>
        Preset
        <select id="overlayPresetFilter">${optionMarkup(PRESET_OPTIONS, state.overlayFilters.presetId)}</select>
      </label>
      <label>
        Geometry
        <select id="overlayGeometryFilter">
          ${optionMarkup([
            ['all', 'All geometry'],
            ['Point', 'Point'],
            ['LineString', 'Line'],
            ['Polygon', 'Polygon']
          ], state.overlayFilters.geometryType)}
        </select>
      </label>
      <label>
        Contributor
        <input id="overlayContributorFilter" type="text" maxlength="80" value="${escapeHtml(state.overlayFilters.contributor)}" placeholder="Name or uid">
      </label>
      <label>
        Region
        <input id="overlayRegionFilter" type="text" maxlength="80" value="${escapeHtml(state.overlayFilters.region)}" placeholder="Area key or base feature">
      </label>
      <label>
        Time Window
        <select id="overlayTimeWindow">
          ${optionMarkup([
            ['all', 'All time'],
            ['24h', 'Last 24 hours'],
            ['7d', 'Last 7 days'],
            ['30d', 'Last 30 days']
          ], state.overlayFilters.timeWindow)}
        </select>
      </label>
      <label class="filter-wide">
        Search
        <input id="overlaySearchFilter" type="text" maxlength="80" value="${escapeHtml(state.overlayFilters.search)}" placeholder="Preset, tag, summary, contributor">
      </label>
      <div class="filter-actions">
        <button type="button" class="secondary-btn" id="overlayApplyFilters">Apply Filters</button>
      </div>
    `;
    return;
  }

  refs.moderationFilters.innerHTML = `
    <label>
      Status
      <select id="legacyStatusFilter">
        ${optionMarkup([
          ['pending', 'Pending'],
          ['approved', 'Approved'],
          ['rejected', 'Rejected'],
          ['all', 'All statuses']
        ], state.legacyFilters.status)}
      </select>
    </label>
    <label>
      Type
      <select id="legacyTypeFilter">${optionMarkup(LEGACY_TYPE_OPTIONS, state.legacyFilters.editType)}</select>
    </label>
    <label class="filter-wide">
      Search
      <input id="legacySearchFilter" type="text" maxlength="80" value="${escapeHtml(state.legacyFilters.search)}" placeholder="Title, contributor, building">
    </label>
    <div class="filter-actions">
      <button type="button" class="secondary-btn" id="legacyApplyFilters">Apply Filters</button>
    </div>
  `;
}

function renderModerationSummary() {
  if (state.currentModerationMode === 'overlay') {
    const summary = state.overlaySummary || {};
    refs.moderationSummary.innerHTML = `
      <article class="metric-card"><span class="metric-label">Submitted</span><strong class="metric-value">${escapeHtml(String(summary.submitted || 0))}</strong></article>
      <article class="metric-card"><span class="metric-label">Approved</span><strong class="metric-value">${escapeHtml(String(summary.approved || 0))}</strong></article>
      <article class="metric-card"><span class="metric-label">Needs Changes</span><strong class="metric-value">${escapeHtml(String(summary.needsChanges || 0))}</strong></article>
      <article class="metric-card"><span class="metric-label">Rejected</span><strong class="metric-value">${escapeHtml(String(summary.rejected || 0))}</strong></article>
      <article class="metric-card"><span class="metric-label">Published</span><strong class="metric-value">${escapeHtml(String(summary.published || 0))}</strong></article>
    `;
    return;
  }
  const summary = state.legacySummary || {};
  refs.moderationSummary.innerHTML = `
    <article class="metric-card"><span class="metric-label">Pending</span><strong class="metric-value">${escapeHtml(String(summary.pending || 0))}</strong></article>
    <article class="metric-card"><span class="metric-label">Approved</span><strong class="metric-value">${escapeHtml(String(summary.approved || 0))}</strong></article>
    <article class="metric-card"><span class="metric-label">Rejected</span><strong class="metric-value">${escapeHtml(String(summary.rejected || 0))}</strong></article>
    <article class="metric-card"><span class="metric-label">Reviewer</span><strong class="metric-value">${escapeHtml(sanitizeText(state.legacyReviewer?.displayName || 'Unknown', 40))}</strong></article>
    <article class="metric-card"><span class="metric-label">Email Alerts</span><strong class="metric-value">${escapeHtml(state.legacyNotifications?.configured ? 'Configured' : 'Needs Setup')}</strong></article>
  `;
}

function renderOverlayList() {
  refs.moderationList.innerHTML = state.overlayItems.map((item) => {
    const selected = item.featureId === state.overlaySelectedId;
    return `
      <article class="queue-card${selected ? ' selected' : ''}" data-overlay-id="${escapeHtml(item.featureId)}">
        <div class="queue-card-top">
          <strong>${escapeHtml(item.summary || item.tags?.name || item.presetId || 'Overlay feature')}</strong>
          <span class="status-pill" data-status="${escapeHtml(item.reviewState || 'draft')}">${escapeHtml(item.reviewState || 'draft')}</span>
        </div>
        <div class="queue-card-meta">
          ${escapeHtml(item.presetId || item.featureClass || 'overlay')} • ${escapeHtml(item.geometryType || 'geometry')} • v${escapeHtml(String(item.version || 1))}
        </div>
        <p>${escapeHtml(item.baseFeatureRef?.displayName || item.areaKey || item.tags?.name || 'No base reference')}</p>
        <div class="queue-card-footer">
          <span>${escapeHtml(item.createdByName || 'Explorer')}</span>
          <span>${escapeHtml(formatRelative(item.updatedAtMs || item.createdAtMs))}</span>
        </div>
      </article>
    `;
  }).join('') || '<div class="empty-card">No overlay submissions match the current filter set.</div>';
}

function renderOverlayDetail() {
  const item = selectedOverlayItem();
  if (!item) {
    refs.moderationDetail.innerHTML = '<div class="empty-card">Select an overlay submission to inspect geometry, tags, validation, and moderation history.</div>';
    return;
  }
  const detail = state.overlayDetails.get(item.featureId);
  if (!detail) {
    refs.moderationDetail.innerHTML = '<div class="empty-card">Loading overlay detail…</div>';
    return;
  }
  const issueList = Array.isArray(detail.item?.validation?.issues) ? detail.item.validation.issues : [];
  const revisions = Array.isArray(detail.revisions) ? detail.revisions : [];
  const history = Array.isArray(detail.moderationHistory) ? detail.moderationHistory : [];
  const canModerate = ['submitted', 'approved'].includes(String(detail.item?.reviewState || ''));
  const center = detail.item?.center || detail.item?.bbox || {};
  const lat = finiteNumber(center.lat ?? ((finiteNumber(center.minLat, 0) + finiteNumber(center.maxLat, 0)) / 2), 0);
  const lon = finiteNumber(center.lon ?? ((finiteNumber(center.minLon, 0) + finiteNumber(center.maxLon, 0)) / 2), 0);

  refs.moderationDetail.innerHTML = `
    <div class="detail-header">
      <div>
        <h3>${escapeHtml(detail.item?.summary || detail.item?.presetId || 'Overlay feature')}</h3>
        <p>${escapeHtml(detail.item?.presetId || detail.item?.featureClass || 'overlay')} • ${escapeHtml(detail.item?.geometryType || 'geometry')} • ${escapeHtml(detail.item?.mergeMode || 'additive')}</p>
      </div>
      <span class="status-pill" data-status="${escapeHtml(detail.item?.reviewState || 'draft')}">${escapeHtml(detail.item?.reviewState || 'draft')}</span>
    </div>

    <div class="detail-compare-grid">
      <article class="detail-card">
        <span class="detail-label">Base Reference</span>
        <strong>${escapeHtml(detail.item?.baseFeatureRef?.displayName || detail.item?.baseFeatureRef?.featureId || 'New overlay feature')}</strong>
        <p>${escapeHtml(detail.item?.baseFeatureRef?.featureType || detail.item?.sourceType || 'overlay source')}</p>
      </article>
      <article class="detail-card">
        <span class="detail-label">Overlay Output</span>
        <strong>${escapeHtml(detail.item?.summary || detail.item?.tags?.name || detail.item?.presetId || 'Overlay')}</strong>
        <p>${escapeHtml(`${detail.item?.geometryType || 'Geometry'} • ${detail.item?.worldKind || 'earth'} • ${detail.item?.areaKey || 'local patch'}`)}</p>
      </article>
    </div>

    <div class="detail-grid">
      <article class="detail-card"><span class="detail-label">Submitted By</span><strong>${escapeHtml(detail.item?.createdByName || detail.item?.createdBy || 'Explorer')}</strong><p>${escapeHtml(formatDateTime(detail.item?.submittedAtMs || detail.item?.createdAtMs))}</p></article>
      <article class="detail-card"><span class="detail-label">3D Shell</span><strong>${escapeHtml(String(detail.item?.threeD?.buildingLevels ?? '-'))} levels</strong><p>Height ${escapeHtml(String(detail.item?.threeD?.height ?? '-'))}m • roof ${escapeHtml(detail.item?.threeD?.roofShape || 'flat')}</p></article>
      <article class="detail-card"><span class="detail-label">Entrances</span><strong>${escapeHtml(String(detail.item?.threeD?.entranceCount || 0))}</strong><p>Layer ${escapeHtml(String(detail.item?.threeD?.layer ?? 0))} • bridge ${detail.item?.threeD?.bridge ? 'yes' : 'no'} • tunnel ${detail.item?.threeD?.tunnel ? 'yes' : 'no'}</p></article>
      <article class="detail-card"><span class="detail-label">Validation</span><strong>${detail.item?.validation?.valid === false ? 'Issues found' : 'Ready'}</strong><p>${escapeHtml(pluralize(issueList.length, 'issue'))}</p></article>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Contributor Notes</div>
      <div class="detail-note">${escapeHtml(detail.item?.submission?.contributorNote || detail.item?.submission?.generatedSummary || 'No contributor note was provided.')}</div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Tags and Mapping</div>
      <div class="tag-row">
        ${['name', 'highway', 'railway', 'building', 'amenity', 'landuse', 'natural', 'surface']
          .filter((key) => detail.item?.tags?.[key])
          .map((key) => `<span class="tag-chip">${escapeHtml(`${key}: ${detail.item.tags[key]}`)}</span>`)
          .join('') || '<span class="muted-inline">No summary tags stored.</span>'}
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Validation Guidance</div>
      ${issueList.length
        ? `<ul class="issue-list">${issueList.map((issue) => `<li><strong>${escapeHtml(issue.severity || 'info')}</strong> ${escapeHtml(issue.message || '')}${issue.hint ? `<div class="issue-hint">${escapeHtml(issue.hint)}</div>` : ''}</li>`).join('')}</ul>`
        : '<div class="detail-note">No validation issues are attached to this overlay revision.</div>'}
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Moderation Note</div>
      <textarea id="overlayDecisionNote" maxlength="320" placeholder="Add reviewer notes for approval, rejection, or requested changes.">${escapeHtml(detail.item?.moderation?.note || '')}</textarea>
      <div class="action-row">
        <a class="secondary-btn" href="${escapeHtml(buildWorldUrl(lat, lon, detail.item?.summary || detail.item?.presetId || 'Overlay'))}" target="_blank" rel="noreferrer">Open In World</a>
        <a class="secondary-btn" href="${escapeHtml(buildOsmUrl(lat, lon))}" target="_blank" rel="noreferrer">Open In OSM</a>
        <button type="button" class="primary-btn" id="overlayApproveBtn" ${canModerate ? '' : 'disabled'}>Approve</button>
        <button type="button" class="secondary-btn" id="overlayNeedsChangesBtn" ${canModerate ? '' : 'disabled'}>Needs Changes</button>
        <button type="button" class="danger-btn" id="overlayRejectBtn" ${canModerate ? '' : 'disabled'}>Reject</button>
      </div>
    </div>

    <div class="detail-split">
      <section class="detail-section">
        <div class="detail-section-title">Revision History</div>
        <div class="timeline-list">
          ${revisions.map((entry) => `
            <article class="timeline-card">
              <strong>${escapeHtml(entry.action || 'revision')}</strong>
              <span>${escapeHtml(formatDateTime(entry.createdAtMs))}</span>
              <p>${escapeHtml(entry.diffSummary || 'No revision summary provided.')}</p>
            </article>
          `).join('') || '<div class="detail-note">No stored revisions yet.</div>'}
        </div>
      </section>
      <section class="detail-section">
        <div class="detail-section-title">Moderation History</div>
        <div class="timeline-list">
          ${history.map((entry) => `
            <article class="timeline-card">
              <strong>${escapeHtml(entry.toState || entry.action || 'status update')}</strong>
              <span>${escapeHtml(formatDateTime(entry.createdAtMs))}</span>
              <p>${escapeHtml(entry.actorName || entry.actorUid || 'Unknown actor')} • ${escapeHtml(entry.note || 'No note')}</p>
            </article>
          `).join('') || '<div class="detail-note">No moderation history recorded yet.</div>'}
        </div>
      </section>
    </div>
  `;
}

function renderLegacyList() {
  refs.moderationList.innerHTML = state.legacyItems.map((item) => {
    const selected = item.id === state.legacySelectedId;
    return `
      <article class="queue-card${selected ? ' selected' : ''}" data-legacy-id="${escapeHtml(item.id)}">
        <div class="queue-card-top">
          <strong>${escapeHtml(item.preview?.title || item.title || 'Legacy contribution')}</strong>
          <span class="status-pill" data-status="${escapeHtml(item.status || 'pending')}">${escapeHtml(item.status || 'pending')}</span>
        </div>
        <div class="queue-card-meta">${escapeHtml(item.editTypeLabel || item.editType || 'Contribution')} • ${escapeHtml(item.preview?.locationLabel || item.locationLabel || 'World')}</div>
        <p>${escapeHtml(item.payload?.note || item.note || 'No submission note.')}</p>
        <div class="queue-card-footer">
          <span>${escapeHtml(item.userDisplayName || 'Explorer')}</span>
          <span>${escapeHtml(formatRelative(item.createdAtMs))}</span>
        </div>
      </article>
    `;
  }).join('') || '<div class="empty-card">No legacy contributions match the current moderation filter set.</div>';
}

function renderLegacyDetail() {
  const item = selectedLegacyItem();
  if (!item) {
    refs.moderationDetail.innerHTML = '<div class="empty-card">Select a legacy contribution to review its note, target, and moderation status.</div>';
    return;
  }
  const canModerate = item.status === 'pending';
  refs.moderationDetail.innerHTML = `
    <div class="detail-header">
      <div>
        <h3>${escapeHtml(item.preview?.title || item.title || 'Legacy contribution')}</h3>
        <p>${escapeHtml(item.editTypeLabel || item.editType || 'Contribution')} • ${escapeHtml(item.preview?.locationLabel || item.locationLabel || 'World')}</p>
      </div>
      <span class="status-pill" data-status="${escapeHtml(item.status || 'pending')}">${escapeHtml(item.status || 'pending')}</span>
    </div>

    <div class="detail-grid">
      <article class="detail-card"><span class="detail-label">Submitted By</span><strong>${escapeHtml(item.userDisplayName || 'Explorer')}</strong><p>${escapeHtml(formatDateTime(item.createdAtMs))}</p></article>
      <article class="detail-card"><span class="detail-label">World</span><strong>${escapeHtml(item.worldKind || 'earth')}</strong><p>${escapeHtml(item.areaKey || 'No area key')}</p></article>
      <article class="detail-card"><span class="detail-label">Building</span><strong>${escapeHtml(item.target?.buildingLabel || '-')}</strong><p>${escapeHtml(item.target?.destinationLabel || item.target?.locationLabel || 'World target')}</p></article>
      <article class="detail-card"><span class="detail-label">Coordinates</span><strong>${escapeHtml(`${finiteNumber(item.target?.lat, 0).toFixed(5)}, ${finiteNumber(item.target?.lon, 0).toFixed(5)}`)}</strong><p>${escapeHtml(item.target?.anchorKind || 'world')}</p></article>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Submission Note</div>
      <div class="detail-note">${escapeHtml(item.payload?.note || item.note || 'No note provided.')}</div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Moderator Note</div>
      <textarea id="legacyDecisionNote" maxlength="200" placeholder="Add a short reason for the decision.">${escapeHtml(item.moderation?.decisionNote || '')}</textarea>
      <div class="action-row">
        <a class="secondary-btn" href="${escapeHtml(buildWorldUrl(item.target?.lat, item.target?.lon, item.preview?.locationLabel || item.preview?.title || 'Legacy Contribution'))}" target="_blank" rel="noreferrer">Open In World</a>
        <a class="secondary-btn" href="${escapeHtml(item.reviewerOnly?.openStreetMapUrl || buildOsmUrl(item.target?.lat, item.target?.lon))}" target="_blank" rel="noreferrer">Open In OSM</a>
        <button type="button" class="primary-btn" id="legacyApproveBtn" ${canModerate ? '' : 'disabled'}>Approve</button>
        <button type="button" class="danger-btn" id="legacyRejectBtn" ${canModerate ? '' : 'disabled'}>Reject</button>
      </div>
    </div>
  `;
}

function renderModeration() {
  refs.moderationTabs.querySelectorAll('button').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === state.currentModerationMode);
  });
  renderModerationFilters();
  renderModerationSummary();
  if (state.currentModerationMode === 'overlay') {
    renderOverlayList();
    renderOverlayDetail();
  } else {
    renderLegacyList();
    renderLegacyDetail();
  }
}

return { renderModeration, renderOverlayList, renderOverlayDetail, renderLegacyList, renderLegacyDetail };
}
