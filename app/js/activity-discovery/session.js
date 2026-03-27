import { ctx as appCtx } from '../shared-context.js?v=55';
import { buildActivityCatalog, currentReferencePose } from './catalog.js?v=5';
import { getStoredActivityById, listStoredActivities, removeStoredActivity } from './library.js?v=2';
import { bindMarkerClicks, refreshWorldMarkers } from './markers.js?v=3';
import {
  distanceToStart,
  getCompletionState,
  getRuntimeSnapshot,
  navigateToActivityStart,
  replayLastActivity,
  startActivity,
  stopActivity,
  updateActivityRuntime
} from './runtime.js?v=5';
import {
  discoveryActionLabel,
  discoveryBadgeForActivity,
  discoveryCategoryForActivity,
  discoveryVisibilityLabel,
  getDiscoveryCategory,
  listDiscoveryCategories,
  sanitizeText
} from './schema.js?v=3';
import { syncOwnCreatorActivityStats } from '../../../js/creator-profile-api.js?v=1';

const state = {
  active: false,
  initialized: false,
  catalog: [],
  selectedId: '',
  search: '',
  categoryId: 'all',
  scope: 'all',
  sort: 'recommended',
  status: 'Loading activities...',
  nearbyPromptId: '',
  lastRefreshAt: 0,
  lastRef: null,
  promptEnabled: false
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function refs() {
  return {
    panel: document.getElementById('activityDiscoveryPanel'),
    status: document.getElementById('activityDiscoveryStatus'),
    search: document.getElementById('activityDiscoverySearchInput'),
    sort: document.getElementById('activityDiscoverySortSelect'),
    scope: document.getElementById('activityDiscoveryScopeChips'),
    categories: document.getElementById('activityDiscoveryCategoryChips'),
    featured: document.getElementById('activityDiscoveryFeatured'),
    list: document.getElementById('activityDiscoveryList'),
    detail: document.getElementById('activityDiscoveryDetail'),
    prompt: document.getElementById('activityDiscoveryPrompt'),
    promptTitle: document.getElementById('activityDiscoveryPromptTitle'),
    promptMeta: document.getElementById('activityDiscoveryPromptMeta'),
    runHud: document.getElementById('activityRunHud'),
    runTitle: document.getElementById('activityRunTitle'),
    runStatus: document.getElementById('activityRunStatus'),
    runProgress: document.getElementById('activityRunProgress')
  };
}

function selectedActivity() {
  const id = sanitizeText(state.selectedId, 120).toLowerCase();
  return state.catalog.find((entry) => entry.id === id) || null;
}

function filteredCatalog() {
  const search = sanitizeText(state.search, 120).toLowerCase();
  let items = state.catalog.slice();
  if (state.scope === 'nearby') {
    items = items.filter((entry) => entry.isNearby);
  } else if (state.scope === 'featured') {
    items = items.filter((entry) => entry.featured || entry.isWeekly);
  } else if (state.scope === 'rooms') {
    items = items.filter((entry) => entry.sourceType === 'room' || entry.sourceType === 'room_activity');
  } else if (state.scope === 'creator') {
    items = items.filter((entry) => entry.sourceType === 'creator');
  }
  if (state.categoryId !== 'all') {
    items = items.filter((entry) => discoveryCategoryForActivity(entry) === state.categoryId);
  }
  if (search) {
    items = items.filter((entry) => {
      const haystack = `${entry.title} ${entry.description} ${entry.locationLabel} ${entry.creatorName} ${entry.badge}`.toLowerCase();
      return haystack.includes(search);
    });
  }
  if (state.sort === 'title') {
    items.sort((a, b) => a.title.localeCompare(b.title));
  } else if (state.sort === 'duration') {
    items.sort((a, b) => finiteNumber(a.estimatedMinutes, 0) - finiteNumber(b.estimatedMinutes, 0));
  } else {
    items.sort((a, b) => {
      const scoreA = (a.featured ? 35 : 0) + (a.isNearby ? 18 : 0) - finiteNumber(a.distanceMeters, 0) * 0.03;
      const scoreB = (b.featured ? 35 : 0) + (b.isNearby ? 18 : 0) - finiteNumber(b.distanceMeters, 0) * 0.03;
      return scoreB - scoreA;
    });
  }
  return items;
}

function featuredActivities() {
  return state.catalog.filter((entry) => entry.featured || entry.isWeekly).slice(0, 4);
}

function visibleWorldActivities() {
  const selected = selectedActivity();
  const nearby = state.catalog
    .filter((entry) => finiteNumber(entry.distanceMeters, Infinity) < 2200 && (entry.isNearby || entry.featured || entry.sourceType === 'creator' || entry.sourceType === 'room' || entry.sourceType === 'room_activity'))
    .slice(0, 12);
  const deduped = [];
  const seen = new Set();
  [selected, ...nearby].forEach((entry) => {
    if (!entry || seen.has(entry.id)) return;
    seen.add(entry.id);
    deduped.push(entry);
  });
  return deduped;
}

function updateExternalState() {
  const runtime = getRuntimeSnapshot();
  const activitiesVisible = appCtx.mapLayers?.activities !== false && state.active;
  const visible = activitiesVisible ? visibleWorldActivities() : [];
  appCtx.activityDiscoveryCatalog = state.catalog.slice();
  appCtx.activityDiscoveryMapMarkers = activitiesVisible
    ? state.catalog
      .filter((entry) => (entry.featured || entry.isNearby || entry.sourceType === 'creator' || entry.sourceType === 'room') && Number.isFinite(entry.startPoint?.x) && Number.isFinite(entry.startPoint?.z))
      .filter((entry) => entry.sourceType !== 'room_activity' || appCtx.mapLayers?.activities !== false)
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        x: entry.startPoint.x,
        z: entry.startPoint.z,
        color: entry.color,
        categoryId: discoveryCategoryForActivity(entry),
        featured: entry.featured,
        distanceMeters: entry.distanceMeters
      }))
    : [];
  appCtx.activityDiscoverySelectedId = sanitizeText(state.selectedId, 120).toLowerCase();
  refreshWorldMarkers(
    visible,
    activitiesVisible ? selectedActivity() : null,
    activitiesVisible ? runtime : null,
    { showRoutePreview: activitiesVisible && !runtime.active }
  );
}

