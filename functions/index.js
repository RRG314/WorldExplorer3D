const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { defineString } = require('firebase-functions/params');
const Stripe = require('stripe');
const { ADMIN_ACTIVITY_COLLECTION, buildAdminDashboardExports } = require('./admin-dashboard');
const {
  CREATOR_PROFILES_COLLECTION,
  ensureCreatorProfileDoc,
  mergeCreatorProfile,
  sanitizeAvatar,
  sanitizeMultilineText: sanitizeCreatorProfileMultilineText,
  sanitizeUsername
} = require('./creator-profile');
const { buildOverlayExports } = require('./overlay');

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

const ACTIVE_SUB_STATUSES = new Set(['active', 'trialing', 'past_due']);
const ALLOWED_PLANS = new Set(['support', 'supporter', 'pro']);
const TRIAL_DURATION_MS = 48 * 60 * 60 * 1000;
const DELETE_ACCOUNT_MAX_AUTH_AGE_SECONDS = 10 * 60;
const ADMIN_TEST_ROOM_CREATE_LIMIT = 10000;
const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  'https://rrg314.github.io',
  'https://worldexplorer.io',
  'https://www.worldexplorer.io',
  'https://worldexplorer3d.io',
  'https://www.worldexplorer3d.io'
]);
const ROOM_CREATE_LIMITS = Object.freeze({
  free: 3,
  trial: 3,
  supporter: 3,
  pro: 10
});
const PARAM_STRIPE_SECRET = defineString('WE3D_STRIPE_SECRET', { default: '' });
const PARAM_STRIPE_WEBHOOK = defineString('WE3D_STRIPE_WEBHOOK_SECRET', { default: '' });
const PARAM_STRIPE_PRICE_SUPPORTER = defineString('WE3D_STRIPE_PRICE_SUPPORTER', { default: '' });
const PARAM_STRIPE_PRICE_PRO = defineString('WE3D_STRIPE_PRICE_PRO', { default: '' });
const PARAM_ADMIN_ALLOWED_EMAILS = defineString('WE3D_ADMIN_ALLOWED_EMAILS', { default: '' });
const PARAM_ADMIN_ALLOWED_UIDS = defineString('WE3D_ADMIN_ALLOWED_UIDS', { default: '' });
const PARAM_ALLOWED_ORIGINS = defineString('WE3D_ALLOWED_ORIGINS', { default: '' });
const PARAM_RESEND_API_KEY = defineString('WE3D_RESEND_API_KEY', { default: '' });
const PARAM_EMAIL_FROM = defineString('WE3D_EMAIL_FROM', { default: '' });
const PARAM_ADMIN_NOTIFICATION_EMAIL = defineString('WE3D_ADMIN_NOTIFICATION_EMAIL', { default: '' });
const PARAM_MODERATION_PANEL_URL = defineString('WE3D_MODERATION_PANEL_URL', { default: 'https://worldexplorer3d.io/account/admin.html?view=moderation' });

const CONTRIBUTION_EDIT_TYPE_CONFIG = Object.freeze({
  place_info: Object.freeze({
    id: 'place_info',
    label: 'Place Info',
    icon: '📍',
    markerStyle: 'info-pin',
    defaultCategory: 'place',
    targetKinds: ['world', 'building', 'destination', 'interior'],
    requiresScopedTarget: false
  }),
  artifact_marker: Object.freeze({
    id: 'artifact_marker',
    label: 'Artifact Marker',
    icon: '🧿',
    markerStyle: 'artifact-beacon',
    defaultCategory: 'artifact',
    targetKinds: ['world', 'building', 'destination', 'interior'],
    requiresScopedTarget: false
  }),
  building_note: Object.freeze({
    id: 'building_note',
    label: 'Building Note',
    icon: '🏢',
    markerStyle: 'building-outline',
    defaultCategory: 'building',
    targetKinds: ['building', 'destination', 'interior'],
    requiresScopedTarget: true
  }),
  interior_seed: Object.freeze({
    id: 'interior_seed',
    label: 'Interior Seed',
    icon: '🚪',
    markerStyle: 'interior-node',
    defaultCategory: 'interior',
    targetKinds: ['building', 'interior', 'destination'],
    requiresScopedTarget: true
  }),
  photo_point: Object.freeze({
    id: 'photo_point',
    label: 'Photo Contribution',
    icon: '📷',
    markerStyle: 'photo-frame',
    defaultCategory: 'photo',
    targetKinds: ['world', 'building', 'destination', 'interior'],
    requiresScopedTarget: false
  })
});
const CONTRIBUTION_EDIT_TYPES = new Set(Object.keys(CONTRIBUTION_EDIT_TYPE_CONFIG));
const CONTRIBUTION_STATUS_VALUES = new Set(['pending', 'approved', 'rejected']);
const CONTRIBUTION_WORLD_KINDS = new Set(['earth', 'moon', 'space']);
const CONTRIBUTION_MAX_RESULTS = 120;
const CONTRIBUTION_AREA_CELL_DEGREES = 0.06;

function readParamString(paramRef, envFallback = '') {
  try {
    const value = typeof paramRef?.value === 'function' ? paramRef.value() : '';
    const text = String(value || '').trim();
    if (text) return text;
  } catch (_) {
    // Param resolution can be unavailable in some local tooling; env fallback still works.
  }
  return String(envFallback || '').trim();
}

function stripeConfig() {
  return {
    secret: readParamString(PARAM_STRIPE_SECRET, process.env.WE3D_STRIPE_SECRET || process.env.STRIPE_SECRET || ''),
    webhook: readParamString(PARAM_STRIPE_WEBHOOK, process.env.WE3D_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK || ''),
    price_supporter: readParamString(PARAM_STRIPE_PRICE_SUPPORTER, process.env.WE3D_STRIPE_PRICE_SUPPORTER || process.env.STRIPE_PRICE_SUPPORTER || ''),
    price_pro: readParamString(PARAM_STRIPE_PRICE_PRO, process.env.WE3D_STRIPE_PRICE_PRO || process.env.STRIPE_PRICE_PRO || '')
  };
}

function adminConfig() {
  return {
    allowedEmails: readParamString(PARAM_ADMIN_ALLOWED_EMAILS, process.env.WE3D_ADMIN_EMAILS || ''),
    allowedUids: readParamString(PARAM_ADMIN_ALLOWED_UIDS, process.env.WE3D_ADMIN_UIDS || '')
  };
}

function contributionNotificationConfig() {
  return {
    resendApiKey: readParamString(PARAM_RESEND_API_KEY, process.env.WE3D_RESEND_API_KEY || ''),
    emailFrom: readParamString(PARAM_EMAIL_FROM, process.env.WE3D_EMAIL_FROM || ''),
    adminNotificationEmail: readParamString(PARAM_ADMIN_NOTIFICATION_EMAIL, process.env.WE3D_ADMIN_NOTIFICATION_EMAIL || ''),
    moderationPanelUrl: readParamString(
      PARAM_MODERATION_PANEL_URL,
      process.env.WE3D_MODERATION_PANEL_URL || 'https://worldexplorer3d.io/account/admin.html?view=moderation'
    )
  };
}

