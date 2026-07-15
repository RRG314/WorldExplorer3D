import { ctx as appCtx } from '../shared-context.js?v=55';
import { CHAT_MAX_LENGTH, reportMessage } from './chat.js?v=55';
import {
  getWeeklyFeaturedCity
} from './loop.js?v=55';
import {
  getCurrentRoom,
  normalizeCityKey,
  normalizeCode,
  setHomeBase
} from './rooms.js?v=66';
import { saveRoomActivity } from './room-activities.js?v=1';
import {
  normalizeColorHex as normalizePaintColorHex
} from './painttown.js?v=55';
import {
  createUiRoomEventsApi
} from './ui-room-events.js?v=1';
import { createUiRoomRenderers } from './ui-room-renderers.js?v=1';
import { createUiRoomActions } from './ui-room-actions.js?v=1';

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