function cardHtml(activity = {}) {
  const distance = finiteNumber(activity.distanceMeters, 0);
  const completion = getCompletionState(activity.id);
  const completionText = completion?.count ? ` • ${completion.count} completed` : '';
  return `
    <button type="button" class="activityDiscoveryCard ${activity.id === state.selectedId ? 'selected' : ''}" data-activity-select="${escapeHtml(activity.id)}">
      <div class="activityDiscoveryCardHead">
        <span class="activityDiscoveryCardBadge" style="border-color:${escapeHtml(activity.color)};color:${escapeHtml(activity.color)}">${escapeHtml(discoveryBadgeForActivity(activity))}</span>
        <span class="activityDiscoveryCardDistance">${escapeHtml(distance > 999 ? `${(distance / 1000).toFixed(1)}km` : `${distance}m`)}</span>
      </div>
      <div class="activityDiscoveryCardTitle">${escapeHtml(activity.icon)} ${escapeHtml(activity.title)}</div>
      <div class="activityDiscoveryCardMeta">${escapeHtml(activity.locationLabel)} • ${escapeHtml(activity.traversalMode)} • Created by ${escapeHtml(activity.creatorName)}${escapeHtml(completionText)}</div>
      <div class="activityDiscoveryCardText">${escapeHtml(activity.description)}</div>
    </button>
  `;
}