function parseCsvSet(value, normalize = (item) => item) {
  return new Set(
    String(value || '')
      .split(',')
      .map((part) => normalize(String(part || '').trim()))
      .filter(Boolean)
  );
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function sanitizeText(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function sanitizeMultilineText(value, max = 320) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .trim()
    .slice(0, max);
}

function sanitizeHttpUrl(value, max = 320) {
  const raw = String(value || '').trim().slice(0, max);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href.slice(0, max) : '';
  } catch (_) {
    return '';
  }
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampLat(lat) {
  return Math.max(-90, Math.min(90, finiteNumber(lat, 0)));
}

function wrapLon(lon) {
  let next = finiteNumber(lon, 0);
  while (next < -180) next += 360;
  while (next > 180) next -= 360;
  return next;
}

function sanitizeContributionEditType(value) {
  const next = String(value || '').trim().toLowerCase();
  return CONTRIBUTION_EDIT_TYPES.has(next) ? next : 'place_info';
}

function getContributionEditTypeConfig(editType) {
  return CONTRIBUTION_EDIT_TYPE_CONFIG[sanitizeContributionEditType(editType)] || CONTRIBUTION_EDIT_TYPE_CONFIG.place_info;
}

function sanitizeContributionStatus(value) {
  const next = String(value || '').trim().toLowerCase();
  return CONTRIBUTION_STATUS_VALUES.has(next) ? next : 'pending';
}

function sanitizeWorldKind(value) {
  const next = String(value || '').trim().toLowerCase();
  return CONTRIBUTION_WORLD_KINDS.has(next) ? next : 'earth';
}

function computeContributionAreaKey(lat, lon, worldKind = 'earth') {
  const safeWorldKind = sanitizeWorldKind(worldKind);
  const safeLat = clampLat(lat);
  const safeLon = wrapLon(lon);
  const latBucket = Math.floor((safeLat + 90) / CONTRIBUTION_AREA_CELL_DEGREES);
  const lonBucket = Math.floor((safeLon + 180) / CONTRIBUTION_AREA_CELL_DEGREES);
  return `${safeWorldKind}:${latBucket}:${lonBucket}`;
}

function normalizeContributionTarget(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const anchorKind = String(source.anchorKind || 'world').toLowerCase();
  return {
    anchorKind: anchorKind === 'building' || anchorKind === 'interior' || anchorKind === 'destination' ? anchorKind : 'world',
    lat: clampLat(source.lat),
    lon: wrapLon(source.lon),
    x: finiteNumber(source.x, 0),
    y: finiteNumber(source.y, 0),
    z: finiteNumber(source.z, 0),
    locationLabel: sanitizeText(source.locationLabel || 'Current Location', 120),
    buildingKey: sanitizeText(source.buildingKey || '', 180),
    buildingLabel: sanitizeText(source.buildingLabel || '', 120),
    interiorKey: sanitizeText(source.interiorKey || '', 180),
    destinationKey: sanitizeText(source.destinationKey || '', 180),
    destinationLabel: sanitizeText(source.destinationLabel || '', 120)
  };
}

function normalizeContributionPayload(raw = {}, editType = 'place_info') {
  const source = raw && typeof raw === 'object' ? raw : {};
  const cfg = getContributionEditTypeConfig(editType);
  return {
    title: sanitizeText(source.title || '', 80),
    subtitle: sanitizeText(source.subtitle || '', 120),
    note: sanitizeMultilineText(source.note || '', 320),
    category: sanitizeText(source.category || cfg.defaultCategory, 40).toLowerCase(),
    icon: sanitizeText(source.icon || cfg.icon, 8),
    markerStyle: sanitizeText(source.markerStyle || cfg.markerStyle, 32).toLowerCase(),
    tagsText: sanitizeText(source.tagsText || '', 160),
    placeKind: sanitizeText(source.placeKind || '', 48).toLowerCase(),
    website: sanitizeHttpUrl(source.website || '', 240),
    phone: sanitizeText(source.phone || '', 40),
    hours: sanitizeText(source.hours || '', 120),
    accessNotes: sanitizeMultilineText(source.accessNotes || '', 180),
    buildingUse: sanitizeText(source.buildingUse || '', 60),
    entranceLabel: sanitizeText(source.entranceLabel || '', 60),
    floorLabel: sanitizeText(source.floorLabel || '', 40),
    roomLabel: sanitizeText(source.roomLabel || '', 80),
    photoUrl: sanitizeHttpUrl(source.photoUrl || '', 320),
    photoCaption: sanitizeText(source.photoCaption || '', 160),
    photoAttribution: sanitizeText(source.photoAttribution || '', 120)
  };
}

function contributionTargetValidForType(editType, target) {
  const cfg = getContributionEditTypeConfig(editType);
  const anchorKind = String(target?.anchorKind || 'world').toLowerCase();
  return cfg.targetKinds.includes(anchorKind);
}

function previewLocationLabel(target = {}) {
  return sanitizeText(
    target.buildingLabel ||
    target.destinationLabel ||
    target.locationLabel ||
    'Current Location',
    120
  );
}

function previewSummaryLine(payload = {}, target = {}) {
  const parts = [
    sanitizeText(payload?.title || '', 80),
    sanitizeText(target?.buildingLabel || target?.destinationLabel || target?.locationLabel || '', 120),
    `${clampLat(target?.lat).toFixed(5)}, ${wrapLon(target?.lon).toFixed(5)}`
  ].filter(Boolean);
  return parts.join(' • ');
}

function serializeContributionDoc(docLike = {}, options = {}) {
  const data = typeof docLike.data === 'function' ? docLike.data() || {} : docLike || {};
  const editType = sanitizeContributionEditType(data.editType);
  const target = normalizeContributionTarget(data.target || {});
  const payload = normalizeContributionPayload(data.payload || {}, editType);
  const status = sanitizeContributionStatus(data.status);
  const moderation = data.moderation && typeof data.moderation === 'object'
    ? {
        moderatedBy: sanitizeText(data.moderation.moderatedBy || '', 120),
        moderatedByName: sanitizeText(data.moderation.moderatedByName || '', 60),
        moderatedAtMs: timestampToMillis(data.moderation.moderatedAt),
        decisionNote: sanitizeMultilineText(data.moderation.decisionNote || '', 200)
      }
    : null;

  return {
    id: sanitizeText(docLike.id || data.id || '', 180),
    editType,
    editTypeLabel: getContributionEditTypeConfig(editType).label,
    status,
    worldKind: sanitizeWorldKind(data.worldKind || 'earth'),
    areaKey: sanitizeText(data.areaKey || computeContributionAreaKey(target.lat, target.lon, data.worldKind), 64),
    source: sanitizeText(data.source || 'editor-v1', 48),
    userId: sanitizeText(data.userId || '', 160),
    userDisplayName: sanitizeText(data.userDisplayName || 'Explorer', 60),
    target,
    payload,
    moderation,
    createdAtMs: timestampToMillis(data.createdAt),
    updatedAtMs: timestampToMillis(data.updatedAt),
    preview: {
      title: sanitizeText(payload.title || 'Untitled contribution', 80),
      summary: previewSummaryLine(payload, target),
      locationLabel: previewLocationLabel(target),
      hasPhoto: !!payload.photoUrl,
      buildingLabel: sanitizeText(target.buildingLabel || '', 120),
      destinationLabel: sanitizeText(target.destinationLabel || '', 120)
    },
    reviewerOnly: options.reviewerOnly === true ? {
      openStreetMapUrl: `https://www.openstreetmap.org/?mlat=${clampLat(target.lat).toFixed(6)}&mlon=${wrapLon(target.lon).toFixed(6)}#map=19/${clampLat(target.lat).toFixed(6)}/${wrapLon(target.lon).toFixed(6)}`
    } : undefined
  };
}

async function requireModerator(req, res) {
  const auth = await verifyAuth(req, res);
  if (!auth) return null;

  try {
    const authUser = await admin.auth().getUser(auth.uid);
    const userSnap = await db.collection('users').doc(auth.uid).get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};
    const claimAdmin = auth.admin === true || String(auth.role || '').toLowerCase() === 'admin';
    const storedAdmin = String(userData.subscriptionStatus || '').toLowerCase() === 'admin';
    const allowlisted = isAllowlistedAdminCandidate(authUser, auth.uid);
    if (!claimAdmin && !storedAdmin && !allowlisted.allowed) {
      res.status(403).json({ error: 'Admin access is required for moderation.' });
      return null;
    }
    return {
      auth,
      authUser,
      userData,
      displayName: sanitizeText(authUser.displayName || authUser.email || userData.displayName || 'Admin', 60)
    };
  } catch (err) {
    console.error('[moderation] moderator verification failed:', err);
    res.status(500).json({ error: 'Unable to verify moderator access right now.' });
    return null;
  }
}

