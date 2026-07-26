import { hasFirebaseConfig } from './firebase-config.js?v=1';
import { ensureSignedIn, observeAuth, signOutUser } from './auth-ui.js?v=55';
import { enableAdminTester, getAccountOverview } from './billing.js?v=60';
import {
  getAdminDashboardOverview,
  getAdminOperationsSnapshot,
  getAdminOverlayFeatureDetail,
  getAdminSiteContent,
  getAdminUserDetail,
  listAdminActivity,
  listAdminOverlayFeatures,
  listAdminRooms,
  listAdminUsers,
  publishAdminSiteContent,
  saveAdminSiteContentDraft,
  updateAdminRoomFlags
} from './admin-dashboard-api.js?v=1';
import { listContributionSubmissions, moderateContributionSubmission } from './contribution-api.js?v=1';
import { moderateOverlayFeature } from './overlay-api.js?v=1';
import {
  LANDING_PAGE_ENTRY_ID,
  cloneLandingContent,
  renderLandingContentPreview
} from './site-content.js?v=1';
import {
  escapeHtml,
  formatDateTime,
  formatRelative,
  optionMarkup,
  pluralize,
  sanitizeLongText,
  sanitizeText
} from './admin-dashboard-format.js?v=1';
import { createAdminCommunityView } from './admin-dashboard-community-view.js?v=1';
import { createAdminModerationView } from './admin-dashboard-moderation-view.js?v=1';

const VIEW_META = {
  overview: {
    title: 'Operations Overview',
    subtitle: 'Platform health, pending review workload, active rooms, and recent admin actions in one place.'
  },
  moderation: {
    title: 'Editor Moderation',
    subtitle: 'Review overlay submissions and legacy contributions without mixing them into the rest of the admin system.'
  },
  users: {
    title: 'User Management',
    subtitle: 'Inspect contributors, access level, owned rooms, and submission history.'
  },
  multiplayer: {
    title: 'Multiplayer Rooms',
    subtitle: 'Monitor active rooms, room visibility, occupancy, and featured-room controls separately from content moderation.'
  },
  content: {
    title: 'Site Content',
    subtitle: 'Manage landing-page messaging with draft, preview, and publish flow instead of editing file copy by hand.'
  },
  diagnostics: {
    title: 'Layer Diagnostics',
    subtitle: 'Operational readiness indicators for overlays, featured rooms, moderation notifications, and published content.'
  },
  operations: {
    title: 'Operations Settings',
    subtitle: 'Read-only platform operations state, admin boundaries, and moderation infrastructure status.'
  },
  activity: {
    title: 'Audit Activity',
    subtitle: 'Review recent moderation decisions, site-content publishes, and room administration actions.'
  }
};

const state = {
  user: null,
  accountOverview: null,
  dashboardOverview: null,
  operations: null,
  currentView: 'overview',
  currentModerationMode: 'overlay',
  busy: false,
  overlayFilters: {
    reviewState: 'submitted',
    presetId: 'all',
    geometryType: 'all',
    contributor: '',
    region: '',
    search: '',
    timeWindow: 'all',
    limit: 48
  },
  overlaySummary: {},
  overlayItems: [],
  overlaySelectedId: '',
  overlayDetails: new Map(),
  legacyFilters: {
    status: 'pending',
    editType: 'all',
    search: '',
    limit: 48
  },
  legacySummary: {},
  legacyItems: [],
  legacyReviewer: null,
  legacyNotifications: null,
  legacySelectedId: '',
  userFilters: {
    search: '',
    role: 'all',
    limit: 48
  },
  users: [],
  selectedUserId: '',
  userDetails: new Map(),
  roomFilters: {
    visibility: 'all',
    worldKind: 'all',
    featuredOnly: false,
    search: '',
    limit: 24
  },
  rooms: [],
  selectedRoomId: '',
  siteContent: null,
  siteContentDraft: null,
  siteContentDirty: false,
  activityFilters: {
    actionPrefix: '',
    limit: 40
  },
  activityItems: []
};

const refs = {
  navButtons: [...document.querySelectorAll('[data-view]')],
  pageTitle: document.getElementById('pageTitle'),
  pageSubtitle: document.getElementById('pageSubtitle'),
  refreshViewBtn: document.getElementById('refreshViewBtn'),
  authGate: document.getElementById('authGate'),
  signInBtn: document.getElementById('signInBtn'),
  enableAdminBtn: document.getElementById('enableAdminBtn'),
  signOutBtn: document.getElementById('signOutBtn'),
  accessIdentity: document.getElementById('accessIdentity'),
  accessState: document.getElementById('accessState'),
  accessHint: document.getElementById('accessHint'),
  adminIdentityPill: document.getElementById('adminIdentityPill'),
  workspace: document.getElementById('adminWorkspace'),
  globalStatus: document.getElementById('globalStatus'),
  views: [...document.querySelectorAll('[data-view-panel]')],
  overviewStats: document.getElementById('overviewStats'),
  overviewAlerts: document.getElementById('overviewAlerts'),
  overviewActivity: document.getElementById('overviewActivity'),
  overviewRooms: document.getElementById('overviewRooms'),
  overviewShortcuts: document.getElementById('overviewShortcuts'),
  moderationTabs: document.getElementById('moderationModeTabs'),
  moderationSummary: document.getElementById('moderationSummary'),
  moderationFilters: document.getElementById('moderationFilters'),
  moderationList: document.getElementById('moderationList'),
  moderationDetail: document.getElementById('moderationDetail'),
  usersFilters: document.getElementById('usersFilters'),
  usersList: document.getElementById('usersList'),
  usersDetail: document.getElementById('usersDetail'),
  roomsFilters: document.getElementById('roomsFilters'),
  roomsList: document.getElementById('roomsList'),
  roomsDetail: document.getElementById('roomsDetail'),
  siteContentMeta: document.getElementById('siteContentMeta'),
  siteContentForm: document.getElementById('siteContentForm'),
  siteContentPreview: document.getElementById('siteContentPreview'),
  diagnosticsGrid: document.getElementById('diagnosticsGrid'),
  operationsGrid: document.getElementById('operationsGrid'),
  activityFilters: document.getElementById('activityFilters'),
  activityList: document.getElementById('activityList'),
  navModerationBadge: document.getElementById('navModerationBadge'),
  navUsersBadge: document.getElementById('navUsersBadge'),
  navRoomsBadge: document.getElementById('navRoomsBadge'),
  navContentBadge: document.getElementById('navContentBadge'),
  navActivityBadge: document.getElementById('navActivityBadge')
};

