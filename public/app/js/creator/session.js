import { ctx as appCtx } from '../shared-context.js?v=55';
import { loadCreatorProfileView } from './store.js?v=1';

const state = {
  initialized: false,
  active: false,
  loading: false,
  error: '',
  data: null
};

function sanitizeText(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function formatDate(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return 'Recently joined';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
  } catch (_) {
    return new Date(value).toISOString().slice(0, 10);
  }
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function creatorTierLabel(stats = {}) {
  const activityWeight = finiteNumber(stats.activitiesCreated, 0) + finiteNumber(stats.activitiesPublished, 0);
  const worldWeight = finiteNumber(stats.publishedContributions, finiteNumber(stats.contributionsCount, 0));
  const total = activityWeight + worldWeight;
  if (total >= 18) return 'Established creator';
  if (total >= 8) return 'Active creator';
  if (total >= 1) return 'Builder';
  return 'New creator';
}

function creatorHeroSummary(profile = {}, data = {}) {
  if (profile.userId === 'system_worldexplorer') {
    return 'Curated routes, featured world experiences, and system-authored activities all point back to this creator record.';
  }
  if (data.isSelf) {
    return 'This is the public creator card other players see from your activities, published overlays, and attribution surfaces in the world.';
  }
  const activityCount = Array.isArray(data.activities) ? data.activities.length : 0;
  const worldEditCount = Array.isArray(data.contributions) ? data.contributions.length : 0;
  if (activityCount || worldEditCount) {
    return `${profile.username} currently has ${activityCount} visible activit${activityCount === 1 ? 'y' : 'ies'} and ${worldEditCount} published world edit${worldEditCount === 1 ? '' : 's'} surfaced here.`;
  }
  return `${profile.username} is credited here, but no public activities or published world edits are visible in this area yet.`;
}

function refs() {
  return {
    panel: document.getElementById('creatorProfilePanel'),
    status: document.getElementById('creatorProfileStatus'),
    body: document.getElementById('creatorProfileBody')
  };
}

function renderSectionTitle(title = '', count = 0) {
  return `
    <div class="creatorProfileSectionTitleRow">
      <h3>${escapeHtml(title)}</h3>
      <span class="creatorProfileSectionCount">${escapeHtml(String(Math.max(0, finiteNumber(count, 0))))}</span>
    </div>
  `;
}

function renderHeroBadges(profile = {}, data = {}) {
  const stats = data.stats || {};
  const badges = [
    profile.userId === 'system_worldexplorer' ? 'System creator' : 'Public creator',
    creatorTierLabel(stats)
  ];
  const publishedActivities = finiteNumber(stats.activitiesPublished, 0);
  const publishedEdits = finiteNumber(stats.publishedContributions, finiteNumber(stats.contributionsCount, 0));
  if (publishedActivities > 0) badges.push(`${publishedActivities} published`);
  if (publishedEdits > 0) badges.push(`${publishedEdits} world edits`);
  if (profile.spaces?.primaryRoomCode) badges.push(`Room ${profile.spaces.primaryRoomCode}`);
  return badges.map((badge) => `<span class="creatorProfileBadge">${escapeHtml(badge)}</span>`).join('');
}

function renderStats(stats = {}) {
  const items = [
    ['Activities', stats.activitiesCreated || 0],
    ['Published', stats.activitiesPublished || 0],
    ['Plays', stats.totalPlays || 0],
    ['World Edits', stats.publishedContributions || 0]
  ];
  return items.map(([label, value]) => `
    <div class="creatorProfileStat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `).join('');
}

function renderActivities(items = [], data = {}) {
  if (!items.length) {
    return `<div class="creatorProfileEmpty">${
      data.isSelf
        ? 'No creator activities are saved yet. Build one in Activity Creator and it will show up here with your public attribution.'
        : 'No public creator activities are visible here yet.'
    }</div>`;
  }
  return items.map((activity) => `
    <article class="creatorProfileListItem">
      <div class="creatorProfileListHead">
        <strong>${escapeHtml(activity.title)}</strong>
        <span>${escapeHtml(activity.status.replace(/_/g, ' '))}</span>
      </div>
      <div class="creatorProfileListMeta">${escapeHtml(activity.locationLabel || 'Current world')}</div>
      <div class="creatorProfileMetaRow">
        <span class="creatorProfileMetaBadge">${escapeHtml(activity.visibility)}</span>
        ${activity.templateId ? `<span class="creatorProfileMetaBadge">${escapeHtml(activity.templateId.replace(/_/g, ' '))}</span>` : ''}
        ${activity.sourceType ? `<span class="creatorProfileMetaBadge">${escapeHtml(activity.sourceType)}</span>` : ''}
      </div>
      <div class="creatorProfileListText">${escapeHtml(activity.description || 'Creator activity')}</div>
      <div class="creatorProfileListActions">
        <button type="button" data-creator-activity="${escapeHtml(activity.id)}">Inspect In World</button>
      </div>
    </article>
  `).join('');
}

function renderContributions(items = [], data = {}) {
  if (!items.length) {
    return `<div class="creatorProfileEmpty">${
      data.isSelf
        ? 'No published world contributions are visible yet. Approved overlays will appear here automatically.'
        : 'No published world contributions are visible for this creator right now.'
    }</div>`;
  }
  return items.map((item) => `
    <article class="creatorProfileListItem">
      <div class="creatorProfileListHead">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.featureClass || item.presetId || 'overlay')}</span>
      </div>
      <div class="creatorProfileListMeta">${escapeHtml(item.locationLabel || 'Published overlay')}</div>
      <div class="creatorProfileMetaRow">
        <span class="creatorProfileMetaBadge">${escapeHtml(item.geometryType || 'feature')}</span>
        ${item.presetId ? `<span class="creatorProfileMetaBadge">${escapeHtml(item.presetId.replace(/_/g, ' '))}</span>` : ''}
      </div>
      <div class="creatorProfileListText">Published ${escapeHtml(formatDate(item.publishedAtMs))}</div>
    </article>
  `).join('');
}

function renderBody() {
  const refsNow = refs();
  if (!refsNow.panel || !refsNow.body) return;
  document.body.classList.toggle('creator-profile-open', state.active);
  refsNow.panel.classList.toggle('show', state.active);
  refsNow.status.textContent = state.error || (state.loading ? 'Loading creator profile…' : '');
  if (!state.active) return;
  if (state.loading) {
    refsNow.body.innerHTML = '<div class="creatorProfileEmpty">Loading creator profile…</div>';
    return;
  }
  const data = state.data;
  if (!data?.profile) {
    refsNow.body.innerHTML = '<div class="creatorProfileEmpty">Creator profile not available.</div>';
    return;
  }
  const profile = data.profile;
  refsNow.body.innerHTML = `
    <div class="creatorProfileHero">
      <div class="creatorProfileAvatar">${escapeHtml(profile.avatar || '🌍')}</div>
      <div class="creatorProfileHeroCopy">
        <div class="creatorProfileHeroLead">Creator Identity</div>
        <div class="creatorProfileNameRow">
          <h2>${escapeHtml(profile.username)}</h2>
          ${data.isSelf ? '<span class="creatorProfileSelfTag">You</span>' : ''}
        </div>
        <div class="creatorProfileMeta">Creator ID: ${escapeHtml(profile.userId || 'guest')} • Joined ${escapeHtml(formatDate(profile.createdAtMs))}</div>
        <div class="creatorProfileBio">${escapeHtml(profile.bio || 'No public bio yet. This creator can still be credited on activities and world edits.')}</div>
        <div class="creatorProfileHeroSummary">${escapeHtml(creatorHeroSummary(profile, data))}</div>
        <div class="creatorProfileBadgeRow">${renderHeroBadges(profile, data)}</div>
        <div class="creatorProfileHeroActions">
          ${data.isSelf ? '<button type="button" data-creator-open-account="1">Edit Public Profile</button>' : ''}
        </div>
      </div>
    </div>
    <div class="creatorProfileStats">${renderStats(data.stats)}</div>
    <div class="creatorProfileSection">
      <div class="creatorProfileSectionHead">
        ${renderSectionTitle('Activities', data.activities?.length || 0)}
        ${data.isSelf ? '<button type="button" data-creator-open-account="1">Account</button>' : ''}
      </div>
      <div class="creatorProfileList">${renderActivities(data.activities, data)}</div>
    </div>
    <div class="creatorProfileSection">
      <div class="creatorProfileSectionHead">
        ${renderSectionTitle('Published World Contributions', data.contributions?.length || 0)}
      </div>
      <div class="creatorProfileList">${renderContributions(data.contributions, data)}</div>
    </div>
    ${(profile.spaces?.primaryRoomCode || profile.spaces?.hubLabel)
      ? `<div class="creatorProfileSection">
          <div class="creatorProfileSectionHead"><h3>Creator Space</h3></div>
          <div class="creatorProfileSpaceCard">
            <strong>${escapeHtml(profile.spaces.hubLabel || 'Creator Hub')}</strong>
            <div>${escapeHtml(profile.spaces.primaryRoomCode || 'No room linked yet')}</div>
          </div>
        </div>`
      : ''}
  `;
}

async function openCreatorProfile(options = {}) {
  state.active = true;
  state.loading = true;
  state.error = '';
  renderBody();
  try {
    state.data = await loadCreatorProfileView(options);
  } catch (error) {
    state.data = null;
    state.error = error?.message || 'Could not load this creator profile.';
  } finally {
    state.loading = false;
    renderBody();
  }
  return true;
}

function closeCreatorProfile() {
  state.active = false;
  renderBody();
  return true;
}

function bindEvents() {
  if (state.initialized) return;
  const refsNow = refs();
  refsNow.panel?.addEventListener('click', (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;
    if (target.closest('#creatorProfileCloseBtn')) {
      closeCreatorProfile();
      return;
    }
    const activityBtn = target.closest('[data-creator-activity]');
    if (activityBtn) {
      const activityId = sanitizeText(activityBtn.getAttribute('data-creator-activity') || '', 120).toLowerCase();
      if (activityId && typeof appCtx.openActivityBrowser === 'function') {
        closeCreatorProfile();
        appCtx.openActivityBrowser({ activityId });
      }
      return;
    }
    if (target.closest('[data-creator-open-account]')) {
      globalThis.location.assign('../account/');
    }
  });
  state.initialized = true;
}

function getCreatorProfileSnapshot() {
  return {
    active: state.active,
    creatorId: sanitizeText(state.data?.profile?.userId || '', 160),
    loading: state.loading
  };
}

function initCreatorProfileSession() {
  bindEvents();
  Object.assign(appCtx, {
    closeCreatorProfile,
    getCreatorProfileSnapshot,
    openCreatorProfile
  });
  renderBody();
}

export {
  closeCreatorProfile,
  getCreatorProfileSnapshot,
  initCreatorProfileSession,
  openCreatorProfile
};