function contributionNotificationEnabled(cfg = contributionNotificationConfig()) {
  return !!(cfg.resendApiKey && cfg.emailFrom && cfg.adminNotificationEmail);
}

async function logAdminActivity(entry = {}) {
  const actorUid = sanitizeText(entry.actorUid || '', 160);
  const actorName = sanitizeText(entry.actorName || '', 80);
  const actionType = sanitizeText(entry.actionType || '', 80);
  const targetType = sanitizeText(entry.targetType || '', 80);
  const targetId = sanitizeText(entry.targetId || '', 180);
  if (!actorUid || !actionType || !targetType || !targetId) return;

  await db.collection(ADMIN_ACTIVITY_COLLECTION).add({
    actorUid,
    actorName,
    actionType,
    targetType,
    targetId,
    title: sanitizeText(entry.title || '', 140),
    summary: sanitizeMultilineText(entry.summary || '', 320),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtMs: Date.now()
  });
}

async function sendContributionNotificationEmail(submission) {
  const cfg = contributionNotificationConfig();
  if (!contributionNotificationEnabled(cfg)) {
    return { sent: false, reason: 'not-configured' };
  }

  const title = sanitizeText(submission?.payload?.title || 'Untitled contribution', 80);
  const typeLabel = sanitizeText(submission?.editTypeLabel || 'Contribution', 60);
  const locationLabel = previewLocationLabel(submission?.target || {});
  const coords = `${clampLat(submission?.target?.lat).toFixed(5)}, ${wrapLon(submission?.target?.lon).toFixed(5)}`;
  const reviewUrl = String(cfg.moderationPanelUrl || 'https://worldexplorer3d.io/account/admin.html?view=moderation').trim();
  const subject = `World Explorer pending contribution: ${typeLabel} — ${title}`;
  const text = [
    'A new World Explorer contribution is waiting for review.',
    '',
    `Type: ${typeLabel}`,
    `Title: ${title}`,
    `Submitted by: ${sanitizeText(submission?.userDisplayName || 'Explorer', 60)} (${sanitizeText(submission?.userId || '', 160)})`,
    `Location: ${locationLabel}`,
    `Coordinates: ${coords}`,
    `Review: ${reviewUrl}`,
    '',
    'This submission is pending and is not live yet.'
  ].join('\n');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.resendApiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'WorldExplorer3D-Functions/1.0'
    },
    body: JSON.stringify({
      from: cfg.emailFrom,
      to: [cfg.adminNotificationEmail],
      subject,
      text,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#102033">
          <h2>New World Explorer contribution</h2>
          <p>A new contribution is waiting for review.</p>
          <ul>
            <li><strong>Type:</strong> ${typeLabel}</li>
            <li><strong>Title:</strong> ${title}</li>
            <li><strong>Submitted by:</strong> ${sanitizeText(submission?.userDisplayName || 'Explorer', 60)}</li>
            <li><strong>Location:</strong> ${locationLabel}</li>
            <li><strong>Coordinates:</strong> ${coords}</li>
          </ul>
          <p><a href="${reviewUrl}">Open the moderation panel</a></p>
          <p>This submission is pending and is not visible in the live world yet.</p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`Email notification failed (${response.status}): ${raw.slice(0, 200)}`);
  }

  return { sent: true };
}

async function listContributionCounts() {
  try {
    const statuses = ['pending', 'approved', 'rejected'];
    const entries = await Promise.all(statuses.map(async (status) => {
      const snap = await db.collection('editorSubmissions').where('status', '==', status).count().get();
      return [status, Number(snap.data()?.count || 0)];
    }));
    return Object.fromEntries(entries);
  } catch (err) {
    console.warn('[moderation] count query failed:', err?.message || err);
    return {};
  }
}

function isAllowlistedAdminCandidate(authUser, uid) {
  const cfg = adminConfig();
  const allowedUidSet = parseCsvSet(cfg.allowedUids);
  if (allowedUidSet.has(String(uid || '').trim())) {
    return { allowed: true, source: 'uid' };
  }

  const allowedEmailSet = parseCsvSet(cfg.allowedEmails, normalizeEmail);
  const email = normalizeEmail(authUser && authUser.email ? authUser.email : '');
  if (email && allowedEmailSet.has(email)) {
    if (authUser && authUser.emailVerified === true) {
      return { allowed: true, source: 'email' };
    }
    return { allowed: false, reason: 'Email is allowlisted but not verified yet.' };
  }

  return { allowed: false, reason: 'Your account is not on the admin allowlist.' };
}

function getStripeClient() {
  const cfg = stripeConfig();
  if (!cfg.secret) {
    throw new Error('Stripe secret is missing. Set WE3D_STRIPE_SECRET (Firebase param or env).');
  }
  return new Stripe(cfg.secret, { apiVersion: '2024-06-20' });
}

function planEntitlements(plan) {
  const normalized = normalizePlan(plan);

  if (normalized === 'pro') {
    return {
      fullAccess: true,
      cloudSync: true,
      proEarlyAccess: true,
      prioritySupport: true,
      featureConsideration: true,
      directContact: true
    };
  }

  if (normalized === 'supporter' || normalized === 'trial') {
    return {
      fullAccess: true,
      cloudSync: true,
      proEarlyAccess: false,
      prioritySupport: false,
      featureConsideration: false,
      directContact: false
    };
  }

  return {
    fullAccess: true,
    cloudSync: true,
    proEarlyAccess: false,
    prioritySupport: false,
    featureConsideration: false,
    directContact: false
  };
}

function normalizePlan(plan) {
  const lowered = String(plan || '').toLowerCase();
  if (lowered === 'support') return 'supporter';
  if (lowered === 'pro' || lowered === 'supporter' || lowered === 'trial') return lowered;
  return 'free';
}

function roomCreateLimitForPlan(plan) {
  const normalized = normalizePlan(plan);
  return ROOM_CREATE_LIMITS[normalized] || ROOM_CREATE_LIMITS.free;
}

function normalizeRoomCreateCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10000, Math.floor(n)));
}

function normalizeRoomCreateLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10000, Math.floor(n)));
}

function hasActiveSubscription(status) {
  return ACTIVE_SUB_STATUSES.has(String(status || '').toLowerCase());
}

function normalizeOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  } catch (_) {
    return '';
  }
}

function allowedOrigins() {
  const configured = parseCsvSet(
    readParamString(PARAM_ALLOWED_ORIGINS, process.env.WE3D_ALLOWED_ORIGINS || ''),
    normalizeOrigin
  );
  const projectId = String(process.env.GCLOUD_PROJECT || '').trim();
  const defaults = new Set(DEFAULT_ALLOWED_ORIGINS);

  if (projectId) {
    defaults.add(`https://${projectId}.web.app`);
    defaults.add(`https://${projectId}.firebaseapp.com`);
  }

  configured.forEach((origin) => defaults.add(origin));
  return defaults;
}

function originIsAllowed(origin, allowlist) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (normalized.startsWith('http://localhost:')) return true;
  if (normalized.startsWith('http://127.0.0.1:')) return true;
  return allowlist.has(normalized);
}

function setCors(req, res) {
  const requestOrigin = req.get('origin') || '';
  const allowlist = allowedOrigins();

  if (requestOrigin && !originIsAllowed(requestOrigin, allowlist)) {
    res.status(403).json({ error: 'Origin not allowed.' });
    return true;
  }

  const allowOrigin = requestOrigin || '*';
  res.set('Access-Control-Allow-Origin', allowOrigin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }

  return false;
}