function renderDetail() {
  const refsNow = refs();
  if (!refsNow.detail) return;
  const activity = selectedActivity();
  if (!activity) {
    refsNow.detail.innerHTML = `
      <div class="activityDiscoveryEmptyDetail">
        <div class="activityDiscoveryDetailTitle">Select an activity</div>
        <div class="activityDiscoveryDetailText">Choose a world activity, room session, or creator-built route to inspect it and start.</div>
      </div>
    `;
    return;
  }
  const completion = getCompletionState(activity.id);
  const runtime = getRuntimeSnapshot();
  const distance = finiteNumber(activity.distanceMeters, 0);
  const far = activity.sourceType !== 'room' && distanceToStart(activity) > 90;
  const roomActivityManager = activity.sourceType === 'room_activity' && typeof appCtx.canManageCurrentRoomActivities === 'function' && appCtx.canManageCurrentRoomActivities();
  const roomActivityRunning = activity.sourceType === 'room_activity'
    && sanitizeText(appCtx.getCurrentMultiplayerRoomActivity?.()?.activityId || '', 120).toLowerCase() === sanitizeText(activity.id || '', 120).toLowerCase();
  const route = Array.isArray(activity.previewRoute) ? activity.previewRoute : [];
  refsNow.detail.innerHTML = `
    <div class="activityDiscoveryDetailHead">
      <div class="activityDiscoveryDetailBadge" style="border-color:${escapeHtml(activity.color)};color:${escapeHtml(activity.color)}">${escapeHtml(activity.badge)}</div>
      <div class="activityDiscoveryDetailTitle">${escapeHtml(activity.title)}</div>
      <div class="activityDiscoveryDetailMeta">${escapeHtml(activity.locationLabel)} • ${escapeHtml(activity.traversalMode)} • ${escapeHtml(discoveryVisibilityLabel(activity))}</div>
    </div>
    <div class="activityDiscoveryDetailText">${escapeHtml(activity.description)}</div>
    <div class="activityDiscoveryStatGrid">
      <div><span>Creator</span><strong><button type="button" class="activityDiscoveryCreatorLink" id="activityDiscoveryCreatorInline">${escapeHtml(activity.creatorAvatar || '🌍')} ${escapeHtml(activity.creatorName)}</button></strong></div>
      <div><span>Difficulty</span><strong>${escapeHtml(activity.difficulty)}</strong></div>
      <div><span>Duration</span><strong>${escapeHtml(`${activity.estimatedMinutes} min`)}</strong></div>
      <div><span>Distance</span><strong>${escapeHtml(distance > 999 ? `${(distance / 1000).toFixed(1)}km` : `${distance}m`)}</strong></div>
    </div>
    <div class="activityDiscoveryDetailActions">
      <button type="button" class="primary" id="activityDiscoveryPrimaryAction">${escapeHtml(activity.sourceType === 'room' ? 'Join Room' : activity.sourceType === 'room_activity' ? roomActivityRunning ? 'Join Running Game' : roomActivityManager ? 'Start For Room' : 'Wait For Host' : far ? 'Go To Start' : discoveryActionLabel(activity))}</button>
      <button type="button" class="secondary" id="activityDiscoveryReplayAction">${escapeHtml(completion?.count || runtime.activityId === activity.id ? 'Replay' : 'Preview Route')}</button>
      ${activity.creatorId || activity.creatorName ? '<button type="button" class="secondary" id="activityDiscoveryCreatorAction">View Creator</button>' : ''}
      ${activity.sourceType === 'creator' ? '<button type="button" class="secondary" id="activityDiscoveryDeleteSavedAction">Remove Saved</button>' : ''}
    </div>
    <div class="activityDiscoveryDetailSection">
      <div class="activityDiscoveryDetailSectionTitle">Route / Anchors</div>
      <div class="activityDiscoveryRouteList">
        ${route.map((anchor, index) => `<div class="activityDiscoveryRouteRow"><span>${index + 1}</span><strong>${escapeHtml(anchor.label)}</strong><em>${escapeHtml(anchor.typeId.replace(/_/g, ' '))}</em></div>`).join('') || '<div class="activityDiscoveryEmptyState">No route preview is available for this activity.</div>'}
      </div>
    </div>
    <div class="activityDiscoveryDetailSection">
      <div class="activityDiscoveryDetailSectionTitle">Completion</div>
      <div class="activityDiscoveryCompletionText">${completion?.count ? `Completed ${completion.count} time${completion.count === 1 ? '' : 's'}${completion.bestTimeMs ? ` • best ${(completion.bestTimeMs / 1000).toFixed(1)}s` : ''}` : 'Not completed yet on this device.'}</div>
    </div>
  `;
}

function renderPrompt() {
  const refsNow = refs();
  if (!refsNow.prompt || !state.promptEnabled || state.active || appCtx.mapLayers?.activities === false || getRuntimeSnapshot().active) {
    refsNow.prompt?.classList.remove('show');
    return;
  }
  const candidate = state.catalog.find((entry) => entry.id === state.nearbyPromptId) || null;
  if (!candidate) {
    refsNow.prompt.classList.remove('show');
    return;
  }
  refsNow.promptTitle.textContent = `${candidate.icon} ${candidate.title}`;
  refsNow.promptMeta.textContent = `${candidate.locationLabel} • ${Math.round(candidate.distanceMeters)}m • ${candidate.traversalMode}`;
  refsNow.prompt.classList.add('show');
}

