export function createUiRoomRoomActionsApi({
  appCtx,
  refs,
  state,
  helpers,
  renderers,
  callbacks,
  runtime,
  activateRoom,
  deps
}) {
  const {
    buildInviteLink,
    buildWeeklyFeaturedRoomCode,
    copyText,
    finiteNumber,
    getRecommendedRoomCap,
    getWeeklyCitySelection,
    isPermissionError,
    normalizeCode,
    pullCodeFromInputs,
    readLocationTagInput,
    readPaintRulesFromPanel,
    readRoomNameInput,
    readVisibilitySelection,
    readWorldContext,
    sanitizeText,
    setInputCode
  } = helpers;
  const {
    closeRoomPanel,
    renderBrowseRooms,
    renderFeaturedRooms,
    resolveWeeklyFeaturedWorld,
    setBrowseStatus,
    setChatStatus,
    setStatus
  } = renderers;
  const {
    currentRoomName,
    deactivateRoom,
    ensureAccessOrWarn,
    refreshFeaturedRooms,
    syncRoomWorldContext
  } = runtime;
  const {
    bumpExplorerLeaderboard,
    createRoom,
    deleteOwnedRoom,
    findPublicRoomsByCity,
    getCurrentUser,
    joinRoomByCode,
    sendMessage
  } = deps;

  async function handleDeleteOwnedRoom(roomCode) {
    if (!state.authUser) {
      setStatus("Sign in to delete rooms you created.", true);
      return;
    }
    const normalizedCode = normalizeCode(roomCode);
    if (!normalizedCode) {
      setStatus("Invalid room code.", true);
      return;
    }

    const roomRecord = state.ownedRooms.find((room) => normalizeCode(room.code || room.id || "") === normalizedCode) || null;
    const label = sanitizeText(roomRecord?.name || normalizedCode, 80);
    if (!window.confirm(`Delete room "${label}" (${normalizedCode})? This cannot be undone.`)) return;

    try {
      if (state.currentRoom && normalizeCode(state.currentRoom.code || state.currentRoom.id || "") === normalizedCode) {
        await deactivateRoom(false);
      }
      await deleteOwnedRoom(normalizedCode);

      const url = new URL(window.location.href);
      if (normalizeCode(url.searchParams.get("room")) === normalizedCode) {
        url.searchParams.delete("room");
        url.searchParams.delete("invite");
        window.history.replaceState({}, "", url.toString());
      }

      state.browseRooms = state.browseRooms.filter((room) => normalizeCode(room.code || room.id || "") !== normalizedCode);
      state.featuredRooms = state.featuredRooms.filter((room) => normalizeCode(room.code || room.id || "") !== normalizedCode);
      renderBrowseRooms();
      renderFeaturedRooms();
      setStatus(`Deleted room ${normalizedCode}.`);
    } catch (err) {
      setStatus(err?.message || "Could not delete room.", true);
    }
  }

  async function handleJoinRoom(codeOverride = "", options = {}) {
    const skipAccessCheck = Boolean(options && options.skipAccessCheck);
    const suppressStatus = Boolean(options && options.suppressStatus);
    const throwOnError = Boolean(options && options.throwOnError);
    if (!skipAccessCheck && state.authUser && !(await ensureAccessOrWarn("joining a room"))) {
      return null;
    }

    const code = normalizeCode(codeOverride || pullCodeFromInputs(refs));
    if (!code) {
      setStatus("Enter a valid room code before joining.", true);
      return null;
    }

    try {
      const room = await joinRoomByCode(code);
      if (!state.authUser) {
        const authed = getCurrentUser();
        if (authed) callbacks.setAuthUser?.(authed);
      }
      await activateRoom(room, "joined room");
      await bumpExplorerLeaderboard({ roomsJoined: 1 });
      await refreshFeaturedRooms(true);
      if (!suppressStatus) setStatus(`Joined room ${room.code}.`);
      closeRoomPanel();
      return room;
    } catch (err) {
      console.error("[multiplayer][ui] join failed:", err);
      if (!suppressStatus) setStatus(err?.message || "Could not join that room.", true);
      if (throwOnError) throw err;
      return null;
    }
  }

  async function handleOpenOwnedRoom(roomCode) {
    if (!state.authUser) {
      setStatus("Sign in to open saved rooms.", true);
      return;
    }
    const normalizedCode = normalizeCode(roomCode);
    if (!normalizedCode) {
      setStatus("Invalid saved room code.", true);
      return;
    }

    const activeCode = normalizeCode(state.currentRoom?.code || state.currentRoom?.id || "");
    if (activeCode && activeCode === normalizedCode) {
      setInputCode(refs, normalizedCode);
      setStatus(`Already in room ${normalizedCode}.`);
      return;
    }

    setInputCode(refs, normalizedCode);
    setStatus(`Opening room ${normalizedCode}...`);
    try {
      const room = await handleJoinRoom(normalizedCode, {
        skipAccessCheck: true,
        suppressStatus: true,
        throwOnError: true
      });
      if (!room) {
        setStatus(`Could not open room ${normalizedCode}.`, true);
        return;
      }
      await syncRoomWorldContext(room, true, true);
      setStatus(`Opened room ${room.code}.`);
    } catch (err) {
      const savedRoom = state.ownedRooms.find((room) => normalizeCode(room.code || room.id || "") === normalizedCode) || null;
      const worldKind = String(savedRoom?.world?.kind || "").toLowerCase();
      const lat = finiteNumber(savedRoom?.world?.lat, null);
      const lon = finiteNumber(savedRoom?.world?.lon, null);
      const canFallbackToLocal = !!savedRoom && worldKind === "earth" && Number.isFinite(lat) && Number.isFinite(lon);

      if (isPermissionError(err) && canFallbackToLocal) {
        await deactivateRoom(true);
        const fallbackRoom = {
          id: normalizedCode,
          code: normalizedCode,
          name: sanitizeText(savedRoom.name || savedRoom.locationTag?.label || `Room ${normalizedCode}`, 80),
          visibility: String(savedRoom.visibility || "private"),
          world: {
            kind: "earth",
            lat,
            lon,
            seed: String(savedRoom.world.seed || `latlon:${lat.toFixed(5)},${lon.toFixed(5)}`)
          },
          rules: savedRoom.rules || {}
        };
        await syncRoomWorldContext(fallbackRoom, true, true);
        closeRoomPanel();
        setStatus(`Opened ${normalizedCode} location, but live multiplayer sync is blocked by permissions.`, true);
        return;
      }

      setStatus(err?.message || `Could not open room ${normalizedCode}.`, true);
    }
  }

  async function handleCreateRoom() {
    if (!(await ensureAccessOrWarn("creating a room"))) return;

    try {
      const world = readWorldContext();
      const roomName = sanitizeText(readRoomNameInput(), 80);
      const visibility = readVisibilitySelection();
      const locationTagText = sanitizeText(readLocationTagInput(), 80);
      const paintRules = readPaintRulesFromPanel();
      const effectiveLocationTag = visibility === "public" ? locationTagText || world.name : locationTagText;
      const cap = getRecommendedRoomCap();
      const room = await createRoom({
        name: roomName || `${world.name} Session`,
        visibility,
        featured: false,
        maxPlayers: cap,
        world,
        rules: paintRules,
        locationName: roomName || world.name,
        locationTag: effectiveLocationTag ? { label: effectiveLocationTag, city: effectiveLocationTag, kind: world.kind } : null
      });

      await activateRoom(room, "created room");
      await bumpExplorerLeaderboard({ roomsJoined: 1 });
      await refreshFeaturedRooms(true);
      const inviteLink = buildInviteLink(room.code);
      if (inviteLink) {
        const named = room.name ? `${room.name} (${room.code})` : room.code;
        try {
          await copyText(inviteLink);
          setStatus(`${visibility === "public" ? "Public" : "Private"} room ${named} created (cap ${cap}). Invite link copied.`);
        } catch (_) {
          setStatus(`${visibility === "public" ? "Public" : "Private"} room ${named} created (cap ${cap}).`);
        }
      }
    } catch (err) {
      console.error("[multiplayer][ui] create room failed:", err);
      setStatus(err?.message || "Could not create room.", true);
    }
  }

  async function ensureInviteJoinAccess() {
    if (!state.authUser) {
      setStatus("Sign in to accept invites.", true);
      return false;
    }
    return true;
  }

  async function handleBrowseRooms() {
    const cityInput = sanitizeText(refs.titleBrowseCityInput?.value || "", 48);
    const cityKey = helpers.normalizeCityKey(cityInput);
    if (!cityKey) {
      setBrowseStatus("Enter a city name to browse public rooms.", true);
      state.browseRooms = [];
      renderBrowseRooms();
      return;
    }

    state.browseCityKey = cityKey;
    setBrowseStatus(`Searching public rooms near ${cityInput}...`);
    try {
      const rooms = await findPublicRoomsByCity(cityInput, { resultLimit: 20 });
      state.browseRooms = rooms;
      renderBrowseRooms();
      if (!rooms.length) {
        setBrowseStatus(`No public rooms near ${cityInput} right now.`);
        return;
      }
      setBrowseStatus(`Found ${rooms.length} public room${rooms.length === 1 ? "" : "s"} near ${cityInput}.`);
    } catch (err) {
      console.error("[multiplayer][ui] browse rooms failed:", err);
      setBrowseStatus(err?.message || "Could not browse public rooms right now.", true);
    }
  }

  async function handleJoinWeeklyFeaturedRoom() {
    const weekly = getWeeklyCitySelection();
    const roomCode = buildWeeklyFeaturedRoomCode(weekly);
    const world = resolveWeeklyFeaturedWorld(weekly);
    const roomName = `Weekly City • ${weekly.city} (Week ${weekly.week})`;

    async function finalizeJoin(room, originLabel) {
      await activateRoom(room, originLabel);
      await bumpExplorerLeaderboard({ roomsJoined: 1 });
      await refreshFeaturedRooms(true);
      renderFeaturedRooms();
      closeRoomPanel();
      setInputCode(refs, room.code);
      setStatus(`Weekly featured room active: ${weekly.city} (${room.code}).`);
      return room;
    }

    try {
      const existing = await joinRoomByCode(roomCode);
      if (!state.authUser) {
        const authed = getCurrentUser();
        if (authed) callbacks.setAuthUser?.(authed);
      }
      return await finalizeJoin(existing, "weekly featured room");
    } catch (joinErr) {
      const joinMessage = String(joinErr?.message || "");
      if (!/Room not found/i.test(joinMessage)) {
        setStatus(joinMessage || "Could not join weekly featured room.", true);
        return null;
      }
    }

    try {
      if (!(await ensureAccessOrWarn("creating the weekly featured city room"))) return null;
      const cap = getRecommendedRoomCap();
      const created = await createRoom({
        code: roomCode,
        name: roomName,
        visibility: "public",
        featured: true,
        maxPlayers: cap,
        world,
        locationName: weekly.city,
        locationTag: { label: `Weekly City: ${weekly.city}`, city: weekly.city, kind: "earth" }
      });
      return await finalizeJoin(created, "weekly featured room");
    } catch (createErr) {
      const createMessage = String(createErr?.message || "");
      if (/unavailable|already|denied/i.test(createMessage)) {
        try {
          const raceWinner = await joinRoomByCode(roomCode);
          return await finalizeJoin(raceWinner, "weekly featured room");
        } catch (retryErr) {
          setStatus(String(retryErr?.message || retryErr || "Could not join weekly featured room."), true);
          return null;
        }
      }
      setStatus(createMessage || "Could not open weekly featured room.", true);
      return null;
    }
  }

  async function handleLeaveRoom() {
    if (!state.currentRoom) {
      setStatus("You are not in a room.");
      return;
    }
    try {
      const prevCode = state.currentRoom.code;
      await deactivateRoom(false);
      const url = new URL(window.location.href);
      url.searchParams.delete("room");
      window.history.replaceState({}, "", url.toString());
      setStatus(`Left room ${prevCode}.`);
    } catch (err) {
      console.error("[multiplayer][ui] leave failed:", err);
      setStatus(err?.message || "Could not leave room cleanly.", true);
    }
  }

  async function handleCopyInvite() {
    if (!state.currentRoom || !state.currentRoom.code) {
      setStatus("Join or create a room first to share an invite.", true);
      return;
    }
    const link = buildInviteLink(state.currentRoom.code);
    if (!link) {
      setStatus("Unable to build invite link.", true);
      return;
    }
    try {
      await copyText(link);
      setStatus("Invite link copied.");
    } catch (err) {
      const message = String(err?.message || err || "");
      if (/permission|denied|not allowed|copy command failed/i.test(message)) {
        setStatus(`Clipboard blocked. Share this invite link: ${link}`);
        return;
      }
      setStatus(`Could not copy invite link. Share this invite link: ${link}`, true);
    }
  }

  async function handleSendChat() {
    if (!state.currentRoom) {
      setChatStatus("Join a room first.", true);
      return;
    }
    const text = refs.chatInput ? refs.chatInput.value : "";
    try {
      const result = await sendMessage(state.currentRoom.code, text);
      if (refs.chatInput) refs.chatInput.value = "";
      setChatStatus(result.wasFiltered ? "Message sent (profanity filter applied)." : "Message sent.");
    } catch (err) {
      setChatStatus(err?.message || "Could not send message.", true);
    }
  }

  async function attemptPendingRoomJoin() {
    if (state.pendingRoomPrompted || !state.pendingRoomCode || state.pendingRoomInFlight) return;
    if (!state.authUser) return;

    const inviteCode = normalizeCode(state.pendingRoomCode);
    if (!inviteCode) return;

    state.pendingRoomInFlight = true;
    try {
      state.pendingRoomPrompted = true;
      setStatus(`Invite accepted. Joining room ${inviteCode}...`);
      setInputCode(refs, inviteCode);
      await handleJoinRoom(inviteCode);
    } catch (err) {
      setStatus(err?.message || "Could not complete invite flow.", true);
    } finally {
      state.pendingRoomInFlight = false;
    }
  }

  return {
    attemptPendingRoomJoin,
    ensureInviteJoinAccess,
    handleBrowseRooms,
    handleCopyInvite,
    handleCreateRoom,
    handleDeleteOwnedRoom,
    handleJoinRoom,
    handleJoinWeeklyFeaturedRoom,
    handleLeaveRoom,
    handleOpenOwnedRoom,
    handleSendChat
  };
}