async function verifyAuth(req, res) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Missing bearer token.' });
    return null;
  }

  try {
    return await admin.auth().verifyIdToken(token);
  } catch (err) {
    console.error('[auth] verifyIdToken failed:', err);
    res.status(401).json({ error: 'Invalid auth token.' });
    return null;
  }
}

function currentBaseUrl(req) {
  const explicitOrigin = req.get('origin');
  if (explicitOrigin) return explicitOrigin.replace(/\/$/, '');

  const host = req.get('host');
  if (host) {
    const isLocal = host.includes('localhost') || host.startsWith('127.0.0.1');
    return `${isLocal ? 'http' : 'https'}://${host}`;
  }

  return `https://${process.env.GCLOUD_PROJECT}.web.app`;
}

function sanitizeReturnBaseUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';

  try {
    const parsed = new URL(value);
    const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocal)) {
      return '';
    }

    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '');
  } catch (_) {
    return '';
  }
}

function resolveReturnBaseUrl(req) {
  const candidate = req && req.body && typeof req.body.returnUrlBase === 'string' ? req.body.returnUrlBase : '';
  const sanitized = sanitizeReturnBaseUrl(candidate);
  return sanitized || currentBaseUrl(req);
}

function planFromPriceId(priceId, cfg) {
  if (!priceId) return 'free';
  if (priceId === cfg.price_pro) return 'pro';
  if (priceId === cfg.price_supporter) return 'supporter';
  return 'free';
}

function priceIdForPlan(plan, cfg) {
  const normalized = normalizePlan(plan);
  if (normalized === 'pro') return cfg.price_pro;
  if (normalized === 'supporter') return cfg.price_supporter;
  return '';
}

function parsePositiveInt(value, fallback = 20, min = 1, max = 50) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function isFailedPreconditionError(err) {
  const code = err && err.code;
  if (Number(code) === 9) return true;
  return String(code || '').toLowerCase() === 'failed-precondition';
}

async function deleteDocsByQuery(query, batchSize = 200, label = '') {
  const limit = Math.max(10, Math.min(500, Number(batchSize) || 200));
  for (;;) {
    let snap;
    try {
      snap = await query.limit(limit).get();
    } catch (err) {
      if (isFailedPreconditionError(err)) {
        const tag = label ? ` (${label})` : '';
        console.warn(`[deleteAccount] Skipping query cleanup${tag}: Firestore failed precondition.`, err && err.message ? err.message : err);
        return;
      }
      throw err;
    }
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    if (snap.size < limit) return;
  }
}

async function deleteRoomTree(roomRef) {
  if (db && typeof db.recursiveDelete === 'function') {
    await db.recursiveDelete(roomRef);
    return;
  }

  const subcollections = ['players', 'chat', 'chatState', 'artifacts', 'blocks', 'paintClaims', 'state'];
  for (const name of subcollections) {
    await deleteDocsByQuery(roomRef.collection(name));
  }
  await roomRef.delete();
}

async function deleteUserData(uid) {
  if (!uid) return;

  const userRef = db.collection('users').doc(uid);
  const creatorProfileRef = db.collection(CREATOR_PROFILES_COLLECTION).doc(uid);

  const ownedRoomsSnap = await db.collection('rooms').where('ownerUid', '==', uid).get();
  for (const roomDoc of ownedRoomsSnap.docs) {
    await deleteRoomTree(roomDoc.ref);
  }

  await deleteDocsByQuery(db.collectionGroup('players').where('uid', '==', uid), 200, 'players(uid)');
  await deleteDocsByQuery(db.collectionGroup('chatState').where('uid', '==', uid), 200, 'chatState(uid)');
  await deleteDocsByQuery(db.collectionGroup('friends').where('uid', '==', uid), 200, 'friends(uid)');
  await deleteDocsByQuery(db.collectionGroup('recentPlayers').where('uid', '==', uid), 200, 'recentPlayers(uid)');
  await deleteDocsByQuery(db.collectionGroup('incomingInvites').where('fromUid', '==', uid), 200, 'incomingInvites(fromUid)');
  await deleteDocsByQuery(db.collectionGroup('artifacts').where('ownerUid', '==', uid), 200, 'artifacts(ownerUid)');
  await deleteDocsByQuery(db.collectionGroup('blocks').where('createdBy', '==', uid), 200, 'blocks(createdBy)');
  await deleteDocsByQuery(db.collectionGroup('paintClaims').where('uid', '==', uid), 200, 'paintClaims(uid)');

  await deleteDocsByQuery(db.collection('flowerLeaderboard').where('uid', '==', uid), 200, 'flowerLeaderboard(uid)');
  await deleteDocsByQuery(db.collection('paintTownLeaderboard').where('uid', '==', uid), 200, 'paintTownLeaderboard(uid)');
  await deleteDocsByQuery(db.collection('activityFeed').where('uid', '==', uid), 200, 'activityFeed(uid)');
  await db.collection('explorerLeaderboard').doc(uid).delete().catch(() => {});

  if (db && typeof db.recursiveDelete === 'function') {
    await db.recursiveDelete(userRef);
  } else {
    await deleteDocsByQuery(userRef.collection('friends'), 200, 'users/{uid}/friends');
    await deleteDocsByQuery(userRef.collection('recentPlayers'), 200, 'users/{uid}/recentPlayers');
    await deleteDocsByQuery(userRef.collection('incomingInvites'), 200, 'users/{uid}/incomingInvites');
    await deleteDocsByQuery(userRef.collection('myRooms'), 200, 'users/{uid}/myRooms');
    await userRef.delete().catch(() => {});
  }
  await creatorProfileRef.delete().catch(() => {});
}

function timestampToMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDisplayName(value) {
  const cleaned = String(value || '').trim().replace(/\s+/g, ' ');
  return cleaned.slice(0, 60);
}

async function assertStripeCustomerOwnership(stripe, customerId, uid, expectedEmail = '') {
  if (!stripe || !customerId || !uid) return false;
  const customer = await stripe.customers.retrieve(customerId);
  if (!customer || customer.deleted) return false;

  const metadataUid = customer.metadata && customer.metadata.uid ? String(customer.metadata.uid) : '';
  if (metadataUid && metadataUid === uid) return true;

  const normalizedExpectedEmail = String(expectedEmail || '').trim().toLowerCase();
  const normalizedCustomerEmail = String(customer.email || '').trim().toLowerCase();
  if (!normalizedExpectedEmail || normalizedExpectedEmail !== normalizedCustomerEmail) {
    return false;
  }

  const nextMetadata = {
    ...(customer.metadata || {}),
    uid
  };
  await stripe.customers.update(customerId, { metadata: nextMetadata });
  return true;
}

