import { ctx as appCtx } from '../shared-context.js?v=55';
import { ensureEntitlements } from '../../../js/entitlements.js?v=71';
import { createArtifact, listenArtifacts, removeArtifact } from './artifacts.js?v=56';
import {
  clearMySharedBlocks,
  listenSharedBlocks,
  removeSharedBlock,
  upsertSharedBlock
} from './blocks.js?v=61';
import { CHAT_MAX_LENGTH, listenChat, reportMessage, sendMessage } from './chat.js?v=55';
import { createGhostManager } from './ghosts.js?v=57';
import {
  bumpExplorerLeaderboard,
  getWeeklyFeaturedCity,
  listenExplorerLeaderboard
} from './loop.js?v=55';
import { listenPlayers, startPresence, stopPresence } from './presence.js?v=60';
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
} from './rooms.js?v=66';
import {
  deleteRoomActivity,
  listenRoomActivities,
  listenRoomActivityState,
  saveRoomActivity,
  startRoomActivitySession,
  stopRoomActivitySession
} from './room-activities.js?v=1';
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
import { getCurrentUser } from '../../../js/auth-ui.js';
import { currentMapReferenceGeoPosition } from '../map-coordinates.js?v=2';

let singleton = null;
const MAX_PLAN_DISPLAY_NAME_LEN = 48;
const RELATIVE_MINUTE_MS = 60 * 1000;
const RELATIVE_HOUR_MS = 60 * RELATIVE_MINUTE_MS;
const RELATIVE_DAY_MS = 24 * RELATIVE_HOUR_MS;
const WEEKLY_CITY_ROTATION = Object.freeze([
  'Tokyo',
  'Paris',
  'Baltimore',
  'Monaco',
  'New York',
  'Miami',
  'London',
  'Dubai',
  'San Francisco',
  'Los Angeles',
  'Chicago',
  'Seattle',
  'Hollywood',
  'Nürburgring',
  'Las Vegas'
]);
const WEEKLY_ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BASE_ROOM_CAP_MOBILE = 8;
const BASE_ROOM_CAP_DESKTOP = 10;
const HIGH_END_ROOM_CAP_DESKTOP = 12;
const ROOM_CAP_MIN = 6;
const ROOM_CAP_MAX = 14;

function emitTutorialEvent(eventName, payload = {}) {
  if (typeof appCtx.tutorialOnEvent === 'function') {
    appCtx.tutorialOnEvent(eventName, payload);
  }
}

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