const {
  renderUsersFilters,
  renderUsersList,
  renderUsersDetail,
  renderRoomsFilters,
  renderRoomsList,
  renderRoomsDetail
} = createAdminCommunityView(state, refs);
const {
  renderModeration,
  renderOverlayList,
  renderOverlayDetail,
  renderLegacyList,
  renderLegacyDetail
} = createAdminModerationView(state, refs);

function setStatus(message = '', tone = 'neutral') {
  refs.globalStatus.textContent = message || '';
  refs.globalStatus.dataset.tone = tone;
}

function setBusy(busy) {
  state.busy = !!busy;
  refs.signInBtn.disabled = !!busy;
  refs.enableAdminBtn.disabled = !!busy;
  refs.signOutBtn.disabled = !!busy;
  refs.refreshViewBtn.disabled = !!busy;
}

function adminAllowed() {
  return state.accountOverview?.isAdmin === true || state.accountOverview?.adminTesterEligible === true;
}

function selectedRoomItem() {
  return state.rooms.find((item) => item.roomId === state.selectedRoomId) || null;
}

function updatePageMeta() {
  const meta = VIEW_META[state.currentView] || VIEW_META.overview;
  refs.pageTitle.textContent = meta.title;
  refs.pageSubtitle.textContent = meta.subtitle;
}

function syncNav() {
  refs.navButtons.forEach((button) => {
    const view = String(button.dataset.view || '');
    button.classList.toggle('active', view === state.currentView);
  });
  refs.views.forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== state.currentView;
  });
}

function syncAccessUi() {
  const configReady = hasFirebaseConfig();
  const signedIn = !!state.user;
  const adminReady = signedIn && !!state.accountOverview && adminAllowed();
  refs.authGate.hidden = adminReady;
  refs.workspace.hidden = !adminReady;
  refs.accessIdentity.textContent = sanitizeText(state.user?.email || state.user?.uid || 'No account session', 120) || 'No account session';

  if (!configReady) {
    refs.accessState.textContent = 'Unavailable';
    refs.accessHint.textContent = 'Firebase config is missing, so admin tools cannot load here.';
    refs.signInBtn.hidden = true;
    refs.enableAdminBtn.hidden = true;
    refs.signOutBtn.hidden = true;
    refs.adminIdentityPill.textContent = 'Config Missing';
    return;
  }

  refs.signInBtn.hidden = signedIn;
  refs.signOutBtn.hidden = !signedIn;
  refs.enableAdminBtn.hidden = !signedIn || !state.accountOverview?.adminTesterEligible || state.accountOverview?.isAdmin === true;
  refs.adminIdentityPill.textContent = signedIn
    ? sanitizeText(state.accountOverview?.displayName || state.user?.displayName || state.user?.email || 'Admin', 48)
    : 'Guest';

  if (!signedIn) {
    refs.accessState.textContent = 'Sign In Required';
    refs.accessHint.textContent = 'Use an authorized World Explorer admin account to open the dashboard.';
    return;
  }

  if (!state.accountOverview) {
    refs.accessState.textContent = 'Checking';
    refs.accessHint.textContent = 'Verifying admin access and loading dashboard permissions.';
    return;
  }

  if (!adminAllowed()) {
    refs.accessState.textContent = 'Denied';
    refs.accessHint.textContent = 'This account is signed in but does not currently have moderator or admin access.';
    return;
  }

  refs.accessState.textContent = state.accountOverview?.isAdmin === true ? 'Active' : 'Allowlisted';
  refs.accessHint.textContent = state.accountOverview?.isAdmin === true
    ? 'Admin access is active for this account.'
    : 'This account is allowlisted for admin tools. The dashboard is available.';
}

function renderOverview() {
  const summary = state.dashboardOverview?.summary || {};
  const alerts = Array.isArray(state.dashboardOverview?.alerts) ? state.dashboardOverview.alerts : [];
  const activity = Array.isArray(state.dashboardOverview?.recentActivity) ? state.dashboardOverview.recentActivity : [];
  const rooms = Array.isArray(state.dashboardOverview?.recentRooms) ? state.dashboardOverview.recentRooms : [];
  const statCards = [
    { label: 'Pending Overlay', value: summary.pendingOverlay || 0, tone: 'warning' },
    { label: 'Pending Legacy', value: summary.pendingLegacy || 0, tone: 'warning' },
    { label: 'Published Overlays', value: summary.publishedOverlay || 0, tone: 'ok' },
    { label: 'Total Users', value: summary.totalUsers || 0, tone: 'neutral' },
    { label: 'New Users (7d)', value: summary.newUsers7d || 0, tone: 'neutral' },
    { label: 'Public Rooms', value: summary.publicRooms || 0, tone: 'neutral' },
    { label: 'Featured Rooms', value: summary.featuredRooms || 0, tone: 'neutral' },
    { label: 'Notification Email', value: summary.notificationConfigured ? 'Configured' : 'Needs Setup', tone: summary.notificationConfigured ? 'ok' : 'warning' }
  ];

  refs.overviewStats.innerHTML = statCards.map((item) => `
    <article class="metric-card" data-tone="${escapeHtml(item.tone)}">
      <span class="metric-label">${escapeHtml(item.label)}</span>
      <strong class="metric-value">${escapeHtml(String(item.value))}</strong>
    </article>
  `).join('');

  refs.overviewAlerts.innerHTML = alerts.map((item) => `
    <article class="alert-card" data-severity="${escapeHtml(item.severity || 'info')}">
      <div class="alert-title">${escapeHtml(item.title || 'Alert')}</div>
      <p>${escapeHtml(item.detail || '')}</p>
    </article>
  `).join('') || '<div class="empty-card">No active alerts.</div>';

  refs.overviewActivity.innerHTML = activity.map((item) => `
    <article class="list-card">
      <div class="list-card-top">
        <strong>${escapeHtml(item.title || item.actionType || 'Admin action')}</strong>
        <span class="mini-chip">${escapeHtml(formatRelative(item.createdAtMs))}</span>
      </div>
      <p>${escapeHtml(item.summary || '')}</p>
      <div class="list-card-meta">${escapeHtml(item.actorName || item.actorUid || 'Unknown actor')}</div>
    </article>
  `).join('') || '<div class="empty-card">No recent admin activity yet.</div>';

  refs.overviewRooms.innerHTML = rooms.map((room) => `
    <article class="list-card">
      <div class="list-card-top">
        <strong>${escapeHtml(room.name || room.code || 'Room')}</strong>
        <span class="mini-chip">${escapeHtml(room.visibility || 'private')}</span>
      </div>
      <p>${escapeHtml(room.locationLabel || room.locationCity || room.cityKey || room.worldKind || 'No location tag')}</p>
      <div class="list-card-meta">
        ${escapeHtml(pluralize(room.activePlayers ?? 0, 'active player'))} • ${escapeHtml(room.worldKind || 'earth')} • ${room.featured ? 'Featured' : 'Standard'}
      </div>
    </article>
  `).join('') || '<div class="empty-card">No recent rooms found.</div>';

  refs.overviewShortcuts.innerHTML = `
    <button type="button" class="shortcut-card" data-goto-view="moderation">
      <strong>Open moderation queue</strong>
      <span>${escapeHtml(pluralize(Number(summary.pendingOverlay || 0) + Number(summary.pendingLegacy || 0), 'pending item'))}</span>
    </button>
    <button type="button" class="shortcut-card" data-goto-view="content">
      <strong>Edit landing page copy</strong>
      <span>${summary.siteContentPublishedAtMs ? `Published ${escapeHtml(formatRelative(summary.siteContentPublishedAtMs))}` : 'No published admin copy yet'}</span>
    </button>
    <button type="button" class="shortcut-card" data-goto-view="multiplayer">
      <strong>Inspect multiplayer rooms</strong>
      <span>${escapeHtml(pluralize(summary.totalRooms || 0, 'room'))} across the platform</span>
    </button>
    <button type="button" class="shortcut-card" data-goto-view="activity">
      <strong>View audit activity</strong>
      <span>Moderation, site content, and room admin history</span>
    </button>
  `;
}