async function ensureUserDoc(uid, email, displayName) {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  const normalizedDisplayName = normalizeDisplayName(displayName);

  if (snap.exists) {
    const existing = snap.data() || {};
    const plan = normalizePlan(existing.plan);
    const roomCreateCount = normalizeRoomCreateCount(existing.roomCreateCount);
    const existingLimit = Number.isFinite(Number(existing.roomCreateLimit))
      ? Math.max(0, Math.min(10000, Math.floor(Number(existing.roomCreateLimit))))
      : null;
    const isAdminOverride = String(existing.subscriptionStatus || '').toLowerCase() === 'admin';
    const roomCreateLimit = isAdminOverride
      ? Math.max(existingLimit || 0, ADMIN_TEST_ROOM_CREATE_LIMIT)
      : roomCreateLimitForPlan(plan);
    await ref.set(
      {
        email: email || existing.email || '',
        displayName: normalizedDisplayName || existing.displayName || 'Explorer',
        roomCreateCount,
        roomCreateLimit,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    await ensureCreatorProfileDoc(db, uid, {
      username: normalizedDisplayName || existing.displayName || 'Explorer'
    });
    return {
      ...existing,
      roomCreateCount,
      roomCreateLimit
    };
  }

  const plan = 'free';
  const created = {
    uid,
    email: email || '',
    displayName: normalizedDisplayName || 'Explorer',
    plan,
    trialEndsAt: null,
    subscriptionStatus: 'none',
    entitlements: planEntitlements(plan),
    roomCreateCount: 0,
    roomCreateLimit: roomCreateLimitForPlan(plan),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await ref.set(created, { merge: true });
  await ensureCreatorProfileDoc(db, uid, {
    username: normalizedDisplayName || 'Explorer'
  });
  return created;
}

async function resolveUidFromCustomer(customerId) {
  if (!customerId) return null;
  const snap = await db.collection('users').where('stripeCustomerId', '==', customerId).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}

async function resolveFallbackPlan(uid) {
  const snap = await db.collection('users').doc(uid).get();
  const data = snap.exists ? snap.data() || {} : {};
  const trialEndsAt = data.trialEndsAt && typeof data.trialEndsAt.toMillis === 'function' ? data.trialEndsAt.toMillis() : null;

  if (trialEndsAt && trialEndsAt > Date.now()) {
    return 'trial';
  }

  return 'free';
}

async function upsertPlanFromSubscription({ uid, customerId, subscriptionId, status, priceId }) {
  if (!uid) return;

  const cfg = stripeConfig();
  const paidPlan = planFromPriceId(priceId, cfg);
  const active = hasActiveSubscription(status);
  const fallbackPlan = active ? 'free' : await resolveFallbackPlan(uid);
  const plan = active ? normalizePlan(paidPlan) : fallbackPlan;
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? userSnap.data() || {} : {};
  const roomCreateCount = normalizeRoomCreateCount(userData.roomCreateCount);
  const isAdminOverride = String(userData.subscriptionStatus || '').toLowerCase() === 'admin';
  const existingLimit = Number.isFinite(Number(userData.roomCreateLimit))
    ? Math.max(0, Math.min(10000, Math.floor(Number(userData.roomCreateLimit))))
    : 0;
  const roomCreateLimit = isAdminOverride
    ? Math.max(existingLimit, ADMIN_TEST_ROOM_CREATE_LIMIT)
    : roomCreateLimitForPlan(plan);

  await userRef.set(
    {
      stripeCustomerId: customerId || null,
      stripeSubscriptionId: subscriptionId || null,
      subscriptionStatus: status || 'none',
      plan,
      entitlements: planEntitlements(plan),
      roomCreateCount,
      roomCreateLimit,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}

exports.createCheckoutSession = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const auth = await verifyAuth(req, res);
  if (!auth) return;

  try {
    const requestedPlan = normalizePlan(req.body && req.body.plan);
    if (!ALLOWED_PLANS.has(requestedPlan)) {
      res.status(400).json({ error: 'Invalid plan. Use support/supporter or pro.' });
      return;
    }

    const cfg = stripeConfig();
    const priceId = priceIdForPlan(requestedPlan, cfg);
    if (!priceId) {
      res.status(500).json({ error: `Missing Stripe price ID for ${requestedPlan}.` });
      return;
    }

    const userRecord = await admin.auth().getUser(auth.uid);
    const userDoc = await ensureUserDoc(auth.uid, userRecord.email || '', userRecord.displayName || '');

    const stripe = getStripeClient();
    let customerId = userDoc.stripeCustomerId || null;

    if (customerId) {
      const ownedByUser = await assertStripeCustomerOwnership(
        stripe,
        customerId,
        auth.uid,
        userRecord.email || userDoc.email || ''
      );
      if (!ownedByUser) {
        customerId = null;
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userRecord.email || undefined,
        name: userRecord.displayName || undefined,
        metadata: { uid: auth.uid }
      });
      customerId = customer.id;
      await db.collection('users').doc(auth.uid).set(
        {
          stripeCustomerId: customerId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    const baseUrl = resolveReturnBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/account/?checkout=success`,
      cancel_url: `${baseUrl}/account/?checkout=cancel`,
      client_reference_id: auth.uid,
      metadata: {
        uid: auth.uid,
        plan: requestedPlan
      },
      subscription_data: {
        metadata: {
          uid: auth.uid,
          plan: requestedPlan
        }
      }
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[createCheckoutSession] failed:', err);
    res.status(500).json({ error: 'Unable to create checkout session.' });
  }
});

exports.createPortalSession = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const auth = await verifyAuth(req, res);
  if (!auth) return;

  try {
    const stripe = getStripeClient();
    const userRef = db.collection('users').doc(auth.uid);
    const authUser = await admin.auth().getUser(auth.uid);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};

    let customerId = userData.stripeCustomerId || null;
    if (!customerId) {
      res.status(400).json({ error: 'No Stripe customer found for this account.' });
      return;
    }

    const ownedByUser = await assertStripeCustomerOwnership(
      stripe,
      customerId,
      auth.uid,
      authUser.email || userData.email || ''
    );
    if (!ownedByUser) {
      res.status(403).json({ error: 'Stripe customer ownership could not be verified.' });
      return;
    }

    const baseUrl = resolveReturnBaseUrl(req);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/account/`
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[createPortalSession] failed:', err);
    res.status(500).json({ error: 'Unable to create billing portal session.' });
  }
});

exports.startTrial = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const auth = await verifyAuth(req, res);
  if (!auth) return;

  try {
    const authUser = await admin.auth().getUser(auth.uid);
    const existing = await ensureUserDoc(auth.uid, authUser.email || '', authUser.displayName || '');
    const nowMs = Date.now();

    const existingPlan = normalizePlan(existing.plan);
    const subscriptionStatus = String(existing.subscriptionStatus || 'none');
    const trialEndsAtMs = timestampToMillis(existing.trialEndsAt) || timestampToMillis(existing.trialEndsAtMs);
    const trialConsumedAtMs = timestampToMillis(existing.trialConsumedAt) || timestampToMillis(existing.trialConsumedAtMs);

    if (existingPlan === 'supporter' || existingPlan === 'pro' || hasActiveSubscription(subscriptionStatus)) {
      res.status(200).json({
        status: 'already-paid',
        plan: existingPlan,
        trialEndsAtMs: trialEndsAtMs || null
      });
      return;
    }

    if (existingPlan === 'trial' && trialEndsAtMs && trialEndsAtMs > nowMs) {
      const trialEndsAtIsTimestamp = existing.trialEndsAt && typeof existing.trialEndsAt.toMillis === 'function';
      const trialStartsAtIsTimestamp = existing.trialStartsAt && typeof existing.trialStartsAt.toMillis === 'function';
      const trialConsumedAtIsTimestamp = existing.trialConsumedAt && typeof existing.trialConsumedAt.toMillis === 'function';

      if (!trialEndsAtIsTimestamp || !trialStartsAtIsTimestamp || !trialConsumedAtIsTimestamp) {
        const normalizedTrialEndsAt = admin.firestore.Timestamp.fromMillis(trialEndsAtMs);
        const normalizedTrialStartMs = trialStartsAtIsTimestamp
          ? existing.trialStartsAt.toMillis()
          : Math.max(nowMs - TRIAL_DURATION_MS, trialEndsAtMs - TRIAL_DURATION_MS);
        const normalizedTrialStartsAt = admin.firestore.Timestamp.fromMillis(normalizedTrialStartMs);
        const normalizedTrialConsumedAt = trialConsumedAtIsTimestamp
          ? existing.trialConsumedAt
          : normalizedTrialStartsAt;
        const roomCreateCount = normalizeRoomCreateCount(existing.roomCreateCount);
        const roomCreateLimit = Math.max(
          roomCreateLimitForPlan('trial'),
          normalizeRoomCreateLimit(existing.roomCreateLimit)
        );

        await db.collection('users').doc(auth.uid).set(
          {
            plan: 'trial',
            trialStartsAt: normalizedTrialStartsAt,
            trialEndsAt: normalizedTrialEndsAt,
            trialConsumedAt: normalizedTrialConsumedAt,
            entitlements: planEntitlements('trial'),
            roomCreateCount,
            roomCreateLimit,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      }

      res.status(200).json({
        status: 'already-active',
        plan: 'trial',
        trialEndsAtMs
      });
      return;
    }

    if (trialConsumedAtMs || (trialEndsAtMs && trialEndsAtMs <= nowMs)) {
      res.status(403).json({
        error: 'Trial already used. Upgrade to Supporter or Pro for multiplayer access.'
      });
      return;
    }

    const trialStartsAt = admin.firestore.Timestamp.fromMillis(nowMs);
    const trialEndsAt = admin.firestore.Timestamp.fromMillis(nowMs + TRIAL_DURATION_MS);
    const roomCreateCount = normalizeRoomCreateCount(existing.roomCreateCount);
    const roomCreateLimit = roomCreateLimitForPlan('trial');
    await db.collection('users').doc(auth.uid).set(
      {
        uid: auth.uid,
        email: authUser.email || existing.email || '',
        displayName: authUser.displayName || existing.displayName || '',
        plan: 'trial',
        subscriptionStatus,
        trialStartsAt,
        trialEndsAt,
        trialConsumedAt: trialStartsAt,
        entitlements: planEntitlements('trial'),
        roomCreateCount,
        roomCreateLimit,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    res.status(200).json({
      status: 'activated',
      plan: 'trial',
      trialEndsAtMs: nowMs + TRIAL_DURATION_MS
    });
  } catch (err) {
    console.error('[startTrial] failed:', err);
    res.status(500).json({ error: 'Unable to start trial right now.' });
  }
});

exports.enableAdminTester = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const auth = await verifyAuth(req, res);
  if (!auth) return;

  try {
    const authUser = await admin.auth().getUser(auth.uid);
    const allowlistResult = isAllowlistedAdminCandidate(authUser, auth.uid);
    if (!allowlistResult.allowed) {
      res.status(403).json({
        error: allowlistResult.reason || 'Account is not allowlisted for admin access.'
      });
      return;
    }

    const existingClaims = authUser.customClaims || {};
    const nextClaims = {
      ...existingClaims,
      admin: true,
      role: 'admin'
    };
    const claimsChanged = existingClaims.admin !== true || existingClaims.role !== 'admin';
    if (claimsChanged) {
      await admin.auth().setCustomUserClaims(auth.uid, nextClaims);
    }

    const existingDoc = await ensureUserDoc(
      auth.uid,
      authUser.email || '',
      authUser.displayName || ''
    );
    const roomCreateCount = normalizeRoomCreateCount(existingDoc.roomCreateCount);
    const roomCreateLimit = ADMIN_TEST_ROOM_CREATE_LIMIT;

    await db.collection('users').doc(auth.uid).set(
      {
        uid: auth.uid,
        email: authUser.email || existingDoc.email || '',
        displayName: authUser.displayName || existingDoc.displayName || '',
        plan: 'pro',
        subscriptionStatus: 'admin',
        entitlements: planEntitlements('pro'),
        roomCreateCount,
        roomCreateLimit,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    res.status(200).json({
      enabled: true,
      plan: 'pro',
      subscriptionStatus: 'admin',
      roomCreateLimit,
      claimsChanged,
      allowlistSource: allowlistResult.source
    });
  } catch (err) {
    console.error('[enableAdminTester] failed:', err);
    res.status(500).json({ error: 'Unable to enable admin test access right now.' });
  }
});

exports.getAccountOverview = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const auth = await verifyAuth(req, res);
  if (!auth) return;

  try {
    const userRef = db.collection('users').doc(auth.uid);
    const authUser = await admin.auth().getUser(auth.uid);
    const customClaims = authUser.customClaims || {};
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};

    const plan = normalizePlan(userData.plan);
    const trialStartsAtMs = timestampToMillis(userData.trialStartsAt);
    const trialEndsAtMs = timestampToMillis(userData.trialEndsAt);
    const trialConsumedAtMs = timestampToMillis(userData.trialConsumedAt);
    const stripeCustomerId = userData.stripeCustomerId || null;
    const stripeSubscriptionId = userData.stripeSubscriptionId || null;
    const roomCreateCount = normalizeRoomCreateCount(userData.roomCreateCount);
    const rawRoomCreateLimit = Number.isFinite(Number(userData.roomCreateLimit))
      ? Math.max(0, Math.min(10000, Math.floor(Number(userData.roomCreateLimit))))
      : roomCreateLimitForPlan(plan);
    const planRoomCreateLimit = roomCreateLimitForPlan(plan);
    const isAdmin = customClaims.admin === true ||
      String(customClaims.role || '').toLowerCase() === 'admin' ||
      String(userData.subscriptionStatus || '').toLowerCase() === 'admin';
    const allowlistResult = isAllowlistedAdminCandidate(authUser, auth.uid);
    const roomCreateLimit = isAdmin
      ? Math.max(rawRoomCreateLimit, ADMIN_TEST_ROOM_CREATE_LIMIT)
      : planRoomCreateLimit;

    const overview = {
      uid: auth.uid,
      email: authUser.email || userData.email || '',
      emailVerified: !!authUser.emailVerified,
      displayName: authUser.displayName || userData.displayName || '',
      isAdmin,
      adminTesterEligible: !!allowlistResult.allowed,
      role: isAdmin ? 'admin' : 'member',
      providers: Array.isArray(authUser.providerData) ? authUser.providerData.map((p) => p.providerId).filter(Boolean) : [],
      authCreatedAt: authUser.metadata && authUser.metadata.creationTime ? authUser.metadata.creationTime : null,
      authLastSignInAt: authUser.metadata && authUser.metadata.lastSignInTime ? authUser.metadata.lastSignInTime : null,
      plan,
      subscriptionStatus: String(userData.subscriptionStatus || 'none'),
      trialStartsAtMs,
      trialEndsAtMs,
      trialConsumedAtMs,
      stripeCustomerId,
      stripeSubscriptionId,
      roomCreateCount,
      roomCreateLimit,
      nextBillingAtMs: null,
      cancelAtPeriodEnd: null
    };

    if (stripeCustomerId && stripeSubscriptionId) {
      try {
        const stripe = getStripeClient();
        const ownedByUser = await assertStripeCustomerOwnership(
          stripe,
          stripeCustomerId,
          auth.uid,
          overview.email || userData.email || ''
        );
        if (!ownedByUser) {
          throw new Error('Stripe customer ownership mismatch.');
        }
        const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        if (String(subscription.customer || '') !== String(stripeCustomerId)) {
          throw new Error('Stripe subscription/customer mismatch.');
        }
        overview.subscriptionStatus = String(subscription.status || overview.subscriptionStatus || 'none');
        overview.nextBillingAtMs = subscription.current_period_end ? Number(subscription.current_period_end) * 1000 : null;
        overview.cancelAtPeriodEnd = !!subscription.cancel_at_period_end;
      } catch (err) {
        console.warn('[getAccountOverview] Unable to load subscription details:', err.message || err);
      }
    }

    res.status(200).json({ overview });
  } catch (err) {
    console.error('[getAccountOverview] failed:', err);
    res.status(500).json({ error: 'Unable to load account overview.' });
  }
});

exports.listBillingReceipts = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const auth = await verifyAuth(req, res);
  if (!auth) return;

  try {
    const userRef = db.collection('users').doc(auth.uid);
    const authUser = await admin.auth().getUser(auth.uid);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};
    const stripeCustomerId = userData.stripeCustomerId || null;

    if (!stripeCustomerId) {
      res.status(200).json({ receipts: [] });
      return;
    }

    const stripe = getStripeClient();
    const ownedByUser = await assertStripeCustomerOwnership(
      stripe,
      stripeCustomerId,
      auth.uid,
      authUser.email || userData.email || ''
    );
    if (!ownedByUser) {
      res.status(403).json({ error: 'Stripe customer ownership could not be verified.' });
      return;
    }

    const listLimit = parsePositiveInt(req.body && req.body.limit, 20, 1, 40);
    const startingAfter = req.body && typeof req.body.startingAfter === 'string' ? req.body.startingAfter.trim() : '';

    const params = {
      customer: stripeCustomerId,
      limit: listLimit
    };
    if (startingAfter) params.starting_after = startingAfter;

    const invoiceList = await stripe.invoices.list(params);
    const receipts = Array.isArray(invoiceList.data) ? invoiceList.data.map((invoice) => ({
      id: invoice.id,
      number: invoice.number || invoice.id,
      status: invoice.status || 'unknown',
      currency: String(invoice.currency || 'usd').toUpperCase(),
      total: Number.isFinite(invoice.total) ? invoice.total : 0,
      amountPaid: Number.isFinite(invoice.amount_paid) ? invoice.amount_paid : 0,
      amountDue: Number.isFinite(invoice.amount_due) ? invoice.amount_due : 0,
      createdAtMs: invoice.created ? Number(invoice.created) * 1000 : null,
      paidAtMs: invoice.status_transitions && invoice.status_transitions.paid_at
        ? Number(invoice.status_transitions.paid_at) * 1000
        : null,
      periodStartMs: invoice.period_start ? Number(invoice.period_start) * 1000 : null,
      periodEndMs: invoice.period_end ? Number(invoice.period_end) * 1000 : null,
      hostedInvoiceUrl: invoice.hosted_invoice_url || null,
      invoicePdfUrl: invoice.invoice_pdf || null
    })) : [];

    res.status(200).json({
      receipts,
      hasMore: !!invoiceList.has_more
    });
  } catch (err) {
    console.error('[listBillingReceipts] failed:', err);
    res.status(500).json({ error: 'Unable to load billing receipts.' });
  }
});

exports.updateAccountProfile = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const auth = await verifyAuth(req, res);
  if (!auth) return;

  try {
    const displayName = normalizeDisplayName(req.body && req.body.displayName);
    const bio = sanitizeCreatorProfileMultilineText(req.body && req.body.bio, 320);
    const avatar = sanitizeAvatar(req.body && req.body.avatar);
    if (!displayName) {
      res.status(400).json({ error: 'Display name is required.' });
      return;
    }

    await admin.auth().updateUser(auth.uid, { displayName });
    await db.collection('users').doc(auth.uid).set({
      displayName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    const creatorProfile = await mergeCreatorProfile(db, auth.uid, {
      username: sanitizeUsername(displayName, 'Explorer'),
      bio,
      avatar
    });

    res.status(200).json({
      displayName,
      creatorProfile
    });
  } catch (err) {
    console.error('[updateAccountProfile] failed:', err);
    res.status(500).json({ error: 'Unable to update account profile.' });
  }
});

exports.deleteAccount = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const auth = await verifyAuth(req, res);
  if (!auth) return;

  const confirmation = String(req.body && req.body.confirmation ? req.body.confirmation : '').trim();
  if (confirmation !== 'DELETE') {
    res.status(400).json({ error: 'Confirmation token is missing. Send confirmation: DELETE.' });
    return;
  }

  const authTimeSec = Number(auth.auth_time || 0);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authTimeSec) || authTimeSec <= 0 || nowSec - authTimeSec > DELETE_ACCOUNT_MAX_AUTH_AGE_SECONDS) {
    res.status(401).json({ error: 'Recent sign-in required. Sign out and sign in again, then retry account deletion.' });
    return;
  }

  try {
    const uid = auth.uid;
    const userRef = db.collection('users').doc(uid);
    const authUser = await admin.auth().getUser(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};

    const stripeCustomerId = String(userData.stripeCustomerId || '').trim();
    const stripeSubscriptionId = String(userData.stripeSubscriptionId || '').trim();
    if (stripeSubscriptionId) {
      const stripe = getStripeClient();
      if (stripeCustomerId) {
        const ownedByUser = await assertStripeCustomerOwnership(
          stripe,
          stripeCustomerId,
          uid,
          authUser.email || userData.email || ''
        );
        if (!ownedByUser) {
          res.status(403).json({ error: 'Unable to verify billing ownership for account deletion.' });
          return;
        }
      }

      try {
        const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        const normalizedStatus = String(subscription && subscription.status ? subscription.status : '').toLowerCase();
        if (normalizedStatus && normalizedStatus !== 'canceled' && normalizedStatus !== 'incomplete_expired') {
          await stripe.subscriptions.cancel(stripeSubscriptionId);
        }
      } catch (err) {
        console.error('[deleteAccount] subscription cancel failed:', err);
        res.status(500).json({ error: 'Could not cancel active subscription. Try again or contact support.' });
        return;
      }
    }

    await deleteUserData(uid);
    await admin.auth().deleteUser(uid);

    res.status(200).json({ deleted: true });
  } catch (err) {
    console.error('[deleteAccount] failed:', err);
    res.status(500).json({ error: 'Unable to delete account right now.' });
  }
});

