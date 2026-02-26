import { ctx as appCtx } from '../shared-context.js?v=55';
import { ensureEntitlements, startTrialIfEligible } from '../../../js/entitlements.js?v=64';
import { createArtifact, listenArtifacts, removeArtifact } from './artifacts.js?v=55';
import {
  clearMySharedBlocks,
  listenSharedBlocks,
  removeSharedBlock,
  upsertSharedBlock
} from './blocks.js?v=61';
import { CHAT_MAX_LENGTH, listenChat, reportMessage, sendMessage } from './chat.js?v=55';
import { createGhostManager } from './ghosts.js?v=56';
import {
  bumpExplorerLeaderboard,
  listenExplorerLeaderboard
} from './loop.js?v=55';
import { listenPlayers, startPresence, stopPresence } from './presence.js?v=55';
import {
  createRoom,
  deleteOwnedRoom,
  deriveRoomDeterministicSeed,
  findFeaturedPublicRooms,
  findPublicRoomsByCity,
  getCurrentRoom,
  joinRoomByCode,
  leaveRoom,
  listenHomeBase,
  listenMyRooms,
  listenRoom,
  normalizeCityKey,
  normalizeCode,
  setHomeBase,
  updateRoomSettings
} from './rooms.js?v=63';
import {
  listenPaintClaims,
  normalizeColorHex as normalizePaintColorHex,
  upsertPaintClaim
} from './painttown.js?v=55';
import {
  addFriend,
  dismissInvite,
  listenFriends,
  listenIncomingInvites,
  listenRecentPlayers,
  markInviteSeen,
  recordRecentPlayers,
  removeFriend,
  sendInviteToFriend
} from './social.js?v=55';

const ENABLED_PLANS = new Set(['trial', 'support', 'supporter', 'pro']);

let singleton = null;

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeText(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

const HTML_ESCAPE_MAP = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
});

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] || char);
}

function safeHtml(value, max = 120) {
  return escapeHtml(sanitizeText(value, max));
}

const PAINT_TOUCH_MODES = new Set(['off', 'roof', 'any']);

function normalizePaintTouchMode(raw) {
  const mode = String(raw || '').toLowerCase();
  return PAINT_TOUCH_MODES.has(mode) ? mode : 'any';
}

function normalizePaintTimeLimitSec(raw) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 120;
  return Math.max(30, Math.min(1800, Math.floor(parsed)));
}

function normalizePaintRules(rawRules = {}) {
  const source = rawRules && typeof rawRules === 'object' ? rawRules : {};
  return {
    paintTimeLimitSec: normalizePaintTimeLimitSec(source.paintTimeLimitSec),
    paintTouchMode: normalizePaintTouchMode(source.paintTouchMode),
    allowPaintballGun: source.allowPaintballGun !== false,
    allowRoofAutoPaint: source.allowRoofAutoPaint !== false
  };
}

function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatRelativeTime(value) {
  const ms = toMillis(value);
  if (!Number.isFinite(ms)) return 'just now';
  const delta = Date.now() - ms;
  if (delta < 60 * 1000) return 'just now';
  if (delta < 60 * 60 * 1000) return `${Math.max(1, Math.floor(delta / (60 * 1000)))}m ago`;
  if (delta < 24 * 60 * 60 * 1000) return `${Math.max(1, Math.floor(delta / (60 * 60 * 1000)))}h ago`;
  return `${Math.max(1, Math.floor(delta / (24 * 60 * 60 * 1000)))}d ago`;
}

function readPlanState() {
  const globalState = globalThis.__WE3D_ENTITLEMENTS__ || {};
  const plan = String(globalState.plan || 'free').toLowerCase();
  const isAdmin = globalState.isAdmin === true || String(globalState.role || '').toLowerCase() === 'admin';
  return {
    plan,
    planLabel: String(globalState.planLabel || (isAdmin ? 'Admin' : (plan ? plan[0].toUpperCase() + plan.slice(1) : 'Free'))),
    isAdmin,
    isAuthenticated: !!globalState.isAuthenticated,
    uid: String(globalState.uid || ''),
    displayName: sanitizeText(globalState.displayName || '', 48)
  };
}

function canUseMultiplayer(planState) {
  return planState?.isAdmin === true || ENABLED_PLANS.has(String(planState?.plan || '').toLowerCase());
}

function copyText(text) {
  if (!text) return Promise.reject(new Error('Nothing to copy.'));
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(text);
  }

  return new Promise((resolve, reject) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    try {
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (!ok) throw new Error('Copy command failed.');
      resolve();
    } catch (err) {
      document.body.removeChild(textarea);
      reject(err);
    }
  });
}

function buildInviteLink(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return '';

  const url = new URL(window.location.href);
  url.searchParams.set('room', normalized);
  url.searchParams.set('tab', 'multiplayer');
  url.searchParams.set('invite', '1');
  url.searchParams.delete('startTrial');
  return url.toString();
}

function pullCodeFromInputs(refs) {
  const values = [
    refs.titleCodeInput?.value,
    refs.roomPanelCodeInput?.value
  ];

  for (const value of values) {
    const normalized = normalizeCode(value);
    if (normalized) return normalized;
  }
  return '';
}

function setInputCode(refs, code) {
  const normalized = normalizeCode(code);
  if (refs.titleCodeInput) refs.titleCodeInput.value = normalized;
  if (refs.roomPanelCodeInput) refs.roomPanelCodeInput.value = normalized;
}

function eventElementTarget(event) {
  const rawTarget = event?.target;
  if (rawTarget instanceof Element) return rawTarget;
  if (rawTarget instanceof Node && rawTarget.parentElement instanceof Element) {
    return rawTarget.parentElement;
  }
  return null;
}

function isWalkModeActive() {
  return !!(appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.mode === 'walk');
}

function readWorldContext() {
  const lat = finiteNumber(appCtx.LOC?.lat, finiteNumber(appCtx.customLoc?.lat, 0));
  const lon = finiteNumber(appCtx.LOC?.lon, finiteNumber(appCtx.customLoc?.lon, 0));
  const locName = appCtx.selLoc === 'custom'
    ? sanitizeText(appCtx.customLoc?.name || 'Custom', 80)
    : sanitizeText(appCtx.LOCS?.[appCtx.selLoc]?.name || appCtx.selLoc || 'Custom', 80);

  const kind = appCtx.spaceFlight?.active ? 'space' : appCtx.onMoon ? 'moon' : 'earth';
  return {
    kind,
    lat,
    lon,
    name: locName,
    seed: `latlon:${lat.toFixed(5)},${lon.toFixed(5)}`
  };
}

