import { postProtectedFunction } from './function-api.js?v=1';

function sanitizeText(value, max = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(value, min, max, fallback) {
  const n = Math.floor(finiteNumber(value, fallback));
  return Math.max(min, Math.min(max, n));
}

function boolValue(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

export async function getAdminDashboardOverview() {
  const payload = await postProtectedFunction('/getAdminDashboardOverview', {}, { label: 'Admin API' });
  return payload || {};
}

export async function listAdminOverlayFeatures(filters = {}) {
  const payload = await postProtectedFunction('/listAdminOverlayFeatures', {
    reviewState: sanitizeText(filters.reviewState || 'submitted', 40).toLowerCase(),
    presetId: sanitizeText(filters.presetId || '', 80).toLowerCase(),
    geometryType: sanitizeText(filters.geometryType || 'all', 20),
    contributor: sanitizeText(filters.contributor || '', 80),
    region: sanitizeText(filters.region || '', 80),
    search: sanitizeText(filters.search || '', 80),
    timeWindow: sanitizeText(filters.timeWindow || 'all', 20).toLowerCase(),
    limit: clampInt(filters.limit, 10, 120, 48)
  }, { label: 'Admin API' });
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    summary: payload?.summary && typeof payload.summary === 'object' ? payload.summary : {}
  };
}

export async function getAdminOverlayFeatureDetail(featureId) {
  const payload = await postProtectedFunction('/getAdminOverlayFeatureDetail', {
    featureId: sanitizeText(featureId || '', 180)
  }, { label: 'Admin API' });
  return payload || {};
}

export async function listAdminUsers(filters = {}) {
  const payload = await postProtectedFunction('/listAdminUsers', {
    search: sanitizeText(filters.search || '', 80),
    role: sanitizeText(filters.role || 'all', 40).toLowerCase(),
    limit: clampInt(filters.limit, 10, 120, 48)
  }, { label: 'Admin API' });
  return {
    items: Array.isArray(payload?.items) ? payload.items : []
  };
}

export async function getAdminUserDetail(uid) {
  const payload = await postProtectedFunction('/getAdminUserDetail', {
    uid: sanitizeText(uid || '', 160)
  }, { label: 'Admin API' });
  return payload || {};
}

export async function listAdminRooms(filters = {}) {
  const payload = await postProtectedFunction('/listAdminRooms', {
    visibility: sanitizeText(filters.visibility || 'all', 20).toLowerCase(),
    worldKind: sanitizeText(filters.worldKind || 'all', 20).toLowerCase(),
    featuredOnly: boolValue(filters.featuredOnly, false),
    search: sanitizeText(filters.search || '', 80),
    limit: clampInt(filters.limit, 10, 40, 24)
  }, { label: 'Admin API' });
  return {
    items: Array.isArray(payload?.items) ? payload.items : []
  };
}

export async function updateAdminRoomFlags(roomId, updates = {}) {
  const payload = await postProtectedFunction('/updateAdminRoomFlags', {
    roomId: sanitizeText(roomId || '', 80),
    featured: updates.featured === true
  }, { label: 'Admin API' });
  return payload || {};
}

export async function getAdminSiteContent(entryId = 'landingPage') {
  const payload = await postProtectedFunction('/getAdminSiteContent', {
    entryId: sanitizeText(entryId || 'landingPage', 80)
  }, { label: 'Admin API' });
  return payload || {};
}

export async function saveAdminSiteContentDraft(entryId, content) {
  const payload = await postProtectedFunction('/saveAdminSiteContentDraft', {
    entryId: sanitizeText(entryId || 'landingPage', 80),
    content: content && typeof content === 'object' ? content : {}
  }, { label: 'Admin API' });
  return payload || {};
}

export async function publishAdminSiteContent(entryId = 'landingPage') {
  const payload = await postProtectedFunction('/publishAdminSiteContent', {
    entryId: sanitizeText(entryId || 'landingPage', 80)
  }, { label: 'Admin API' });
  return payload || {};
}

export async function listAdminActivity(filters = {}) {
  const payload = await postProtectedFunction('/listAdminActivity', {
    limit: clampInt(filters.limit, 10, 80, 40),
    actionPrefix: sanitizeText(filters.actionPrefix || '', 40).toLowerCase()
  }, { label: 'Admin API' });
  return {
    items: Array.isArray(payload?.items) ? payload.items : []
  };
}

export async function getAdminOperationsSnapshot() {
  const payload = await postProtectedFunction('/getAdminOperationsSnapshot', {}, { label: 'Admin API' });
  return payload || {};
}