exports.submitContribution = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const auth = await verifyAuth(req, res);
  if (!auth) return;

  try {
    const authUser = await admin.auth().getUser(auth.uid);
    await ensureUserDoc(auth.uid, authUser.email || '', authUser.displayName || '');

    const editType = sanitizeContributionEditType(req.body && req.body.editType);
    const worldKind = sanitizeWorldKind(req.body && req.body.worldKind);
    const source = sanitizeText(req.body && req.body.source ? req.body.source : 'editor-v2', 48) || 'editor-v2';
    const target = normalizeContributionTarget(req.body && req.body.target ? req.body.target : {});
    const payload = normalizeContributionPayload(req.body && req.body.payload ? req.body.payload : {}, editType);
    const areaKey = computeContributionAreaKey(target.lat, target.lon, worldKind);
    const userDisplayName = sanitizeText(
      req.body && req.body.userDisplayName ? req.body.userDisplayName : (authUser.displayName || authUser.email || 'Explorer'),
      60
    ) || 'Explorer';
    const typeConfig = getContributionEditTypeConfig(editType);

    if (!payload.title) {
      res.status(400).json({ error: 'Add a short title before submitting.' });
      return;
    }
    if (editType === 'photo_point' && !payload.photoUrl) {
      res.status(400).json({ error: 'Add a photo URL before submitting a photo contribution.' });
      return;
    }
    if (!contributionTargetValidForType(editType, target)) {
      res.status(400).json({ error: 'This contribution type needs a valid world, building, destination, or interior target.' });
      return;
    }
    if (typeConfig.requiresScopedTarget === true && target.anchorKind === 'world') {
      res.status(400).json({ error: 'Capture a building, destination, or interior target before submitting this contribution type.' });
      return;
    }

    const createdAt = admin.firestore.FieldValue.serverTimestamp();
    const ref = await db.collection('editorSubmissions').add({
      editType,
      status: 'pending',
      worldKind,
      areaKey,
      target,
      payload,
      userId: auth.uid,
      userDisplayName,
      source,
      createdAt,
      updatedAt: createdAt
    });

    const savedSnap = await ref.get();
    const saved = serializeContributionDoc(savedSnap, { reviewerOnly: true });
    let notification = { sent: false, reason: 'not-configured' };
    try {
      notification = await sendContributionNotificationEmail(saved);
    } catch (err) {
      notification = { sent: false, reason: 'send-failed' };
      console.error('[submitContribution] notification failed:', err);
    }

    res.status(200).json({
      id: ref.id,
      status: 'pending',
      notification
    });
  } catch (err) {
    console.error('[submitContribution] failed:', err);
    res.status(500).json({ error: 'Could not save this contribution right now.' });
  }
});

