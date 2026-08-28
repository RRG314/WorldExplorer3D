import { listenArtifacts } from "./artifacts.js?v=57";
import {
  clearMySharedBlocks,
  clearRoomSharedBlocks,
  listenSharedBlocks,
  removeSharedBlock,
  upsertSharedBlock
} from "./blocks.js?v=68";
import { listenChat } from "./chat.js?v=56";
import { listenPlayers, startPresence } from "./presence.js?v=62";
import {
  deriveRoomDeterministicSeed,
  listenHomeBase,
  listenRoom
} from "./rooms.js?v=67";
import {
  listenRoomActivities,
  listenRoomActivityState
} from "./room-activities.js?v=2";
import { listenPaintClaims } from "./painttown.js?v=56";
import { recordRecentPlayers } from "./social.js?v=55";

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
    await appCtx.ensureEditableWorldRuntime?.();
    const [{
      listenRoomWorldModifications,
      resetRoomWorldModifications,
      restoreRoomBuilding,
      suppressRoomBuilding
    }, {
      editableRoomPermissions,
      resolveEditableRoomRole,
      roomWorldModificationIdentity
    }] = await Promise.all([
      import('./world-modifications.js?v=1'),
      import('../editable-world/room-model.js?v=1')
    ]);
    state.currentRoom = room;
    emitTutorialEvent("room_created_or_toggled", {
      roomCode: normalizeCode(room.code || room.id || ""),
      origin: String(originLabel || "room")
    });
    upsertOwnedRoomLocal(room);
    if (typeof appCtx.configureSharedBuildSync === "function") {
      appCtx.configureSharedBuildSync({
        enabled: true,
        roomId: room.id,
        connected: globalThis.navigator?.onLine !== false,
        upsert: (entry) => upsertSharedBlock(room.id, entry),
        remove: (entry) => removeSharedBlock(room.id, entry),
        clearMine: () => clearMySharedBlocks(room.id)
      });
    }
    const editableRole = resolveEditableRoomRole(room, state.authUser?.uid || '');
    const editablePermissions = editableRoomPermissions(editableRole);
    appCtx.configureSharedEditableWorld?.({
      enabled: true,
      roomId: room.id,
      worldId: roomWorldModificationIdentity(room),
      canManage: editablePermissions.resetWorld,
      suppress: (sourceFeatureId) => suppressRoomBuilding(room, sourceFeatureId),
      restore: (sourceFeatureId) => restoreRoomBuilding(room, sourceFeatureId),
      reset: async () => {
        const [modifications, blocks] = await Promise.all([
          resetRoomWorldModifications(room),
          clearRoomSharedBlocks(room.id)
        ]);
        return modifications + blocks;
      }
    });
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
    }, {
      onError: () => setStatus("Room connection interrupted. Retrying without discarding the session.", true)
    });

    state.unsubPlayers = listenPlayers(room.id, (players) => {
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
    }, {
      onError: () => setStatus("Player presence is reconnecting; the room remains active.", true)
    });

    state.unsubChat = listenChat(room.id, (messages) => {
      state.messages = messages;
      renderChat();
    }, {
      onError: () => setStatus("Room chat is reconnecting; visible messages were kept.", true)
    });

    state.unsubArtifacts = listenArtifacts(room.id, (artifacts) => {
      state.artifacts = artifacts;
      renderArtifacts();
    }, {
      onError: () => setStatus("Shared artifacts are reconnecting; existing items were kept.", true)
    });

    state.unsubRoomActivities = listenRoomActivities(room.id, (activities) => {
      state.roomActivities = Array.isArray(activities) ? activities : [];
      renderRoomActivities();
      publishMapRoomsToContext();
    }, {
      onError: () => setStatus("Room activities are reconnecting; current games were kept.", true)
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
    }, {
      onError: () => setStatus("The active room game is reconnecting without resetting progress.", true)
    });

    state.unsubSharedBlocks = listenSharedBlocks(room.id, (blocks) => {
      if (typeof appCtx.setSharedBuildEntries === "function") {
        appCtx.setSharedBuildEntries(Array.isArray(blocks) ? blocks : []);
      }
    }, {
      onError: () => setStatus("Shared builds are reconnecting; existing blocks were kept.", true)
    });

    state.unsubWorldModifications = listenRoomWorldModifications(room, (rows) => {
      appCtx.setSharedEditableWorldRows?.(rows);
    }, {
      onError: () => setStatus('Shared world edits are reconnecting; the last committed room world remains visible.', true)
    });

    state.unsubHomeBase = listenHomeBase(room.id, (homeBase) => {
      state.homeBase = homeBase;
      renderHomeBase();
    }, {
      onError: () => setStatus("Home base data is reconnecting; the current marker was kept.", true)
    });

    state.unsubPaintClaims = listenPaintClaims(room.id, (claims) => {
      if (typeof appCtx.applyPaintTownRemoteClaimsFromSync === "function") {
        appCtx.applyPaintTownRemoteClaimsFromSync({
          roomId: room.id,
          claims: Array.isArray(claims) ? claims : []
        });
      }
    }, {
      onError: () => setStatus("Paint Town is reconnecting; visible paint was kept.", true)
    });

    startPresence(room.id, helpers.readPoseSnapshot);
    await syncRoomWorldContext(room, false, true);

    const invite = helpers.buildInviteLink(room.code);
    if (invite) {
      const url = new URL(window.location.href);
      url.searchParams.set("room", room.code);
      window.history.replaceState({}, "", url.toString());
    }

    setStatus(`Connected to ${originLabel}: ${room.code} (seed ${deriveRoomDeterministicSeed(room)}).`);
    publishMapRoomsToContext();
  }

  return {
    activateRoom
  };
}
