import {
  escapeHtml,
  formatDateTime,
  formatPercentLike,
  formatRelative,
  optionMarkup,
  pluralize
} from './admin-dashboard-format.js?v=1';

export function createAdminCommunityView(state, refs) {
  function renderUsersFilters() {
    refs.usersFilters.innerHTML = `
      <label>Role<select id="userRoleFilter">${optionMarkup([
        ['all', 'All roles'], ['admin', 'Admin'], ['member', 'Member']
      ], state.userFilters.role)}</select></label>
      <label class="filter-wide">Search<input id="userSearchFilter" type="text" maxlength="80" value="${escapeHtml(state.userFilters.search)}" placeholder="Display name, email, uid"></label>
      <div class="filter-actions"><button type="button" class="secondary-btn" id="usersApplyFilters">Apply Filters</button></div>`;
  }

  function renderUsersList() {
    refs.usersList.innerHTML = state.users.map((item) => `
      <article class="queue-card${item.uid === state.selectedUserId ? ' selected' : ''}" data-user-id="${escapeHtml(item.uid)}">
        <div class="queue-card-top"><strong>${escapeHtml(item.displayName || 'Explorer')}</strong><span class="mini-chip">${escapeHtml(item.role || 'member')}</span></div>
        <div class="queue-card-meta">${escapeHtml(item.email || item.uid)}</div>
        <p>${escapeHtml(`Plan ${item.plan || 'free'} • ${item.subscriptionStatus || 'none'} • ${pluralize(item.roomCreateCount || 0, 'room created')}`)}</p>
        <div class="queue-card-footer"><span>${escapeHtml(item.uid)}</span><span>${escapeHtml(formatRelative(item.updatedAtMs || item.createdAtMs))}</span></div>
      </article>`).join('') || '<div class="empty-card">No users match the current admin filter set.</div>';
  }

  function renderUsersDetail() {
    const selected = state.users.find((item) => item.uid === state.selectedUserId) || null;
    if (!selected) {
      refs.usersDetail.innerHTML = '<div class="empty-card">Select a user to inspect submission history, owned rooms, and account state.</div>';
      return;
    }
    const detail = state.userDetails.get(selected.uid);
    if (!detail) {
      refs.usersDetail.innerHTML = '<div class="empty-card">Loading user detail…</div>';
      return;
    }
    refs.usersDetail.innerHTML = `
      <div class="detail-header"><div><h3>${escapeHtml(detail.user?.displayName || selected.displayName || 'Explorer')}</h3><p>${escapeHtml(detail.user?.email || selected.email || selected.uid)}</p></div><span class="status-pill" data-status="${escapeHtml(detail.user?.role || 'member')}">${escapeHtml(detail.user?.role || 'member')}</span></div>
      <div class="detail-grid">
        <article class="detail-card"><span class="detail-label">Plan</span><strong>${escapeHtml(detail.user?.plan || 'free')}</strong><p>${escapeHtml(detail.user?.subscriptionStatus || 'none')}</p></article>
        <article class="detail-card"><span class="detail-label">Rooms</span><strong>${escapeHtml(String(detail.stats?.ownedRooms || 0))}</strong><p>${escapeHtml(`${detail.user?.roomCreateCount || 0} / ${detail.user?.roomCreateLimit || 0} quota used`)}</p></article>
        <article class="detail-card"><span class="detail-label">Overlay Submissions</span><strong>${escapeHtml(String(detail.stats?.overlaySubmissions || 0))}</strong><p>${escapeHtml(pluralize(detail.stats?.legacySubmissions || 0, 'legacy contribution'))}</p></article>
        <article class="detail-card"><span class="detail-label">Account State</span><strong>${detail.user?.disabled ? 'Disabled' : 'Active'}</strong><p>${detail.user?.emailVerified ? 'Email verified' : 'Email not verified'}</p></article>
      </div>
      <div class="detail-split">
        <section class="detail-section"><div class="detail-section-title">Recent Overlay Features</div><div class="timeline-list">${detail.recentOverlay?.map((entry) => `<article class="timeline-card"><strong>${escapeHtml(entry.summary || entry.presetId || 'Overlay')}</strong><span>${escapeHtml(entry.reviewState || 'draft')}</span><p>${escapeHtml(formatDateTime(entry.updatedAtMs || entry.createdAtMs))}</p></article>`).join('') || '<div class="detail-note">No overlay submissions found.</div>'}</div></section>
        <section class="detail-section"><div class="detail-section-title">Recent Legacy Contributions</div><div class="timeline-list">${detail.recentLegacy?.map((entry) => `<article class="timeline-card"><strong>${escapeHtml(entry.title || entry.payload?.title || 'Legacy contribution')}</strong><span>${escapeHtml(entry.status || 'pending')}</span><p>${escapeHtml(formatDateTime(entry.createdAtMs))}</p></article>`).join('') || '<div class="detail-note">No legacy contributions found.</div>'}</div></section>
      </div>
      <section class="detail-section"><div class="detail-section-title">Owned Rooms</div><div class="timeline-list">${detail.ownedRooms?.map((room) => `<article class="timeline-card"><strong>${escapeHtml(room.name || room.code || 'Room')}</strong><span>${escapeHtml(room.visibility || 'private')}</span><p>${escapeHtml(`${room.worldKind || 'earth'} • ${pluralize(room.activePlayers || 0, 'active player')} • ${room.featured ? 'featured' : 'standard'}`)}</p></article>`).join('') || '<div class="detail-note">No owned rooms found.</div>'}</div></section>`;
  }

  function renderRoomsFilters() {
    refs.roomsFilters.innerHTML = `
      <label>Visibility<select id="roomVisibilityFilter">${optionMarkup([
        ['all', 'All visibility'], ['public', 'Public'], ['private', 'Private']
      ], state.roomFilters.visibility)}</select></label>
      <label>World<select id="roomWorldFilter">${optionMarkup([
        ['all', 'All worlds'], ['earth', 'Earth'], ['moon', 'Moon'], ['space', 'Space']
      ], state.roomFilters.worldKind)}</select></label>
      <label class="filter-toggle"><input id="roomFeaturedOnly" type="checkbox" ${state.roomFilters.featuredOnly ? 'checked' : ''}>Featured only</label>
      <label class="filter-wide">Search<input id="roomSearchFilter" type="text" maxlength="80" value="${escapeHtml(state.roomFilters.search)}" placeholder="Room code, owner, location"></label>
      <div class="filter-actions"><button type="button" class="secondary-btn" id="roomsApplyFilters">Apply Filters</button></div>`;
  }

  function renderRoomsList() {
    refs.roomsList.innerHTML = state.rooms.map((room) => `
      <article class="queue-card${room.roomId === state.selectedRoomId ? ' selected' : ''}" data-room-id="${escapeHtml(room.roomId)}">
        <div class="queue-card-top"><strong>${escapeHtml(room.name || room.code || 'Room')}</strong><span class="mini-chip">${room.featured ? 'featured' : 'standard'}</span></div>
        <div class="queue-card-meta">${escapeHtml(`${room.visibility || 'private'} • ${room.worldKind || 'earth'} • ${room.code || room.roomId}`)}</div>
        <p>${escapeHtml(room.locationLabel || room.locationCity || room.cityKey || 'No location tag')}</p>
        <div class="queue-card-footer"><span>${escapeHtml(pluralize(room.activePlayers ?? 0, 'active player'))}</span><span>${escapeHtml(formatRelative(room.updatedAtMs || room.createdAtMs))}</span></div>
      </article>`).join('') || '<div class="empty-card">No rooms match the current admin filter set.</div>';
  }

  function renderRoomsDetail() {
    const room = state.rooms.find((item) => item.roomId === state.selectedRoomId) || null;
    if (!room) {
      refs.roomsDetail.innerHTML = '<div class="empty-card">Select a room to inspect occupancy, rules, and featured-room state.</div>';
      return;
    }
    refs.roomsDetail.innerHTML = `
      <div class="detail-header"><div><h3>${escapeHtml(room.name || room.code || 'Room')}</h3><p>${escapeHtml(`${room.visibility || 'private'} • ${room.worldKind || 'earth'} • owner ${room.ownerUid || 'unknown'}`)}</p></div><span class="status-pill" data-status="${room.featured ? 'approved' : 'pending'}">${room.featured ? 'featured' : 'standard'}</span></div>
      <div class="detail-grid">
        <article class="detail-card"><span class="detail-label">Occupancy</span><strong>${escapeHtml(String(room.activePlayers ?? 0))}</strong><p>${escapeHtml(`${room.maxPlayers || 0} max players`)}</p></article>
        <article class="detail-card"><span class="detail-label">Artifacts</span><strong>${escapeHtml(String(room.artifactCount ?? 0))}</strong><p>${escapeHtml(pluralize(room.blockCount ?? 0, 'block'))}</p></article>
        <article class="detail-card"><span class="detail-label">Location</span><strong>${escapeHtml(room.locationLabel || room.locationCity || room.cityKey || 'Not tagged')}</strong><p>${escapeHtml(room.worldSeed || 'No world seed')}</p></article>
        <article class="detail-card"><span class="detail-label">Created</span><strong>${escapeHtml(formatDateTime(room.createdAtMs))}</strong><p>${escapeHtml(formatRelative(room.updatedAtMs || room.createdAtMs))}</p></article>
      </div>
      <section class="detail-section"><div class="detail-section-title">Room Rules</div><div class="tag-row"><span class="tag-chip">Chat: ${room.rules?.allowChat ? 'on' : 'off'}</span><span class="tag-chip">Ghosts: ${room.rules?.allowGhosts ? 'on' : 'off'}</span><span class="tag-chip">Paint limit: ${formatPercentLike(room.rules?.paintTimeLimitSec)} sec</span><span class="tag-chip">Paint touch: ${escapeHtml(room.rules?.paintTouchMode || 'any')}</span></div></section>
      <div class="action-row"><a class="secondary-btn" href="${escapeHtml(new URL(`../app/?tab=multiplayer&room=${encodeURIComponent(room.code || room.roomId)}`, window.location.href).toString())}" target="_blank" rel="noreferrer">Open Room</a><button type="button" class="primary-btn" id="toggleRoomFeaturedBtn">${room.featured ? 'Remove Featured' : 'Mark Featured'}</button></div>`;
  }

  return { renderUsersFilters, renderUsersList, renderUsersDetail, renderRoomsFilters, renderRoomsList, renderRoomsDetail };
}