exports.getContributionModerationOverview = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const moderator = await requireModerator(req, res);
  if (!moderator) return;

  try {
    const counts = await listContributionCounts();
    const notificationCfg = contributionNotificationConfig();
    res.status(200).json({
      reviewer: {
        uid: moderator.auth.uid,
        displayName: moderator.displayName,
        email: sanitizeText(moderator.authUser.email || '', 120)
      },
      summary: counts,
      notifications: {
        configured: contributionNotificationEnabled(notificationCfg),
        adminEmail: sanitizeText(notificationCfg.adminNotificationEmail || '', 160),
        moderationPanelUrl: sanitizeText(notificationCfg.moderationPanelUrl || '', 320)
      }
    });
  } catch (err) {
    console.error('[getContributionModerationOverview] failed:', err);
    res.status(500).json({ error: 'Unable to load moderation overview.' });
  }
});

exports.listContributionSubmissions = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const moderator = await requireModerator(req, res);
  if (!moderator) return;

  try {
    const rawStatus = sanitizeText(req.body && req.body.status ? req.body.status : 'pending', 20).toLowerCase();
    const status = rawStatus === 'all' ? 'all' : sanitizeContributionStatus(rawStatus);
    const editTypeFilter = sanitizeText(req.body && req.body.editType ? req.body.editType : 'all', 40).toLowerCase() || 'all';
    const search = sanitizeText(req.body && req.body.search ? req.body.search : '', 80).toLowerCase();
    const limitValue = parsePositiveInt(req.body && req.body.limit, 60, 1, CONTRIBUTION_MAX_RESULTS);

    const baseRef = db.collection('editorSubmissions');
    const queryRef = status !== 'all'
      ? baseRef.where('status', '==', status).orderBy('createdAt', 'desc').limit(limitValue)
      : baseRef.orderBy('createdAt', 'desc').limit(limitValue);

    const snap = await queryRef.get();
    let items = snap.docs.map((row) => serializeContributionDoc(row, { reviewerOnly: true }));

    if (editTypeFilter !== 'all' && CONTRIBUTION_EDIT_TYPES.has(editTypeFilter)) {
      items = items.filter((item) => item.editType === editTypeFilter);
    }
    if (search) {
      items = items.filter((item) => {
        const haystack = [
          item.payload?.title,
          item.payload?.subtitle,
          item.payload?.note,
          item.userDisplayName,
          item.target?.locationLabel,
          item.target?.buildingLabel,
          item.target?.destinationLabel,
          item.payload?.photoCaption,
          item.payload?.buildingUse,
          item.payload?.roomLabel
        ].join(' ').toLowerCase();
        return haystack.includes(search);
      });
    }

    const counts = await listContributionCounts();
    const notificationCfg = contributionNotificationConfig();
    res.status(200).json({
      items,
      summary: counts,
      reviewer: {
        uid: moderator.auth.uid,
        displayName: moderator.displayName,
        email: sanitizeText(moderator.authUser.email || '', 120)
      },
      notifications: {
        configured: contributionNotificationEnabled(notificationCfg),
        adminEmail: sanitizeText(notificationCfg.adminNotificationEmail || '', 160),
        moderationPanelUrl: sanitizeText(notificationCfg.moderationPanelUrl || '', 320)
      }
    });
  } catch (err) {
    console.error('[listContributionSubmissions] failed:', err);
    res.status(500).json({ error: 'Unable to load contribution submissions.' });
  }
});

