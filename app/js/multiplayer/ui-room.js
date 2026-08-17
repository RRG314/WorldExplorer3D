import { ctx as appCtx } from '../shared-context.js?v=55';
import { CHAT_MAX_LENGTH, reportMessage } from './chat.js?v=56';
import {
  getCurrentRoom,
  normalizeCityKey,
  normalizeCode,
  setHomeBase
} from './rooms.js?v=67';
import { saveRoomActivity } from './room-activities.js?v=2';
import {
  normalizeColorHex as normalizePaintColorHex
} from './painttown.js?v=56';
import {
  createUiRoomEventsApi
} from './ui-room-events.js?v=2';
import { createUiRoomRenderers } from './ui-room-renderers.js?v=2';
import { createUiRoomActions } from './ui-room-actions.js?v=3';
import {
  emitTutorialEvent,
  finiteNumber,
  sanitizeText,
  escapeHtml,
  safeHtml,
  normalizePaintTouchMode,
  normalizePaintTimeLimitSec,
  normalizePaintRules,
  toMillis,
  hashStringToUint32,
  getWeeklyCitySelection,
  buildWeeklyFeaturedRoomCode,
  formatRelativeTime,
  formatPlanLabel,
  readPlanState,
  getRecommendedRoomCap,
  canUseMultiplayer,
  copyText,
  isPermissionError,
  buildInviteLink,
  pullCodeFromInputs,
  setInputCode,
  eventElementTarget,
  isWalkModeActive,
  isDroneModeActive
} from './ui-room-support.js?v=2';
import { readPoseSnapshot, readWorldContext } from './ui-room-pose.js?v=2';

