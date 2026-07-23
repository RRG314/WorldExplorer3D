import { listenArtifacts } from "./artifacts.js?v=56";
import {
  clearMySharedBlocks,
  listenSharedBlocks,
  removeSharedBlock,
  upsertSharedBlock
} from "./blocks.js?v=64";
import { listenChat } from "./chat.js?v=55";
import { listenPlayers, startPresence } from "./presence.js?v=60";
import {
  deriveRoomDeterministicSeed,
  listenHomeBase,
  listenRoom
} from "./rooms.js?v=66";
import {
  listenRoomActivities,
  listenRoomActivityState
} from "./room-activities.js?v=1";
import { listenPaintClaims } from "./painttown.js?v=55";
import { recordRecentPlayers } from "./social.js?v=55";
import { startAuthoritativeRoomSession } from './authoritative-session.js?v=7';

export function createUiRoomSession({ appCtx, refs, state, renderers, helpers, runtime }) {
  const {
    emitTutorialEvent,
    normalizeCode,
    sanitizeText,
    setInputCode
  } = helpers;

  const {
    publishMapRoomsToContext,
    renderArtifacts,
    renderChat,
    renderHomeBase,
    renderMmoPanel,
    renderPlayerList,
    renderRoomActivities,
    renderRoomMeta,
    setStatus,
    updateToggleStates,
    upsertOwnedRoomLocal
  } = renderers;

  const {
    applyRoomPaintMultiplayerConfig,
    clearSubscriptions,
    currentRoomName,
    ensureGhostManager,
    installPaintClaimPublisher,
    syncRoomWorldContext
  } = runtime;

  async function activateRoom(room, originLabel = "room") {
    if (!room || !room.id) {
      await runtime.deactivateRoom(true);
      return;
    }

    clearSubscriptions();
    state.currentRoom = room;
    emitTutorialEvent("room_created_or_toggled", {
      roomCode: normalizeCode(room.code || room.id || ""),
      origin: String(originLabel || "room")
    });
    upsertOwnedRoomLocal(room);
    let playerRosterKey = '';
    const authoritativeSession = await startAuthoritativeRoomSession({
      room,
      appCtx,
      userUid: state.authUser?.uid,
      readPoseSnapshot: helpers.readPoseSnapshot,
      onPlayers(players, selfUid) {
        state.players = players;
        state.mmoSelfUid = String(selfUid || state.mmoSelfUid || '');
        const nextRosterKey = JSON.stringify(players.map((player) => [
          player.uid,
          player.displayName,
          player.role,
          player.mode,
          player.vehicleId,
          player.connected,
          player.health,
          player.level
        ]));
        if (nextRosterKey !== playerRosterKey) {
          playerRosterKey = nextRosterKey;
          renderPlayerList();
        }
        renderMmoPanel();
        ensureGhostManager();
        state.ghostManager?.setVisible(state.ghostsEnabled);
        state.ghostManager?.updateGhosts(players);
      },
      onProgression(profile, leaderboard, catalog) {
        state.mmoProgression = profile;
        state.mmoLeaderboard = Array.isArray(leaderboard) ? leaderboard : [];
        state.mmoCatalog = catalog && typeof catalog === 'object' ? catalog : null;
        renderMmoPanel();
      },
      onStatus(event) {
        if (event.status === 'reconnecting') setStatus('Realtime room connection interrupted; reconnecting...', true);
        void appCtx.recordProductEvent?.('room', {
          action: event.status,
          world_kind: room.world?.kind || 'earth'
        });
      },
      onGameEvent(event) {
        appCtx.onAuthoritativeGameEvent?.(event);
        const eventType = String(event?.type || 'unknown');
        const category = eventType.startsWith('mission.') || eventType.startsWith('progression.')
          ? 'progression'
          : 'room';
        void appCtx.recordProductEvent?.(category, {
          action: eventType,
          world_kind: room.world?.kind || 'earth'
        });
      }
    });
    state.authoritativeSession = authoritativeSession;
    if (!authoritativeSession && typeof appCtx.configureSharedBuildSync === "function") {
      appCtx.configureSharedBuildSync({
        enabled: true,
        roomId: room.id,
        upsert: (entry) => upsertSharedBlock(room.id, entry),
        remove: (entry) => removeSharedBlock(room.id, entry),
        clearMine: () => clearMySharedBlocks(room.id)
      });
    }
    state.artifacts = [];
    state.roomActivities = [];
    state.activeRoomActivity = null;
    state.homeBase = null;
    applyRoomPaintMultiplayerConfig(room);
    installPaintClaimPublisher();
    setInputCode(refs, room.code);
    if (refs.titleVisibilitySelect) refs.titleVisibilitySelect.value = helpers.normalizeVisibilitySelection(room.visibility);
    if (refs.roomPanelVisibilitySelect) refs.roomPanelVisibilitySelect.value = helpers.normalizeVisibilitySelection(room.visibility);
    const roomName = sanitizeText(room.name || "", 80);
    if (roomName) {
      if (refs.titleRoomNameInput) refs.titleRoomNameInput.value = roomName;
      if (refs.roomPanelCreateNameInput) refs.roomPanelCreateNameInput.value = roomName;
    }
    const locationLabel = sanitizeText(room.locationTag?.label || "", 80);
    if (locationLabel) {
      if (refs.titleLocationTagInput) refs.titleLocationTagInput.value = locationLabel;
      if (refs.roomPanelLocationTagInput) refs.roomPanelLocationTagInput.value = locationLabel;
    }

    renderRoomMeta();
    renderPlayerList();
    renderChat();
    renderArtifacts();
    renderRoomActivities();
    renderHomeBase();
    updateToggleStates();

    state.unsubRoom = listenRoom(room.id, async (nextRoom) => {
      if (!nextRoom) {
        setStatus("Room was closed or became unavailable.", true);
        await runtime.deactivateRoom(true);
        return;
      }
      state.currentRoom = nextRoom;
      applyRoomPaintMultiplayerConfig(nextRoom);
      await syncRoomWorldContext(nextRoom, false);
      renderRoomMeta();
      updateToggleStates();
      publishMapRoomsToContext();
    });

    state.unsubPlayers = authoritativeSession ? null : listenPlayers(room.id, (players) => {
      state.players = players;
      renderPlayerList();
      recordRecentPlayers(room.code, currentRoomName(), players).catch((err) => {
        console.warn("[multiplayer][ui] recent players update failed:", err);
      });
      ensureGhostManager();
      if (state.ghostManager) {
        state.ghostManager.setVisible(state.ghostsEnabled);
        state.ghostManager.updateGhosts(players);
      }
    });

    state.unsubChat = listenChat(room.id, (messages) => {
      state.messages = messages;
      renderChat();
    });

    state.unsubArtifacts = listenArtifacts(room.id, (artifacts) => {
      state.artifacts = artifacts;
      renderArtifacts();
    });

    state.unsubRoomActivities = listenRoomActivities(room.id, (activities) => {
      state.roomActivities = Array.isArray(activities) ? activities : [];
      renderRoomActivities();
      publishMapRoomsToContext();
    });

    state.unsubRoomActivityState = listenRoomActivityState(room.id, async (activityState) => {
      state.activeRoomActivity = activityState;
      renderRoomActivities();
      publishMapRoomsToContext();
      const activeId = sanitizeText(activityState?.activityId || "", 120).toLowerCase();
      if (activityState?.status === "running" && activeId) {
        const activity =
          state.roomActivities.find(
            (entry) => sanitizeText(entry.id || "", 120).toLowerCase() === activeId
          ) || null;
        if (activity && typeof appCtx.startSharedRoomActivityRuntime === "function") {
          await appCtx.startSharedRoomActivityRuntime({
            ...activity,
            sourceType: "room_activity",
            roomCode: normalizeCode(room.code || room.id || ""),
            requiresNearbyStart: false
          });
        }
      } else if (typeof appCtx.stopSharedRoomActivityRuntime === "function") {
        appCtx.stopSharedRoomActivityRuntime({ source: "room_activity_stop" });
      }
    });

    state.unsubSharedBlocks = authoritativeSession ? null : listenSharedBlocks(room.id, (blocks) => {
      if (typeof appCtx.setSharedBuildEntries === "function") {
        appCtx.setSharedBuildEntries(Array.isArray(blocks) ? blocks : []);
      }
    });

    state.unsubHomeBase = listenHomeBase(room.id, (homeBase) => {
      state.homeBase = homeBase;
      renderHomeBase();
    });

    state.unsubPaintClaims = listenPaintClaims(room.id, (claims) => {
      if (typeof appCtx.applyPaintTownRemoteClaimsFromSync === "function") {
        appCtx.applyPaintTownRemoteClaimsFromSync({
          roomId: room.id,
          claims: Array.isArray(claims) ? claims : []
        });
      }
    });

    if (!authoritativeSession) startPresence(room.id, helpers.readPoseSnapshot);
    await syncRoomWorldContext(room, false, true);

    const invite = helpers.buildInviteLink(room.code);
    if (invite) {
      const url = new URL(window.location.href);
      url.searchParams.set("room", room.code);
      window.history.replaceState({}, "", url.toString());
    }

    setStatus(`${authoritativeSession ? 'Authoritative realtime' : 'Legacy multiplayer'} connected to ${originLabel}: ${room.code} (seed ${deriveRoomDeterministicSeed(room)}).`);
    void appCtx.recordProductEvent?.('room', {
      action: authoritativeSession ? 'authoritative_joined' : 'legacy_joined',
      world_kind: room.world?.kind || 'earth',
      visibility: room.visibility || 'private'
    });
    publishMapRoomsToContext();
  }

  return {
    activateRoom
  };
}