function hashStringToUint32(input) {
  const text = String(input || '');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function getWeeklyCitySelection(date = new Date()) {
  const weekly = getWeeklyFeaturedCity(date);
  const week = Math.max(1, Math.floor(Number(weekly?.week || 1)));
  const city = WEEKLY_CITY_ROTATION[week % WEEKLY_CITY_ROTATION.length] || WEEKLY_CITY_ROTATION[0];
  return {
    week,
    city,
    cityKey: normalizeCityKey(city),
    kind: 'earth'
  };
}

function buildWeeklyFeaturedRoomCode(selection) {
  const week = Math.max(1, Math.floor(Number(selection?.week || 1)));
  const cityKey = normalizeCityKey(selection?.cityKey || selection?.city || 'baltimore');
  const seed = hashStringToUint32(`weekly-room-v1:${week}:${cityKey}`);
  let value = seed || 1;
  let code = 'W';
  for (let i = 0; i < 5; i++) {
    code += WEEKLY_ROOM_ALPHABET[value % WEEKLY_ROOM_ALPHABET.length];
    value = Math.floor(value / WEEKLY_ROOM_ALPHABET.length);
    if (value <= 0) {
      value = ((seed >>> ((i + 1) * 3)) ^ (seed << ((i + 1) * 2))) >>> 0;
      if (!value) value = i + 7;
    }
  }
  return normalizeCode(code).slice(0, 6);
}

function formatRelativeTime(value) {
  const ms = toMillis(value);
  if (!Number.isFinite(ms)) return 'just now';
  const delta = Date.now() - ms;
  if (delta < RELATIVE_MINUTE_MS) return 'just now';
  if (delta < RELATIVE_HOUR_MS) return `${Math.max(1, Math.floor(delta / RELATIVE_MINUTE_MS))}m ago`;
  if (delta < RELATIVE_DAY_MS) return `${Math.max(1, Math.floor(delta / RELATIVE_HOUR_MS))}h ago`;
  return `${Math.max(1, Math.floor(delta / RELATIVE_DAY_MS))}d ago`;
}

function formatPlanLabel(plan, isAdmin, explicitLabel = '') {
  const label = String(explicitLabel || '').trim();
  if (label) return label;
  if (isAdmin) return 'Admin';
  if (!plan) return 'Free';
  return plan[0].toUpperCase() + plan.slice(1);
}

function readPlanState() {
  const globalState = globalThis.__WE3D_ENTITLEMENTS__ || {};
  const plan = String(globalState.plan || 'free').toLowerCase();
  const isAdmin = globalState.isAdmin === true || String(globalState.role || '').toLowerCase() === 'admin';
  return {
    plan,
    planLabel: formatPlanLabel(plan, isAdmin, globalState.planLabel),
    isAdmin,
    isAuthenticated: !!globalState.isAuthenticated,
    uid: String(globalState.uid || ''),
    displayName: sanitizeText(globalState.displayName || '', MAX_PLAN_DISPLAY_NAME_LEN)
  };
}

function getRecommendedRoomCap() {
  const coarsePointer = typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  const mobileLike = coarsePointer || /Android|iPhone|iPad|iPod|Mobile/i.test(String(navigator?.userAgent || ''));
  const hwThreads = finiteNumber(navigator?.hardwareConcurrency, 4);
  const memGb = finiteNumber(navigator?.deviceMemory, mobileLike ? 4 : 6);
  const perfMode = String(appCtx.perfMode || '').toLowerCase();

  let cap = mobileLike ? BASE_ROOM_CAP_MOBILE : BASE_ROOM_CAP_DESKTOP;
  if (!mobileLike && hwThreads >= 8 && memGb >= 8) cap = HIGH_END_ROOM_CAP_DESKTOP;
  if (perfMode === 'eco') cap = Math.min(cap, 8);
  if (perfMode === 'cinematic') cap = Math.min(cap, 10);
  return Math.max(ROOM_CAP_MIN, Math.min(ROOM_CAP_MAX, Math.floor(cap)));
}

function canUseMultiplayer(planState) {
  if (!planState) return false;
  if (planState.isAdmin === true) return true;
  return planState.isAuthenticated === true || !!String(planState.uid || '');
}

function copyText(text) {
  if (!text) return Promise.reject(new Error('Nothing to copy.'));
  const fallbackCopy = () => new Promise((resolve, reject) => {
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

  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy());
  }

  return fallbackCopy();
}

function isPermissionError(err) {
  const code = String(err?.code || '').toLowerCase();
  const message = String(err?.message || err || '').toLowerCase();
  return code === 'permission-denied' ||
    message.includes('permission') ||
    message.includes('not authorized') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('app check');
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

function isDroneModeActive() {
  if (appCtx.droneMode) return true;

  const droneToggle = document.getElementById('fDrone');
  if (droneToggle?.classList?.contains('on')) return true;

  const modeLabel = String(document.getElementById('fMode')?.textContent || '').toLowerCase();
  return modeLabel.includes('drone');
}

function readWorldContext() {
  const refGeo = currentMapReferenceGeoPosition();
  const lat = finiteNumber(refGeo?.lat, finiteNumber(appCtx.LOC?.lat, finiteNumber(appCtx.customLoc?.lat, 0)));
  const lon = finiteNumber(refGeo?.lon, finiteNumber(appCtx.LOC?.lon, finiteNumber(appCtx.customLoc?.lon, 0)));
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

function createPoseSnapshotBase(world) {
  const activeInterior = appCtx.activeInterior || null;
  return {
    mode: world.kind === 'space' ? 'space' : 'drive',
    frame: {
      kind: world.kind,
      locLat: world.lat,
      locLon: world.lon,
      interiorKey: String(activeInterior?.key || '').trim(),
      buildingKey: String(activeInterior?.support?.key || activeInterior?.building?.sourceBuildingId || '').trim(),
      interiorLabel: String(activeInterior?.label || '').trim()
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
}

function applyPose(base, values = {}) {
  if (!base || !base.pose || !values || typeof values !== 'object') return;
  const pose = base.pose;
  if (Object.prototype.hasOwnProperty.call(values, 'x')) pose.x = finiteNumber(values.x, pose.x);
  if (Object.prototype.hasOwnProperty.call(values, 'y')) pose.y = finiteNumber(values.y, pose.y);
  if (Object.prototype.hasOwnProperty.call(values, 'z')) pose.z = finiteNumber(values.z, pose.z);
  if (Object.prototype.hasOwnProperty.call(values, 'yaw')) pose.yaw = finiteNumber(values.yaw, pose.yaw);
  if (Object.prototype.hasOwnProperty.call(values, 'pitch')) pose.pitch = finiteNumber(values.pitch, pose.pitch);
  if (Object.prototype.hasOwnProperty.call(values, 'vx')) pose.vx = finiteNumber(values.vx, pose.vx);
  if (Object.prototype.hasOwnProperty.call(values, 'vy')) pose.vy = finiteNumber(values.vy, pose.vy);
  if (Object.prototype.hasOwnProperty.call(values, 'vz')) pose.vz = finiteNumber(values.vz, pose.vz);
}

function readSpacePose(base) {
  const rocket = appCtx.spaceFlight?.rocket;
  if (!rocket) return false;

  base.mode = 'space';
  applyPose(base, {
    x: rocket.position?.x,
    y: rocket.position?.y,
    z: rocket.position?.z,
    vx: appCtx.spaceFlight?.velocity?.x,
    vy: appCtx.spaceFlight?.velocity?.y,
    vz: appCtx.spaceFlight?.velocity?.z
  });

  if (globalThis.THREE && rocket.quaternion) {
    const euler = new globalThis.THREE.Euler().setFromQuaternion(rocket.quaternion, 'YXZ');
    applyPose(base, { yaw: euler.y, pitch: euler.x });
  }
  return true;
}

function readDronePose(base) {
  if (!isDroneModeActive()) return false;
  base.mode = 'drone';
  base.pose.x = finiteNumber(appCtx.drone?.x, finiteNumber(appCtx.car?.x, 0));
  base.pose.y = finiteNumber(appCtx.drone?.y, finiteNumber(appCtx.car?.y, 0));
  base.pose.z = finiteNumber(appCtx.drone?.z, finiteNumber(appCtx.car?.z, 0));
  base.pose.yaw = finiteNumber(appCtx.drone?.yaw, finiteNumber(appCtx.car?.angle, 0));
  base.pose.pitch = finiteNumber(appCtx.drone?.pitch, 0);
  return true;
}

function readWalkPose(base) {
  if (!isWalkModeActive()) return false;
  base.mode = 'walk';
  base.pose.x = finiteNumber(appCtx.Walk?.state?.walker?.x, finiteNumber(appCtx.car?.x, 0));
  base.pose.y = finiteNumber(appCtx.Walk?.state?.walker?.y, finiteNumber(appCtx.car?.y, 0));
  base.pose.z = finiteNumber(appCtx.Walk?.state?.walker?.z, finiteNumber(appCtx.car?.z, 0));
  base.pose.yaw = finiteNumber(appCtx.Walk?.state?.walker?.yaw, finiteNumber(appCtx.car?.angle, 0));
  base.pose.pitch = finiteNumber(appCtx.Walk?.state?.walker?.pitch, 0);
  base.pose.vy = finiteNumber(appCtx.Walk?.state?.walker?.vy, 0);
  return true;
}

function readPoseSnapshot() {
  const world = readWorldContext();
  const base = createPoseSnapshotBase(world);

  if (appCtx.spaceFlight?.active && readSpacePose(base)) return base;
  if (readDronePose(base)) return base;
  if (readWalkPose(base)) return base;

  base.mode = 'drive';
  applyPose(base, {
    x: appCtx.car?.x,
    y: appCtx.car?.y,
    z: appCtx.car?.z,
    yaw: appCtx.car?.angle,
    vx: appCtx.car?.vx,
    vy: appCtx.car?.vy,
    vz: appCtx.car?.vz
  });
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

  function roomToMapMarker(room, type = 'public') {
    if (!room || typeof room !== 'object') return null;
    const code = normalizeCode(room.code || room.id || '');
    const worldKind = sanitizeText(room.world?.kind || 'earth', 16).toLowerCase();
    if (worldKind !== 'earth') return null;
    const lat = Number(room.world?.lat);
    const lon = Number(room.world?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const roomName = sanitizeText(room.name || room.locationTag?.label || code || 'Room', 80) || 'Room';
    const locationLabel = sanitizeText(room.locationTag?.label || room.locationTag?.city || '', 80);
    const visibility = String(room.visibility || 'private').toLowerCase() === 'public' ? 'public' : 'private';
    return {
      code: code || '',
      lat,
      lon,
      name: roomName,
      locationLabel,
      ownerUid: sanitizeText(room.ownerUid || room.createdBy || '', 160),
      createdBy: sanitizeText(room.createdBy || room.ownerUid || '', 160),
      type: type === 'user' ? 'user' : 'public',
      visibility
    };
  }

  function dedupeMarkers(markers = []) {
    const out = [];
    const seen = new Set();
    markers.forEach((marker) => {
      if (!marker) return;
      const key = marker.code || `${marker.lat.toFixed(5)},${marker.lon.toFixed(5)},${marker.type}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(marker);
    });
    return out;
  }

  function buildWeeklyFeaturedMarker() {
    const weekly = getWeeklyCitySelection();
    const world = resolveWeeklyFeaturedWorld(weekly);
    if (!Number.isFinite(world.lat) || !Number.isFinite(world.lon)) return null;
    return {
      code: buildWeeklyFeaturedRoomCode(weekly),
      lat: world.lat,
      lon: world.lon,
      name: `Weekly City • ${weekly.city}`,
      locationLabel: weekly.city,
      type: 'public',
      visibility: 'public',
      isWeekly: true
    };
  }

  function publishMapRoomsToContext() {
    const signedIn = !!state.authUser;
    const userRooms = signedIn ?
    dedupeMarkers(
      [
      ...state.ownedRooms.map((room) => roomToMapMarker(room, 'user')),
      roomToMapMarker(state.currentRoom, 'user')]
      ) :
    [];
    const publicRooms = dedupeMarkers(
      [
      ...state.featuredRooms.map((room) => roomToMapMarker(room, 'public')),
      ...state.browseRooms.map((room) => roomToMapMarker(room, 'public')),
      roomToMapMarker(
        state.currentRoom && String(state.currentRoom.visibility || '').toLowerCase() === 'public' ? state.currentRoom : null,
        'public'
      ),
      buildWeeklyFeaturedMarker()]
    );
    appCtx.multiplayerMapRooms = {
      signedIn,
      currentRoomCode: normalizeCode(state.currentRoom?.code || ''),
      userRooms,
      publicRooms,
      updatedAt: Date.now()
    };
    appCtx.multiplayerRoomActivities = state.roomActivities.slice();
    appCtx.multiplayerActiveRoomActivity = state.activeRoomActivity ? { ...state.activeRoomActivity } : null;
  }

  function canManageCurrentRoomActivities() {
    return !!(state.currentRoom && state.authUser && String(state.currentRoom.ownerUid || '') === String(state.authUser.uid || ''));
  }

  function closeRoomPanel() {
    if (!refs.roomPanelModal) return;
    refs.roomPanelModal.classList.remove('show');
  }

  function openRoomPanel() {
    if (!refs.roomPanelModal) return;
    refs.roomPanelModal.classList.add('show');
    emitTutorialEvent('opened_rooms_menu', { source: 'room_panel' });
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

  async function syncRoomWorldContext(room, force = false, respawn = false) {
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

    if (!appCtx.gameStarted) {
      setStatus(`Opening room ${room.code}...`);
      appCtx.pendingCustomLaunchBypass = true;
      if (typeof appCtx.triggerTitleStart === 'function') {
        appCtx.triggerTitleStart({ bypassCustomGate: true });
      } else {
        const startBtn = document.getElementById('startBtn');
        if (startBtn instanceof HTMLButtonElement) startBtn.click();
      }
      return;
    }

    if (appCtx.gameStarted && appCtx.worldLoading) {
      if (state.pendingRoomWorldRetryTimer) {
        clearTimeout(state.pendingRoomWorldRetryTimer);
        state.pendingRoomWorldRetryTimer = null;
      }
      const roomId = String(room.id || '');
      state.pendingRoomWorldRetryTimer = setTimeout(() => {
        state.pendingRoomWorldRetryTimer = null;
        if (!state.currentRoom || String(state.currentRoom.id || '') !== roomId) return;
        syncRoomWorldContext(state.currentRoom, true, respawn).catch((err) => {
          console.warn('[multiplayer][ui] delayed room world sync failed:', err);
        });
      }, 420);
      return;
    }

    if (appCtx.gameStarted && !appCtx.worldLoading && typeof appCtx.loadRoads === 'function') {
      setStatus(`Syncing room world ${room.code} (seed ${roomSeed})...`);
      try {
        await appCtx.loadRoads();
        if (respawn && typeof appCtx.spawnOnRoad === 'function') {
          appCtx.spawnOnRoad();
        }
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

    if (!state.browseRooms.length) {
      if (state.browseCityKey) {
        refs.titleBrowseList.innerHTML = '<li class="mpRoomEmpty">No public rooms found for that city tag.</li>';
      } else {
        refs.titleBrowseList.innerHTML = '<li class="mpRoomEmpty">Search a city to find public rooms (view-only if signed out).</li>';
      }
      publishMapRoomsToContext();
      return;
    }

    refs.titleBrowseList.innerHTML = state.browseRooms.map((room) => {
      const code = normalizeCode(room.code);
      const worldKind = sanitizeText(room.world?.kind || 'earth', 16).toUpperCase();
      const roomName = safeHtml(room.name || `${worldKind} Session`, 80);
      const locationLabel = safeHtml(room.locationTag?.label || room.locationTag?.city || 'Unknown location', 80);
      const joinButton = state.authUser ?
      `<button class="mp-btn secondary mpRoomJoinBtn" data-room-code="${escapeHtml(code)}" type="button">Join</button>` :
      '<button class="mp-btn secondary mpRoomJoinBtn" type="button" disabled title="Sign in to join">View</button>';
      return `<li class="mpRoomItem"><div class="mpRoomInfo"><div class="mpRoomName">${roomName}</div><div class="mpRoomMeta">${locationLabel} • ${escapeHtml(worldKind)} • ${escapeHtml(code)}</div></div>${joinButton}</li>`;
    }).join('');
    publishMapRoomsToContext();
  }

  function resolveWeeklyFeaturedWorld(selection) {
    const cityKey = normalizeCityKey(selection?.cityKey || selection?.city || '');
    const locations = Object.values(appCtx.LOCS || {});
    const match = locations.find((loc) => normalizeCityKey(loc?.name || '') === cityKey) || null;
    const refGeo = currentMapReferenceGeoPosition();
    const lat = finiteNumber(match?.lat, finiteNumber(refGeo?.lat, finiteNumber(appCtx.LOC?.lat, 0)));
    const lon = finiteNumber(match?.lon, finiteNumber(refGeo?.lon, finiteNumber(appCtx.LOC?.lon, 0)));
    return {
      kind: 'earth',
      lat,
      lon,
      seed: `latlon:${lat.toFixed(5)},${lon.toFixed(5)}`
    };
  }

  function renderWeeklyFeaturedCallout() {
    const weekly = getWeeklyCitySelection();
    const roomCode = buildWeeklyFeaturedRoomCode(weekly);
    const inWeeklyRoom = normalizeCode(state.currentRoom?.code || '') === roomCode;

    if (refs.titleFeaturedWeeklyBtn) {
      refs.titleFeaturedWeeklyBtn.disabled = !state.authUser;
      refs.titleFeaturedWeeklyBtn.textContent = inWeeklyRoom
        ? `In Weekly Room • ${weekly.city}`
        : `Join Weekly City • ${weekly.city}`;
    }

    if (refs.titleFeaturedWeeklyMeta) {
      refs.titleFeaturedWeeklyMeta.textContent = state.authUser
        ? `Week ${weekly.week}: ${weekly.city}. Public room code ${roomCode}.`
        : `Weekly city room rotates each week. Sign in to join.`;
      refs.titleFeaturedWeeklyMeta.style.color = '#64748b';
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
    refs.titleFeaturedList.innerHTML = state.featuredRooms.map((room) => {
      const code = normalizeCode(room.code);
      const roomName = safeHtml(room.name || 'Untitled Room', 80);
      const locationLabel = safeHtml(room.locationTag?.label || room.locationTag?.city || 'Unknown location', 80);
      const joinButton = state.authUser ?
      `<button class="mp-btn secondary mpRoomJoinBtn" data-room-code="${escapeHtml(code)}" type="button">Join</button>` :
      '<button class="mp-btn secondary mpRoomJoinBtn" type="button" disabled title="Sign in to join">View</button>';
      return `<li class="mpRoomItem"><div class="mpRoomInfo"><div class="mpRoomName">${roomName}</div><div class="mpRoomMeta">${locationLabel} • ${escapeHtml(code)}</div></div>${joinButton}</li>`;
    }).join('');
    publishMapRoomsToContext();
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
      publishMapRoomsToContext();
      return;
    }

    if (!state.ownedRooms.length) {
      refs.titleOwnedRoomsList.innerHTML = '<li class="mpRoomEmpty">No saved rooms yet.</li>';
      if (refs.titleOwnedRoomsStatus) {
        refs.titleOwnedRoomsStatus.textContent = 'Create or join a room to save it here for quick return.';
        refs.titleOwnedRoomsStatus.style.color = '#64748b';
      }
      publishMapRoomsToContext();
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
    publishMapRoomsToContext();
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

  function renderRoomActivities() {
    if (!refs.roomActivityList) return;
    if (!state.currentRoom) {
      refs.roomActivityList.innerHTML = '<li class="mpRoomEmpty">Join a room to browse room games.</li>';
      return;
    }
    if (!state.roomActivities.length) {
      refs.roomActivityList.innerHTML = '<li class="mpRoomEmpty">No room games yet. Open Create Game to add one for this room.</li>';
      return;
    }
    const activeId = sanitizeText(state.activeRoomActivity?.activityId || '', 120).toLowerCase();
    refs.roomActivityList.innerHTML = state.roomActivities.map((activity) => {
      const active = sanitizeText(activity.id || '', 120).toLowerCase() === activeId;
      const title = safeHtml(activity.title || 'Room Game', 80);
      const meta = `${safeHtml(activity.templateId.replace(/_/g, ' ') || 'activity', 40)} • ${safeHtml(activity.traversalMode || 'walk', 24)} • by ${safeHtml(activity.creatorName || 'Explorer', 48)}`;
      const actionLabel = active ? 'Running' : 'Open';
      const stopBtn = active && canManageCurrentRoomActivities()
        ? `<button class="mp-btn secondary mpSmallBtn" data-stop-room-activity="${escapeHtml(String(activity.id || ''))}" type="button">Stop</button>`
        : '';
      const deleteBtn = canManageCurrentRoomActivities()
        ? `<button class="mp-btn secondary mpSmallBtn" data-remove-room-activity="${escapeHtml(String(activity.id || ''))}" type="button">Delete</button>`
        : '';
      return `<li class="mpRoomItem ${active ? 'active' : ''}" data-room-activity-id="${escapeHtml(String(activity.id || ''))}">
        <div class="mpArtifactInfo">
          <div class="mpArtifactTitle">${title}</div>
          <div class="mpArtifactMeta">${meta}</div>
          <div class="mpArtifactMeta">${safeHtml(activity.description || 'Shared room game.', 220)}</div>
        </div>
        <div class="mp-row">
          <button class="mp-btn secondary mpSmallBtn" data-open-room-activity="${escapeHtml(String(activity.id || ''))}" type="button">${actionLabel}</button>
          ${stopBtn}
          ${deleteBtn}
        </div>
      </li>`;
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
      refs.titlePlanState.textContent = 'Pro donation active: multiplayer is open, plus early demo access.';
      refs.titlePlanState.classList.remove('warn');
      return;
    }
    if (plan === 'supporter' || plan === 'support') {
      refs.titlePlanState.textContent = 'Supporter donation active: multiplayer is fully open. Upgrade to Pro for early demos.';
      refs.titlePlanState.classList.remove('warn');
      return;
    }
    refs.titlePlanState.textContent = 'Signed-in explorers can create and join multiplayer rooms. Donations are optional.';
    refs.titlePlanState.classList.remove('warn');
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
    if (refs.roomActivityOpenBtn) refs.roomActivityOpenBtn.disabled = !hasRoom;
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
      const capLabel = Math.max(2, Number(room.maxPlayers) || getRecommendedRoomCap());
      refs.roomPanelRoomName.textContent = locationLabel
        ? `${roomName} (${room.visibility || 'private'}) • ${locationLabel} • cap ${capLabel}`
        : `${roomName} (${room.visibility || 'private'}) • cap ${capLabel}`;
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
      const cap = Math.max(2, Number(state.currentRoom?.maxPlayers) || getRecommendedRoomCap());
      if (refs.roomPanelPlayerCount) refs.roomPanelPlayerCount.textContent = `0 / ${cap}`;
      return;
    }

    refs.roomPanelPlayerList.innerHTML = state.players.map((player) => {
      const role = safeHtml(player.role || 'member', 16);
      const displayName = safeHtml(player.displayName || 'Explorer', 48);
      const mode = safeHtml(player.mode || 'drive', 16);
      const selfTag = player.uid === state.authUser?.uid ? ' (You)' : '';
      return `<li class="mpPlayerItem"><span class="mpPlayerName">${displayName}${selfTag}</span><span class="mpPlayerMeta">${role} • ${mode}</span></li>`;
    }).join('');

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
    if (typeof state.unsubRoomActivities === 'function') state.unsubRoomActivities();
    if (typeof state.unsubRoomActivityState === 'function') state.unsubRoomActivityState();
    if (typeof state.unsubSharedBlocks === 'function') state.unsubSharedBlocks();
    if (typeof state.unsubHomeBase === 'function') state.unsubHomeBase();
    if (typeof state.unsubPaintClaims === 'function') state.unsubPaintClaims();
    state.unsubRoom = null;
    state.unsubPlayers = null;
    state.unsubChat = null;
    state.unsubArtifacts = null;
    state.unsubRoomActivities = null;
    state.unsubRoomActivityState = null;
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
    if (state.pendingRoomWorldRetryTimer) {
      clearTimeout(state.pendingRoomWorldRetryTimer);
      state.pendingRoomWorldRetryTimer = null;
    }
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
    state.roomActivities = [];
    state.activeRoomActivity = null;
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
    renderRoomActivities();
    renderHomeBase();
    updateToggleStates();
    publishMapRoomsToContext();
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
      setStatus('Could not confirm multiplayer access for this account yet. Try refresh or sign in again.', true);
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
        setStatus(rooms.length ? `Loaded ${rooms.length} featured room${rooms.length === 1 ? '' : 's'}.` : 'No featured rooms yet.');
      }
    } catch (err) {
      console.warn('[multiplayer][ui] refresh featured rooms failed:', err);
      if (!silent) setStatus(err?.message || 'Could not load featured rooms.', true);
      publishMapRoomsToContext();
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
          z: finiteNumber(pose.pose.z, 0),
          interiorKey: pose.frame.interiorKey || '',
          buildingKey: pose.frame.buildingKey || '',
          interiorLabel: pose.frame.interiorLabel || ''
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
          z: finiteNumber(pose.pose.z, 0),
          interiorKey: pose.frame.interiorKey || '',
          buildingKey: pose.frame.buildingKey || '',
          interiorLabel: pose.frame.interiorLabel || ''
        }
      });

      if (refs.roomArtifactTitleInput) refs.roomArtifactTitleInput.value = '';
      if (refs.roomArtifactTextInput) refs.roomArtifactTextInput.value = '';

      await bumpExplorerLeaderboard({ artifactsShared: 1 });
      emitTutorialEvent('artifact_placed', {
        source: 'multiplayer_artifact',
        roomCode: normalizeCode(state.currentRoom?.code || '')
      });
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

  async function handleOpenRoomActivity(activityId) {
    if (!state.currentRoom) {
      setStatus('Join a room first.', true);
      return;
    }
    const activity = state.roomActivities.find((entry) => sanitizeText(entry.id || '', 120).toLowerCase() === sanitizeText(activityId || '', 120).toLowerCase());
    if (!activity) {
      setStatus('That room game could not be found.', true);
      return;
    }
    if (typeof appCtx.openActivityBrowser === 'function') {
      await appCtx.openActivityBrowser({
        activityId: activity.id,
        scope: 'rooms'
      });
    }
    setStatus(`Opened ${activity.title}.`);
  }

  async function handleDeleteRoomActivity(activityId) {
    if (!state.currentRoom) {
      setStatus('Join a room first.', true);
      return;
    }
    if (!canManageCurrentRoomActivities()) {
      setStatus('Only the room owner can remove room games.', true);
      return;
    }
    try {
      await deleteRoomActivity(state.currentRoom.code, activityId);
      if (sanitizeText(state.activeRoomActivity?.activityId || '', 120).toLowerCase() === sanitizeText(activityId || '', 120).toLowerCase()) {
        await stopRoomActivitySession(state.currentRoom.code, {
          uid: state.authUser?.uid || '',
          displayName: state.authUser?.displayName || state.authUser?.email || 'Explorer'
        });
      }
      setStatus('Room game removed.');
    } catch (err) {
      setStatus(err?.message || 'Could not remove that room game.', true);
    }
  }

  async function handleStopRoomActivity(activityId = '') {
    if (!state.currentRoom) {
      setStatus('Join a room first.', true);
      return;
    }
    if (!canManageCurrentRoomActivities()) {
      setStatus('Only the room owner can stop a shared room game.', true);
      return;
    }
    const activeId = sanitizeText(state.activeRoomActivity?.activityId || '', 120).toLowerCase();
    if (activityId && sanitizeText(activityId, 120).toLowerCase() !== activeId) return;
    try {
      await stopRoomActivitySession(state.currentRoom.code, {
        uid: state.authUser?.uid || '',
        displayName: state.authUser?.displayName || state.authUser?.email || 'Explorer'
      });
      if (typeof appCtx.stopSharedRoomActivityRuntime === 'function') {
        appCtx.stopSharedRoomActivityRuntime({ source: 'room_activity_stop' });
      }
      setStatus('Room game stopped.');
    } catch (err) {
      setStatus(err?.message || 'Could not stop the room game.', true);
    }
  }

  async function launchRoomActivity(activity = {}) {
    if (!state.currentRoom) throw new Error('Join a room first.');
    const selected = state.roomActivities.find((entry) => sanitizeText(entry.id || '', 120).toLowerCase() === sanitizeText(activity.id || '', 120).toLowerCase()) || activity;
    if (!selected?.id) throw new Error('Select a valid room game first.');
    const activeId = sanitizeText(state.activeRoomActivity?.activityId || '', 120).toLowerCase();
    if (canManageCurrentRoomActivities()) {
      await startRoomActivitySession(state.currentRoom.code, selected, {
        uid: state.authUser?.uid || '',
        displayName: state.authUser?.displayName || state.authUser?.email || 'Explorer'
      });
      return { mode: 'started' };
    }
    if (activeId === sanitizeText(selected.id || '', 120).toLowerCase()) {
      if (typeof appCtx.startSharedRoomActivityRuntime === 'function') {
        await appCtx.startSharedRoomActivityRuntime({
          ...selected,
          sourceType: 'room_activity',
          requiresNearbyStart: false
        });
      }
      return { mode: 'joined' };
    }
    throw new Error('The room owner needs to start this room game first.');
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
      const savedRoom = state.ownedRooms.find((room) => normalizeCode(room.code || room.id || '') === normalizedCode) || null;
      const worldKind = String(savedRoom?.world?.kind || '').toLowerCase();
      const lat = finiteNumber(savedRoom?.world?.lat, null);
      const lon = finiteNumber(savedRoom?.world?.lon, null);
      const canFallbackToLocal = !!savedRoom && worldKind === 'earth' && Number.isFinite(lat) && Number.isFinite(lon);

      if (isPermissionError(err) && canFallbackToLocal) {
        await deactivateRoom(true);
        const fallbackRoom = {
          id: normalizedCode,
          code: normalizedCode,
          name: sanitizeText(savedRoom.name || savedRoom.locationTag?.label || `Room ${normalizedCode}`, 80),
          visibility: String(savedRoom.visibility || 'private'),
          world: {
            kind: 'earth',
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

  async function activateRoom(room, originLabel = 'room') {
    if (!room || !room.id) {
      await deactivateRoom(true);
      return;
    }

    clearSubscriptions();
    state.currentRoom = room;
    emitTutorialEvent('room_created_or_toggled', {
      roomCode: normalizeCode(room.code || room.id || ''),
      origin: String(originLabel || 'room')
    });
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
    state.roomActivities = [];
    state.activeRoomActivity = null;
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
    renderRoomActivities();
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
      publishMapRoomsToContext();
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

    state.unsubRoomActivities = listenRoomActivities(room.id, (activities) => {
      state.roomActivities = Array.isArray(activities) ? activities : [];
      renderRoomActivities();
      publishMapRoomsToContext();
    });

    state.unsubRoomActivityState = listenRoomActivityState(room.id, async (activityState) => {
      state.activeRoomActivity = activityState;
      renderRoomActivities();
      publishMapRoomsToContext();
      const activeId = sanitizeText(activityState?.activityId || '', 120).toLowerCase();
      if (activityState?.status === 'running' && activeId) {
        const activity = state.roomActivities.find((entry) => sanitizeText(entry.id || '', 120).toLowerCase() === activeId) || null;
        if (activity && typeof appCtx.startSharedRoomActivityRuntime === 'function') {
          await appCtx.startSharedRoomActivityRuntime({
            ...activity,
            sourceType: 'room_activity',
            roomCode: normalizeCode(room.code || room.id || ''),
            requiresNearbyStart: false
          });
        }
      } else if (typeof appCtx.stopSharedRoomActivityRuntime === 'function') {
        appCtx.stopSharedRoomActivityRuntime({ source: 'room_activity_stop' });
      }
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
    await syncRoomWorldContext(room, false, true);

    const invite = buildInviteLink(room.code);
    if (invite) {
      const url = new URL(window.location.href);
      url.searchParams.set('room', room.code);
      window.history.replaceState({}, '', url.toString());
    }

    setStatus(`Connected to ${originLabel}: ${room.code} (seed ${deriveRoomDeterministicSeed(room)}).`);
    publishMapRoomsToContext();
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
      const cap = getRecommendedRoomCap();
      const createPayload = {
        name: roomName || `${world.name} Session`,
        visibility,
        featured: false,
        maxPlayers: cap,
        world,
        rules: paintRules,
        locationName: roomName || world.name,
        locationTag: effectiveLocationTag ? { label: effectiveLocationTag, city: effectiveLocationTag, kind: world.kind } : null
      };
      const room = await createRoom(createPayload);

      await activateRoom(room, 'created room');
      await bumpExplorerLeaderboard({ roomsJoined: 1 });
      await refreshFeaturedRooms(true);
      const inviteLink = buildInviteLink(room.code);
      if (inviteLink) {
        const named = room.name ? `${room.name} (${room.code})` : room.code;
        try {
          await copyText(inviteLink);
          setStatus(`${visibility === 'public' ? 'Public' : 'Private'} room ${named} created (cap ${cap}). Invite link copied.`);
        } catch (_) {
          setStatus(`${visibility === 'public' ? 'Public' : 'Private'} room ${named} created (cap ${cap}).`);
        }
      }
    } catch (err) {
      console.error('[multiplayer][ui] create room failed:', err);
      setStatus(err?.message || 'Could not create room.', true);
    }
  }

  async function ensureInviteJoinAccess() {
    if (!state.authUser) {
      setStatus('Sign in to accept invites.', true);
      return false;
    }
    return true;
  }

  async function handleBrowseRooms() {
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
        if (authed) setAuthUser(authed);
      }
      return await finalizeJoin(existing, 'weekly featured room');
    } catch (joinErr) {
      const joinMessage = String(joinErr?.message || '');
      if (!/Room not found/i.test(joinMessage)) {
        setStatus(joinMessage || 'Could not join weekly featured room.', true);
        return null;
      }
    }

    try {
      if (!(await ensureAccessOrWarn('creating the weekly featured city room'))) return null;
      const cap = getRecommendedRoomCap();
      const created = await createRoom({
        code: roomCode,
        name: roomName,
        visibility: 'public',
        featured: true,
        maxPlayers: cap,
        world,
        locationName: weekly.city,
        locationTag: { label: `Weekly City: ${weekly.city}`, city: weekly.city, kind: 'earth' }
      });
      return await finalizeJoin(created, 'weekly featured room');
    } catch (createErr) {
      const createMessage = String(createErr?.message || '');
      if (/unavailable|already|denied/i.test(createMessage)) {
        try {
          const raceWinner = await joinRoomByCode(roomCode);
          return await finalizeJoin(raceWinner, 'weekly featured room');
        } catch (retryErr) {
          setStatus(String(retryErr?.message || retryErr || 'Could not join weekly featured room.'), true);
          return null;
        }
      }
      setStatus(createMessage || 'Could not open weekly featured room.', true);
      return null;
    }
  }

  async function handleJoinRoom(codeOverride = '', options = {}) {
    const skipAccessCheck = Boolean(options && options.skipAccessCheck);
    const suppressStatus = Boolean(options && options.suppressStatus);
    const throwOnError = Boolean(options && options.throwOnError);
    if (!skipAccessCheck && state.authUser && !(await ensureAccessOrWarn('joining a room'))) {
      return null;
    }

    const code = normalizeCode(codeOverride || pullCodeFromInputs(refs));
    if (!code) {
      setStatus('Enter a valid room code before joining.', true);
      return;
    }

    try {
      const room = await joinRoomByCode(code);
      if (!state.authUser) {
        const authed = getCurrentUser();
        if (authed) setAuthUser(authed);
      }
      await activateRoom(room, 'joined room');
      await bumpExplorerLeaderboard({ roomsJoined: 1 });
      await refreshFeaturedRooms(true);
      if (!suppressStatus) setStatus(`Joined room ${room.code}.`);
      closeRoomPanel();
      return room;
    } catch (err) {
      console.error('[multiplayer][ui] join failed:', err);
      if (!suppressStatus) setStatus(err?.message || 'Could not join that room.', true);
      if (throwOnError) throw err;
      return null;
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
      const message = String(err?.message || err || '');
      if (/permission|denied|not allowed|copy command failed/i.test(message)) {
        setStatus(`Clipboard blocked. Share this invite link: ${link}`);
        return;
      }
      setStatus(`Could not copy invite link. Share this invite link: ${link}`, true);
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
      state.pendingRoomPrompted = true;
      setStatus(`Invite accepted. Joining room ${inviteCode}...`);
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
      setBrowseStatus('Public rooms are viewable. Sign in to join or create rooms.');
      if (refs.titleFriendsStatus) refs.titleFriendsStatus.textContent = 'Sign in to build your social graph.';
      return;
    }

    if (!allowed) {
      setStatus('Signed in, but multiplayer access is still syncing. Retry in a moment.', true);
      setBrowseStatus('Access is syncing for this session. Try again shortly.');
      return;
    }

    if (state.currentRoom) {
      setStatus(`Multiplayer active in room ${state.currentRoom.code}.`);
    } else {
      setStatus('Multiplayer ready. Create or join a room.');
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

    const openAccountCenter = async () => {
      if (!state.authUser) {
        const signInBtn = document.getElementById('appSignInBtn');
        if (signInBtn) signInBtn.click();
        setStatus('Sign in first to use multiplayer rooms.');
        return;
      }
      window.location.assign('../account/');
    };

    refs.titleTrialBtn?.addEventListener('click', openAccountCenter);
    refs.roomPanelTrialBtn?.addEventListener('click', openAccountCenter);

    refs.titleBrowseBtn?.addEventListener('click', handleBrowseRooms);
    refs.titleFeaturedRefreshBtn?.addEventListener('click', () => refreshFeaturedRooms(false));
    refs.titleFeaturedWeeklyBtn?.addEventListener('click', handleJoinWeeklyFeaturedRoom);
    refs.titleAddFriendBtn?.addEventListener('click', () => {
      handleManualAddFriend();
    });
    refs.roomPanelSaveSettingsBtn?.addEventListener('click', handleSaveRoomSettings);
    refs.roomHomeBaseSaveBtn?.addEventListener('click', handleSaveHomeBase);
    refs.roomArtifactCreateBtn?.addEventListener('click', handleCreateArtifact);
    refs.roomActivityOpenBtn?.addEventListener('click', async () => {
      if (typeof appCtx.openActivityBrowser === 'function') {
        await appCtx.openActivityBrowser({ scope: 'rooms' });
      }
      closeRoomPanel();
    });
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

    refs.roomActivityList?.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const openBtn = target.closest('button[data-open-room-activity]');
      if (openBtn instanceof HTMLElement) {
        const activityId = sanitizeText(openBtn.dataset.openRoomActivity || '', 120);
        if (activityId) await handleOpenRoomActivity(activityId);
        return;
      }
      const stopBtn = target.closest('button[data-stop-room-activity]');
      if (stopBtn instanceof HTMLElement) {
        const activityId = sanitizeText(stopBtn.dataset.stopRoomActivity || '', 120);
        if (activityId) await handleStopRoomActivity(activityId);
        return;
      }
      const removeBtn = target.closest('button[data-remove-room-activity]');
      if (removeBtn instanceof HTMLElement) {
        const activityId = sanitizeText(removeBtn.dataset.removeRoomActivity || '', 120);
        if (activityId) await handleDeleteRoomActivity(activityId);
      }
    });

    window.addEventListener('we3d-entitlements-changed', (event) => {
      const detail = event?.detail || {};
      state.entitlement = {
        ...state.entitlement,
        ...readPlanState(),
        plan: String(detail.plan || state.entitlement.plan || 'free').toLowerCase(),
        planLabel: String(detail.planLabel || state.entitlement.planLabel || 'Free')
      };
      if (!state.authUser && state.currentRoom) {
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
    publishMapRoomsToContext();
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
    getWorldContextSnapshot: () => ({ ...readWorldContext() }),
    getWeeklyFeaturedWorldSnapshot: (selection) => ({ ...resolveWeeklyFeaturedWorld(selection || getWeeklyCitySelection()) }),
    getCurrentRoom: () => state.currentRoom,
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