function renderSiteContentMeta() {
  const meta = state.siteContent?.meta || {};
  refs.siteContentMeta.innerHTML = `
    <article class="metric-card"><span class="metric-label">Entry</span><strong class="metric-value">${escapeHtml(state.siteContent?.entryId || LANDING_PAGE_ENTRY_ID)}</strong></article>
    <article class="metric-card"><span class="metric-label">Draft Updated</span><strong class="metric-value">${escapeHtml(meta.updatedAtMs ? formatDateTime(meta.updatedAtMs) : 'Never')}</strong></article>
    <article class="metric-card"><span class="metric-label">Published</span><strong class="metric-value">${escapeHtml(meta.publishedAtMs ? formatDateTime(meta.publishedAtMs) : 'Not yet')}</strong></article>
    <article class="metric-card"><span class="metric-label">Draft State</span><strong class="metric-value">${state.siteContentDirty ? 'Unsaved changes' : 'Saved'}</strong></article>
  `;
}

function renderSiteContentForm() {
  const draft = state.siteContentDraft || cloneLandingContent({});
  refs.siteContentForm.innerHTML = `
    <section class="form-section">
      <div class="form-section-header">
        <h3>Landing Content</h3>
        <div class="action-row compact">
          <button type="button" class="secondary-btn" id="reloadSiteContentBtn">Reload</button>
          <button type="button" class="secondary-btn" id="saveSiteContentBtn">Save Draft</button>
          <button type="button" class="primary-btn" id="publishSiteContentBtn">Publish Live</button>
        </div>
      </div>
      <div class="form-grid">
        <label>
          Browser Title
          <input data-site-path="meta.title" type="text" maxlength="160" value="${escapeHtml(draft.meta?.title || '')}">
        </label>
        <label class="field-wide">
          Meta Description
          <textarea data-site-path="meta.description" maxlength="320">${escapeHtml(draft.meta?.description || '')}</textarea>
        </label>
        <label>
          Hero Brand
          <input data-site-path="hero.brand" type="text" maxlength="80" value="${escapeHtml(draft.hero?.brand || '')}">
        </label>
        <label class="field-wide">
          Hero Headline
          <textarea data-site-path="hero.headline" maxlength="220">${escapeHtml(draft.hero?.headline || '')}</textarea>
        </label>
        <label class="field-wide">
          Hero Lead
          <textarea data-site-path="hero.lead" maxlength="420">${escapeHtml(draft.hero?.lead || '')}</textarea>
        </label>
        <label>
          Primary CTA
          <input data-site-path="hero.primaryCtaLabel" type="text" maxlength="48" value="${escapeHtml(draft.hero?.primaryCtaLabel || '')}">
        </label>
        <label>
          Secondary CTA
          <input data-site-path="hero.secondaryCtaLabel" type="text" maxlength="56" value="${escapeHtml(draft.hero?.secondaryCtaLabel || '')}">
        </label>
        <label>
          Tertiary CTA
          <input data-site-path="hero.tertiaryCtaLabel" type="text" maxlength="40" value="${escapeHtml(draft.hero?.tertiaryCtaLabel || '')}">
        </label>
        <label class="field-wide">
          Performance Note
          <textarea data-site-path="hero.performanceNote" maxlength="220">${escapeHtml(draft.hero?.performanceNote || '')}</textarea>
        </label>
      </div>
    </section>

    <section class="form-section">
      <div class="form-section-header">
        <h3>Announcement Banner</h3>
      </div>
      <div class="form-grid">
        <label class="filter-toggle">
          <input data-site-path="announcement.enabled" type="checkbox" ${draft.announcement?.enabled ? 'checked' : ''}>
          Enable announcement
        </label>
        <label>
          Tone
          <select data-site-path="announcement.tone">
            ${optionMarkup([
              ['info', 'Info'],
              ['success', 'Success'],
              ['warning', 'Warning']
            ], draft.announcement?.tone || 'info')}
          </select>
        </label>
        <label>
          Eyebrow
          <input data-site-path="announcement.eyebrow" type="text" maxlength="48" value="${escapeHtml(draft.announcement?.eyebrow || '')}">
        </label>
        <label class="field-wide">
          Title
          <input data-site-path="announcement.title" type="text" maxlength="120" value="${escapeHtml(draft.announcement?.title || '')}">
        </label>
        <label class="field-wide">
          Body
          <textarea data-site-path="announcement.body" maxlength="300">${escapeHtml(draft.announcement?.body || '')}</textarea>
        </label>
        <label>
          Link Label
          <input data-site-path="announcement.linkLabel" type="text" maxlength="48" value="${escapeHtml(draft.announcement?.linkLabel || '')}">
        </label>
        <label class="field-wide">
          Link URL
          <input data-site-path="announcement.linkHref" type="text" maxlength="320" value="${escapeHtml(draft.announcement?.linkHref || '')}" placeholder="https://...">
        </label>
      </div>
    </section>

    <section class="form-section">
      <div class="form-section-header">
        <h3>Highlights</h3>
        <div class="action-row compact">
          <button type="button" class="secondary-btn" id="addHighlightBtn">Add Highlight</button>
        </div>
      </div>
      <div class="form-grid">
        <label class="field-wide">
          Section Title
          <input data-site-path="sections.highlightsTitle" type="text" maxlength="80" value="${escapeHtml(draft.sections?.highlightsTitle || '')}">
        </label>
      </div>
      <div class="highlight-editor-list">
        ${draft.highlights.map((item, index) => `
          <article class="highlight-editor-card">
            <div class="highlight-editor-top">
              <strong>Highlight ${index + 1}</strong>
              <button type="button" class="ghost-btn" data-remove-highlight="${index}">Remove</button>
            </div>
            <div class="form-grid">
              <label>
                Identifier
                <input data-highlight-index="${index}" data-highlight-field="id" type="text" maxlength="48" value="${escapeHtml(item.id || '')}">
              </label>
              <label class="field-wide">
                Title
                <input data-highlight-index="${index}" data-highlight-field="title" type="text" maxlength="80" value="${escapeHtml(item.title || '')}">
              </label>
              <label class="field-wide">
                Body
                <textarea data-highlight-index="${index}" data-highlight-field="body" maxlength="280">${escapeHtml(item.body || '')}</textarea>
              </label>
            </div>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderDiagnostics() {
  const summary = state.dashboardOverview?.summary || {};
  const ops = state.operations?.settings || {};
  const cards = [
    {
      label: 'Overlay Runtime Layer',
      value: summary.publishedOverlay ? `${summary.publishedOverlay} published` : 'No published overlays',
      tone: summary.publishedOverlay ? 'ok' : 'warning',
      detail: 'Approved overlays are available to the runtime merge layer when published.'
    },
    {
      label: 'Moderation Notifications',
      value: ops.notificationConfigured ? 'Configured' : 'Needs setup',
      tone: ops.notificationConfigured ? 'ok' : 'warning',
      detail: ops.notificationConfigured
        ? `Alerts route to ${ops.notificationEmail || 'the configured inbox'}.`
        : 'Resend/admin email settings are not fully configured yet.'
    },
    {
      label: 'Landing Content',
      value: ops.siteContentPublishedAtMs ? `Published ${formatRelative(ops.siteContentPublishedAtMs)}` : 'Using file defaults',
      tone: ops.siteContentPublishedAtMs ? 'ok' : 'neutral',
      detail: 'Public-facing site copy can now move through draft and publish flow in the Site Content section.'
    },
    {
      label: 'Featured Rooms',
      value: `${summary.featuredRooms || 0} featured`,
      tone: Number(summary.featuredRooms || 0) > 0 ? 'ok' : 'neutral',
      detail: `${summary.publicRooms || 0} public room${Number(summary.publicRooms || 0) === 1 ? '' : 's'} currently exposed.`
    },
    {
      label: 'Admin Access Boundary',
      value: ops.adminAllowlistConfigured ? 'Protected' : 'Needs allowlist',
      tone: ops.adminAllowlistConfigured ? 'ok' : 'warning',
      detail: 'Admin endpoints stay behind auth plus moderator checks; direct client writes remain blocked.'
    }
  ];

  refs.diagnosticsGrid.innerHTML = `
    <div class="notice-card">
      <strong>Diagnostics only</strong>
      <p>This section intentionally reports readiness and state. It does not expose fake live-layer toggles that the platform does not support yet.</p>
    </div>
    ${cards.map((item) => `
      <article class="metric-card" data-tone="${escapeHtml(item.tone)}">
        <span class="metric-label">${escapeHtml(item.label)}</span>
        <strong class="metric-value">${escapeHtml(item.value)}</strong>
        <p class="metric-note">${escapeHtml(item.detail)}</p>
      </article>
    `).join('')}
  `;
}

function renderOperations() {
  const ops = state.operations?.settings || {};
  refs.operationsGrid.innerHTML = `
    <article class="detail-card">
      <span class="detail-label">Moderation Dashboard URL</span>
      <strong>${escapeHtml(ops.moderationPanelUrl || 'Not configured')}</strong>
      <p>Notification emails and review links point here.</p>
    </article>
    <article class="detail-card">
      <span class="detail-label">Notification Email</span>
      <strong>${escapeHtml(ops.notificationEmail || 'Not configured')}</strong>
      <p>${ops.notificationConfigured ? 'Email alerts are active.' : 'Resend/admin email settings still need to be configured.'}</p>
    </article>
    <article class="detail-card">
      <span class="detail-label">Admin Allowlist</span>
      <strong>${ops.adminAllowlistConfigured ? 'Configured' : 'Not configured'}</strong>
      <p>Admin tools remain restricted to authorized accounts.</p>
    </article>
    <article class="detail-card">
      <span class="detail-label">Published Site Content</span>
      <strong>${escapeHtml(ops.siteContentPublishedAtMs ? formatDateTime(ops.siteContentPublishedAtMs) : 'No published snapshot')}</strong>
      <p>Landing-page text now has a formal draft and publish path.</p>
    </article>
  `;
}

function renderActivityFilters() {
  refs.activityFilters.innerHTML = `
    <label>
      Action Group
      <select id="activityPrefixFilter">
        ${optionMarkup([
          ['', 'All actions'],
          ['overlay.', 'Overlay moderation'],
          ['legacy_submission.', 'Legacy moderation'],
          ['room.', 'Room administration'],
          ['site_content.', 'Site content']
        ], state.activityFilters.actionPrefix)}
      </select>
    </label>
    <div class="filter-actions">
      <button type="button" class="secondary-btn" id="activityApplyFilters">Apply Filters</button>
    </div>
  `;
}

function renderActivity() {
  refs.activityList.innerHTML = state.activityItems.map((item) => `
    <article class="list-card">
      <div class="list-card-top">
        <strong>${escapeHtml(item.title || item.actionType || 'Admin action')}</strong>
        <span class="mini-chip">${escapeHtml(formatDateTime(item.createdAtMs))}</span>
      </div>
      <p>${escapeHtml(item.summary || '')}</p>
      <div class="list-card-meta">${escapeHtml(`${item.actorName || item.actorUid || 'Unknown actor'} • ${item.targetType || 'target'} • ${item.targetId || ''}`)}</div>
    </article>
  `).join('') || '<div class="empty-card">No admin activity matches the current filter.</div>';
}

function renderAllVisible() {
  updatePageMeta();
  syncNav();
  syncAccessUi();
  if (refs.workspace.hidden) return;
  renderNavBadges();
  if (state.currentView === 'overview') renderOverview();
  if (state.currentView === 'moderation') renderModeration();
  if (state.currentView === 'users') {
    renderUsersFilters();
    renderUsersList();
    renderUsersDetail();
  }
  if (state.currentView === 'multiplayer') {
    renderRoomsFilters();
    renderRoomsList();
    renderRoomsDetail();
  }
  if (state.currentView === 'content') {
    renderSiteContentMeta();
    renderSiteContentForm();
    renderLandingContentPreview(refs.siteContentPreview, state.siteContentDraft || state.siteContent?.draft || {});
  }
  if (state.currentView === 'diagnostics') renderDiagnostics();
  if (state.currentView === 'operations') renderOperations();
  if (state.currentView === 'activity') {
    renderActivityFilters();
    renderActivity();
  }
}

function renderNavBadges() {
  const summary = state.dashboardOverview?.summary || {};
  refs.navModerationBadge.textContent = String(Number(summary.pendingOverlay || 0) + Number(summary.pendingLegacy || 0));
  refs.navUsersBadge.textContent = String(summary.newUsers7d || 0);
  refs.navRoomsBadge.textContent = String(summary.publicRooms || 0);
  refs.navContentBadge.textContent = state.dashboardOverview?.summary?.siteContentPublishedAtMs ? 'Live' : 'Draft';
  refs.navActivityBadge.textContent = String((state.dashboardOverview?.recentActivity || []).length || 0);
}

async function ensureOverlayDetail(featureId) {
  if (!featureId) return;
  if (state.overlayDetails.has(featureId)) return;
  const detail = await getAdminOverlayFeatureDetail(featureId);
  state.overlayDetails.set(featureId, detail);
}

async function loadOverview() {
  state.dashboardOverview = await getAdminDashboardOverview();
}

async function loadOperations() {
  state.operations = await getAdminOperationsSnapshot();
}

async function loadOverlayQueue() {
  const payload = await listAdminOverlayFeatures(state.overlayFilters);
  state.overlayItems = Array.isArray(payload.items) ? payload.items : [];
  state.overlaySummary = payload.summary || {};
  if (!state.overlayItems.some((item) => item.featureId === state.overlaySelectedId)) {
    state.overlaySelectedId = state.overlayItems[0]?.featureId || '';
  }
  if (state.overlaySelectedId) {
    await ensureOverlayDetail(state.overlaySelectedId);
  }
}

async function loadLegacyQueue() {
  const payload = await listContributionSubmissions(state.legacyFilters);
  state.legacyItems = Array.isArray(payload.items) ? payload.items : [];
  state.legacySummary = payload.summary || {};
  state.legacyReviewer = payload.reviewer || {};
  state.legacyNotifications = payload.notifications || {};
  if (!state.legacyItems.some((item) => item.id === state.legacySelectedId)) {
    state.legacySelectedId = state.legacyItems[0]?.id || '';
  }
}

async function loadUsers() {
  const payload = await listAdminUsers(state.userFilters);
  state.users = Array.isArray(payload.items) ? payload.items : [];
  if (!state.users.some((item) => item.uid === state.selectedUserId)) {
    state.selectedUserId = state.users[0]?.uid || '';
  }
  if (state.selectedUserId && !state.userDetails.has(state.selectedUserId)) {
    state.userDetails.set(state.selectedUserId, await getAdminUserDetail(state.selectedUserId));
  }
}

async function loadRooms() {
  const payload = await listAdminRooms(state.roomFilters);
  state.rooms = Array.isArray(payload.items) ? payload.items : [];
  if (!state.rooms.some((item) => item.roomId === state.selectedRoomId)) {
    state.selectedRoomId = state.rooms[0]?.roomId || '';
  }
}

async function loadSiteContent() {
  state.siteContent = await getAdminSiteContent(LANDING_PAGE_ENTRY_ID);
  state.siteContentDraft = cloneLandingContent(state.siteContent?.draft || state.siteContent?.published || {});
  state.siteContentDirty = false;
}

async function loadActivity() {
  const payload = await listAdminActivity(state.activityFilters);
  state.activityItems = Array.isArray(payload.items) ? payload.items : [];
}

async function loadOverviewBundle() {
  const results = await Promise.allSettled([loadOverview(), loadOperations()]);
  return results
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason?.message || 'Could not load admin overview data.');
}