exports.moderateContributionSubmission = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const moderator = await requireModerator(req, res);
  if (!moderator) return;

  try {
    const submissionId = sanitizeText(req.body && req.body.submissionId ? req.body.submissionId : '', 180);
    const status = sanitizeContributionStatus(req.body && req.body.status ? req.body.status : 'pending');
    const decisionNote = sanitizeMultilineText(req.body && req.body.decisionNote ? req.body.decisionNote : '', 200);
    if (!submissionId) {
      res.status(400).json({ error: 'Missing submission id.' });
      return;
    }
    if (status !== 'approved' && status !== 'rejected') {
      res.status(400).json({ error: 'Moderation status must be approved or rejected.' });
      return;
    }

    const ref = db.collection('editorSubmissions').doc(submissionId);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).json({ error: 'Contribution submission not found.' });
      return;
    }

    const existing = snap.data() || {};
    if (sanitizeContributionStatus(existing.status) !== 'pending') {
      res.status(409).json({ error: 'This submission has already been reviewed.' });
      return;
    }

    await ref.set({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      moderation: {
        moderatedBy: moderator.auth.uid,
        moderatedByName: moderator.displayName,
        moderatedAt: admin.firestore.FieldValue.serverTimestamp(),
        decisionNote
      }
    }, { merge: true });

    const updatedSnap = await ref.get();
    await logAdminActivity({
      actorUid: moderator.auth.uid,
      actorName: moderator.displayName,
      actionType: status === 'approved' ? 'legacy_submission.approve' : 'legacy_submission.reject',
      targetType: 'legacy_submission',
      targetId: submissionId,
      title: status === 'approved' ? 'Legacy contribution approved' : 'Legacy contribution rejected',
      summary: `${sanitizeText(existing.payload?.title || existing.editType || submissionId, 120)} is now ${status}.`
    });
    res.status(200).json({
      item: serializeContributionDoc(updatedSnap, { reviewerOnly: true })
    });
  } catch (err) {
    console.error('[moderateContributionSubmission] failed:', err);
    res.status(500).json({ error: 'Could not update moderation status right now.' });
  }
});

exports.stripeWebhook = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const cfg = stripeConfig();
  if (!cfg.webhook) {
    res.status(500).send('Missing Stripe webhook secret.');
    return;
  }

  let event;
  try {
    const stripe = getStripeClient();
    const signature = req.get('stripe-signature');
    event = stripe.webhooks.constructEvent(req.rawBody, signature, cfg.webhook);
  } catch (err) {
    console.error('[stripeWebhook] signature verification failed:', err);
    res.status(400).send('Webhook signature verification failed.');
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = session.customer || null;
        const subscriptionId = session.subscription || null;
        let uid = (session.metadata && session.metadata.uid) || session.client_reference_id || null;

        if (!uid) {
          uid = await resolveUidFromCustomer(customerId);
        }

        if (uid) {
          const stripe = getStripeClient();
          let status = 'active';
          let priceId = null;

          if (subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            status = subscription.status || status;
            priceId =
              subscription.items &&
              subscription.items.data &&
              subscription.items.data[0] &&
              subscription.items.data[0].price
                ? subscription.items.data[0].price.id
                : null;
          }

          await upsertPlanFromSubscription({
            uid,
            customerId,
            subscriptionId,
            status,
            priceId
          });
        }

        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer || null;
        const subscriptionId = subscription.id || null;
        const status = subscription.status || 'none';
        const priceId =
          subscription.items &&
          subscription.items.data &&
          subscription.items.data[0] &&
          subscription.items.data[0].price
            ? subscription.items.data[0].price.id
            : null;

        let uid = (subscription.metadata && subscription.metadata.uid) || null;
        if (!uid) {
          uid = await resolveUidFromCustomer(customerId);
        }

        if (uid) {
          await upsertPlanFromSubscription({
            uid,
            customerId,
            subscriptionId,
            status,
            priceId
          });
        }

        break;
      }

      default:
        break;
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[stripeWebhook] processing failed:', err);
    res.status(500).send('Webhook processing failed.');
  }
});

Object.assign(exports, buildOverlayExports({
  setCors,
  verifyAuth,
  requireModerator,
  logAdminActivity,
  mergeCreatorProfile
}));

Object.assign(exports, buildAdminDashboardExports({
  setCors,
  requireModerator,
  adminConfig,
  contributionNotificationConfig,
  contributionNotificationEnabled,
  logAdminActivity
}));