function renderRunHud() {
  const runtime = getRuntimeSnapshot();
  const refsNow = refs();
  if (!refsNow.runHud) return;
  document.body.classList.toggle('activity-running', runtime.active);
  refsNow.runHud.classList.toggle('show', runtime.active);
  if (!runtime.active) return;
  refsNow.runTitle.textContent = runtime.activityTitle || 'Activity Running';
  refsNow.runStatus.textContent = runtime.message || 'Move to the next target.';
  refsNow.runProgress.textContent = `${runtime.completedCount} cleared`;
}

function renderUi() {
  const refsNow = refs();
  if (!refsNow.panel) return;
  document.body.classList.toggle('activity-browser-open', state.active);
  refsNow.panel.classList.toggle('show', state.active);
  if (refsNow.status) refsNow.status.textContent = state.status;
  if (refsNow.search && refsNow.search.value !== state.search) refsNow.search.value = state.search;
  if (refsNow.sort && refsNow.sort.value !== state.sort) refsNow.sort.value = state.sort;
  if (refsNow.scope) {
    refsNow.scope.innerHTML = [
      ['all', 'All'],
      ['nearby', 'Nearby'],
      ['featured', 'Featured'],
      ['creator', 'Creator'],
      ['rooms', 'Room Games']
    ].map(([id, label]) => `<button type="button" class="${state.scope === id ? 'active' : ''}" data-activity-scope="${escapeHtml(id)}">${escapeHtml(label)}</button>`).join('');
  }
  if (refsNow.categories) {
    refsNow.categories.innerHTML = listDiscoveryCategories()
      .filter((entry) => entry.id !== 'nearby' && entry.id !== 'featured' && entry.id !== 'creator' && entry.id !== 'room')
      .map((entry) => `<button type="button" class="${state.categoryId === entry.id ? 'active' : ''}" data-activity-category="${escapeHtml(entry.id)}">${escapeHtml(entry.icon)} ${escapeHtml(entry.label)}</button>`)
      .join('');
  }
  if (refsNow.featured) {
    const featured = featuredActivities();
    refsNow.featured.innerHTML = featured.length > 0
      ? featured.map((activity) => `
          <button type="button" class="activityDiscoveryFeaturedCard" data-activity-select="${escapeHtml(activity.id)}">
            <span>${escapeHtml(activity.icon)}</span>
            <strong>${escapeHtml(activity.title)}</strong>
            <em>${escapeHtml(activity.locationLabel)}</em>
          </button>
        `).join('')
      : '<div class="activityDiscoveryEmptyState">No featured activities are available in this area yet.</div>';
  }
  if (refsNow.list) {
    const items = filteredCatalog();
    refsNow.list.innerHTML = items.length > 0
      ? items.map(cardHtml).join('')
      : '<div class="activityDiscoveryEmptyState">No activities match the current filters here yet.</div>';
  }
  renderDetail();
  renderPrompt();
  renderRunHud();
}

function refreshCatalog(force = false) {
  const now = performance.now();
  const ref = currentReferencePose();
  const moved = !state.lastRef || Math.hypot(ref.x - state.lastRef.x, ref.z - state.lastRef.z) > 90;
  if (!force && now - finiteNumber(state.lastRefreshAt, 0) < 2200 && !moved) return false;
  if (!appCtx.gameStarted || appCtx.worldLoading) return false;
  state.lastRefreshAt = now;
  state.lastRef = ref;
  state.catalog = buildActivityCatalog();
  if (!state.selectedId && state.catalog[0]) state.selectedId = state.catalog[0].id;
  if (state.selectedId && !state.catalog.find((entry) => entry.id === state.selectedId)) {
    state.selectedId = state.catalog[0]?.id || '';
  }
  const nearby = state.catalog.find((entry) => entry.isNearby && entry.sourceType !== 'room') || state.catalog.find((entry) => entry.isNearby) || null;
  state.nearbyPromptId = state.promptEnabled ? (nearby?.id || '') : '';
  state.status = state.catalog.length > 0
    ? `${state.catalog.length} activities available in this world context.`
    : 'No activities are available at this location yet.';
  updateExternalState();
  renderUi();
  return true;
}