async function ensureViewLoaded(view) {
  if (view === 'overview') {
    await loadOverviewBundle();
    return;
  }
  if (view === 'moderation') {
    if (state.currentModerationMode === 'overlay') {
      await loadOverlayQueue();
    } else {
      await loadLegacyQueue();
    }
    return;
  }
  if (view === 'users') {
    await loadUsers();
    return;
  }
  if (view === 'multiplayer') {
    await loadRooms();
    return;
  }
  if (view === 'content') {
    await loadSiteContent();
    return;
  }
  if (view === 'diagnostics') {
    if (!state.dashboardOverview || !state.operations) {
      await loadOverviewBundle();
    }
    return;
  }
  if (view === 'operations') {
    await loadOperations();
    return;
  }
  if (view === 'activity') {
    await loadActivity();
  }
}

async function refreshCurrentView() {
  if (!adminAllowed()) return;
  setBusy(true);
  setStatus('Refreshing admin data...');
  try {
    await getAndStoreAccountOverview();
    const overviewErrors = await loadOverviewBundle();
    await ensureViewLoaded(state.currentView);
    renderAllVisible();
    setStatus(overviewErrors[0] || 'Dashboard refreshed.', overviewErrors.length ? 'warn' : 'ok');
  } catch (error) {
    console.error('[admin-dashboard] Refresh failed:', error);
    setStatus(error?.message || 'Could not refresh the admin dashboard.', 'warn');
  } finally {
    setBusy(false);
  }
}

