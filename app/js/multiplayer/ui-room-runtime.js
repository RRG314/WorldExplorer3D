import { leavesRoomForEarthLocation } from './room-world-policy.js';
import { ensureEntitlements } from "../../../js/entitlements.js?v=71";
import {isEarthWorldUsable} from '../earth-core/world-readiness.js';
import { createGhostManager } from "./ghosts.js?v=58";
import { listenExplorerLeaderboard } from "./loop.js?v=56";
import { stopPresence } from "./presence.js?v=63";
import {
  deriveRoomDeterministicSeed,
  findFeaturedPublicRooms,
  leaveRoom,
  listenMyRooms
} from "./rooms.js?v=67";
import { listenPaintClaims, upsertPaintClaim } from "./painttown.js?v=56";
import {
  listenBlockedPlayers,
  listenFriends,
  listenIncomingInvites,
  listenRecentPlayers
} from "./social.js?v=55";

export function createUiRoomRuntime({ appCtx, refs, state, renderers, helpers }) {
  const {
    canUseMultiplayer,
    finiteNumber,
    normalizePaintColorHex,
    normalizePaintRules,
    sanitizeText
  } = helpers;

  const {
    publishMapRoomsToContext,
    renderArtifacts,
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
    setBrowseStatus,
    setChatOpen,
    setStatus,
    updateToggleStates
  } = renderers;

  function clearSubscriptions() {
    if (state.ghostRenderTimer) window.clearInterval(state.ghostRenderTimer);
    state.ghostRenderTimer = null;
    state.roomSessionGeneration = (Number(state.roomSessionGeneration) || 0) + 1;
    if (typeof state.unsubRoom === "function") state.unsubRoom();
    if (typeof state.unsubPlayers === "function") state.unsubPlayers();
    if (typeof state.unsubChat === "function") state.unsubChat();
    if (typeof state.unsubArtifacts === "function") state.unsubArtifacts();
    if (typeof state.unsubRoomActivities === "function") state.unsubRoomActivities();
    if (typeof state.unsubRoomActivityState === "function") state.unsubRoomActivityState();
    if (typeof state.unsubSharedBlocks === "function") state.unsubSharedBlocks();
    if (typeof state.unsubWorldModifications === "function") state.unsubWorldModifications();
    if (typeof state.unsubHomeBase === "function") state.unsubHomeBase();
    if (typeof state.unsubPaintClaims === "function") state.unsubPaintClaims();
    state.unsubRoom = null;
    state.unsubPlayers = null;
    state.unsubChat = null;
    state.unsubArtifacts = null;
    state.unsubRoomActivities = null;
    state.unsubRoomActivityState = null;
    state.unsubSharedBlocks = null;
    state.unsubWorldModifications = null;
    state.unsubHomeBase = null;
    state.unsubPaintClaims = null;
  }

  function clearGlobalSubscriptions() {
    if (typeof state.unsubBlockedPlayers === 'function') state.unsubBlockedPlayers();
    state.unsubBlockedPlayers = null;
    state.blockedPlayers = [];
    state.blockedPlayersReady = false;
    state.friends = [];
    state.recentPlayers = [];
    state.invites = [];
    state.ownedRooms = [];
    if (typeof state.unsubFriends === "function") state.unsubFriends();
    if (typeof state.unsubRecentPlayers === "function") state.unsubRecentPlayers();
    if (typeof state.unsubInvites === "function") state.unsubInvites();
    if (typeof state.unsubOwnedRooms === "function") state.unsubOwnedRooms();
    if (typeof state.unsubLeaderboard === "function") state.unsubLeaderboard();
    state.unsubFriends = null;
    state.unsubRecentPlayers = null;
    state.unsubInvites = null;
    state.unsubOwnedRooms = null;
    state.unsubLeaderboard = null;
  }

  function ensureLeaderboardSubscription() {
    if (state.unsubLeaderboard) return;
    state.unsubLeaderboard = listenExplorerLeaderboard((rows) => {
      state.leaderboard = rows;
      renderLeaderboard();
    });
  }

  function roomWorldSignature(room) {
    if (!room || !room.world) return "";
    const world = room.world || {};
    const kind = String(world.kind || "earth").toLowerCase();
    const seed = String(world.seed || "").trim();
    const lat = finiteNumber(world.lat, 0).toFixed(6);
    const lon = finiteNumber(world.lon, 0).toFixed(6);
    return `${kind}|${seed}|${lat}|${lon}|${deriveRoomDeterministicSeed(room)}`;
  }

  function applyRoomPaintMultiplayerConfig(room) {
    if (!room) return;
    const roomSeed = deriveRoomDeterministicSeed(room);
    const rules = normalizePaintRules(room.rules || {});
    appCtx.paintTownRoomRules = { ...rules };
    if (typeof appCtx.setPaintTownMultiplayerConfig === "function") {
      appCtx.setPaintTownMultiplayerConfig({
        roomId: room.id,
        uid: state.authUser?.uid || "",
        roomSeed,
        rules
      });
    }
  }

  function installPaintClaimPublisher() {
    appCtx.publishPaintTownClaim = async (claim = {}) => {
      if (!state.currentRoom?.id) return;
      const key = sanitizeText(claim.key || "", 120);
      if (!key) return;
      await upsertPaintClaim(state.currentRoom.code, {
        key,
        colorHex: normalizePaintColorHex(claim.colorHex || "#D61F2C"),
        colorName: sanitizeText(claim.colorName || "", 24),
        method: sanitizeText(claim.method || "touch-any", 24)
      });
    };
  }

  function clearPendingRoomWorldRetry() {
    if (state.pendingRoomWorldRetryTimer) {
      clearTimeout(state.pendingRoomWorldRetryTimer);
      state.pendingRoomWorldRetryTimer = null;
    }
  }

  function scheduleRoomWorldRetry(room, respawn = false, delayMs = 420) {
    clearPendingRoomWorldRetry();
    const roomId = String(room?.id || room?.code || "");
    state.pendingRoomWorldRetryTimer = setTimeout(() => {
      state.pendingRoomWorldRetryTimer = null;
      if (!state.currentRoom) return;
      const activeId = String(state.currentRoom.id || state.currentRoom.code || "");
      if (roomId && activeId && activeId !== roomId) return;
      syncRoomWorldContext(state.currentRoom, true, respawn).catch((err) => {
        console.warn("[multiplayer][ui] delayed room world sync failed:", err);
      });
    }, Math.max(80, Number(delayMs) || 420));
  }

  function setRoomEarthSelection(room, lat, lon) {
    appCtx.setCustomLocation?.({
      lat,
      lon,
      name: sanitizeText(room.name || room.locationTag?.label || room.code || "Room World", 80) || "Room World"
    });

    const customLatInput = document.getElementById("customLat");
    const customLonInput = document.getElementById("customLon");
    if (customLatInput) customLatInput.value = lat.toFixed(6);
    if (customLonInput) customLonInput.value = lon.toFixed(6);
  }

  function setTitleLaunchMode(kind = "earth") {
    if (kind === "moon") {
      document.getElementById("moonLaunchToggle")?.click();
      return;
    }
    if (kind === "space") {
      document.getElementById("spaceLaunchToggle")?.click();
      return;
    }
    document.getElementById("earthLaunchToggle")?.click();
  }

  async function ensureRoomEnvironment(kind, room, respawn = false) {
    if (kind === "moon") {
      if (appCtx.onMoon) return true;
      setStatus(`Syncing room world ${room.code} to Moon...`);
      if (typeof appCtx.arriveAtMoon === "function") {
        await appCtx.arriveAtMoon();
        return true;
      }
      if (typeof appCtx.directTravelToMoon === "function") {
        await appCtx.directTravelToMoon();
        return false;
      }
      return false;
    }

    if (kind === "space") {
      if (appCtx.spaceFlight?.active) return true;
      setStatus(`Syncing room world ${room.code} to Space...`);
      if (appCtx.onMoon && typeof appCtx.startSpaceFlightToEarth === "function") {
        await appCtx.startSpaceFlightToEarth();
        return appCtx.spaceFlight?.active === true;
      }
      if (typeof appCtx.startSpaceFlightToMoon === "function") {
        await appCtx.startSpaceFlightToMoon();
        return appCtx.spaceFlight?.active === true;
      }
      return false;
    }

    const environment = appCtx.getEnv?.();
    if (environment && environment !== (appCtx.ENV?.EARTH || 'EARTH')) {
      setStatus(`Returning to Earth for room ${room.code}...`);
      if (typeof appCtx.returnToEarthFromMenu !== 'function') return false;
      return await appCtx.returnToEarthFromMenu() === true && appCtx.getEnv?.() === (appCtx.ENV?.EARTH || 'EARTH');
    }

    // Earth arrival belongs to the successful load below, not this environment check.
    return true;
  }

  async function syncRoomWorldContext(room, force = false, respawn = false) {
    if (!room || !room.world || state.currentRoom?.id !== room.id) return false;
    const generation = state.roomSessionGeneration;
    const isCurrent = () => state.roomSessionGeneration === generation && state.currentRoom?.id === room.id;
    const failSync = (error) => {
      if (!isCurrent()) return false;
      state.activeRoomWorldSignature = '';
      clearPendingRoomWorldRetry();
      setStatus('The room location could not load. Retry from the location menu.', true);
      console.warn('[multiplayer][ui] room world sync failed:', error);
      return false;
    };

    const signature = roomWorldSignature(room);
    if (!force && signature && state.activeRoomWorldSignature === signature) return !appCtx.worldLoading;
    state.activeRoomWorldSignature = signature;

    const world = room.world || {};
    const roomSeed = deriveRoomDeterministicSeed(room);
    state.roomSeedLease ||= {previous:appCtx.sharedSeedOverride};
    state.roomSeedLease.value=roomSeed;
    appCtx.sharedSeedOverride = roomSeed;
    applyRoomPaintMultiplayerConfig(room);
    installPaintClaimPublisher();

    const lat = finiteNumber(world.lat, null);
    const lon = finiteNumber(world.lon, null);
    const kind = String(world.kind || "earth").toLowerCase();

    if (!appCtx.gameStarted) {
      if (kind === 'earth' && Number.isFinite(lat) && Number.isFinite(lon)) setRoomEarthSelection(room,lat,lon);
      setStatus(`Opening room ${room.code}...`);
      setTitleLaunchMode(kind);
      appCtx.pendingCustomLaunchBypass = true;
      if (typeof appCtx.triggerTitleStart === "function") {
        try {
          const launched = await appCtx.triggerTitleStart({ bypassCustomGate: true });
          if (!isCurrent()) return;
          if (launched === false || (kind === 'earth' && !isEarthWorldUsable(appCtx))) {
            throw new Error('The room location did not finish loading.');
          }
          clearPendingRoomWorldRetry();
          return true;
        } catch (error) { return failSync(error); }
      } else {
        const startBtn = document.getElementById("startBtn");
        if (startBtn instanceof HTMLButtonElement) startBtn.click();
      }
      return;
    }

    if (appCtx.gameStarted && appCtx.worldLoading) {
      scheduleRoomWorldRetry(room, respawn);
      return false;
    }

    const environmentReady = await ensureRoomEnvironment(kind, room, respawn);
    if (!isCurrent()) return;
    if (!environmentReady) {
      scheduleRoomWorldRetry(room, respawn, 700);
      return false;
    }

    if (kind !== "earth") {
      clearPendingRoomWorldRetry();
      return true;
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || typeof appCtx.loadRoads !== "function") return;

    // Earth restoration may restore its prior selection. Select the room only
    // after that owner has finished, then let publication own the one arrival.
    setRoomEarthSelection(room,lat,lon);
    const selectionSignature = appCtx.getLocationSelectionSignature?.();
    setStatus(`Syncing room world ${room.code} (seed ${roomSeed})...`);
    try {
      const loaded = await appCtx.loadRoads();
      if (!isCurrent()) return;
      if ((appCtx.getEnv && appCtx.getEnv() !== (appCtx.ENV?.EARTH || 'EARTH')) || !isEarthWorldUsable(appCtx, loaded) || (selectionSignature !== undefined && selectionSignature !== appCtx.getLocationSelectionSignature?.())) throw new Error('The room location did not finish loading.');
      appCtx.markLocationSelectionLoaded?.();
      clearPendingRoomWorldRetry();
      return true;
    } catch (err) {
      return failSync(err);
    }
  }

  function prepareRoomWorldChange(location) {
    if(!leavesRoomForEarthLocation(state.currentRoom,location))return false;
    const code=state.currentRoom.code;
    // deactivateRoom detaches subscriptions, edits and presence synchronously,
    // before awaiting its captured network lease cleanup. Offline travel stays usable.
    void deactivateRoom(false).catch(error=>console.warn('[multiplayer] room travel cleanup:',error));
    appCtx.showToast?.(`Left room ${code}. Multiplayer rooms stay at one location; you can rejoin with the room code.`);
    return true;
  }

  async function deactivateRoom(localOnly = false) {
    clearSubscriptions();
    const seedLease=state.roomSeedLease;state.roomSeedLease=null;
    if(seedLease&&appCtx.sharedSeedOverride===seedLease.value)appCtx.sharedSeedOverride=seedLease.previous;
    clearPendingRoomWorldRetry();
    if (typeof appCtx.configureSharedBuildSync === "function") {
      appCtx.configureSharedBuildSync({ enabled: false });
    }
    if (typeof appCtx.setSharedBuildEntries === "function") {
      appCtx.setSharedBuildEntries([]);
    }
    appCtx.configureSharedEditableWorld?.({ enabled: false });
    // Capture and detach both owners before yielding. Waiting here used to let
    // a completed join replace currentRoom, then leaveRoom deleted the new room.
    const stoppingPresence = stopPresence();
    const leavingRoom = localOnly ? Promise.resolve() : leaveRoom();

    state.currentRoom = null;
    state.activeRoomWorldSignature = "";
    state.players = [];
    state.messages = [];
    state.artifacts = [];
    state.roomActivities = [];
    state.activeRoomActivity = null;
    state.homeBase = null;
    if (typeof appCtx.clearPaintTownMultiplayerConfig === "function") {
      appCtx.clearPaintTownMultiplayerConfig();
    }
    if (Object.prototype.hasOwnProperty.call(appCtx, "publishPaintTownClaim")) {
      delete appCtx.publishPaintTownClaim;
    }
    if (state.ghostManager) state.ghostManager.clear();
    setChatOpen(false);
    renderRoomMeta();
    renderPlayerList();
    renderChat();
    renderArtifacts();
    renderRoomActivities();
    renderHomeBase();
    updateToggleStates();
    publishMapRoomsToContext();
    await Promise.all([stoppingPresence, leavingRoom]);
  }

  function ensureGhostManager() {
    if (state.ghostManager) return;
    if (!state.currentRoom) return;
    if (!appCtx.scene) return;

    state.ghostManager = createGhostManager(appCtx.scene, {
      getCamera: () => appCtx.camera,
      getViewportHeight: () => appCtx.renderer?.domElement?.clientHeight || globalThis.innerHeight,
      getSelfUid: () => state.authUser?.uid || state.entitlement.uid || "",
      getLocalFrame: () => helpers.readPoseSnapshot?.()?.frame || null
    });
    state.ghostManager.setVisible(state.ghostsEnabled);
  }

  function ensureGhostTicker() {
    if (!state.currentRoom || state.ghostRenderTimer) return;
    state.ghostRenderTimer = window.setInterval(() => {
      if (!state.currentRoom) return;
      ensureGhostManager();
      if (state.ghostManager) {
        state.ghostManager.setVisible(state.ghostsEnabled);
        state.ghostManager.tick(performance.now());
      }
    }, 33);
  }

  async function ensureAccessOrWarn(actionLabel = "this action") {
    if (!state.authUser) {
      setStatus(`Sign in is required for ${actionLabel}.`, true);
      return false;
    }
    if (!canUseMultiplayer(state.entitlement)) {
      try {
        const refreshed = await ensureEntitlements(state.authUser);
        state.entitlement = {
          ...state.entitlement,
          ...refreshed
        };
      } catch (err) {
        console.warn("[multiplayer][ui] entitlement refresh failed:", err);
      }
    }
    if (!canUseMultiplayer(state.entitlement)) {
      setStatus("Could not confirm multiplayer access for this account yet. Try refresh or sign in again.", true);
      return false;
    }
    return true;
  }

  async function refreshFeaturedRooms(silent = false) {
    try {
      const rooms = await findFeaturedPublicRooms({ resultLimit: 10 });
      state.featuredRooms = rooms;
      renderFeaturedRooms();
      if (!silent) {
        setStatus(rooms.length ? `Loaded ${rooms.length} featured room${rooms.length === 1 ? "" : "s"}.` : "No featured rooms yet.");
      }
    } catch (err) {
      console.warn("[multiplayer][ui] refresh featured rooms failed:", err);
      if (!silent) setStatus(err?.message || "Could not load featured rooms.", true);
      publishMapRoomsToContext();
    }
  }

  function ensureGlobalSubscriptions() {
    const uid = state.authUser?.uid || '';
    if (state.globalSubscriptionUid !== uid) {
      clearGlobalSubscriptions();
      state.globalSubscriptionUid = uid;
      renderChat(); renderFriends(); renderInvites(); renderRecentPlayers(); renderPlayerList();
      renderers.renderBlockedPlayers();
    }
    if (!state.authUser) {
      clearGlobalSubscriptions();
      state.friends = [];
      state.recentPlayers = [];
      state.invites = [];
      state.ownedRooms = [];
      renderFriends();
      renderRecentPlayers();
      renderInvites();
      renderOwnedRooms();
      ensureLeaderboardSubscription();
      renderFeaturedRooms();
      return;
    }

    if (!state.unsubBlockedPlayers) {
      state.unsubBlockedPlayers = listenBlockedPlayers(rows => {
        if (state.authUser?.uid !== uid) return;
        state.blockedPlayers = rows;
        state.blockedPlayersReady = true;
        renderChat(); renderFriends(); renderInvites(); renderRecentPlayers(); renderPlayerList();
        renderers.renderBlockedPlayers();
      }, {onError: () => {
        if (state.authUser?.uid !== uid) return;
        setStatus('Blocked players could not be refreshed. Chat and invites wait for the first successful check.', true);
      }});
    }

    if (!state.unsubFriends) {
      state.unsubFriends = listenFriends((rows) => {
        if (state.authUser?.uid !== uid) return;
        state.friends = rows;
        renderFriends();
      });
    }
    if (!state.unsubRecentPlayers) {
      state.unsubRecentPlayers = listenRecentPlayers((rows) => {
        if (state.authUser?.uid !== uid) return;
        state.recentPlayers = rows;
        renderRecentPlayers();
      });
    }
    if (!state.unsubInvites) {
      state.unsubInvites = listenIncomingInvites((rows) => {
        if (state.authUser?.uid !== uid) return;
        state.invites = rows;
        renderInvites();
      });
    }
    if (!state.unsubOwnedRooms) {
      state.unsubOwnedRooms = listenMyRooms((rows) => {
        if (state.authUser?.uid !== uid) return;
        state.ownedRooms = rows;
        renderOwnedRooms();
      }, { onError: () => setStatus('Saved rooms could not be refreshed. Reload the app to reconnect.', true) });
    }
    ensureLeaderboardSubscription();
  }

  function currentRoomName() {
    if (!state.currentRoom) return "";
    return sanitizeText(
      state.currentRoom.name ||
        state.currentRoom.locationTag?.label ||
        `${sanitizeText(state.currentRoom.world?.kind || "earth", 16).toUpperCase()} Session`,
      80
    );
  }

  function applyEntitlementCopy() {
    renderers.refreshPlanLabel();

    const allowed = canUseMultiplayer(state.entitlement);
    // Account refresh is background state, not the result of the player's
    // create/join action. Keep its pending/error outcome until their next action.
    if (state.authUser && (state.roomCreateBusy || state.roomJoinBusy || state.lastActionStatusWarn)) return;
    if (!state.authUser) {
      if (state.pendingRoomCode) {
        setStatus(`Invite detected for room ${state.pendingRoomCode}. Sign in to continue.`);
      } else {
        setStatus("Join Weekly City as a guest, or sign in to create a room.");
      }
      setBrowseStatus("Public rooms are viewable. Sign in to join or create rooms.");
      if (refs.titleFriendsStatus) refs.titleFriendsStatus.textContent = "Sign in to build your social graph.";
      return;
    }

    if (!allowed) {
      setStatus("Signed in, but multiplayer access is still syncing. Retry in a moment.", true);
      setBrowseStatus("Access is syncing for this session. Try again shortly.");
      return;
    }

    if (state.currentRoom) {
      setStatus(`Multiplayer active in room ${state.currentRoom.code}.`);
    } else {
      setStatus("Multiplayer ready. Create or join a room.");
    }

    if (!state.browseRooms.length) {
      setBrowseStatus("Browse public rooms by city tag. This list does not stream live presence.");
    }
  }

  return {
    applyEntitlementCopy,
    applyRoomPaintMultiplayerConfig,
    clearGlobalSubscriptions,
    clearSubscriptions,
    currentRoomName,
    deactivateRoom,
    prepareRoomWorldChange,
    ensureAccessOrWarn,
    ensureGhostManager,
    ensureGhostTicker,
    ensureGlobalSubscriptions,
    installPaintClaimPublisher,
    refreshFeaturedRooms,
    syncRoomWorldContext
  };
}