let singleton = null;
function initMultiplayerPlatform() {
  if (singleton) return singleton;

  const refs = {
    titleStatus: document.getElementById('mpTitleStatus'),
    titlePlanState: document.getElementById('mpPlanState'),
    titleCodeInput: document.getElementById('mpTitleCodeInput'),
    titleRoomNameInput: document.getElementById('mpTitleRoomNameInput'),
    titleVisibilitySelect: document.getElementById('mpTitleVisibilitySelect'),
    titleLocationTagInput: document.getElementById('mpTitleLocationTagInput'),
    titleCreateBtn: document.getElementById('mpTitleCreateBtn'),
    titleJoinBtn: document.getElementById('mpTitleJoinBtn'),
    titlePanelBtn: document.getElementById('mpTitlePanelBtn'),
    titleInviteBtn: document.getElementById('mpTitleInviteBtn'),
    titleLeaveBtn: document.getElementById('mpTitleLeaveBtn'),
    titleTrialBtn: document.getElementById('mpTitleTrialBtn'),
    titleBrowseCityInput: document.getElementById('mpBrowseCityInput'),
    titleBrowseBtn: document.getElementById('mpBrowseBtn'),
    titleBrowseStatus: document.getElementById('mpBrowseStatus'),
    titleBrowseList: document.getElementById('mpBrowseList'),
    titleFeaturedRefreshBtn: document.getElementById('mpFeaturedRefreshBtn'),
    titleFeaturedWeeklyBtn: document.getElementById('mpFeaturedWeeklyBtn'),
    titleFeaturedWeeklyMeta: document.getElementById('mpFeaturedWeeklyMeta'),
    titleFeaturedList: document.getElementById('mpFeaturedList'),
    titleFriendsStatus: document.getElementById('mpFriendsStatus'),
    titleFriendUidInput: document.getElementById('mpFriendUidInput'),
    titleFriendNameInput: document.getElementById('mpFriendNameInput'),
    titleAddFriendBtn: document.getElementById('mpAddFriendBtn'),
    titleFriendsList: document.getElementById('mpFriendsList'),
    titleRecentPlayersList: document.getElementById('mpRecentPlayersList'),
    titleInvitesList: document.getElementById('mpInvitesList'),
    titleOwnedRoomsStatus: document.getElementById('mpOwnedRoomsStatus'),
    titleOwnedRoomsList: document.getElementById('mpOwnedRoomsList'),
    titleLeaderboardList: document.getElementById('mpLeaderboardList'),

    roomPanelModal: document.getElementById('roomPanelModal'),
    roomPanelCloseBtn: document.getElementById('roomPanelCloseBtn'),
    roomPanelCodeInput: document.getElementById('roomPanelCodeInput'),
    roomPanelCreateNameInput: document.getElementById('roomPanelCreateNameInput'),
    roomPanelVisibilitySelect: document.getElementById('roomPanelVisibilitySelect'),
    roomPanelLocationTagInput: document.getElementById('roomPanelLocationTagInput'),
    roomPanelCreateBtn: document.getElementById('roomPanelCreateBtn'),
    roomPanelJoinBtn: document.getElementById('roomPanelJoinBtn'),
    roomPanelInviteBtn: document.getElementById('roomPanelInviteBtn'),
    roomPanelLeaveBtn: document.getElementById('roomPanelLeaveBtn'),
    roomPanelTrialBtn: document.getElementById('roomPanelTrialBtn'),
    roomPanelStatus: document.getElementById('roomPanelStatus'),
    roomPanelRoomCode: document.getElementById('roomPanelRoomCode'),
    roomPanelRoomName: document.getElementById('roomPanelRoomName'),
    roomPanelPlayerList: document.getElementById('roomPanelPlayerList'),
    roomPanelPlayerCount: document.getElementById('roomPanelPlayerCount'),
    roomPanelNameInput: document.getElementById('roomPanelNameInput'),
    roomPanelFeaturedControl: document.getElementById('roomPanelFeaturedControl'),
    roomPanelFeaturedToggle: document.getElementById('roomPanelFeaturedToggle'),
    roomPanelPaintTimeInput: document.getElementById('roomPanelPaintTimeInput'),
    roomPanelPaintTouchModeSelect: document.getElementById('roomPanelPaintTouchModeSelect'),
    roomPanelPaintAllowGunToggle: document.getElementById('roomPanelPaintAllowGunToggle'),
    roomPanelPaintAllowRoofAutoToggle: document.getElementById('roomPanelPaintAllowRoofAutoToggle'),
    roomPanelSaveSettingsBtn: document.getElementById('roomPanelSaveSettingsBtn'),
    roomHomeBaseNameInput: document.getElementById('roomHomeBaseNameInput'),
    roomHomeBaseDescInput: document.getElementById('roomHomeBaseDescInput'),
    roomHomeBaseSaveBtn: document.getElementById('roomHomeBaseSaveBtn'),
    roomHomeBaseCurrent: document.getElementById('roomHomeBaseCurrent'),
    roomArtifactTypeSelect: document.getElementById('roomArtifactTypeSelect'),
    roomArtifactTitleInput: document.getElementById('roomArtifactTitleInput'),
    roomArtifactTextInput: document.getElementById('roomArtifactTextInput'),
    roomArtifactCreateBtn: document.getElementById('roomArtifactCreateBtn'),
    roomArtifactList: document.getElementById('roomArtifactList'),
    roomActivityList: document.getElementById('roomActivityList'),
    roomActivityOpenBtn: document.getElementById('roomActivityOpenBtn'),

    floatCreate: document.getElementById('fMpCreate'),
    floatJoin: document.getElementById('fMpJoin'),
    floatInvite: document.getElementById('fMpInvite'),
    floatLeave: document.getElementById('fMpLeave'),
    floatGhosts: document.getElementById('fMpGhosts'),
    floatChat: document.getElementById('fMpChat'),

    chatDrawer: document.getElementById('roomChatDrawer'),
    chatToggleBtn: document.getElementById('roomChatToggleBtn'),
    chatCloseBtn: document.getElementById('roomChatCloseBtn'),
    chatStatus: document.getElementById('roomChatStatus'),
    chatMessages: document.getElementById('roomChatMessages'),
    chatInput: document.getElementById('roomChatInput'),
    chatSendBtn: document.getElementById('roomChatSendBtn')
  };

  const state = {
    authUser: null,
    entitlement: readPlanState(),
    currentRoom: getCurrentRoom(),
    players: [],
    messages: [],
    ghostManager: null,
    ghostRenderTimer: null,
    ghostsEnabled: true,
    chatOpen: false,
    browseCityKey: '',
    browseRooms: [],
    featuredRooms: [],
    friends: [],
    recentPlayers: [],
    invites: [],
    ownedRooms: [],
    leaderboard: [],
    artifacts: [],
    roomActivities: [],
    activeRoomActivity: null,
    homeBase: null,
    pendingRoomCode: normalizeCode(new URLSearchParams(window.location.search).get('room')),
    pendingRoomPrompted: false,
    pendingRoomInFlight: false,
    activeRoomWorldSignature: '',
    pendingRoomWorldRetryTimer: null,
    unsubRoom: null,
    unsubPlayers: null,
    unsubChat: null,
    unsubArtifacts: null,
    unsubSharedBlocks: null,
    unsubWorldModifications: null,
    unsubHomeBase: null,
    unsubPaintClaims: null,
    unsubRoomActivities: null,
    unsubRoomActivityState: null,
    unsubFriends: null,
    unsubRecentPlayers: null,
    unsubInvites: null,
    unsubOwnedRooms: null,
    unsubLeaderboard: null
  };

  function normalizeVisibilitySelection(raw) {
    return String(raw || '').toLowerCase() === 'public' ? 'public' : 'private';
  }

  function readVisibilitySelection() {
    const roomPanelValue = normalizeVisibilitySelection(refs.roomPanelVisibilitySelect?.value);
    const titleValue = normalizeVisibilitySelection(refs.titleVisibilitySelect?.value);
    if (refs.roomPanelModal?.classList.contains('show')) return roomPanelValue;
    return titleValue || roomPanelValue || 'private';
  }

  function readLocationTagInput() {
    const roomPanelValue = sanitizeText(refs.roomPanelLocationTagInput?.value || '', 80);
    const titleValue = sanitizeText(refs.titleLocationTagInput?.value || '', 80);
    if (refs.roomPanelModal?.classList.contains('show')) return roomPanelValue || titleValue;
    return titleValue || roomPanelValue;
  }

  function readRoomNameInput() {
    const roomPanelValue = sanitizeText(refs.roomPanelCreateNameInput?.value || '', 80);
    const titleValue = sanitizeText(refs.titleRoomNameInput?.value || '', 80);
    if (refs.roomPanelModal?.classList.contains('show')) return roomPanelValue || titleValue;
    return titleValue || roomPanelValue;
  }

  function readPaintRulesFromPanel() {
    return normalizePaintRules({
      paintTimeLimitSec: refs.roomPanelPaintTimeInput?.value,
      paintTouchMode: refs.roomPanelPaintTouchModeSelect?.value,
      allowPaintballGun: refs.roomPanelPaintAllowGunToggle ? !!refs.roomPanelPaintAllowGunToggle.checked : true,
      allowRoofAutoPaint: refs.roomPanelPaintAllowRoofAutoToggle ? !!refs.roomPanelPaintAllowRoofAutoToggle.checked : true
    });
  }

  function applyPaintRulesToPanel(room) {
    const rules = normalizePaintRules(room?.rules || {});
    if (refs.roomPanelPaintTimeInput && document.activeElement !== refs.roomPanelPaintTimeInput) {
      refs.roomPanelPaintTimeInput.value = String(rules.paintTimeLimitSec);
    }
    if (refs.roomPanelPaintTouchModeSelect) {
      refs.roomPanelPaintTouchModeSelect.value = normalizePaintTouchMode(rules.paintTouchMode);
    }
    if (refs.roomPanelPaintAllowGunToggle) {
      refs.roomPanelPaintAllowGunToggle.checked = rules.allowPaintballGun === true;
    }
    if (refs.roomPanelPaintAllowRoofAutoToggle) {
      refs.roomPanelPaintAllowRoofAutoToggle.checked = rules.allowRoofAutoPaint === true;
    }
  }

  function syncCreateOptionFields(source = 'title') {
    const visibility = source === 'panel'
      ? normalizeVisibilitySelection(refs.roomPanelVisibilitySelect?.value)
      : normalizeVisibilitySelection(refs.titleVisibilitySelect?.value);
    const roomName = source === 'panel'
      ? sanitizeText(refs.roomPanelCreateNameInput?.value || '', 80)
      : sanitizeText(refs.titleRoomNameInput?.value || '', 80);
    const locationTag = source === 'panel'
      ? sanitizeText(refs.roomPanelLocationTagInput?.value || '', 80)
      : sanitizeText(refs.titleLocationTagInput?.value || '', 80);

    if (refs.titleVisibilitySelect) refs.titleVisibilitySelect.value = visibility;
    if (refs.roomPanelVisibilitySelect) refs.roomPanelVisibilitySelect.value = visibility;
    if (refs.titleRoomNameInput) refs.titleRoomNameInput.value = roomName;
    if (refs.roomPanelCreateNameInput) refs.roomPanelCreateNameInput.value = roomName;
    if (refs.titleLocationTagInput) refs.titleLocationTagInput.value = locationTag;
    if (refs.roomPanelLocationTagInput) refs.roomPanelLocationTagInput.value = locationTag;
  }

  function resolveWeeklyFeaturedWorld(selection) {
    const cityKey = normalizeCityKey(selection?.cityKey || selection?.city || '');
    const locations = Object.values(appCtx.LOCS || {});
    const match = locations.find((loc) => normalizeCityKey(loc?.name || '') === cityKey) || null;
    const lat = finiteNumber(match?.lat, finiteNumber(appCtx.LOC?.lat, 0));
    const lon = finiteNumber(match?.lon, finiteNumber(appCtx.LOC?.lon, 0));
    return {
      kind: 'earth',
      lat,
      lon,
      seed: `latlon:${lat.toFixed(5)},${lon.toFixed(5)}`
    };
  }

  const callbacks = { setAuthUser: null };
  const helperFns = {
    applyPaintRulesToPanel,
    buildInviteLink,
    buildWeeklyFeaturedRoomCode,
    canUseMultiplayer,
    chatMaxLength: CHAT_MAX_LENGTH,
    copyText,
    emitTutorialEvent,
    escapeHtml,
    finiteNumber,
    formatRelativeTime,
    getRecommendedRoomCap,
    getWeeklyCitySelection,
    isPermissionError,
    normalizeCityKey,
    normalizeCode,
    normalizePaintColorHex,
    normalizePaintRules,
    normalizeVisibilitySelection,
    pullCodeFromInputs,
    readLocationTagInput,
    readPaintRulesFromPanel,
    readPoseSnapshot,
    readRoomNameInput,
    readVisibilitySelection,
    readWorldContext,
    resolveWeeklyFeaturedWorld,
    safeHtml,
    sanitizeText,
    setHomeBase,
    setInputCode
  };

  const renderers = createUiRoomRenderers({
    appCtx,
    refs,
    state,
    helpers: helperFns
  });
  const actions = createUiRoomActions({
    appCtx,
    refs,
    state,
    renderers,
    helpers: helperFns,
    callbacks
  });

  const {
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
    setBrowseStatus,
    setChatOpen,
    setChatStatus,
    setStatus,
    updateToggleStates
  } = renderers;

  const {
    activateRoom,
    applyEntitlementCopy,
    attemptPendingRoomJoin,
    deactivateRoom,
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
    syncRoomWorldContext
  } = actions;

  const eventApi = createUiRoomEventsApi({
    appCtx,
    refs,
    state,
    callbacks: {
      syncCreateOptionFields
    },
    handlers: {
      applyEntitlementCopy,
      attemptPendingRoomJoin,
      closeRoomPanel,
      deactivateRoom,
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
      openRoomPanel,
      refreshFeaturedRooms,
      setChatOpen,
      setChatStatus,
      setStatus,
      updateToggleStates
    },
    helpers: {
      eventElementTarget,
      normalizeCode,
      readPlanState,
      sanitizeText,
      setInputCode
    }
  });

  const {
    activateMultiplayerTabFromQuery,
    wireEvents
  } = eventApi;

  function setAuthUser(user) {
    state.authUser = user || null;
    if (!state.authUser) {
      state.browseCityKey = '';
      state.browseRooms = [];
      deactivateRoom(true);
    }

    state.entitlement = {
      ...state.entitlement,
      ...readPlanState(),
      uid: user?.uid || state.entitlement.uid || ''
    };

    ensureGlobalSubscriptions();
    refreshFeaturedRooms(true);
    applyEntitlementCopy();
    attemptPendingRoomJoin();
    updateToggleStates();
    renderBrowseRooms();
    renderFeaturedRooms();
    renderFriends();
    renderRecentPlayers();
    renderInvites();
    renderOwnedRooms();
    renderLeaderboard();
    publishMapRoomsToContext();
  }

  callbacks.setAuthUser = setAuthUser;

  wireEvents();
  syncCreateOptionFields('title');
  activateMultiplayerTabFromQuery();
  ensureGhostTicker();

  if (state.currentRoom && state.currentRoom.id) {
    activateRoom(state.currentRoom, 'current room');
  } else {
    if (typeof appCtx.clearPaintTownMultiplayerConfig === 'function') {
      appCtx.clearPaintTownMultiplayerConfig();
    }
    if (Object.prototype.hasOwnProperty.call(appCtx, 'publishPaintTownClaim')) {
      delete appCtx.publishPaintTownClaim;
    }
    renderRoomMeta();
    renderPlayerList();
    renderChat();
    renderArtifacts();
    renderRoomActivities();
    renderHomeBase();
    renderBrowseRooms();
    renderFeaturedRooms();
    renderFriends();
    renderRecentPlayers();
    renderInvites();
    renderOwnedRooms();
    renderLeaderboard();
    updateToggleStates();
    applyEntitlementCopy();
    publishMapRoomsToContext();
  }

  singleton = {
    setAuthUser,
    openRoomPanel,
    closeRoomPanel,
    joinRoomByCode: (code) => handleJoinRoom(code),
    createRoom: handleCreateRoom,
    leaveRoom: handleLeaveRoom,
    getCurrentRoom: () => state.currentRoom,
    syncRoomWorldContext: (room, options = {}) => syncRoomWorldContext(room, options.force === true, options.respawn === true),
    canManageCurrentRoomActivities,
    saveRoomActivity: async (activity) => {
      if (!state.currentRoom) throw new Error('Join a room first.');
      if (!canManageCurrentRoomActivities()) throw new Error('Only the room owner can save room games.');
      const saved = await saveRoomActivity(state.currentRoom.code, activity);
      setStatus(`Saved ${saved.title} to this room.`);
      return saved;
    },
    launchRoomActivity,
    stopRoomActivity: () => handleStopRoomActivity(),
    getCurrentRoomActivities: () => state.roomActivities.slice(),
    getActiveRoomActivity: () => state.activeRoomActivity ? { ...state.activeRoomActivity } : null
  };

  return singleton;
}

export { initMultiplayerPlatform };