function setView(view, { pushHistory = true } = {}) {
  const next = VIEW_META[view] ? view : 'overview';
  state.currentView = next;
  if (pushHistory) {
    const url = new URL(window.location.href);
    url.searchParams.set('view', next);
    window.history.replaceState({}, '', url);
  }
  renderAllVisible();
  if (!adminAllowed()) return;
  ensureViewLoaded(next).then(() => {
    renderAllVisible();
  }).catch((error) => {
    console.error('[admin-dashboard] View load failed:', error);
    setStatus(error?.message || `Could not load the ${next} view.`, 'warn');
  });
}

function getNestedValue(target, path) {
  return String(path || '')
    .split('.')
    .filter(Boolean)
    .reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), target);
}

function setNestedValue(target, path, value) {
  const parts = String(path || '').split('.').filter(Boolean);
  if (!parts.length) return;
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
}

function updateSiteDraftFromField(path, value) {
  if (!state.siteContentDraft) {
    state.siteContentDraft = cloneLandingContent({});
  }
  setNestedValue(state.siteContentDraft, path, value);
  state.siteContentDirty = true;
  renderSiteContentMeta();
  renderLandingContentPreview(refs.siteContentPreview, state.siteContentDraft);
}

async function getAndStoreAccountOverview() {
  state.accountOverview = await getAccountOverview();
  return state.accountOverview;
}