function inspectActivity(activityId = '', options = {}) {
  const id = sanitizeText(activityId, 120).toLowerCase();
  if (!id) return false;
  state.selectedId = id;
  if (options.open !== false) state.active = true;
  updateExternalState();
  renderUi();
  return true;
}

function openActivityBrowser(options = {}) {
  state.active = true;
  if (options.activityId) state.selectedId = sanitizeText(options.activityId, 120).toLowerCase();
  if (options.scope) state.scope = sanitizeText(options.scope, 24).toLowerCase();
  if (options.categoryId) state.categoryId = sanitizeText(options.categoryId, 32).toLowerCase();
  refreshCatalog(true);
  renderUi();
  return true;
}

function closeActivityBrowser() {
  state.active = false;
  updateExternalState();
  renderUi();
  return true;
}

function toggleActivityBrowser(options = {}) {
  if (state.active) return closeActivityBrowser();
  return openActivityBrowser(options);
}

function bindEvents() {
  if (state.initialized) return;
  const refsNow = refs();
  refsNow.panel?.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const selectBtn = target.closest('[data-activity-select]');
    if (selectBtn) {
      inspectActivity(selectBtn.getAttribute('data-activity-select') || '', { open: true });
      return;
    }
    const scopeBtn = target.closest('[data-activity-scope]');
    if (scopeBtn) {
      state.scope = sanitizeText(scopeBtn.getAttribute('data-activity-scope') || 'all', 24).toLowerCase();
      renderUi();
      return;
    }
    const categoryBtn = target.closest('[data-activity-category]');
    if (categoryBtn) {
      state.categoryId = sanitizeText(categoryBtn.getAttribute('data-activity-category') || 'all', 32).toLowerCase();
      renderUi();
      return;
    }
    if (target.id === 'activityDiscoveryCloseBtn') {
      closeActivityBrowser();
      return;
    }
    if (target.id === 'activityDiscoveryOpenCreatorBtn') {
      closeActivityBrowser();
      if (typeof appCtx.openActivityCreator === 'function') appCtx.openActivityCreator();
      return;
    }
    if (target.id === 'activityDiscoveryPrimaryAction') {
      const activity = selectedActivity();
      if (!activity) return;
      if (activity.sourceType === 'room') {
        state.status = 'Joining room...';
        renderUi();
        await startActivity(activity);
        state.status = `Joined ${activity.title}.`;
        closeActivityBrowser();
      } else if (activity.sourceType === 'room_activity') {
        state.status = 'Preparing room game...';
        renderUi();
        try {
          if (typeof appCtx.launchCurrentRoomActivity !== 'function') throw new Error('Room game launch is unavailable right now.');
          const result = await appCtx.launchCurrentRoomActivity(activity);
          state.status = result?.mode === 'started'
            ? `${activity.title} started for the room.`
            : result?.mode === 'joined'
              ? `Joined ${activity.title}.`
              : `${activity.title} is waiting on the room host.`;
          if (result?.mode === 'started' || result?.mode === 'joined') closeActivityBrowser();
        } catch (error) {
          state.status = error?.message || `Could not open ${activity.title}.`;
        }
      } else if (distanceToStart(activity) > 90) {
        navigateToActivityStart(activity);
        state.status = `Route set to ${activity.title}.`;
      } else {
        const ok = await startActivity(activity);
        state.status = ok ? `${activity.title} started.` : `Could not start ${activity.title}.`;
        if (ok) closeActivityBrowser();
      }
      renderUi();
      return;
    }
    if (target.id === 'activityDiscoveryReplayAction') {
      const activity = selectedActivity();
      if (!activity) return;
      if (getCompletionState(activity.id) || getRuntimeSnapshot().activityId === activity.id) {
        const ok = await replayLastActivity();
        state.status = ok ? `Replaying ${activity.title}.` : `Could not replay ${activity.title}.`;
        if (ok) closeActivityBrowser();
      } else {
        navigateToActivityStart(activity);
        state.status = `Previewing route to ${activity.title}.`;
      }
      renderUi();
      return;
    }
    if (target.id === 'activityDiscoveryCreatorAction' || target.id === 'activityDiscoveryCreatorInline') {
      const activity = selectedActivity();
      if (!activity) return;
      if (typeof appCtx.openCreatorProfile === 'function') {
        await appCtx.openCreatorProfile({
          creatorId: activity.creatorId,
          creatorName: activity.creatorName,
          creatorAvatar: activity.creatorAvatar,
          sourceActivityId: activity.id
        });
      }
      return;
    }
    if (target.id === 'activityDiscoveryDeleteSavedAction') {
      const activity = selectedActivity();
      if (!activity || activity.sourceType !== 'creator') return;
      removeStoredActivity(activity.id);
      if (activity.creatorId) {
        void syncOwnCreatorActivityStats(listStoredActivities().filter((entry) => entry.creatorId === activity.creatorId));
      }
      state.status = `${activity.title} removed from saved activities.`;
      refreshCatalog(true);
      return;
    }
  });
  refsNow.search?.addEventListener('input', (event) => {
    state.search = sanitizeText(event.target?.value || '', 120);
    renderUi();
  });
  refsNow.sort?.addEventListener('change', (event) => {
    state.sort = sanitizeText(event.target?.value || 'recommended', 24).toLowerCase();
    renderUi();
  });
  document.getElementById('activityDiscoveryPromptInspectBtn')?.addEventListener('click', () => {
    if (state.nearbyPromptId) inspectActivity(state.nearbyPromptId, { open: true });
  });
  document.getElementById('activityDiscoveryPromptJoinBtn')?.addEventListener('click', async () => {
    const activity = state.catalog.find((entry) => entry.id === state.nearbyPromptId) || null;
    if (!activity) return;
    if (activity.sourceType === 'room') {
      await startActivity(activity);
    } else if (distanceToStart(activity) > 90) {
      navigateToActivityStart(activity);
    } else {
      await startActivity(activity);
    }
    renderUi();
  });
  document.getElementById('activityRunReplayBtn')?.addEventListener('click', () => {
    void replayLastActivity();
  });
  document.getElementById('activityRunStopBtn')?.addEventListener('click', () => {
    const runtime = getRuntimeSnapshot();
    if (runtime.sourceType === 'room_activity' && typeof appCtx.stopCurrentRoomActivity === 'function' && typeof appCtx.canManageCurrentRoomActivities === 'function' && appCtx.canManageCurrentRoomActivities()) {
      void appCtx.stopCurrentRoomActivity();
    }
    stopActivity();
    renderUi();
  });
  bindMarkerClicks((activityId) => {
    inspectActivity(activityId, { open: true });
  });
  state.initialized = true;
}