function readPoseSnapshot() {
  const world = readWorldContext();
  const base = {
    mode: world.kind === 'space' ? 'space' : world.kind === 'moon' ? 'moon' : 'drive',
    frame: {
      kind: world.kind,
      locLat: world.lat,
      locLon: world.lon
    },
    pose: {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      vx: 0,
      vy: 0,
      vz: 0
    }
  };

  if (appCtx.spaceFlight?.active && appCtx.spaceFlight.rocket) {
    const rocket = appCtx.spaceFlight.rocket;
    base.mode = 'space';
    base.pose.x = finiteNumber(rocket.position?.x, 0);
    base.pose.y = finiteNumber(rocket.position?.y, 0);
    base.pose.z = finiteNumber(rocket.position?.z, 0);
    base.pose.vx = finiteNumber(appCtx.spaceFlight.velocity?.x, 0);
    base.pose.vy = finiteNumber(appCtx.spaceFlight.velocity?.y, 0);
    base.pose.vz = finiteNumber(appCtx.spaceFlight.velocity?.z, 0);

    if (globalThis.THREE && rocket.quaternion) {
      const euler = new THREE.Euler().setFromQuaternion(rocket.quaternion, 'YXZ');
      base.pose.yaw = finiteNumber(euler.y, 0);
      base.pose.pitch = finiteNumber(euler.x, 0);
    }
    return base;
  }

  if (appCtx.droneMode) {
    base.mode = appCtx.onMoon ? 'moon' : 'drone';
    base.pose.x = finiteNumber(appCtx.drone?.x, finiteNumber(appCtx.car?.x, 0));
    base.pose.y = finiteNumber(appCtx.drone?.y, finiteNumber(appCtx.car?.y, 0));
    base.pose.z = finiteNumber(appCtx.drone?.z, finiteNumber(appCtx.car?.z, 0));
    base.pose.yaw = finiteNumber(appCtx.drone?.yaw, finiteNumber(appCtx.car?.angle, 0));
    base.pose.pitch = finiteNumber(appCtx.drone?.pitch, 0);
    return base;
  }

  if (isWalkModeActive()) {
    base.mode = appCtx.onMoon ? 'moon' : 'walk';
    base.pose.x = finiteNumber(appCtx.Walk.state.walker?.x, finiteNumber(appCtx.car?.x, 0));
    base.pose.y = finiteNumber(appCtx.Walk.state.walker?.y, finiteNumber(appCtx.car?.y, 0));
    base.pose.z = finiteNumber(appCtx.Walk.state.walker?.z, finiteNumber(appCtx.car?.z, 0));
    base.pose.yaw = finiteNumber(appCtx.Walk.state.walker?.yaw, finiteNumber(appCtx.car?.angle, 0));
    base.pose.pitch = finiteNumber(appCtx.Walk.state.walker?.pitch, 0);
    base.pose.vy = finiteNumber(appCtx.Walk.state.walker?.vy, 0);
    return base;
  }

  base.mode = appCtx.onMoon ? 'moon' : 'drive';
  base.pose.x = finiteNumber(appCtx.car?.x, 0);
  base.pose.y = finiteNumber(appCtx.car?.y, 0);
  base.pose.z = finiteNumber(appCtx.car?.z, 0);
  base.pose.yaw = finiteNumber(appCtx.car?.angle, 0);
  base.pose.vx = finiteNumber(appCtx.car?.vx, 0);
  base.pose.vy = finiteNumber(appCtx.car?.vy, 0);
  base.pose.vz = finiteNumber(appCtx.car?.vz, 0);
  return base;
}

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
    homeBase: null,
    pendingRoomCode: normalizeCode(new URLSearchParams(window.location.search).get('room')),
    pendingRoomPrompted: false,
    pendingRoomInFlight: false,
    activeRoomWorldSignature: '',
    unsubRoom: null,
    unsubPlayers: null,
    unsubChat: null,
    unsubArtifacts: null,
    unsubSharedBlocks: null,
    unsubHomeBase: null,
    unsubPaintClaims: null,
    unsubFriends: null,
    unsubRecentPlayers: null,
    unsubInvites: null,
    unsubOwnedRooms: null,
    unsubLeaderboard: null
  };

  function closeRoomPanel() {
    if (!refs.roomPanelModal) return;
    refs.roomPanelModal.classList.remove('show');
  }

  function openRoomPanel() {
    if (!refs.roomPanelModal) return;
    refs.roomPanelModal.classList.add('show');
  }

  function setChatStatus(message, warn = false) {
    if (!refs.chatStatus) return;
    refs.chatStatus.textContent = message || '';
    refs.chatStatus.style.color = warn ? '#fca5a5' : '#93c5fd';
  }

  function setStatus(message, warn = false) {
    if (refs.titleStatus) {
      refs.titleStatus.textContent = message || '';
      refs.titleStatus.style.color = warn ? '#ef4444' : '#64748b';
    }
    if (refs.roomPanelStatus) {
      refs.roomPanelStatus.textContent = message || '';
      refs.roomPanelStatus.style.color = warn ? '#fca5a5' : '#93c5fd';
    }
  }

  function setBrowseStatus(message, warn = false) {
    if (!refs.titleBrowseStatus) return;
    refs.titleBrowseStatus.textContent = message || '';
    refs.titleBrowseStatus.style.color = warn ? '#b91c1c' : '#64748b';
  }

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

  function roomWorldSignature(room) {
    if (!room || !room.world) return '';
    const world = room.world || {};
    const kind = String(world.kind || 'earth').toLowerCase();
    const seed = String(world.seed || '').trim();
    const lat = finiteNumber(world.lat, 0).toFixed(6);
    const lon = finiteNumber(world.lon, 0).toFixed(6);
    return `${kind}|${seed}|${lat}|${lon}`;
  }

  function applyRoomPaintMultiplayerConfig(room) {
    if (!room) return;
    const roomSeed = deriveRoomDeterministicSeed(room);
    const rules = normalizePaintRules(room.rules || {});
    appCtx.paintTownRoomRules = { ...rules };
    if (typeof appCtx.setPaintTownMultiplayerConfig === 'function') {
      appCtx.setPaintTownMultiplayerConfig({
        roomId: room.id,
        uid: state.authUser?.uid || '',
        roomSeed,
        rules
      });
    }
  }

  function installPaintClaimPublisher() {
    appCtx.publishPaintTownClaim = async (claim = {}) => {
      if (!state.currentRoom?.id) return;
      const key = sanitizeText(claim.key || '', 120);
      if (!key) return;
      await upsertPaintClaim(state.currentRoom.code, {
        key,
        colorHex: normalizePaintColorHex(claim.colorHex || '#D61F2C'),
        colorName: sanitizeText(claim.colorName || '', 24),
        method: sanitizeText(claim.method || 'touch-any', 24)
      });
    };
  }

  async function syncRoomWorldContext(room, force = false) {
    if (!room || !room.world) return;

    const signature = roomWorldSignature(room);
    if (!force && signature && state.activeRoomWorldSignature === signature) return;
    state.activeRoomWorldSignature = signature;

    const world = room.world || {};
    const roomSeed = deriveRoomDeterministicSeed(room);
    appCtx.sharedSeedOverride = roomSeed;
    applyRoomPaintMultiplayerConfig(room);
    installPaintClaimPublisher();

    const lat = finiteNumber(world.lat, null);
    const lon = finiteNumber(world.lon, null);
    const kind = String(world.kind || 'earth').toLowerCase();

    if (kind !== 'earth' || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return;
    }

    appCtx.customLoc = {
      lat,
      lon,
      name: sanitizeText(room.name || room.locationTag?.label || room.code || 'Room World', 80) || 'Room World'
    };
    appCtx.selLoc = 'custom';

    const customLatInput = document.getElementById('customLat');
    const customLonInput = document.getElementById('customLon');
    if (customLatInput) customLatInput.value = lat.toFixed(6);
    if (customLonInput) customLonInput.value = lon.toFixed(6);

    if (appCtx.gameStarted && !appCtx.worldLoading && typeof appCtx.loadRoads === 'function') {
      setStatus(`Syncing room world ${room.code} (seed ${roomSeed})...`);
      try {
        await appCtx.loadRoads();
      } catch (err) {
        console.warn('[multiplayer][ui] room world sync failed:', err);
      }
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

  function renderBrowseRooms() {
    if (!refs.titleBrowseList) return;

    if (!state.authUser) {
      refs.titleBrowseList.innerHTML = '<li class="mpRoomEmpty">Sign in to browse public rooms.</li>';
      return;
    }

    if (!state.browseRooms.length) {
      if (state.browseCityKey) {
        refs.titleBrowseList.innerHTML = '<li class="mpRoomEmpty">No public rooms found for that city tag.</li>';
      } else {
        refs.titleBrowseList.innerHTML = '<li class="mpRoomEmpty">Search a city to find public rooms.</li>';
      }
      return;
    }

    refs.titleBrowseList.innerHTML = state.browseRooms.map((room) => {
      const code = normalizeCode(room.code);
      const worldKind = sanitizeText(room.world?.kind || 'earth', 16).toUpperCase();
      const roomName = safeHtml(room.name || `${worldKind} Session`, 80);
      const locationLabel = safeHtml(room.locationTag?.label || room.locationTag?.city || 'Unknown location', 80);
      return `<li class="mpRoomItem"><div class="mpRoomInfo"><div class="mpRoomName">${roomName}</div><div class="mpRoomMeta">${locationLabel} • ${escapeHtml(worldKind)} • ${escapeHtml(code)}</div></div><button class="mp-btn secondary mpRoomJoinBtn" data-room-code="${escapeHtml(code)}" type="button">Join</button></li>`;
    }).join('');
  }

  function renderFeaturedRooms() {
    if (!refs.titleFeaturedList) return;
    if (!state.authUser) {
      refs.titleFeaturedList.innerHTML = '<li class="mpRoomEmpty">Sign in to browse featured rooms.</li>';
      return;
    }
    if (!state.featuredRooms.length) {
      refs.titleFeaturedList.innerHTML = '<li class="mpRoomEmpty">No featured rooms yet.</li>';
      return;
    }
    refs.titleFeaturedList.innerHTML = state.featuredRooms.map((room) => {
      const code = normalizeCode(room.code);
      const roomName = safeHtml(room.name || 'Untitled Room', 80);
      const locationLabel = safeHtml(room.locationTag?.label || room.locationTag?.city || 'Unknown location', 80);
      return `<li class="mpRoomItem"><div class="mpRoomInfo"><div class="mpRoomName">${roomName}</div><div class="mpRoomMeta">${locationLabel} • ${escapeHtml(code)}</div></div><button class="mp-btn secondary mpRoomJoinBtn" data-room-code="${escapeHtml(code)}" type="button">Join</button></li>`;
    }).join('');
  }

  function renderFriends() {
    if (!refs.titleFriendsList) return;
    if (!state.authUser) {
      refs.titleFriendsList.innerHTML = '<li class="mpRoomEmpty">Sign in to use your friends list.</li>';
      return;
    }
    if (!state.friends.length) {
      refs.titleFriendsList.innerHTML = '<li class="mpRoomEmpty">No friends yet. Add by UID above or from Recent Players.</li>';
      return;
    }
    refs.titleFriendsList.innerHTML = state.friends.map((friend) => {
      const display = safeHtml(friend.displayName || 'Explorer', 48);
      const source = safeHtml(friend.source || 'manual', 12);
      const friendUid = escapeHtml(String(friend.uid || ''));
      return `<li class="mpRoomItem"><div class="mpRoomInfo"><div class="mpRoomName">${display}</div><div class="mpRoomMeta">source: ${source}</div></div><div class="mp-row"><button class="mp-btn secondary mpSmallBtn" data-invite-friend="${friendUid}" type="button">Invite</button><button class="mp-btn secondary mpSmallBtn" data-remove-friend="${friendUid}" type="button">Remove</button></div></li>`;
    }).join('');
  }

  function renderRecentPlayers() {
    if (!refs.titleRecentPlayersList) return;
    if (!state.authUser) {
      refs.titleRecentPlayersList.innerHTML = '<li class="mpRoomEmpty">Sign in to track recent players.</li>';
      return;
    }
    if (!state.recentPlayers.length) {
      refs.titleRecentPlayersList.innerHTML = '<li class="mpRoomEmpty">Play with others to populate recent players.</li>';
      return;
    }
    refs.titleRecentPlayersList.innerHTML = state.recentPlayers.map((player) => {
      const display = safeHtml(player.displayName || 'Explorer', 48);
      const displayAttr = escapeHtml(sanitizeText(player.displayName || 'Explorer', 48));
      const roomCode = normalizeCode(player.roomCode || '');
      const roomLabel = safeHtml(player.roomName || roomCode || '', 80);
      const roomCodeSafe = escapeHtml(roomCode || '----');
      const sessions = Math.max(1, Number(player.sharedSessions || 1));
      return `<li class="mpRoomItem"><div class="mpRoomInfo"><div class="mpRoomName">${display}</div><div class="mpRoomMeta">${roomLabel || 'Recent room'} • ${roomCodeSafe} • sessions ${sessions}</div></div><div class="mp-row"><button class="mp-btn secondary mpSmallBtn" data-add-friend="${escapeHtml(String(player.uid || ''))}" data-player-name="${displayAttr}" type="button">Add Friend</button><button class="mp-btn secondary mpSmallBtn" data-join-recent="${escapeHtml(roomCode)}" type="button">Join</button></div></li>`;
    }).join('');
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
    refs.titleInvitesList.innerHTML = state.invites.map((invite) => {
      const from = safeHtml(invite.fromDisplayName || 'Explorer', 48);
      const roomCode = normalizeCode(invite.roomCode || '');
      const roomName = safeHtml(invite.roomName || roomCode || 'Room', 80);
      const statusBadge = invite.seen ? '<span class="mp-pill">Seen</span>' : '<span class="mp-pill">New</span>';
      const message = invite.message ? `<div class="mpRoomMeta">${safeHtml(invite.message, 120)}</div>` : '';
      return `<li class="mpRoomItem"><div class="mpRoomInfo"><div class="mpRoomName">${from} invited you ${statusBadge}</div><div class="mpRoomMeta">${roomName} • ${escapeHtml(roomCode)}</div>${message}</div><div class="mp-row"><button class="mp-btn secondary mpSmallBtn" data-accept-invite="${escapeHtml(String(invite.id || ''))}" data-room-code="${escapeHtml(roomCode)}" type="button">Join</button><button class="mp-btn secondary mpSmallBtn" data-dismiss-invite="${escapeHtml(String(invite.id || ''))}" type="button">Dismiss</button></div></li>`;
    }).join('');
  }

  function renderOwnedRooms() {
    if (!refs.titleOwnedRoomsList) return;
    if (!state.authUser) {
      refs.titleOwnedRoomsList.innerHTML = '<li class="mpRoomEmpty">Sign in to manage rooms you created.</li>';
      if (refs.titleOwnedRoomsStatus) {
        refs.titleOwnedRoomsStatus.textContent = 'Sign in to access your saved rooms.';
        refs.titleOwnedRoomsStatus.style.color = '#64748b';
      }
      return;
    }

    if (!state.ownedRooms.length) {
      refs.titleOwnedRoomsList.innerHTML = '<li class="mpRoomEmpty">No saved rooms yet.</li>';
      if (refs.titleOwnedRoomsStatus) {
        refs.titleOwnedRoomsStatus.textContent = 'Create or join a room to save it here for quick return.';
        refs.titleOwnedRoomsStatus.style.color = '#64748b';
      }
      return;
    }

    refs.titleOwnedRoomsList.innerHTML = state.ownedRooms.map((room) => {
      const code = normalizeCode(room.code || room.id || '');
      const name = safeHtml(room.name || code || 'Untitled Room', 80);
      const visibility = safeHtml(room.visibility || 'private', 16);
      const role = safeHtml(room.role || (room.ownerUid === state.authUser?.uid ? 'owner' : 'member'), 16);
      const location = safeHtml(room.locationTag?.label || room.locationTag?.city || '', 80);
      const locationMeta = location ? ` • ${location}` : '';
      const canDelete = String(room.ownerUid || '') === String(state.authUser?.uid || '');
      const deleteBtn = canDelete
        ? `<button class="mp-btn secondary mpSmallBtn" data-delete-owned-room="${escapeHtml(code)}" type="button">Delete</button>`
        : '';
      return `<li class="mpRoomItem" data-owned-room-code="${escapeHtml(code)}" tabindex="0" role="button" aria-label="Open room ${escapeHtml(code)}"><div class="mpRoomInfo"><div class="mpRoomName">${name}</div><div class="mpRoomMeta">${escapeHtml(code)} • ${visibility} • ${role}${locationMeta}</div></div><div class="mp-row"><button class="mp-btn secondary mpSmallBtn" data-open-owned-room="${escapeHtml(code)}" type="button">Open</button>${deleteBtn}</div></li>`;
    }).join('');

    if (refs.titleOwnedRoomsStatus) {
      refs.titleOwnedRoomsStatus.textContent = `${state.ownedRooms.length} saved room${state.ownedRooms.length === 1 ? '' : 's'}. Use Open to return anytime.`;
      refs.titleOwnedRoomsStatus.style.color = '#64748b';
    }
  }

  function upsertOwnedRoomLocal(room) {
    if (!room || !state.authUser || !state.authUser.uid) return;
    const code = normalizeCode(room.code || room.id || '');
    if (!code) return;

    const normalized = {
      ...room,
      role: String(room.role || (String(room.ownerUid || '') === String(state.authUser.uid) ? 'owner' : 'member')).toLowerCase()
    };
    const next = Array.isArray(state.ownedRooms) ? [...state.ownedRooms] : [];
    const idx = next.findIndex((entry) => normalizeCode(entry.code || entry.id || '') === code);
    if (idx >= 0) next[idx] = normalized;
    else next.unshift(normalized);
    state.ownedRooms = next;
    renderOwnedRooms();
  }

  function renderLeaderboard() {
    if (!refs.titleLeaderboardList) return;
    if (!state.leaderboard.length) {
      refs.titleLeaderboardList.innerHTML = '<li class="mpRoomEmpty">Leaderboard updates as explorers participate.</li>';
      return;
    }
    refs.titleLeaderboardList.innerHTML = state.leaderboard.map((entry, idx) => {
      const rank = idx + 1;
      const display = safeHtml(entry.displayName || 'Explorer', 48);
      const summary = `Score ${Math.max(0, Number(entry.score || 0))} • Rooms ${Math.max(0, Number(entry.roomsJoined || 0))} • Artifacts ${Math.max(0, Number(entry.artifactsShared || 0))}`;
      return `<li class="mpFeedItem"><div class="mpFeedTitle">#${rank} ${display}</div><div class="mpFeedMeta">${escapeHtml(summary)}</div><div class="mpFeedMeta">last active ${escapeHtml(formatRelativeTime(entry.lastActiveAt))}</div></li>`;
    }).join('');
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
    refs.roomArtifactList.innerHTML = state.artifacts.map((artifact) => {
      const type = safeHtml(artifact.type || 'pin', 20);
      const title = safeHtml(artifact.title || 'Untitled', 80);
      const owner = safeHtml(artifact.ownerDisplayName || 'Explorer', 48);
      const mine = artifact.ownerUid && state.authUser && artifact.ownerUid === state.authUser.uid;
      const canDelete = mine || (state.currentRoom && state.currentRoom.ownerUid === state.authUser?.uid);
      const deleteBtn = canDelete ? `<button class="mp-btn secondary mpSmallBtn" data-remove-artifact="${escapeHtml(String(artifact.id || ''))}" type="button">Delete</button>` : '';
      return `<li class="mpRoomItem"><div class="mpArtifactInfo"><div class="mpArtifactTitle">${title}</div><div class="mpArtifactMeta">${type} • by ${owner} • ${escapeHtml(formatRelativeTime(artifact.updatedAt))}</div><div class="mpArtifactMeta">${safeHtml(artifact.text || '', 280)}</div></div><div class="mp-row">${deleteBtn}</div></li>`;
    }).join('');
  }

  function renderHomeBase() {
    if (!refs.roomHomeBaseCurrent) return;
    if (!state.currentRoom) {
      refs.roomHomeBaseCurrent.textContent = 'Join a room to set a home base.';
      return;
    }
    if (!state.homeBase) {
      refs.roomHomeBaseCurrent.textContent = 'No home base set.';
      return;
    }
    const name = sanitizeText(state.homeBase.name || 'Home Base', 80);
    const desc = sanitizeText(state.homeBase.description || '', 240);
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
      refs.titlePlanState.textContent = 'Admin mode: Multiplayer + Pro features unlocked for live testing.';
      refs.titlePlanState.classList.remove('warn');
      return;
    }
    if (plan === 'pro') {
      refs.titlePlanState.textContent = 'Pro: Multiplayer + Early demos + direct feedback channel.';
      refs.titlePlanState.classList.remove('warn');
      return;
    }
    if (plan === 'supporter' || plan === 'support') {
      refs.titlePlanState.textContent = 'Supporter: Multiplayer unlocked. Upgrade to Pro for early demos.';
      refs.titlePlanState.classList.remove('warn');
      return;
    }
    if (plan === 'trial') {
      refs.titlePlanState.textContent = 'Trial: Multiplayer unlocked for 2 days. Subscribe to keep access.';
      refs.titlePlanState.classList.remove('warn');
      return;
    }

    refs.titlePlanState.textContent = 'Free plan: Multiplayer is locked until you start trial or upgrade.';
    refs.titlePlanState.classList.add('warn');
  }

  function updateToggleStates() {
    const hasRoom = !!state.currentRoom;
    if (refs.floatGhosts) {
      refs.floatGhosts.classList.toggle('on', state.ghostsEnabled);
      refs.floatGhosts.classList.toggle('disabled', !hasRoom);
    }
    if (refs.floatChat) {
      refs.floatChat.classList.toggle('on', state.chatOpen);
      refs.floatChat.classList.toggle('disabled', !hasRoom);
    }
    if (refs.chatToggleBtn) {
      refs.chatToggleBtn.classList.toggle('on', state.chatOpen);
      refs.chatToggleBtn.disabled = !hasRoom;
    }
    if (refs.chatSendBtn) refs.chatSendBtn.disabled = !hasRoom;
    if (refs.chatInput) refs.chatInput.disabled = !hasRoom;
    if (refs.titleInviteBtn) refs.titleInviteBtn.disabled = !hasRoom;
    if (refs.titleLeaveBtn) refs.titleLeaveBtn.disabled = !hasRoom;
    if (refs.roomPanelInviteBtn) refs.roomPanelInviteBtn.disabled = !hasRoom;
    if (refs.roomPanelLeaveBtn) refs.roomPanelLeaveBtn.disabled = !hasRoom;
    if (refs.roomPanelSaveSettingsBtn) refs.roomPanelSaveSettingsBtn.disabled = !hasRoom;
    if (refs.roomHomeBaseSaveBtn) refs.roomHomeBaseSaveBtn.disabled = !hasRoom;
    if (refs.roomArtifactCreateBtn) refs.roomArtifactCreateBtn.disabled = !hasRoom;
    if (refs.roomPanelFeaturedToggle) refs.roomPanelFeaturedToggle.disabled = !hasRoom;
    if (refs.roomPanelNameInput) refs.roomPanelNameInput.disabled = !hasRoom;
    if (refs.roomPanelPaintTimeInput) refs.roomPanelPaintTimeInput.disabled = !hasRoom;
    if (refs.roomPanelPaintTouchModeSelect) refs.roomPanelPaintTouchModeSelect.disabled = !hasRoom;
    if (refs.roomPanelPaintAllowGunToggle) refs.roomPanelPaintAllowGunToggle.disabled = !hasRoom;
    if (refs.roomPanelPaintAllowRoofAutoToggle) refs.roomPanelPaintAllowRoofAutoToggle.disabled = !hasRoom;
    if (refs.roomHomeBaseNameInput) refs.roomHomeBaseNameInput.disabled = !hasRoom;
    if (refs.roomHomeBaseDescInput) refs.roomHomeBaseDescInput.disabled = !hasRoom;
    if (refs.roomArtifactTypeSelect) refs.roomArtifactTypeSelect.disabled = !hasRoom;
    if (refs.roomArtifactTitleInput) refs.roomArtifactTitleInput.disabled = !hasRoom;
    if (refs.roomArtifactTextInput) refs.roomArtifactTextInput.disabled = !hasRoom;
    const signedIn = !!state.authUser;
    if (refs.titleAddFriendBtn) refs.titleAddFriendBtn.disabled = !signedIn;
    if (refs.titleFriendUidInput) refs.titleFriendUidInput.disabled = !signedIn;
    if (refs.titleFriendNameInput) refs.titleFriendNameInput.disabled = !signedIn;
  }

  function renderRoomMeta() {
    const room = state.currentRoom;
    if (!room) {
      if (refs.roomPanelRoomCode) refs.roomPanelRoomCode.textContent = 'Not in a room';
      if (refs.roomPanelRoomName) refs.roomPanelRoomName.textContent = 'Create or join to start multiplayer.';
      if (refs.roomPanelNameInput) refs.roomPanelNameInput.value = '';
      if (refs.roomPanelFeaturedToggle) refs.roomPanelFeaturedToggle.checked = false;
      applyPaintRulesToPanel(null);
      return;
    }

    if (refs.roomPanelRoomCode) refs.roomPanelRoomCode.textContent = `Room ${room.code}`;
    if (refs.roomPanelRoomName) {
      const worldName = sanitizeText(room.world?.kind || 'earth', 16).toUpperCase();
      const roomName = room.name ? sanitizeText(room.name, 80) : `${worldName} Session`;
      const locationLabel = sanitizeText(room.locationTag?.label || room.locationTag?.city || '', 80);
      refs.roomPanelRoomName.textContent = locationLabel
        ? `${roomName} (${room.visibility || 'private'}) • ${locationLabel}`
        : `${roomName} (${room.visibility || 'private'})`;
    }
    if (refs.roomPanelNameInput && document.activeElement !== refs.roomPanelNameInput) {
      refs.roomPanelNameInput.value = sanitizeText(room.name || '', 80);
    }
    if (refs.roomPanelFeaturedToggle) {
      refs.roomPanelFeaturedToggle.checked = room.visibility === 'public' && room.featured === true;
    }
    applyPaintRulesToPanel(room);
  }

  function renderPlayerList() {
    if (!refs.roomPanelPlayerList) return;

    if (!state.currentRoom) {
      refs.roomPanelPlayerList.innerHTML = '<li class="mpPlayerEmpty">No active room.</li>';
      if (refs.roomPanelPlayerCount) refs.roomPanelPlayerCount.textContent = '0';
      return;
    }

    if (!state.players.length) {
      refs.roomPanelPlayerList.innerHTML = '<li class="mpPlayerEmpty">Waiting for players...</li>';
      if (refs.roomPanelPlayerCount) refs.roomPanelPlayerCount.textContent = '0';
      return;
    }

    refs.roomPanelPlayerList.innerHTML = state.players.map((player) => {
      const role = safeHtml(player.role || 'member', 16);
      const displayName = safeHtml(player.displayName || 'Explorer', 48);
      const mode = safeHtml(player.mode || 'drive', 16);
      const selfTag = player.uid === state.authUser?.uid ? ' (You)' : '';
      return `<li class="mpPlayerItem"><span class="mpPlayerName">${displayName}${selfTag}</span><span class="mpPlayerMeta">${role} • ${mode}</span></li>`;
    }).join('');

    if (refs.roomPanelPlayerCount) refs.roomPanelPlayerCount.textContent = String(state.players.length);
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

    refs.chatMessages.innerHTML = state.messages.map((msg) => {
      const userName = safeHtml(msg.displayName || 'Explorer', 48);
      const text = safeHtml(msg.text || '', CHAT_MAX_LENGTH);
      const mine = msg.uid && state.authUser && msg.uid === state.authUser.uid;
      const klass = mine ? 'mpChatRow mine' : 'mpChatRow';
      const reportBtn = mine ? '' : `<button class="mpChatReport" data-msgid="${escapeHtml(String(msg.id || ''))}" type="button">Report</button>`;
      return `<div class="${klass}"><div class="mpChatHead"><span>${userName}</span>${reportBtn}</div><div class="mpChatText">${text}</div></div>`;
    }).join('');

    refs.chatMessages.scrollTop = refs.chatMessages.scrollHeight;
  }

  function setChatOpen(open) {
    state.chatOpen = !!open;
    if (refs.chatDrawer) refs.chatDrawer.classList.toggle('open', state.chatOpen);
    updateToggleStates();
  }

  function clearSubscriptions() {
    if (typeof state.unsubRoom === 'function') state.unsubRoom();
    if (typeof state.unsubPlayers === 'function') state.unsubPlayers();
    if (typeof state.unsubChat === 'function') state.unsubChat();
    if (typeof state.unsubArtifacts === 'function') state.unsubArtifacts();
    if (typeof state.unsubSharedBlocks === 'function') state.unsubSharedBlocks();
    if (typeof state.unsubHomeBase === 'function') state.unsubHomeBase();
    if (typeof state.unsubPaintClaims === 'function') state.unsubPaintClaims();
    state.unsubRoom = null;
    state.unsubPlayers = null;
    state.unsubChat = null;
    state.unsubArtifacts = null;
    state.unsubSharedBlocks = null;
    state.unsubHomeBase = null;
    state.unsubPaintClaims = null;
  }

  function clearGlobalSubscriptions() {
    if (typeof state.unsubFriends === 'function') state.unsubFriends();
    if (typeof state.unsubRecentPlayers === 'function') state.unsubRecentPlayers();
    if (typeof state.unsubInvites === 'function') state.unsubInvites();
    if (typeof state.unsubOwnedRooms === 'function') state.unsubOwnedRooms();
    if (typeof state.unsubLeaderboard === 'function') state.unsubLeaderboard();
    state.unsubFriends = null;
    state.unsubRecentPlayers = null;
    state.unsubInvites = null;
    state.unsubOwnedRooms = null;
    state.unsubLeaderboard = null;
  }

  async function deactivateRoom(localOnly = false) {
    clearSubscriptions();
    if (typeof appCtx.configureSharedBuildSync === 'function') {
      appCtx.configureSharedBuildSync({ enabled: false });
    }
    if (typeof appCtx.setSharedBuildEntries === 'function') {
      appCtx.setSharedBuildEntries([]);
    }
    await stopPresence();
    if (!localOnly) {
      await leaveRoom();
    }

    state.currentRoom = null;
    state.activeRoomWorldSignature = '';
    state.players = [];
    state.messages = [];
    state.artifacts = [];
    state.homeBase = null;
    if (typeof appCtx.clearPaintTownMultiplayerConfig === 'function') {
      appCtx.clearPaintTownMultiplayerConfig();
    }
    if (Object.prototype.hasOwnProperty.call(appCtx, 'publishPaintTownClaim')) {
      delete appCtx.publishPaintTownClaim;
    }
    if (state.ghostManager) state.ghostManager.clear();
    setChatOpen(false);
    renderRoomMeta();
    renderPlayerList();
    renderChat();
    renderArtifacts();
    renderHomeBase();
    updateToggleStates();
  }

  function ensureGhostManager() {
    if (state.ghostManager) return;
    if (!state.currentRoom) return;
    if (!appCtx.scene) return;

    state.ghostManager = createGhostManager(appCtx.scene, {
      getSelfUid: () => state.authUser?.uid || state.entitlement.uid || ''
    });
    state.ghostManager.setVisible(state.ghostsEnabled);
  }

  function ensureGhostTicker() {
    if (state.ghostRenderTimer) return;
    state.ghostRenderTimer = window.setInterval(() => {
      if (!state.currentRoom) return;
      ensureGhostManager();
      if (state.ghostManager) {
        state.ghostManager.setVisible(state.ghostsEnabled);
        state.ghostManager.tick(performance.now());
      }
    }, 33);
  }

  async function ensureAccessOrWarn(actionLabel = 'this action') {
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
        console.warn('[multiplayer][ui] entitlement refresh failed:', err);
      }
    }
    if (!canUseMultiplayer(state.entitlement)) {
      const plan = String(state.entitlement?.plan || 'free');
      const subStatus = String(state.entitlement?.subscriptionStatus || 'none');
      const admin = state.entitlement?.isAdmin === true ? 'yes' : 'no';
      setStatus(`Multiplayer is locked on Free. Start your 2-day trial or upgrade to Supporter/Pro. (plan=${plan}, subStatus=${subStatus}, admin=${admin})`, true);
      return false;
    }
    return true;
  }

  async function refreshFeaturedRooms(silent = false) {
    if (!state.authUser) {
      state.featuredRooms = [];
      renderFeaturedRooms();
      return;
    }
    try {
      const rooms = await findFeaturedPublicRooms({ resultLimit: 10 });
      state.featuredRooms = rooms;
      renderFeaturedRooms();
      if (!silent) {
        setStatus(rooms.length ? `Loaded ${rooms.length} featured room${rooms.length === 1 ? '' : 's'}.` : 'No featured rooms yet.');
      }
    } catch (err) {
      console.warn('[multiplayer][ui] refresh featured rooms failed:', err);
      if (!silent) setStatus(err?.message || 'Could not load featured rooms.', true);
    }
  }

  function ensureGlobalSubscriptions() {
    if (!state.authUser) {
      clearGlobalSubscriptions();
      state.friends = [];
      state.recentPlayers = [];
      state.invites = [];
      state.ownedRooms = [];
      state.leaderboard = [];
      renderFriends();
      renderRecentPlayers();
      renderInvites();
      renderOwnedRooms();
      renderLeaderboard();
      renderFeaturedRooms();
      return;
    }

    if (!state.unsubFriends) {
      state.unsubFriends = listenFriends((rows) => {
        state.friends = rows;
        renderFriends();
      });
    }
    if (!state.unsubRecentPlayers) {
      state.unsubRecentPlayers = listenRecentPlayers((rows) => {
        state.recentPlayers = rows;
        renderRecentPlayers();
      });
    }
    if (!state.unsubInvites) {
      state.unsubInvites = listenIncomingInvites((rows) => {
        state.invites = rows;
        renderInvites();
      });
    }
    if (!state.unsubOwnedRooms) {
      state.unsubOwnedRooms = listenMyRooms((rows) => {
        state.ownedRooms = rows;
        renderOwnedRooms();
      });
    }
    if (!state.unsubLeaderboard) {
      state.unsubLeaderboard = listenExplorerLeaderboard((rows) => {
        state.leaderboard = rows;
        renderLeaderboard();
      });
    }
  }

  function currentRoomName() {
    if (!state.currentRoom) return '';
    return sanitizeText(
      state.currentRoom.name ||
      state.currentRoom.locationTag?.label ||
      `${sanitizeText(state.currentRoom.world?.kind || 'earth', 16).toUpperCase()} Session`,
      80
    );
  }

  async function handleSaveRoomSettings() {
    if (!state.currentRoom) {
      setStatus('Join a room first.', true);
      return;
    }
    try {
      const nextName = sanitizeText(refs.roomPanelNameInput?.value || state.currentRoom.name || '', 80);
      const featured = !!refs.roomPanelFeaturedToggle?.checked;
      const nextVisibility = featured ? 'public' : normalizeVisibilitySelection(readVisibilitySelection());
      const nextLocationTag = sanitizeText(readLocationTagInput() || state.currentRoom.locationTag?.label || '', 80);
      const paintRules = readPaintRulesFromPanel();

      const updated = await updateRoomSettings(state.currentRoom.code, {
        name: nextName,
        featured,
        visibility: nextVisibility,
        locationTag: nextLocationTag ? { label: nextLocationTag, city: nextLocationTag, kind: state.currentRoom.world?.kind || 'earth' } : null,
        rules: paintRules
      });

      if (updated) {
        state.currentRoom = updated;
        applyRoomPaintMultiplayerConfig(updated);
        renderRoomMeta();
        setStatus('Room settings updated.');
      }
      await refreshFeaturedRooms(true);
    } catch (err) {
      setStatus(err?.message || 'Could not update room settings.', true);
    }
  }

  async function handleSaveHomeBase() {
    if (!state.currentRoom) {
      setStatus('Join a room first.', true);
      return;
    }
    const homeBaseName = sanitizeText(refs.roomHomeBaseNameInput?.value || '', 80);
    if (!homeBaseName) {
      setStatus('Home base name is required.', true);
      return;
    }

    try {
      const pose = readPoseSnapshot();
      await setHomeBase(state.currentRoom.code, {
        name: homeBaseName,
        description: sanitizeText(refs.roomHomeBaseDescInput?.value || '', 240),
        anchor: {
          kind: pose.frame.kind,
          lat: finiteNumber(pose.frame.locLat, 0),
          lon: finiteNumber(pose.frame.locLon, 0),
          x: finiteNumber(pose.pose.x, 0),
          y: finiteNumber(pose.pose.y, 0),
          z: finiteNumber(pose.pose.z, 0)
        }
      });
      setStatus('Home base saved.');
    } catch (err) {
      setStatus(err?.message || 'Could not save home base.', true);
    }
  }

  async function handleCreateArtifact() {
    if (!state.currentRoom) {
      setStatus('Join a room first.', true);
      return;
    }
    const title = sanitizeText(refs.roomArtifactTitleInput?.value || '', 80);
    if (!title) {
      setStatus('Artifact title is required.', true);
      return;
    }
    try {
      const pose = readPoseSnapshot();
      const type = sanitizeText(refs.roomArtifactTypeSelect?.value || 'pin', 20);
      const text = sanitizeText(refs.roomArtifactTextInput?.value || '', 280);
      await createArtifact(state.currentRoom.code, {
        type,
        title,
        text,
        visibility: state.currentRoom.visibility === 'public' ? 'public' : 'room',
        anchor: {
          kind: pose.frame.kind,
          lat: finiteNumber(pose.frame.locLat, 0),
          lon: finiteNumber(pose.frame.locLon, 0),
          x: finiteNumber(pose.pose.x, 0),
          y: finiteNumber(pose.pose.y, 0),
          z: finiteNumber(pose.pose.z, 0)
        }
      });

      if (refs.roomArtifactTitleInput) refs.roomArtifactTitleInput.value = '';
      if (refs.roomArtifactTextInput) refs.roomArtifactTextInput.value = '';

      await bumpExplorerLeaderboard({ artifactsShared: 1 });
      setStatus('Artifact saved.');
    } catch (err) {
      setStatus(err?.message || 'Could not save artifact.', true);
    }
  }

  async function handleRemoveArtifact(artifactId) {
    if (!state.currentRoom) return;
    try {
      await removeArtifact(state.currentRoom.code, artifactId);
      setStatus('Artifact removed.');
    } catch (err) {
      setStatus(err?.message || 'Could not remove artifact.', true);
    }
  }

  async function handleAddFriend(friendUid, displayName, source = 'manual') {
    if (!state.authUser) {
      setStatus('Sign in to add friends.', true);
      return;
    }
    try {
      const safeSource = source === 'recent' ? 'recent' : 'manual';
      await addFriend(friendUid, displayName, safeSource);
      await bumpExplorerLeaderboard({ friendsAdded: 1 });
      if (refs.titleFriendsStatus) refs.titleFriendsStatus.textContent = 'Friend added successfully.';
      setStatus('Friend added.');
    } catch (err) {
      setStatus(err?.message || 'Could not add friend.', true);
    }
  }

  async function handleManualAddFriend() {
    if (!state.authUser) {
      setStatus('Sign in to add friends.', true);
      return;
    }
    const friendUid = sanitizeText(refs.titleFriendUidInput?.value || '', 128);
    if (!friendUid) {
      setStatus('Enter a friend UID to add them.', true);
      return;
    }
    const displayName = sanitizeText(refs.titleFriendNameInput?.value || '', 48) || 'Explorer';
    await handleAddFriend(friendUid, displayName, 'manual');
    if (refs.titleFriendUidInput) refs.titleFriendUidInput.value = '';
    if (refs.titleFriendNameInput) refs.titleFriendNameInput.value = '';
  }

  async function handleInviteFriend(friendUid) {
    if (!state.currentRoom) {
      setStatus('Join a room first before inviting friends.', true);
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
      setStatus('Invite sent and link copied.');
    } catch (err) {
      setStatus(err?.message || 'Could not send invite.', true);
    }
  }

  async function handleDeleteOwnedRoom(roomCode) {
    if (!state.authUser) {
      setStatus('Sign in to delete rooms you created.', true);
      return;
    }

    const normalizedCode = normalizeCode(roomCode);
    if (!normalizedCode) {
      setStatus('Invalid room code.', true);
      return;
    }

    const roomRecord = state.ownedRooms.find((room) => normalizeCode(room.code || room.id || '') === normalizedCode) || null;
    const label = sanitizeText(roomRecord?.name || normalizedCode, 80);
    const confirmed = window.confirm(`Delete room "${label}" (${normalizedCode})? This cannot be undone.`);
    if (!confirmed) return;

    try {
      if (state.currentRoom && normalizeCode(state.currentRoom.code || state.currentRoom.id || '') === normalizedCode) {
        await deactivateRoom(false);
      }

      await deleteOwnedRoom(normalizedCode);

      const url = new URL(window.location.href);
      if (normalizeCode(url.searchParams.get('room')) === normalizedCode) {
        url.searchParams.delete('room');
        url.searchParams.delete('invite');
        window.history.replaceState({}, '', url.toString());
      }

      state.browseRooms = state.browseRooms.filter((room) => normalizeCode(room.code || room.id || '') !== normalizedCode);
      state.featuredRooms = state.featuredRooms.filter((room) => normalizeCode(room.code || room.id || '') !== normalizedCode);
      renderBrowseRooms();
      renderFeaturedRooms();
      setStatus(`Deleted room ${normalizedCode}.`);
    } catch (err) {
      setStatus(err?.message || 'Could not delete room.', true);
    }
  }

  async function handleOpenOwnedRoom(roomCode) {
    if (!state.authUser) {
      setStatus('Sign in to open saved rooms.', true);
      return;
    }
    const normalizedCode = normalizeCode(roomCode);
    if (!normalizedCode) {
      setStatus('Invalid saved room code.', true);
      return;
    }

    const activeCode = normalizeCode(state.currentRoom?.code || state.currentRoom?.id || '');
    if (activeCode && activeCode === normalizedCode) {
      setInputCode(refs, normalizedCode);
      setStatus(`Already in room ${normalizedCode}.`);
      return;
    }

    setInputCode(refs, normalizedCode);
    setStatus(`Opening room ${normalizedCode}...`);
    await handleJoinRoom(normalizedCode);
  }

  async function activateRoom(room, originLabel = 'room') {
    if (!room || !room.id) {
      await deactivateRoom(true);
      return;
    }

    clearSubscriptions();
    state.currentRoom = room;
    upsertOwnedRoomLocal(room);
    if (typeof appCtx.configureSharedBuildSync === 'function') {
      appCtx.configureSharedBuildSync({
        enabled: true,
        roomId: room.id,
        upsert: (entry) => upsertSharedBlock(room.id, entry),
        remove: (entry) => removeSharedBlock(room.id, entry),
        clearMine: () => clearMySharedBlocks(room.id)
      });
    }
    state.artifacts = [];
    state.homeBase = null;
    applyRoomPaintMultiplayerConfig(room);
    installPaintClaimPublisher();
    setInputCode(refs, room.code);
    if (refs.titleVisibilitySelect) refs.titleVisibilitySelect.value = normalizeVisibilitySelection(room.visibility);
    if (refs.roomPanelVisibilitySelect) refs.roomPanelVisibilitySelect.value = normalizeVisibilitySelection(room.visibility);
    const roomName = sanitizeText(room.name || '', 80);
    if (roomName) {
      if (refs.titleRoomNameInput) refs.titleRoomNameInput.value = roomName;
      if (refs.roomPanelCreateNameInput) refs.roomPanelCreateNameInput.value = roomName;
    }
    const locationLabel = sanitizeText(room.locationTag?.label || '', 80);
    if (locationLabel) {
      if (refs.titleLocationTagInput) refs.titleLocationTagInput.value = locationLabel;
      if (refs.roomPanelLocationTagInput) refs.roomPanelLocationTagInput.value = locationLabel;
    }

    renderRoomMeta();
    renderPlayerList();
    renderChat();
    renderArtifacts();
    renderHomeBase();
    updateToggleStates();

    state.unsubRoom = listenRoom(room.id, async (nextRoom) => {
      if (!nextRoom) {
        setStatus('Room was closed or became unavailable.', true);
        await deactivateRoom(true);
        return;
      }
      state.currentRoom = nextRoom;
      applyRoomPaintMultiplayerConfig(nextRoom);
      await syncRoomWorldContext(nextRoom, false);
      renderRoomMeta();
      updateToggleStates();
    });

    state.unsubPlayers = listenPlayers(room.id, (players) => {
      state.players = players;
      renderPlayerList();
      recordRecentPlayers(room.code, currentRoomName(), players).catch((err) => {
        console.warn('[multiplayer][ui] recent players update failed:', err);
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

    state.unsubSharedBlocks = listenSharedBlocks(room.id, (blocks) => {
      if (typeof appCtx.setSharedBuildEntries === 'function') {
        appCtx.setSharedBuildEntries(Array.isArray(blocks) ? blocks : []);
      }
    });

    state.unsubHomeBase = listenHomeBase(room.id, (homeBase) => {
      state.homeBase = homeBase;
      renderHomeBase();
    });

    state.unsubPaintClaims = listenPaintClaims(room.id, (claims) => {
      if (typeof appCtx.applyPaintTownRemoteClaimsFromSync === 'function') {
        appCtx.applyPaintTownRemoteClaimsFromSync({
          roomId: room.id,
          claims: Array.isArray(claims) ? claims : []
        });
      }
    });

    startPresence(room.id, readPoseSnapshot);
    await syncRoomWorldContext(room, false);

    const invite = buildInviteLink(room.code);
    if (invite) {
      const url = new URL(window.location.href);
      url.searchParams.set('room', room.code);
      window.history.replaceState({}, '', url.toString());
    }

    setStatus(`Connected to ${originLabel}: ${room.code} (seed ${deriveRoomDeterministicSeed(room)}).`);
  }

  async function handleCreateRoom() {
    if (!(await ensureAccessOrWarn('creating a room'))) return;

    try {
      const world = readWorldContext();
      const roomName = sanitizeText(readRoomNameInput(), 80);
      const visibility = readVisibilitySelection();
      const locationTagText = sanitizeText(readLocationTagInput(), 80);
      const paintRules = readPaintRulesFromPanel();
      const effectiveLocationTag = visibility === 'public'
        ? (locationTagText || world.name)
        : locationTagText;
      const createPayload = {
        name: roomName || `${world.name} Session`,
        visibility,
        featured: false,
        maxPlayers: 12,
        world,
        rules: paintRules,
        locationName: roomName || world.name,
        locationTag: effectiveLocationTag ? { label: effectiveLocationTag, city: effectiveLocationTag, kind: world.kind } : null
      };
      const trialPlan = String(state.entitlement?.plan || '').toLowerCase() === 'trial';
      let room = null;

      try {
        room = await createRoom(createPayload);
      } catch (err) {
        const errCode = String(err?.code || '').toLowerCase();
        const errMessage = String(err?.message || '').toLowerCase();
        const permissionDenied = errCode.includes('permission') ||
          errMessage.includes('permission-denied') ||
          errMessage.includes('missing or insufficient permissions') ||
          errMessage.includes('insufficient permissions');

        if (trialPlan && permissionDenied && state.authUser) {
          setStatus('Trial access is syncing. Retrying room create...');
          const next = await startTrialIfEligible(state.authUser);
          state.entitlement = {
            ...state.entitlement,
            ...next
          };
          applyEntitlementCopy();
          room = await createRoom(createPayload);
        } else {
          throw err;
        }
      }

      await activateRoom(room, 'created room');
      await bumpExplorerLeaderboard({ roomsJoined: 1 });
      await refreshFeaturedRooms(true);
      const inviteLink = buildInviteLink(room.code);
      if (inviteLink) {
        await copyText(inviteLink);
        const named = room.name ? `${room.name} (${room.code})` : room.code;
        setStatus(`${visibility === 'public' ? 'Public' : 'Private'} room ${named} created. Invite link copied.`);
      }
    } catch (err) {
      console.error('[multiplayer][ui] create room failed:', err);
      setStatus(err?.message || 'Could not create room.', true);
    }
  }

  async function ensureInviteJoinAccess() {
    if (canUseMultiplayer(state.entitlement)) return true;
    if (!state.authUser) {
      setStatus('Sign in to accept invites.', true);
      return false;
    }

    try {
      setStatus('Starting your 2-day trial so you can join this invite...');
      const next = await startTrialIfEligible(state.authUser);
      state.entitlement = {
        ...state.entitlement,
        ...next
      };
      applyEntitlementCopy();
      return canUseMultiplayer(state.entitlement);
    } catch (err) {
      setStatus(err?.message || 'Invite requires trial or paid plan.', true);
      return false;
    }
  }

  async function handleBrowseRooms() {
    if (!state.authUser) {
      setBrowseStatus('Sign in to browse public rooms.', true);
      state.browseRooms = [];
      renderBrowseRooms();
      return;
    }

    const cityInput = sanitizeText(refs.titleBrowseCityInput?.value || '', 48);
    const cityKey = normalizeCityKey(cityInput);
    if (!cityKey) {
      setBrowseStatus('Enter a city name to browse public rooms.', true);
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
      setBrowseStatus(`Found ${rooms.length} public room${rooms.length === 1 ? '' : 's'} near ${cityInput}.`);
    } catch (err) {
      console.error('[multiplayer][ui] browse rooms failed:', err);
      setBrowseStatus(err?.message || 'Could not browse public rooms right now.', true);
    }
  }

  async function handleJoinRoom(codeOverride = '') {
    if (!(await ensureAccessOrWarn('joining a room'))) return;

    const code = normalizeCode(codeOverride || pullCodeFromInputs(refs));
    if (!code) {
      setStatus('Enter a valid room code before joining.', true);
      return;
    }

    try {
      const room = await joinRoomByCode(code);
      await activateRoom(room, 'joined room');
      await bumpExplorerLeaderboard({ roomsJoined: 1 });
      await refreshFeaturedRooms(true);
      setStatus(`Joined room ${room.code}.`);
      closeRoomPanel();
    } catch (err) {
      console.error('[multiplayer][ui] join failed:', err);
      setStatus(err?.message || 'Could not join that room.', true);
    }
  }

  async function handleLeaveRoom() {
    if (!state.currentRoom) {
      setStatus('You are not in a room.');
      return;
    }

    try {
      const prevCode = state.currentRoom.code;
      await deactivateRoom(false);
      const url = new URL(window.location.href);
      url.searchParams.delete('room');
      window.history.replaceState({}, '', url.toString());
      setStatus(`Left room ${prevCode}.`);
    } catch (err) {
      console.error('[multiplayer][ui] leave failed:', err);
      setStatus(err?.message || 'Could not leave room cleanly.', true);
    }
  }

  async function handleCopyInvite() {
    if (!state.currentRoom || !state.currentRoom.code) {
      setStatus('Join or create a room first to share an invite.', true);
      return;
    }

    const link = buildInviteLink(state.currentRoom.code);
    if (!link) {
      setStatus('Unable to build invite link.', true);
      return;
    }

    try {
      await copyText(link);
      setStatus('Invite link copied.');
    } catch (err) {
      setStatus(err?.message || 'Could not copy invite link.', true);
    }
  }

  async function handleSendChat() {
    if (!state.currentRoom) {
      setChatStatus('Join a room first.', true);
      return;
    }

    const text = refs.chatInput ? refs.chatInput.value : '';
    try {
      const result = await sendMessage(state.currentRoom.code, text);
      if (refs.chatInput) refs.chatInput.value = '';
      setChatStatus(result.wasFiltered ? 'Message sent (profanity filter applied).' : 'Message sent.');
    } catch (err) {
      setChatStatus(err?.message || 'Could not send message.', true);
    }
  }

  async function attemptPendingRoomJoin() {
    if (state.pendingRoomPrompted || !state.pendingRoomCode || state.pendingRoomInFlight) return;
    if (!state.authUser) return;

    const inviteCode = normalizeCode(state.pendingRoomCode);
    if (!inviteCode) return;

    state.pendingRoomInFlight = true;
    try {
      if (canUseMultiplayer(state.entitlement)) {
        state.pendingRoomPrompted = true;
        setStatus(`Invite accepted. Joining room ${inviteCode}...`);
        setInputCode(refs, inviteCode);
        await handleJoinRoom(inviteCode);
        return;
      }

      const shouldStartTrial = window.confirm(
        `Invite to room ${inviteCode}. Multiplayer is locked on Free.\n\nStart your 2-day trial now to join?`
      );
      state.pendingRoomPrompted = true;
      if (!shouldStartTrial) {
        setStatus('Invite requires trial or paid plan. Start your trial to continue.', true);
        return;
      }

      setStatus('Starting your 2-day trial from invite...');
      const next = await startTrialIfEligible(state.authUser);
      state.entitlement = {
        ...state.entitlement,
        ...next
      };
      applyEntitlementCopy();

      if (!canUseMultiplayer(state.entitlement)) {
        setStatus('Trial start did not unlock multiplayer yet. Refresh and try again.', true);
        return;
      }

      setInputCode(refs, inviteCode);
      await handleJoinRoom(inviteCode);
    } catch (err) {
      setStatus(err?.message || 'Could not complete invite flow.', true);
    } finally {
      state.pendingRoomInFlight = false;
    }
  }

  function applyEntitlementCopy() {
    refreshPlanLabel();

    const allowed = canUseMultiplayer(state.entitlement);
    if (!state.authUser) {
      if (state.pendingRoomCode) {
        setStatus(`Invite detected for room ${state.pendingRoomCode}. Sign in to continue.`);
      } else {
        setStatus('Sign in to create or join multiplayer rooms.');
      }
      setBrowseStatus('Sign in to browse public rooms.');
      if (refs.titleFriendsStatus) refs.titleFriendsStatus.textContent = 'Sign in to build your social graph.';
      return;
    }

    if (!allowed) {
      setStatus('Free plan cannot access multiplayer. Start trial or upgrade to Supporter/Pro.', true);
      setBrowseStatus('Browsing public rooms is available. Joining requires trial or paid plan.');
      return;
    }

    if (state.currentRoom) {
      setStatus(`Multiplayer active in room ${state.currentRoom.code}.`);
    } else {
      setStatus('Multiplayer unlocked. Create or join a room.');
    }

    if (!state.browseRooms.length) {
      setBrowseStatus('Browse public rooms by city tag. This list does not stream live presence.');
    }
  }

  function activateMultiplayerTabFromQuery() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') !== 'multiplayer') return;

    const targetBtn = document.querySelector('.tab-btn[data-tab="multiplayer"]');
    if (targetBtn instanceof HTMLElement) targetBtn.click();
  }

  function wireEvents() {
    refs.titleCreateBtn?.addEventListener('click', handleCreateRoom);
    refs.roomPanelCreateBtn?.addEventListener('click', handleCreateRoom);

    refs.titleVisibilitySelect?.addEventListener('change', () => syncCreateOptionFields('title'));
    refs.roomPanelVisibilitySelect?.addEventListener('change', () => syncCreateOptionFields('panel'));
    refs.titleRoomNameInput?.addEventListener('input', () => syncCreateOptionFields('title'));
    refs.roomPanelCreateNameInput?.addEventListener('input', () => syncCreateOptionFields('panel'));
    refs.titleLocationTagInput?.addEventListener('input', () => syncCreateOptionFields('title'));
    refs.roomPanelLocationTagInput?.addEventListener('input', () => syncCreateOptionFields('panel'));

    refs.titleJoinBtn?.addEventListener('click', () => handleJoinRoom());
    refs.roomPanelJoinBtn?.addEventListener('click', () => handleJoinRoom());

    refs.titleInviteBtn?.addEventListener('click', handleCopyInvite);
    refs.roomPanelInviteBtn?.addEventListener('click', handleCopyInvite);

    refs.titleLeaveBtn?.addEventListener('click', handleLeaveRoom);
    refs.roomPanelLeaveBtn?.addEventListener('click', handleLeaveRoom);

    refs.titlePanelBtn?.addEventListener('click', openRoomPanel);
    refs.roomPanelCloseBtn?.addEventListener('click', closeRoomPanel);

    refs.roomPanelModal?.addEventListener('click', (event) => {
      if (event.target === refs.roomPanelModal) closeRoomPanel();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeRoomPanel();
    });

    refs.floatCreate?.addEventListener('click', () => {
      handleCreateRoom();
      document.querySelectorAll('.floatMenu').forEach((menu) => menu.classList.remove('open'));
    });

    refs.floatJoin?.addEventListener('click', () => {
      openRoomPanel();
      refs.roomPanelCodeInput?.focus();
      document.querySelectorAll('.floatMenu').forEach((menu) => menu.classList.remove('open'));
    });

    refs.floatInvite?.addEventListener('click', () => {
      handleCopyInvite();
      document.querySelectorAll('.floatMenu').forEach((menu) => menu.classList.remove('open'));
    });

    refs.floatLeave?.addEventListener('click', () => {
      handleLeaveRoom();
      document.querySelectorAll('.floatMenu').forEach((menu) => menu.classList.remove('open'));
    });

    refs.floatGhosts?.addEventListener('click', () => {
      if (!state.currentRoom) {
        setStatus('Join a room before toggling ghosts.', true);
        return;
      }
      state.ghostsEnabled = !state.ghostsEnabled;
      if (state.ghostManager) state.ghostManager.setVisible(state.ghostsEnabled);
      updateToggleStates();
      document.querySelectorAll('.floatMenu').forEach((menu) => menu.classList.remove('open'));
    });

    refs.floatChat?.addEventListener('click', () => {
      if (!state.currentRoom) {
        setStatus('Join a room before opening chat.', true);
        return;
      }
      setChatOpen(!state.chatOpen);
      document.querySelectorAll('.floatMenu').forEach((menu) => menu.classList.remove('open'));
    });

    refs.chatToggleBtn?.addEventListener('click', () => {
      if (!state.currentRoom) {
        setStatus('Join a room before opening chat.', true);
        return;
      }
      setChatOpen(!state.chatOpen);
    });

    refs.chatCloseBtn?.addEventListener('click', () => setChatOpen(false));
    refs.chatSendBtn?.addEventListener('click', handleSendChat);
    refs.chatInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSendChat();
      }
    });

    refs.chatMessages?.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest('button[data-msgid]');
      if (!button || !state.currentRoom) return;

      const msgId = sanitizeText(button.dataset.msgid || '', 128);
      if (!msgId) return;

      try {
        await reportMessage(state.currentRoom.code, msgId, 'User report');
        setChatStatus('Message reported.');
      } catch (err) {
        setChatStatus(err?.message || 'Could not report this message.', true);
      }
    });

    refs.titleCodeInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleJoinRoom();
      }
    });

    refs.roomPanelCodeInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleJoinRoom();
      }
    });

    const openTrialOrBilling = () => {
      if (!state.authUser) {
        const signInBtn = document.getElementById('appSignInBtn');
        if (signInBtn) signInBtn.click();
        setStatus('Sign in first, then start your trial from the app or landing page.');
        return;
      }
      window.location.assign('../?startTrial=1');
    };

    refs.titleTrialBtn?.addEventListener('click', openTrialOrBilling);
    refs.roomPanelTrialBtn?.addEventListener('click', openTrialOrBilling);

    refs.titleBrowseBtn?.addEventListener('click', handleBrowseRooms);
    refs.titleFeaturedRefreshBtn?.addEventListener('click', () => refreshFeaturedRooms(false));
    refs.titleAddFriendBtn?.addEventListener('click', () => {
      handleManualAddFriend();
    });
    refs.roomPanelSaveSettingsBtn?.addEventListener('click', handleSaveRoomSettings);
    refs.roomHomeBaseSaveBtn?.addEventListener('click', handleSaveHomeBase);
    refs.roomArtifactCreateBtn?.addEventListener('click', handleCreateArtifact);
    refs.titleBrowseCityInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleBrowseRooms();
      }
    });
    refs.titleFriendUidInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleManualAddFriend();
      }
    });
    refs.titleFriendNameInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleManualAddFriend();
      }
    });
    refs.titleBrowseList?.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest('button[data-room-code]');
      if (!button) return;
      const code = normalizeCode(button.dataset.roomCode || '');
      if (!code) return;
      setInputCode(refs, code);
      handleJoinRoom(code);
    });

    refs.titleFeaturedList?.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest('button[data-room-code]');
      if (!button) return;
      const code = normalizeCode(button.dataset.roomCode || '');
      if (!code) return;
      setInputCode(refs, code);
      handleJoinRoom(code);
    });

    refs.titleFriendsList?.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const inviteBtn = target.closest('button[data-invite-friend]');
      if (inviteBtn instanceof HTMLElement) {
        const friendUid = sanitizeText(inviteBtn.dataset.inviteFriend || '', 80);
        if (friendUid) await handleInviteFriend(friendUid);
        return;
      }
      const removeBtn = target.closest('button[data-remove-friend]');
      if (removeBtn instanceof HTMLElement) {
        const friendUid = sanitizeText(removeBtn.dataset.removeFriend || '', 80);
        if (!friendUid) return;
        try {
          await removeFriend(friendUid);
          setStatus('Friend removed.');
        } catch (err) {
          setStatus(err?.message || 'Could not remove friend.', true);
        }
      }
    });

    refs.titleRecentPlayersList?.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const addBtn = target.closest('button[data-add-friend]');
      if (addBtn instanceof HTMLElement) {
        const friendUid = sanitizeText(addBtn.dataset.addFriend || '', 80);
        const playerName = sanitizeText(addBtn.dataset.playerName || 'Explorer', 48);
        if (friendUid) await handleAddFriend(friendUid, playerName, 'recent');
        return;
      }
      const joinBtn = target.closest('button[data-join-recent]');
      if (joinBtn instanceof HTMLElement) {
        const code = normalizeCode(joinBtn.dataset.joinRecent || '');
        if (code) {
          setInputCode(refs, code);
          await handleJoinRoom(code);
        }
      }
    });

    refs.titleInvitesList?.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const acceptBtn = target.closest('button[data-accept-invite]');
      if (acceptBtn instanceof HTMLElement) {
        const inviteId = sanitizeText(acceptBtn.dataset.acceptInvite || '', 128);
        const roomCode = normalizeCode(acceptBtn.dataset.roomCode || '');
        if (!inviteId || !roomCode) return;
        try {
          await markInviteSeen(inviteId, true);
          const canJoin = await ensureInviteJoinAccess();
          if (!canJoin) return;
          setInputCode(refs, roomCode);
          await handleJoinRoom(roomCode);
        } catch (err) {
          setStatus(err?.message || 'Could not accept invite.', true);
        }
        return;
      }
      const dismissBtn = target.closest('button[data-dismiss-invite]');
      if (dismissBtn instanceof HTMLElement) {
        const inviteId = sanitizeText(dismissBtn.dataset.dismissInvite || '', 128);
        if (!inviteId) return;
        try {
          await dismissInvite(inviteId);
          setStatus('Invite dismissed.');
        } catch (err) {
          setStatus(err?.message || 'Could not dismiss invite.', true);
        }
      }
    });

    refs.titleOwnedRoomsList?.addEventListener('click', async (event) => {
      const target = eventElementTarget(event);
      if (!target) return;

      const openBtn = target.closest('button[data-open-owned-room]');
      if (openBtn instanceof HTMLElement) {
        const roomCode = normalizeCode(openBtn.dataset.openOwnedRoom || '');
        if (!roomCode) return;
        await handleOpenOwnedRoom(roomCode);
        return;
      }

      const deleteBtn = target.closest('button[data-delete-owned-room]');
      if (deleteBtn instanceof HTMLElement) {
        const roomCode = normalizeCode(deleteBtn.dataset.deleteOwnedRoom || '');
        if (!roomCode) return;
        await handleDeleteOwnedRoom(roomCode);
        return;
      }

      const roomRow = target.closest('li[data-owned-room-code]');
      if (roomRow instanceof HTMLElement) {
        const roomCode = normalizeCode(roomRow.dataset.ownedRoomCode || '');
        if (!roomCode) return;
        await handleOpenOwnedRoom(roomCode);
      }
    });

    refs.titleOwnedRoomsList?.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = eventElementTarget(event);
      if (!target) return;
      const roomRow = target.closest('li[data-owned-room-code]');
      if (!(roomRow instanceof HTMLElement)) return;
      const roomCode = normalizeCode(roomRow.dataset.ownedRoomCode || '');
      if (!roomCode) return;
      event.preventDefault();
      await handleOpenOwnedRoom(roomCode);
    });

    refs.roomArtifactList?.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const removeBtn = target.closest('button[data-remove-artifact]');
      if (!removeBtn) return;
      const artifactId = sanitizeText(removeBtn.dataset.removeArtifact || '', 160);
      if (!artifactId) return;
      handleRemoveArtifact(artifactId);
    });

    window.addEventListener('we3d-entitlements-changed', (event) => {
      const detail = event?.detail || {};
      state.entitlement = {
        ...state.entitlement,
        ...readPlanState(),
        plan: String(detail.plan || state.entitlement.plan || 'free').toLowerCase(),
        planLabel: String(detail.planLabel || state.entitlement.planLabel || 'Free')
      };
      if (!canUseMultiplayer(state.entitlement) && state.currentRoom) {
        deactivateRoom(true);
      }
      applyEntitlementCopy();
      attemptPendingRoomJoin();
      updateToggleStates();
    });

    const titleScreen = document.getElementById('titleScreen');
    if (titleScreen) {
      const observer = new MutationObserver(() => {
        const visible = !titleScreen.classList.contains('hidden');
        if (visible) {
          closeRoomPanel();
          setChatOpen(false);
        }
      });
      observer.observe(titleScreen, { attributes: true, attributeFilter: ['class'] });
    }
  }

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
  }

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
  }

  singleton = {
    setAuthUser,
    openRoomPanel,
    closeRoomPanel,
    joinRoomByCode: (code) => handleJoinRoom(code),
    createRoom: handleCreateRoom,
    leaveRoom: handleLeaveRoom,
    getCurrentRoom: () => state.currentRoom
  };

  return singleton;
}

export { initMultiplayerPlatform };