async function handleOverlayDecision(action) {
  const item = selectedOverlayItem();
  const noteEl = document.getElementById('overlayDecisionNote');
  if (!item) return;
  setBusy(true);
  setStatus(action === 'approve' ? 'Approving overlay submission...' : action === 'needs_changes' ? 'Requesting changes...' : 'Rejecting overlay submission...');
  try {
    const note = sanitizeLongText(noteEl?.value || '', 320);
    await moderateOverlayFeature(item.featureId, action, note);
    state.overlayDetails.delete(item.featureId);
    await Promise.all([loadOverview(), loadOverlayQueue(), loadActivity()]);
    if (state.overlaySelectedId) await ensureOverlayDetail(state.overlaySelectedId);
    renderAllVisible();
    setStatus(
      action === 'approve'
        ? 'Overlay feature approved and published to the runtime overlay layer.'
        : action === 'needs_changes'
          ? 'Overlay feature returned with reviewer feedback.'
          : 'Overlay feature rejected and kept out of the public layer.',
      'ok'
    );
  } catch (error) {
    console.error('[admin-dashboard] Overlay moderation failed:', error);
    setStatus(error?.message || 'Could not update overlay moderation state.', 'warn');
  } finally {
    setBusy(false);
  }
}

async function handleLegacyDecision(status) {
  const item = selectedLegacyItem();
  const noteEl = document.getElementById('legacyDecisionNote');
  if (!item) return;
  setBusy(true);
  setStatus(status === 'approved' ? 'Approving legacy contribution...' : 'Rejecting legacy contribution...');
  try {
    await moderateContributionSubmission(item.id, status, sanitizeLongText(noteEl?.value || '', 200));
    await Promise.all([loadOverview(), loadLegacyQueue(), loadActivity()]);
    renderAllVisible();
    setStatus(status === 'approved' ? 'Legacy contribution approved.' : 'Legacy contribution rejected.', 'ok');
  } catch (error) {
    console.error('[admin-dashboard] Legacy moderation failed:', error);
    setStatus(error?.message || 'Could not update legacy moderation state.', 'warn');
  } finally {
    setBusy(false);
  }
}

async function handleRoomFeaturedToggle() {
  const room = selectedRoomItem();
  if (!room) return;
  setBusy(true);
  setStatus(room.featured ? 'Removing featured-room flag...' : 'Featuring room...');
  try {
    const payload = await updateAdminRoomFlags(room.roomId, { featured: !room.featured });
    const next = payload?.item || null;
    if (next) {
      state.rooms = state.rooms.map((item) => item.roomId === next.roomId ? next : item);
    } else {
      await loadRooms();
    }
    await Promise.all([loadOverview(), loadActivity()]);
    renderAllVisible();
    setStatus(room.featured ? 'Room removed from featured rotation.' : 'Room marked as featured.', 'ok');
  } catch (error) {
    console.error('[admin-dashboard] Room flag update failed:', error);
    setStatus(error?.message || 'Could not update room admin flags.', 'warn');
  } finally {
    setBusy(false);
  }
}

async function handleSaveSiteContentDraft() {
  if (!state.siteContentDraft) return;
  setBusy(true);
  setStatus('Saving site content draft...');
  try {
    await saveAdminSiteContentDraft(LANDING_PAGE_ENTRY_ID, state.siteContentDraft);
    await Promise.all([loadSiteContent(), loadOverview(), loadActivity()]);
    renderAllVisible();
    setStatus('Landing-page draft saved.', 'ok');
  } catch (error) {
    console.error('[admin-dashboard] Site content save failed:', error);
    setStatus(error?.message || 'Could not save site content draft.', 'warn');
  } finally {
    setBusy(false);
  }
}

async function handlePublishSiteContent() {
  setBusy(true);
  setStatus('Publishing landing page content...');
  try {
    await publishAdminSiteContent(LANDING_PAGE_ENTRY_ID);
    await Promise.all([loadSiteContent(), loadOverview(), loadOperations(), loadActivity()]);
    renderAllVisible();
    setStatus('Landing-page content published.', 'ok');
  } catch (error) {
    console.error('[admin-dashboard] Site content publish failed:', error);
    setStatus(error?.message || 'Could not publish site content.', 'warn');
  } finally {
    setBusy(false);
  }
}