function updateActivityDiscovery() {
  const runtime = getRuntimeSnapshot();
  if (!state.active && !runtime.active) {
    renderRunHud();
    renderPrompt();
    return;
  }
  refreshCatalog(false);
  updateActivityRuntime();
  updateExternalState();
  renderRunHud();
  renderPrompt();
}

function getActivityDiscoverySnapshot() {
  return {
    active: state.active,
    count: state.catalog.length,
    selectedId: sanitizeText(state.selectedId, 120).toLowerCase(),
    nearbyPromptId: sanitizeText(state.nearbyPromptId, 120).toLowerCase()
  };
}

function findActivityById(activityId = '') {
  const key = sanitizeText(activityId, 120).toLowerCase();
  return state.catalog.find((entry) => entry.id === key) || getStoredActivityById(key);
}

function initActivityDiscovery() {
  bindEvents();
  Object.assign(appCtx, {
    startSharedRoomActivityRuntime: (activity = {}) => startActivity(activity),
    stopSharedRoomActivityRuntime: () => stopActivity({ keepMessage: false }),
    closeActivityBrowser,
    findActivityById,
    getActivityDiscoverySnapshot,
    openActivityBrowser,
    toggleActivityBrowser,
    updateActivityDiscovery,
    removeSavedActivityDiscoveryItem: removeStoredActivity
  });
  refreshCatalog(true);
  renderUi();
}

export {
  closeActivityBrowser,
  getActivityDiscoverySnapshot,
  initActivityDiscovery,
  openActivityBrowser,
  toggleActivityBrowser,
  updateActivityDiscovery
};
