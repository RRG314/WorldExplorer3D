import { ctx as appCtx } from '../shared-context.js?v=55';
import { getWeeklyFeaturedCity } from './loop.js?v=55';
import { normalizeCityKey, normalizeCode } from './rooms.js?v=66';

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


export {
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
};