async function handleAuthUser(user) {
  state.user = user || null;
  state.accountOverview = null;
  state.dashboardOverview = null;
  state.operations = null;
  if (!hasFirebaseConfig()) {
    renderAllVisible();
    setStatus('Firebase config is missing, so admin tools are unavailable here.', 'warn');
    return;
  }
  if (!state.user) {
    renderAllVisible();
    setStatus('Sign in with an authorized admin account to open the dashboard.');
    return;
  }
  setBusy(true);
  setStatus('Checking admin access...');
  try {
    await getAndStoreAccountOverview();
    if (!adminAllowed()) {
      renderAllVisible();
      setStatus('This account does not currently have admin access.', 'warn');
      return;
    }
    const overviewErrors = await loadOverviewBundle();
    renderAllVisible();
    await ensureViewLoaded(state.currentView);
    renderAllVisible();
    setStatus(overviewErrors[0] || 'Admin dashboard ready.', overviewErrors.length ? 'warn' : 'ok');
  } catch (error) {
    console.error('[admin-dashboard] Auth handling failed:', error);
    renderAllVisible();
    setStatus(error?.message || 'Could not load admin access.', 'warn');
  } finally {
    setBusy(false);
  }
}

refs.navButtons.forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view || 'overview'));
});

refs.refreshViewBtn.addEventListener('click', () => {
  refreshCurrentView();
});

refs.signInBtn.addEventListener('click', async () => {
  setBusy(true);
  setStatus('Signing in...');
  try {
    await ensureSignedIn();
  } catch (error) {
    setStatus(error?.message || 'Could not sign in.', 'warn');
    setBusy(false);
  }
});

refs.enableAdminBtn.addEventListener('click', async () => {
  setBusy(true);
  setStatus('Enabling admin access...');
  try {
    await enableAdminTester();
    await handleAuthUser(state.user);
  } catch (error) {
    console.error('[admin-dashboard] Enable admin failed:', error);
    setStatus(error?.message || 'Could not enable admin access.', 'warn');
    setBusy(false);
  }
});

refs.signOutBtn.addEventListener('click', async () => {
  setBusy(true);
  setStatus('Signing out...');
  try {
    await signOutUser();
    setStatus('Signed out.');
  } catch (error) {
    setStatus(error?.message || 'Could not sign out.', 'warn');
  } finally {
    setBusy(false);
  }
});

