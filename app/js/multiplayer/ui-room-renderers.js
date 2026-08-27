import { createUiRoomMapApi } from "./ui-room-map.js?v=1";

export function createUiRoomRenderers({ appCtx, refs, state, helpers }) {
  const {
    applyPaintRulesToPanel,
    buildWeeklyFeaturedRoomCode,
    escapeHtml,
    emitTutorialEvent,
    formatRelativeTime,
    getRecommendedRoomCap,
    getWeeklyCitySelection,
    normalizeCode,
    normalizeVisibilitySelection,
    resolveWeeklyFeaturedWorld,
    safeHtml,
    sanitizeText
  } = helpers;

  const { publishMapRoomsToContext } = createUiRoomMapApi({ appCtx, state, helpers });

  function canManageCurrentRoomActivities() {
    return !!(
      state.currentRoom &&
      state.authUser &&
      String(state.currentRoom.ownerUid || "") === String(state.authUser.uid || "")
    );
  }

  function closeRoomPanel() {
    if (!refs.roomPanelModal) return;
    refs.roomPanelModal.classList.remove("show");
  }

  function openRoomPanel() {
    if (!refs.roomPanelModal) return;
    refs.roomPanelModal.classList.add("show");
    emitTutorialEvent("opened_rooms_menu", { source: "room_panel" });
  }

  function setChatStatus(message, warn = false) {
    if (!refs.chatStatus) return;
    refs.chatStatus.textContent = message || "";
    refs.chatStatus.style.color = warn ? "#fca5a5" : "#93c5fd";
  }

  function setStatus(message, warn = false) {
    if (refs.titleStatus) {
      refs.titleStatus.textContent = message || "";
      refs.titleStatus.style.color = warn ? "#ef4444" : "#64748b";
    }
    if (refs.roomPanelStatus) {
      refs.roomPanelStatus.textContent = message || "";
      refs.roomPanelStatus.style.color = warn ? "#fca5a5" : "#93c5fd";
    }
  }

  function setBrowseStatus(message, warn = false) {
    if (!refs.titleBrowseStatus) return;
    refs.titleBrowseStatus.textContent = message || "";
    refs.titleBrowseStatus.style.color = warn ? "#b91c1c" : "#64748b";
  }

  function renderBrowseRooms() {
    if (!refs.titleBrowseList) return;

    if (!state.browseRooms.length) {
      if (state.browseCityKey) {
        refs.titleBrowseList.innerHTML = '<li class="mpRoomEmpty">No public rooms found for that city tag.</li>';
      } else {
        refs.titleBrowseList.innerHTML =
          '<li class="mpRoomEmpty">Search a city to find public rooms (view-only if signed out).</li>';
      }
      publishMapRoomsToContext();
      return;
    }

    refs.titleBrowseList.innerHTML = state.browseRooms
      .map((room) => {
        const code = normalizeCode(room.code);
        const worldKind = sanitizeText(room.world?.kind || "earth", 16).toUpperCase();
        const roomName = safeHtml(room.name || `${worldKind} Session`, 80);
        const locationLabel = safeHtml(room.locationTag?.label || room.locationTag?.city || "Unknown location", 80);
        const joinButton = state.authUser
          ? `<button class="mp-btn secondary mpRoomJoinBtn" data-room-code="${escapeHtml(code)}" type="button">Join</button>`
          : '<button class="mp-btn secondary mpRoomJoinBtn" type="button" disabled title="Sign in to join">View</button>';
        return `<li class="mpRoomItem"><div class="mpRoomInfo"><div class="mpRoomName">${roomName}</div><div class="mpRoomMeta">${locationLabel} • ${escapeHtml(worldKind)} • ${escapeHtml(code)}</div></div>${joinButton}</li>`;
      })
      .join("");
    publishMapRoomsToContext();
  }

  function renderWeeklyFeaturedCallout() {
    const weekly = getWeeklyCitySelection();
    const roomCode = buildWeeklyFeaturedRoomCode(weekly);
    const inWeeklyRoom = normalizeCode(state.currentRoom?.code || "") === roomCode;

    if (refs.titleFeaturedWeeklyBtn) {
      refs.titleFeaturedWeeklyBtn.disabled = !state.authUser;
      refs.titleFeaturedWeeklyBtn.textContent = inWeeklyRoom
        ? `In Weekly Room • ${weekly.city}`
        : `Join Weekly City • ${weekly.city}`;
    }

    if (refs.titleFeaturedWeeklyMeta) {
      refs.titleFeaturedWeeklyMeta.textContent = state.authUser
        ? `Week ${weekly.week}: ${weekly.city}. Public room code ${roomCode}.`
        : "Weekly city room rotates each week. Sign in to join.";
      refs.titleFeaturedWeeklyMeta.style.color = "#64748b";
    }
  }

  function renderFeaturedRooms() {
    renderWeeklyFeaturedCallout();
    if (!refs.titleFeaturedList) return;
    if (!state.featuredRooms.length) {
      refs.titleFeaturedList.innerHTML = '<li class="mpRoomEmpty">No featured rooms yet.</li>';
      publishMapRoomsToContext();
      return;
    }
    refs.titleFeaturedList.innerHTML = state.featuredRooms
      .map((room) => {
        const code = normalizeCode(room.code);
        const roomName = safeHtml(room.name || "Untitled Room", 80);
        const locationLabel = safeHtml(room.locationTag?.label || room.locationTag?.city || "Unknown location", 80);
        const joinButton = state.authUser
          ? `<button class="mp-btn secondary mpRoomJoinBtn" data-room-code="${escapeHtml(code)}" type="button">Join</button>`
          : '<button class="mp-btn secondary mpRoomJoinBtn" type="button" disabled title="Sign in to join">View</button>';
        return `<li class="mpRoomItem"><div class="mpRoomInfo"><div class="mpRoomName">${roomName}</div><div class="mpRoomMeta">${locationLabel} • ${escapeHtml(code)}</div></div>${joinButton}</li>`;
      })
      .join("");
    publishMapRoomsToContext();
  }

  function renderFriends() {
    if (!refs.titleFriendsList) return;
    if (!state.authUser) {
      refs.titleFriendsList.innerHTML = '<li class="mpRoomEmpty">Sign in to use your friends list.</li>';
      return;
    }
    if (!state.friends.length) {
      refs.titleFriendsList.innerHTML =
        '<li class="mpRoomEmpty">No friends yet. Add by UID above or from Recent Players.</li>';
      return;
    }
    refs.titleFriendsList.innerHTML = state.friends
      .map((friend) => {
        const display = safeHtml(friend.displayName || "Explorer", 48);
        const source = safeHtml(friend.source || "manual", 12);
        const friendUid = escapeHtml(String(friend.uid || ""));
        return `<li class="mpRoomItem"><div class="mpRoomInfo"><div class="mpRoomName">${display}</div><div class="mpRoomMeta">source: ${source}</div></div><div class="mp-row"><button class="mp-btn secondary mpSmallBtn" data-invite-friend="${friendUid}" type="button">Invite</button><button class="mp-btn secondary mpSmallBtn" data-remove-friend="${friendUid}" type="button">Remove</button></div></li>`;
      })
      .join("");
  }

  function renderRecentPlayers() {
    if (!refs.titleRecentPlayersList) return;
    if (!state.authUser) {
      refs.titleRecentPlayersList.innerHTML = '<li class="mpRoomEmpty">Sign in to track recent players.</li>';
      return;
    }
    if (!state.recentPlayers.length) {
      refs.titleRecentPlayersList.innerHTML =
        '<li class="mpRoomEmpty">Play with others to populate recent players.</li>';
      return;
    }
    refs.titleRecentPlayersList.innerHTML = state.recentPlayers
      .map((player) => {
        const display = safeHtml(player.displayName || "Explorer", 48);
        const displayAttr = escapeHtml(sanitizeText(player.displayName || "Explorer", 48));
        const roomCode = normalizeCode(player.roomCode || "");
        const roomLabel = safeHtml(player.roomName || roomCode || "", 80);
        const roomCodeSafe = escapeHtml(roomCode || "----");
        const sessions = Math.max(1, Number(player.sharedSessions || 1));
        return `<li class="mpRoomItem"><div class="mpRoomInfo"><div class="mpRoomName">${display}</div><div class="mpRoomMeta">${roomLabel || "Recent room"} • ${roomCodeSafe} • sessions ${sessions}</div></div><div class="mp-row"><button class="mp-btn secondary mpSmallBtn" data-add-friend="${escapeHtml(String(player.uid || ""))}" data-player-name="${displayAttr}" type="button">Add Friend</button><button class="mp-btn secondary mpSmallBtn" data-join-recent="${escapeHtml(roomCode)}" type="button">Join</button></div></li>`;
      })
      .join("");
  }

  function renderInvites() {
    if (!refs.titleInvitesList) return;
    if (!state.authUser) {
      refs.titleInvitesList.innerHTML = '<li class="mpRoomEmpty">Sign in to receive invites.</li>';
      return;
    }
    if (!state.invites.length) {
      refs.titleInvitesList.innerHTML = '<li class="mpRoomEmpty">No incoming invites.</li>';
      return;
    }
    refs.titleInvitesList.innerHTML = state.invites
      .map((invite) => {
        const from = safeHtml(invite.fromDisplayName || "Explorer", 48);
        const roomCode = normalizeCode(invite.roomCode || "");
        const roomName = safeHtml(invite.roomName || roomCode || "Room", 80);
        const statusBadge = invite.seen ? '<span class="mp-pill">Seen</span>' : '<span class="mp-pill">New</span>';
        const message = invite.message ? `<div class="mpRoomMeta">${safeHtml(invite.message, 120)}</div>` : "";
        return `<li class="mpRoomItem"><div class="mpRoomInfo"><div class="mpRoomName">${from} invited you ${statusBadge}</div><div class="mpRoomMeta">${roomName} • ${escapeHtml(roomCode)}</div>${message}</div><div class="mp-row"><button class="mp-btn secondary mpSmallBtn" data-accept-invite="${escapeHtml(String(invite.id || ""))}" data-room-code="${escapeHtml(roomCode)}" type="button">Join</button><button class="mp-btn secondary mpSmallBtn" data-dismiss-invite="${escapeHtml(String(invite.id || ""))}" type="button">Dismiss</button></div></li>`;
      })
      .join("");
  }

  function renderOwnedRooms() {
    if (!refs.titleOwnedRoomsList) return;
    if (!state.authUser) {
      refs.titleOwnedRoomsList.innerHTML = '<li class="mpRoomEmpty">Sign in to manage rooms you created.</li>';
      if (refs.titleOwnedRoomsStatus) {
        refs.titleOwnedRoomsStatus.textContent = "Sign in to access your saved rooms.";
        refs.titleOwnedRoomsStatus.style.color = "#64748b";
      }
      publishMapRoomsToContext();
      return;
    }

    if (!state.ownedRooms.length) {
      refs.titleOwnedRoomsList.innerHTML = '<li class="mpRoomEmpty">No saved rooms yet.</li>';
      if (refs.titleOwnedRoomsStatus) {
        refs.titleOwnedRoomsStatus.textContent = "Create or join a room to save it here for quick return.";
        refs.titleOwnedRoomsStatus.style.color = "#64748b";
      }
      publishMapRoomsToContext();
      return;
    }

    refs.titleOwnedRoomsList.innerHTML = state.ownedRooms
      .map((room) => {
        const code = normalizeCode(room.code || room.id || "");
        const name = safeHtml(room.name || code || "Untitled Room", 80);
        const visibility = safeHtml(room.visibility || "private", 16);
        const role = safeHtml(room.role || (room.ownerUid === state.authUser?.uid ? "owner" : "member"), 16);
        const location = safeHtml(room.locationTag?.label || room.locationTag?.city || "", 80);
        const locationMeta = location ? ` • ${location}` : "";
        const canDelete = String(room.ownerUid || "") === String(state.authUser?.uid || "");
        const deleteBtn = canDelete
          ? `<button class="mp-btn secondary mpSmallBtn" data-delete-owned-room="${escapeHtml(code)}" type="button">Delete</button>`
          : "";
        return `<li class="mpRoomItem" data-owned-room-code="${escapeHtml(code)}" tabindex="0" role="button" aria-label="Open room ${escapeHtml(code)}"><div class="mpRoomInfo"><div class="mpRoomName">${name}</div><div class="mpRoomMeta">${escapeHtml(code)} • ${visibility} • ${role}${locationMeta}</div></div><div class="mp-row"><button class="mp-btn secondary mpSmallBtn" data-open-owned-room="${escapeHtml(code)}" type="button">Open</button>${deleteBtn}</div></li>`;
      })
      .join("");

    if (refs.titleOwnedRoomsStatus) {
      refs.titleOwnedRoomsStatus.textContent = `${state.ownedRooms.length} saved room${state.ownedRooms.length === 1 ? "" : "s"}. Use Open to return anytime.`;
      refs.titleOwnedRoomsStatus.style.color = "#64748b";
    }
    publishMapRoomsToContext();
  }

  function upsertOwnedRoomLocal(room) {
    if (!room || !state.authUser || !state.authUser.uid) return;
    const code = normalizeCode(room.code || room.id || "");
    if (!code) return;

    const normalized = {
      ...room,
      role: String(room.role || (String(room.ownerUid || "") === String(state.authUser.uid) ? "owner" : "member")).toLowerCase()
    };
    const next = Array.isArray(state.ownedRooms) ? [...state.ownedRooms] : [];
    const idx = next.findIndex((entry) => normalizeCode(entry.code || entry.id || "") === code);
    if (idx >= 0) next[idx] = normalized;
    else next.unshift(normalized);
    state.ownedRooms = next;
    renderOwnedRooms();
  }

  function renderLeaderboard() {
    if (!refs.titleLeaderboardList) return;
    if (!state.leaderboard.length) {
      refs.titleLeaderboardList.innerHTML =
        '<li class="mpRoomEmpty">No Explorer League activity yet. Join rooms, share artifacts, and make connections to begin.</li>';
      return;
    }
    refs.titleLeaderboardList.innerHTML = state.leaderboard
      .map((entry, idx) => {
        const rank = idx + 1;
        const display = safeHtml(entry.displayName || "Explorer", 48);
        const summary = `Score ${Math.max(0, Number(entry.score || 0))} • Rooms ${Math.max(0, Number(entry.roomsJoined || 0))} • Artifacts ${Math.max(0, Number(entry.artifactsShared || 0))}`;
        return `<li class="mpFeedItem"><div class="mpFeedTitle">#${rank} ${display}</div><div class="mpFeedMeta">${escapeHtml(summary)}</div><div class="mpFeedMeta">last active ${escapeHtml(formatRelativeTime(entry.lastActiveAt))}</div></li>`;
      })
      .join("");
  }

  function renderArtifacts() {
    if (!refs.roomArtifactList) return;
    if (!state.currentRoom) {
      refs.roomArtifactList.innerHTML = '<li class="mpRoomEmpty">Join a room to load shared artifacts.</li>';
      return;
    }
    if (!state.artifacts.length) {
      refs.roomArtifactList.innerHTML = '<li class="mpRoomEmpty">No shared artifacts yet.</li>';
      return;
    }
    refs.roomArtifactList.innerHTML = state.artifacts
      .map((artifact) => {
        const type = safeHtml(artifact.type || "pin", 20);
        const title = safeHtml(artifact.title || "Untitled", 80);
        const owner = safeHtml(artifact.ownerDisplayName || "Explorer", 48);
        const mine = artifact.ownerUid && state.authUser && artifact.ownerUid === state.authUser.uid;
        const canDelete = mine || (state.currentRoom && state.currentRoom.ownerUid === state.authUser?.uid);
        const deleteBtn = canDelete
          ? `<button class="mp-btn secondary mpSmallBtn" data-remove-artifact="${escapeHtml(String(artifact.id || ""))}" type="button">Delete</button>`
          : "";
        return `<li class="mpRoomItem"><div class="mpArtifactInfo"><div class="mpArtifactTitle">${title}</div><div class="mpArtifactMeta">${type} • by ${owner} • ${escapeHtml(formatRelativeTime(artifact.updatedAt))}</div><div class="mpArtifactMeta">${safeHtml(artifact.text || "", 280)}</div></div><div class="mp-row">${deleteBtn}</div></li>`;
      })
      .join("");
  }

  function renderRoomActivities() {
    if (!refs.roomActivityList) return;
    if (!state.currentRoom) {
      refs.roomActivityList.innerHTML = '<li class="mpRoomEmpty">Join a room to browse room games.</li>';
      return;
    }
    if (!state.roomActivities.length) {
      refs.roomActivityList.innerHTML =
        '<li class="mpRoomEmpty">No room games yet. Open Create Game to add one for this room.</li>';
      return;
    }
    const activeId = sanitizeText(state.activeRoomActivity?.activityId || "", 120).toLowerCase();
    refs.roomActivityList.innerHTML = state.roomActivities
      .map((activity) => {
        const active = sanitizeText(activity.id || "", 120).toLowerCase() === activeId;
        const title = safeHtml(activity.title || "Room Game", 80);
        const meta = `${safeHtml(activity.templateId.replace(/_/g, " ") || "activity", 40)} • ${safeHtml(activity.traversalMode || "walk", 24)} • by ${safeHtml(activity.creatorName || "Explorer", 48)}`;
        const actionLabel = active ? "Running" : "Open";
        const stopBtn = active && canManageCurrentRoomActivities()
          ? `<button class="mp-btn secondary mpSmallBtn" data-stop-room-activity="${escapeHtml(String(activity.id || ""))}" type="button">Stop</button>`
          : "";
        const deleteBtn = canManageCurrentRoomActivities()
          ? `<button class="mp-btn secondary mpSmallBtn" data-remove-room-activity="${escapeHtml(String(activity.id || ""))}" type="button">Delete</button>`
          : "";
        return `<li class="mpRoomItem ${active ? "active" : ""}" data-room-activity-id="${escapeHtml(String(activity.id || ""))}">
        <div class="mpArtifactInfo">
          <div class="mpArtifactTitle">${title}</div>
          <div class="mpArtifactMeta">${meta}</div>
          <div class="mpArtifactMeta">${safeHtml(activity.description || "Shared room game.", 220)}</div>
        </div>
        <div class="mp-row">
          <button class="mp-btn secondary mpSmallBtn" data-open-room-activity="${escapeHtml(String(activity.id || ""))}" type="button">${actionLabel}</button>
          ${stopBtn}
          ${deleteBtn}
        </div>
      </li>`;
      })
      .join("");
  }

  function renderHomeBase() {
    if (!refs.roomHomeBaseCurrent) return;
    if (!state.currentRoom) {
      refs.roomHomeBaseCurrent.textContent = "Join a room to set a home base.";
      return;
    }
    if (!state.homeBase) {
      refs.roomHomeBaseCurrent.textContent = "No home base set.";
      return;
    }
    const name = sanitizeText(state.homeBase.name || "Home Base", 80);
    const desc = sanitizeText(state.homeBase.description || "", 240);
    refs.roomHomeBaseCurrent.textContent = desc ? `${name} — ${desc}` : name;
    if (refs.roomHomeBaseNameInput && document.activeElement !== refs.roomHomeBaseNameInput) {
      refs.roomHomeBaseNameInput.value = name;
    }
    if (refs.roomHomeBaseDescInput && document.activeElement !== refs.roomHomeBaseDescInput) {
      refs.roomHomeBaseDescInput.value = desc;
    }
  }

  function refreshPlanLabel() {
    if (!refs.titlePlanState) return;
    const plan = state.entitlement.plan;
    if (state.entitlement.isAdmin === true) {
      refs.titlePlanState.textContent = "Admin mode: Multiplayer + Pro features unlocked for live testing.";
      refs.titlePlanState.classList.remove("warn");
      return;
    }
    if (plan === "pro") {
      refs.titlePlanState.textContent = "Pro donation active: multiplayer is open, plus early demo access.";
      refs.titlePlanState.classList.remove("warn");
      return;
    }
    if (plan === "supporter" || plan === "support") {
      refs.titlePlanState.textContent =
        "Supporter donation active: multiplayer is fully open. Upgrade to Pro for early demos.";
      refs.titlePlanState.classList.remove("warn");
      return;
    }
    refs.titlePlanState.textContent =
      "Signed-in explorers can create and join multiplayer rooms. Donations are optional.";
    refs.titlePlanState.classList.remove("warn");
  }

  function updateToggleStates() {
    const hasRoom = !!state.currentRoom;
    const isRoomOwner = hasRoom && !!state.authUser &&
      String(state.currentRoom.ownerUid || "") === String(state.authUser.uid || "");
    const canFeatureRoom = isRoomOwner && state.entitlement.isAdmin === true;
    if (refs.floatGhosts) {
      refs.floatGhosts.classList.toggle("on", state.ghostsEnabled);
      refs.floatGhosts.classList.toggle("disabled", !hasRoom);
    }
    if (refs.floatChat) {
      refs.floatChat.classList.toggle("on", state.chatOpen);
      refs.floatChat.classList.toggle("disabled", !hasRoom);
    }
    if (refs.chatToggleBtn) {
      refs.chatToggleBtn.classList.toggle("on", state.chatOpen);
      refs.chatToggleBtn.disabled = !hasRoom;
    }
    if (refs.chatSendBtn) refs.chatSendBtn.disabled = !hasRoom;
    if (refs.chatInput) refs.chatInput.disabled = !hasRoom;
    if (refs.titleInviteBtn) refs.titleInviteBtn.disabled = !hasRoom;
    if (refs.titleLeaveBtn) refs.titleLeaveBtn.disabled = !hasRoom;
    if (refs.roomPanelInviteBtn) refs.roomPanelInviteBtn.disabled = !hasRoom;
    if (refs.roomPanelLeaveBtn) refs.roomPanelLeaveBtn.disabled = !hasRoom;
    if (refs.roomPanelSaveSettingsBtn) refs.roomPanelSaveSettingsBtn.disabled = !isRoomOwner;
    if (refs.roomHomeBaseSaveBtn) refs.roomHomeBaseSaveBtn.disabled = !isRoomOwner;
    if (refs.roomArtifactCreateBtn) refs.roomArtifactCreateBtn.disabled = !hasRoom;
    if (refs.roomPanelFeaturedControl) refs.roomPanelFeaturedControl.hidden = state.entitlement.isAdmin !== true;
    if (refs.roomPanelFeaturedToggle) refs.roomPanelFeaturedToggle.disabled = !canFeatureRoom;
    if (refs.roomPanelNameInput) refs.roomPanelNameInput.disabled = !isRoomOwner;
    if (refs.roomPanelPaintTimeInput) refs.roomPanelPaintTimeInput.disabled = !isRoomOwner;
    if (refs.roomPanelPaintTouchModeSelect) refs.roomPanelPaintTouchModeSelect.disabled = !isRoomOwner;
    if (refs.roomPanelPaintAllowGunToggle) refs.roomPanelPaintAllowGunToggle.disabled = !isRoomOwner;
    if (refs.roomPanelPaintAllowRoofAutoToggle) refs.roomPanelPaintAllowRoofAutoToggle.disabled = !isRoomOwner;
    if (refs.roomHomeBaseNameInput) refs.roomHomeBaseNameInput.disabled = !isRoomOwner;
    if (refs.roomHomeBaseDescInput) refs.roomHomeBaseDescInput.disabled = !isRoomOwner;
    if (refs.roomArtifactTypeSelect) refs.roomArtifactTypeSelect.disabled = !hasRoom;
    if (refs.roomArtifactTitleInput) refs.roomArtifactTitleInput.disabled = !hasRoom;
    if (refs.roomArtifactTextInput) refs.roomArtifactTextInput.disabled = !hasRoom;
    if (refs.roomActivityOpenBtn) refs.roomActivityOpenBtn.disabled = !hasRoom;
    const signedIn = !!state.authUser;
    if (refs.titleAddFriendBtn) refs.titleAddFriendBtn.disabled = !signedIn;
    if (refs.titleFriendUidInput) refs.titleFriendUidInput.disabled = !signedIn;
    if (refs.titleFriendNameInput) refs.titleFriendNameInput.disabled = !signedIn;
  }

  function renderRoomMeta() {
    const room = state.currentRoom;
    if (!room) {
      if (refs.roomPanelRoomCode) refs.roomPanelRoomCode.textContent = "Not in a room";
      if (refs.roomPanelRoomName) refs.roomPanelRoomName.textContent = "Create or join to start multiplayer.";
      if (refs.roomPanelNameInput) refs.roomPanelNameInput.value = "";
      if (refs.roomPanelFeaturedToggle) refs.roomPanelFeaturedToggle.checked = false;
      applyPaintRulesToPanel(null);
      return;
    }

    if (refs.roomPanelRoomCode) refs.roomPanelRoomCode.textContent = `Room ${room.code}`;
    if (refs.roomPanelRoomName) {
      const worldName = sanitizeText(room.world?.kind || "earth", 16).toUpperCase();
      const roomName = room.name ? sanitizeText(room.name, 80) : `${worldName} Session`;
      const locationLabel = sanitizeText(room.locationTag?.label || room.locationTag?.city || "", 80);
      const capLabel = Math.max(2, Number(room.maxPlayers) || getRecommendedRoomCap());
      refs.roomPanelRoomName.textContent = locationLabel
        ? `${roomName} (${room.visibility || "private"}) • ${locationLabel} • cap ${capLabel}`
        : `${roomName} (${room.visibility || "private"}) • cap ${capLabel}`;
    }
    if (refs.roomPanelNameInput && document.activeElement !== refs.roomPanelNameInput) {
      refs.roomPanelNameInput.value = sanitizeText(room.name || "", 80);
    }
    if (refs.roomPanelFeaturedToggle) {
      refs.roomPanelFeaturedToggle.checked = room.visibility === "public" && room.featured === true;
    }
    applyPaintRulesToPanel(room);
  }

  function renderPlayerList() {
    if (!refs.roomPanelPlayerList) return;

    if (!state.currentRoom) {
      refs.roomPanelPlayerList.innerHTML = '<li class="mpPlayerEmpty">No active room.</li>';
      if (refs.roomPanelPlayerCount) refs.roomPanelPlayerCount.textContent = "0";
      return;
    }

    if (!state.players.length) {
      refs.roomPanelPlayerList.innerHTML = '<li class="mpPlayerEmpty">Waiting for players...</li>';
      const cap = Math.max(2, Number(state.currentRoom?.maxPlayers) || getRecommendedRoomCap());
      if (refs.roomPanelPlayerCount) refs.roomPanelPlayerCount.textContent = `0 / ${cap}`;
      return;
    }

    refs.roomPanelPlayerList.innerHTML = state.players
      .map((player) => {
        const role = safeHtml(player.role || "member", 16);
        const displayName = safeHtml(player.displayName || "Explorer", 48);
        const mode = safeHtml(player.mode || "drive", 16);
        const selfTag = player.uid === state.authUser?.uid ? " (You)" : "";
        return `<li class="mpPlayerItem"><span class="mpPlayerName">${displayName}${selfTag}</span><span class="mpPlayerMeta">${role} • ${mode}</span></li>`;
      })
      .join("");

    const cap = Math.max(2, Number(state.currentRoom?.maxPlayers) || getRecommendedRoomCap());
    if (refs.roomPanelPlayerCount) refs.roomPanelPlayerCount.textContent = `${state.players.length} / ${cap}`;
  }

  function renderChat() {
    if (!refs.chatMessages) return;

    if (!state.currentRoom) {
      refs.chatMessages.innerHTML = '<div class="mpChatEmpty">Join a room to enable chat.</div>';
      return;
    }

    if (!state.messages.length) {
      refs.chatMessages.innerHTML = '<div class="mpChatEmpty">No messages yet.</div>';
      return;
    }

    refs.chatMessages.innerHTML = state.messages
      .map((msg) => {
        const userName = safeHtml(msg.displayName || "Explorer", 48);
        const text = safeHtml(msg.text || "", helpers.chatMaxLength);
        const mine = msg.uid && state.authUser && msg.uid === state.authUser.uid;
        const klass = mine ? "mpChatRow mine" : "mpChatRow";
        const reportBtn = mine
          ? ""
          : `<button class="mpChatReport" data-msgid="${escapeHtml(String(msg.id || ""))}" type="button">Report</button>`;
        return `<div class="${klass}"><div class="mpChatHead"><span>${userName}</span>${reportBtn}</div><div class="mpChatText">${text}</div></div>`;
      })
      .join("");

    refs.chatMessages.scrollTop = refs.chatMessages.scrollHeight;
  }

  function setChatOpen(open) {
    state.chatOpen = !!open;
    if (refs.chatDrawer) refs.chatDrawer.classList.toggle("open", state.chatOpen);
    updateToggleStates();
  }

  return {
    canManageCurrentRoomActivities,
    closeRoomPanel,
    openRoomPanel,
    publishMapRoomsToContext,
    renderArtifacts,
    renderBrowseRooms,
    renderChat,
    renderFeaturedRooms,
    renderFriends,
    renderHomeBase,
    renderInvites,
    renderLeaderboard,
    renderOwnedRooms,
    renderPlayerList,
    renderRecentPlayers,
    renderRoomActivities,
    renderRoomMeta,
    renderWeeklyFeaturedCallout,
    resolveWeeklyFeaturedWorld,
    refreshPlanLabel,
    setBrowseStatus,
    setChatOpen,
    setChatStatus,
    setStatus,
    updateToggleStates,
    upsertOwnedRoomLocal
  };
}
