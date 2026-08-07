import { getCurrentUser } from "../../../js/auth-ui.js";
import { createArtifact, removeArtifact } from "./artifacts.js?v=56";
import { sendMessage } from "./chat.js?v=55";
import {
  bumpExplorerLeaderboard,
} from "./loop.js?v=55";
import {
  createRoom,
  deleteOwnedRoom,
  findPublicRoomsByCity,
  joinRoomByCode,
  updateRoomSettings
} from "./rooms.js?v=66";
import {
  deleteRoomActivity,
  startRoomActivitySession,
  stopRoomActivitySession
} from "./room-activities.js?v=1";
import {
  addFriend,
  removeFriend,
  sendInviteToFriend
} from "./social.js?v=55";
import { createUiRoomRoomActionsApi } from "./ui-room-room-actions.js?v=1";
import { createUiRoomRuntime } from "./ui-room-runtime.js?v=2";
import { createUiRoomSession } from "./ui-room-session.js?v=1";

export function createUiRoomActions({ appCtx, refs, state, renderers, helpers, callbacks }) {
  const {
    buildInviteLink,
    buildWeeklyFeaturedRoomCode,
    copyText,
    emitTutorialEvent,
    finiteNumber,
    getRecommendedRoomCap,
    getWeeklyCitySelection,
    isPermissionError,
    normalizeCode,
    normalizeVisibilitySelection,
    pullCodeFromInputs,
    readLocationTagInput,
    readPaintRulesFromPanel,
    readPoseSnapshot,
    readRoomNameInput,
    readVisibilitySelection,
    readWorldContext,
    sanitizeText,
    setInputCode
  } = helpers;

  const {
    canManageCurrentRoomActivities,
    closeRoomPanel,
    renderBrowseRooms,
    renderFeaturedRooms,
    renderRoomActivities,
    renderRoomMeta,
    resolveWeeklyFeaturedWorld,
    setBrowseStatus,
    setChatStatus,
    setStatus
  } = renderers;

  const runtime = createUiRoomRuntime({ appCtx, refs, state, renderers, helpers });
  const {
    applyRoomPaintMultiplayerConfig,
    applyEntitlementCopy,
    clearGlobalSubscriptions,
    clearSubscriptions,
    currentRoomName,
    deactivateRoom,
    ensureAccessOrWarn,
    ensureGhostManager,
    ensureGhostTicker,
    ensureGlobalSubscriptions,
    refreshFeaturedRooms,
    syncRoomWorldContext
  } = runtime;

  const { activateRoom } = createUiRoomSession({
    appCtx,
    refs,
    state,
    renderers,
    helpers,
    runtime
  });
  const roomActions = createUiRoomRoomActionsApi({
    activateRoom,
    appCtx,
    callbacks,
    deps: {
      bumpExplorerLeaderboard,
      createRoom,
      deleteOwnedRoom,
      findPublicRoomsByCity,
      getCurrentUser,
      joinRoomByCode,
      sendMessage
    },
    helpers,
    refs,
    renderers,
    runtime,
    state
  });
  const {
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
  } = roomActions;

  async function handleSaveRoomSettings() {
    if (!state.currentRoom) {
      setStatus("Join a room first.", true);
      return;
    }
    try {
      const nextName = sanitizeText(refs.roomPanelNameInput?.value || state.currentRoom.name || "", 80);
      const featured = !!refs.roomPanelFeaturedToggle?.checked;
      const nextVisibility = featured ? "public" : normalizeVisibilitySelection(readVisibilitySelection());
      const nextLocationTag = sanitizeText(readLocationTagInput() || state.currentRoom.locationTag?.label || "", 80);
      const paintRules = readPaintRulesFromPanel();

      const updated = await updateRoomSettings(state.currentRoom.code, {
        name: nextName,
        featured,
        visibility: nextVisibility,
        locationTag: nextLocationTag
          ? { label: nextLocationTag, city: nextLocationTag, kind: state.currentRoom.world?.kind || "earth" }
          : null,
        rules: paintRules
      });

      if (updated) {
        state.currentRoom = updated;
        applyRoomPaintMultiplayerConfig(updated);
        renderRoomMeta();
        setStatus("Room settings updated.");
      }
      await refreshFeaturedRooms(true);
    } catch (err) {
      setStatus(err?.message || "Could not update room settings.", true);
    }
  }

  async function handleSaveHomeBase() {
    if (!state.currentRoom) {
      setStatus("Join a room first.", true);
      return;
    }
    const homeBaseName = sanitizeText(refs.roomHomeBaseNameInput?.value || "", 80);
    if (!homeBaseName) {
      setStatus("Home base name is required.", true);
      return;
    }

    try {
      const pose = readPoseSnapshot();
      await helpers.setHomeBase(state.currentRoom.code, {
        name: homeBaseName,
        description: sanitizeText(refs.roomHomeBaseDescInput?.value || "", 240),
        anchor: {
          kind: pose.frame.kind,
          lat: finiteNumber(pose.frame.locLat, 0),
          lon: finiteNumber(pose.frame.locLon, 0),
          x: finiteNumber(pose.pose.x, 0),
          y: finiteNumber(pose.pose.y, 0),
          z: finiteNumber(pose.pose.z, 0),
          interiorKey: pose.frame.interiorKey || "",
          buildingKey: pose.frame.buildingKey || "",
          interiorLabel: pose.frame.interiorLabel || ""
        }
      });
      setStatus("Home base saved.");
    } catch (err) {
      setStatus(err?.message || "Could not save home base.", true);
    }
  }

  async function handleCreateArtifact() {
    if (!state.currentRoom) {
      setStatus("Join a room first.", true);
      return;
    }
    const title = sanitizeText(refs.roomArtifactTitleInput?.value || "", 80);
    if (!title) {
      setStatus("Artifact title is required.", true);
      return;
    }
    try {
      const pose = readPoseSnapshot();
      const type = sanitizeText(refs.roomArtifactTypeSelect?.value || "pin", 20);
      const text = sanitizeText(refs.roomArtifactTextInput?.value || "", 280);
      await createArtifact(state.currentRoom.code, {
        type,
        title,
        text,
        visibility: state.currentRoom.visibility === "public" ? "public" : "room",
        anchor: {
          kind: pose.frame.kind,
          lat: finiteNumber(pose.frame.locLat, 0),
          lon: finiteNumber(pose.frame.locLon, 0),
          x: finiteNumber(pose.pose.x, 0),
          y: finiteNumber(pose.pose.y, 0),
          z: finiteNumber(pose.pose.z, 0),
          interiorKey: pose.frame.interiorKey || "",
          buildingKey: pose.frame.buildingKey || "",
          interiorLabel: pose.frame.interiorLabel || ""
        }
      });

      if (refs.roomArtifactTitleInput) refs.roomArtifactTitleInput.value = "";
      if (refs.roomArtifactTextInput) refs.roomArtifactTextInput.value = "";

      await bumpExplorerLeaderboard({ artifactsShared: 1 });
      emitTutorialEvent("artifact_placed", {
        source: "multiplayer_artifact",
        roomCode: normalizeCode(state.currentRoom?.code || "")
      });
      setStatus("Artifact saved.");
    } catch (err) {
      setStatus(err?.message || "Could not save artifact.", true);
    }
  }

  async function handleRemoveArtifact(artifactId) {
    if (!state.currentRoom) return;
    try {
      await removeArtifact(state.currentRoom.code, artifactId);
      setStatus("Artifact removed.");
    } catch (err) {
      setStatus(err?.message || "Could not remove artifact.", true);
    }
  }

  async function handleOpenRoomActivity(activityId) {
    if (!state.currentRoom) {
      setStatus("Join a room first.", true);
      return;
    }
    const activity = state.roomActivities.find(
      (entry) =>
        sanitizeText(entry.id || "", 120).toLowerCase() === sanitizeText(activityId || "", 120).toLowerCase()
    );
    if (!activity) {
      setStatus("That room game could not be found.", true);
      return;
    }
    if (typeof appCtx.openActivityBrowser === "function") {
      await appCtx.openActivityBrowser({
        activityId: activity.id,
        scope: "rooms"
      });
    }
    setStatus(`Opened ${activity.title}.`);
  }

  async function handleDeleteRoomActivity(activityId) {
    if (!state.currentRoom) {
      setStatus("Join a room first.", true);
      return;
    }
    if (!canManageCurrentRoomActivities()) {
      setStatus("Only the room owner can remove room games.", true);
      return;
    }
    try {
      await deleteRoomActivity(state.currentRoom.code, activityId);
      if (
        sanitizeText(state.activeRoomActivity?.activityId || "", 120).toLowerCase() ===
        sanitizeText(activityId || "", 120).toLowerCase()
      ) {
        await stopRoomActivitySession(state.currentRoom.code, {
          uid: state.authUser?.uid || "",
          displayName: state.authUser?.displayName || state.authUser?.email || "Explorer"
        });
      }
      setStatus("Room game removed.");
    } catch (err) {
      setStatus(err?.message || "Could not remove that room game.", true);
    }
  }

  async function handleStopRoomActivity(activityId = "") {
    if (!state.currentRoom) {
      setStatus("Join a room first.", true);
      return;
    }
    if (!canManageCurrentRoomActivities()) {
      setStatus("Only the room owner can stop a shared room game.", true);
      return;
    }
    const activeId = sanitizeText(state.activeRoomActivity?.activityId || "", 120).toLowerCase();
    if (activityId && sanitizeText(activityId, 120).toLowerCase() !== activeId) return;
    try {
      await stopRoomActivitySession(state.currentRoom.code, {
        uid: state.authUser?.uid || "",
        displayName: state.authUser?.displayName || state.authUser?.email || "Explorer"
      });
      if (typeof appCtx.stopSharedRoomActivityRuntime === "function") {
        appCtx.stopSharedRoomActivityRuntime({ source: "room_activity_stop" });
      }
      setStatus("Room game stopped.");
    } catch (err) {
      setStatus(err?.message || "Could not stop the room game.", true);
    }
  }

  async function launchRoomActivity(activity = {}) {
    if (!state.currentRoom) throw new Error("Join a room first.");
    const selected =
      state.roomActivities.find(
        (entry) =>
          sanitizeText(entry.id || "", 120).toLowerCase() === sanitizeText(activity.id || "", 120).toLowerCase()
      ) || activity;
    if (!selected?.id) throw new Error("Select a valid room game first.");
    const activeId = sanitizeText(state.activeRoomActivity?.activityId || "", 120).toLowerCase();
    if (canManageCurrentRoomActivities()) {
      await startRoomActivitySession(state.currentRoom.code, selected, {
        uid: state.authUser?.uid || "",
        displayName: state.authUser?.displayName || state.authUser?.email || "Explorer"
      });
      return { mode: "started" };
    }
    if (activeId === sanitizeText(selected.id || "", 120).toLowerCase()) {
      if (typeof appCtx.startSharedRoomActivityRuntime === "function") {
        await appCtx.startSharedRoomActivityRuntime({
          ...selected,
          sourceType: "room_activity",
          requiresNearbyStart: false
        });
      }
      return { mode: "joined" };
    }
    throw new Error("The room owner needs to start this room game first.");
  }

  async function handleAddFriend(friendUid, displayName, source = "manual") {
    if (!state.authUser) {
      setStatus("Sign in to add friends.", true);
      return;
    }
    try {
      const safeSource = source === "recent" ? "recent" : "manual";
      await addFriend(friendUid, displayName, safeSource);
      await bumpExplorerLeaderboard({ friendsAdded: 1 });
      if (refs.titleFriendsStatus) refs.titleFriendsStatus.textContent = "Friend added successfully.";
      setStatus("Friend added.");
    } catch (err) {
      setStatus(err?.message || "Could not add friend.", true);
    }
  }

  async function handleManualAddFriend() {
    if (!state.authUser) {
      setStatus("Sign in to add friends.", true);
      return;
    }
    const friendUid = sanitizeText(refs.titleFriendUidInput?.value || "", 128);
    if (!friendUid) {
      setStatus("Enter a friend UID to add them.", true);
      return;
    }
    const displayName = sanitizeText(refs.titleFriendNameInput?.value || "", 48) || "Explorer";
    await handleAddFriend(friendUid, displayName, "manual");
    if (refs.titleFriendUidInput) refs.titleFriendUidInput.value = "";
    if (refs.titleFriendNameInput) refs.titleFriendNameInput.value = "";
  }

  async function handleInviteFriend(friendUid) {
    if (!state.currentRoom) {
      setStatus("Join a room first before inviting friends.", true);
      return;
    }
    try {
      const link = await sendInviteToFriend(
        friendUid,
        state.currentRoom.code,
        currentRoomName(),
        `Join me in ${currentRoomName()}`
      );
      await copyText(link);
      setStatus("Invite sent and link copied.");
    } catch (err) {
      setStatus(err?.message || "Could not send invite.", true);
    }
  }

  return {
    activateRoom,
    applyEntitlementCopy,
    attemptPendingRoomJoin,
    clearGlobalSubscriptions,
    clearSubscriptions,
    currentRoomName,
    deactivateRoom,
    ensureAccessOrWarn,
    ensureGhostManager,
    ensureGhostTicker,
    ensureGlobalSubscriptions,
    ensureInviteJoinAccess,
    handleAddFriend,
    handleBrowseRooms,
    handleCopyInvite,
    handleCreateArtifact,
    handleCreateRoom,
    handleDeleteOwnedRoom,
    handleDeleteRoomActivity,
    handleInviteFriend,
    handleJoinRoom,
    handleJoinWeeklyFeaturedRoom,
    handleLeaveRoom,
    handleManualAddFriend,
    handleOpenOwnedRoom,
    handleOpenRoomActivity,
    handleRemoveArtifact,
    handleSaveHomeBase,
    handleSaveRoomSettings,
    handleSendChat,
    handleStopRoomActivity,
    launchRoomActivity,
    refreshFeaturedRooms,
    removeFriend,
    setHomeBase: helpers.setHomeBase,
    syncRoomWorldContext
  };
}