document.addEventListener('click', async (event) => {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) return;

  const goTo = target.closest('[data-goto-view]');
  if (goTo) {
    setView(goTo.getAttribute('data-goto-view') || 'overview');
    return;
  }

  const modeBtn = target.closest('[data-moderation-mode]');
  if (modeBtn) {
    state.currentModerationMode = modeBtn.getAttribute('data-moderation-mode') || 'overlay';
    renderModeration();
    try {
      setBusy(true);
      await ensureViewLoaded('moderation');
      renderModeration();
    } catch (error) {
      setStatus(error?.message || 'Could not load moderation queue.', 'warn');
    } finally {
      setBusy(false);
    }
    return;
  }

  const overlayCard = target.closest('[data-overlay-id]');
  if (overlayCard) {
    state.overlaySelectedId = overlayCard.getAttribute('data-overlay-id') || '';
    renderOverlayList();
    renderOverlayDetail();
    try {
      await ensureOverlayDetail(state.overlaySelectedId);
      renderOverlayDetail();
    } catch (error) {
      setStatus(error?.message || 'Could not load overlay detail.', 'warn');
    }
    return;
  }

  const legacyCard = target.closest('[data-legacy-id]');
  if (legacyCard) {
    state.legacySelectedId = legacyCard.getAttribute('data-legacy-id') || '';
    renderLegacyList();
    renderLegacyDetail();
    return;
  }

  const userCard = target.closest('[data-user-id]');
  if (userCard) {
    state.selectedUserId = userCard.getAttribute('data-user-id') || '';
    renderUsersList();
    renderUsersDetail();
    try {
      if (!state.userDetails.has(state.selectedUserId)) {
        state.userDetails.set(state.selectedUserId, await getAdminUserDetail(state.selectedUserId));
      }
      renderUsersDetail();
    } catch (error) {
      setStatus(error?.message || 'Could not load user detail.', 'warn');
    }
    return;
  }

  const roomCard = target.closest('[data-room-id]');
  if (roomCard) {
    state.selectedRoomId = roomCard.getAttribute('data-room-id') || '';
    renderRoomsList();
    renderRoomsDetail();
    return;
  }

  if (target.id === 'overlayApplyFilters') {
    state.overlayFilters.reviewState = sanitizeText(document.getElementById('overlayReviewState')?.value || 'submitted', 40).toLowerCase();
    state.overlayFilters.presetId = sanitizeText(document.getElementById('overlayPresetFilter')?.value || 'all', 80).toLowerCase();
    state.overlayFilters.geometryType = sanitizeText(document.getElementById('overlayGeometryFilter')?.value || 'all', 20);
    state.overlayFilters.contributor = sanitizeText(document.getElementById('overlayContributorFilter')?.value || '', 80);
    state.overlayFilters.region = sanitizeText(document.getElementById('overlayRegionFilter')?.value || '', 80);
    state.overlayFilters.search = sanitizeText(document.getElementById('overlaySearchFilter')?.value || '', 80);
    state.overlayFilters.timeWindow = sanitizeText(document.getElementById('overlayTimeWindow')?.value || 'all', 20).toLowerCase();
    setBusy(true);
    setStatus('Loading filtered overlay queue...');
    try {
      state.overlayDetails.clear();
      await loadOverlayQueue();
      renderModeration();
      setStatus('Overlay moderation queue updated.', 'ok');
    } catch (error) {
      setStatus(error?.message || 'Could not filter the overlay moderation queue.', 'warn');
    } finally {
      setBusy(false);
    }
    return;
  }

  if (target.id === 'legacyApplyFilters') {
    state.legacyFilters.status = sanitizeText(document.getElementById('legacyStatusFilter')?.value || 'pending', 20).toLowerCase();
    state.legacyFilters.editType = sanitizeText(document.getElementById('legacyTypeFilter')?.value || 'all', 40).toLowerCase();
    state.legacyFilters.search = sanitizeText(document.getElementById('legacySearchFilter')?.value || '', 80);
    setBusy(true);
    setStatus('Loading filtered legacy queue...');
    try {
      await loadLegacyQueue();
      renderModeration();
      setStatus('Legacy moderation queue updated.', 'ok');
    } catch (error) {
      setStatus(error?.message || 'Could not filter the legacy moderation queue.', 'warn');
    } finally {
      setBusy(false);
    }
    return;
  }

  if (target.id === 'overlayApproveBtn') {
    await handleOverlayDecision('approve');
    return;
  }
  if (target.id === 'overlayNeedsChangesBtn') {
    await handleOverlayDecision('needs_changes');
    return;
  }
  if (target.id === 'overlayRejectBtn') {
    await handleOverlayDecision('reject');
    return;
  }
  if (target.id === 'legacyApproveBtn') {
    await handleLegacyDecision('approved');
    return;
  }
  if (target.id === 'legacyRejectBtn') {
    await handleLegacyDecision('rejected');
    return;
  }

  if (target.id === 'usersApplyFilters') {
    state.userFilters.role = sanitizeText(document.getElementById('userRoleFilter')?.value || 'all', 40).toLowerCase();
    state.userFilters.search = sanitizeText(document.getElementById('userSearchFilter')?.value || '', 80);
    setBusy(true);
    setStatus('Loading users...');
    try {
      state.userDetails.clear();
      await loadUsers();
      renderAllVisible();
      setStatus('User list updated.', 'ok');
    } catch (error) {
      setStatus(error?.message || 'Could not load users.', 'warn');
    } finally {
      setBusy(false);
    }
    return;
  }

  if (target.id === 'roomsApplyFilters') {
    state.roomFilters.visibility = sanitizeText(document.getElementById('roomVisibilityFilter')?.value || 'all', 20).toLowerCase();
    state.roomFilters.worldKind = sanitizeText(document.getElementById('roomWorldFilter')?.value || 'all', 20).toLowerCase();
    state.roomFilters.featuredOnly = document.getElementById('roomFeaturedOnly')?.checked === true;
    state.roomFilters.search = sanitizeText(document.getElementById('roomSearchFilter')?.value || '', 80);
    setBusy(true);
    setStatus('Loading multiplayer rooms...');
    try {
      await loadRooms();
      renderAllVisible();
      setStatus('Room list updated.', 'ok');
    } catch (error) {
      setStatus(error?.message || 'Could not load rooms.', 'warn');
    } finally {
      setBusy(false);
    }
    return;
  }

  if (target.id === 'toggleRoomFeaturedBtn') {
    await handleRoomFeaturedToggle();
    return;
  }

  if (target.id === 'reloadSiteContentBtn') {
    setBusy(true);
    setStatus('Reloading site content...');
    try {
      await loadSiteContent();
      renderAllVisible();
      setStatus('Landing-page draft reloaded.', 'ok');
    } catch (error) {
      setStatus(error?.message || 'Could not reload site content.', 'warn');
    } finally {
      setBusy(false);
    }
    return;
  }

  if (target.id === 'saveSiteContentBtn') {
    await handleSaveSiteContentDraft();
    return;
  }
  if (target.id === 'publishSiteContentBtn') {
    await handlePublishSiteContent();
    return;
  }
  if (target.id === 'addHighlightBtn') {
    if (!state.siteContentDraft) state.siteContentDraft = cloneLandingContent({});
    state.siteContentDraft.highlights.push({
      id: `highlight_${state.siteContentDraft.highlights.length + 1}`,
      title: '',
      body: ''
    });
    state.siteContentDirty = true;
    renderAllVisible();
    return;
  }
  const removeHighlight = target.getAttribute('data-remove-highlight');
  if (removeHighlight != null) {
    const index = Number(removeHighlight);
    if (state.siteContentDraft?.highlights?.[index]) {
      state.siteContentDraft.highlights.splice(index, 1);
      state.siteContentDirty = true;
      renderAllVisible();
    }
    return;
  }

  if (target.id === 'activityApplyFilters') {
    state.activityFilters.actionPrefix = sanitizeText(document.getElementById('activityPrefixFilter')?.value || '', 40).toLowerCase();
    setBusy(true);
    setStatus('Loading activity log...');
    try {
      await loadActivity();
      renderAllVisible();
      setStatus('Activity log updated.', 'ok');
    } catch (error) {
      setStatus(error?.message || 'Could not load activity log.', 'warn');
    } finally {
      setBusy(false);
    }
  }
});

document.addEventListener('input', (event) => {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) return;
  if (target.hasAttribute('data-site-path')) {
    const path = target.getAttribute('data-site-path') || '';
    const value = target instanceof HTMLInputElement && target.type === 'checkbox'
      ? target.checked
      : target.value;
    updateSiteDraftFromField(path, value);
    return;
  }
  if (target.hasAttribute('data-highlight-index') && target.hasAttribute('data-highlight-field')) {
    const index = Number(target.getAttribute('data-highlight-index'));
    const field = target.getAttribute('data-highlight-field') || '';
    if (!state.siteContentDraft?.highlights?.[index]) return;
    state.siteContentDraft.highlights[index][field] = target.value;
    state.siteContentDirty = true;
    renderSiteContentMeta();
    renderLandingContentPreview(refs.siteContentPreview, state.siteContentDraft);
  }
});

document.addEventListener('change', (event) => {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) return;
  if (target.hasAttribute('data-site-path')) {
    const path = target.getAttribute('data-site-path') || '';
    const value = target instanceof HTMLInputElement && target.type === 'checkbox'
      ? target.checked
      : target.value;
    updateSiteDraftFromField(path, value);
  }
});

window.addEventListener('popstate', () => {
  const url = new URL(window.location.href);
  setView(url.searchParams.get('view') || 'overview', { pushHistory: false });
});

const initialUrl = new URL(window.location.href);
state.currentView = VIEW_META[initialUrl.searchParams.get('view')] ? initialUrl.searchParams.get('view') : 'overview';
renderAllVisible();
observeAuth((user) => {
  handleAuthUser(user);
});
