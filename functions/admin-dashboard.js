const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const OVERLAY_FEATURES_COLLECTION = 'overlayFeatures';
const OVERLAY_PUBLISHED_COLLECTION = 'overlayPublished';
const OVERLAY_REVISIONS_SUBCOLLECTION = 'revisions';
const OVERLAY_MODERATION_SUBCOLLECTION = 'moderation';
const LEGACY_SUBMISSIONS_COLLECTION = 'editorSubmissions';
const USERS_COLLECTION = 'users';
const ROOMS_COLLECTION = 'rooms';
const PLAYERS_SUBCOLLECTION = 'players';
const SITE_CONTENT_COLLECTION = 'siteContent';
const SITE_CONTENT_PUBLISHED_COLLECTION = 'siteContentPublished';
const ADMIN_ACTIVITY_COLLECTION = 'adminActivity';
const LANDING_CONTENT_ENTRY_ID = 'landingPage';
const MAX_RESULTS = 120;
const ACTIVE_ROOM_PLAYER_GRACE_MS = 90 * 1000;

function sanitizeText(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function sanitizeLongText(value, max = 600) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .trim()
    .slice(0, max);
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(value, min, max, fallback) {
  const n = Math.floor(finiteNumber(value, fallback));
  return Math.max(min, Math.min(max, n));
}

function timestampToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function boolFromValue(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function uniqueStrings(values = [], max = 24, itemMax = 80) {
  const out = [];
  const seen = new Set();
  values.forEach((value) => {
    const clean = sanitizeText(value, itemMax);
    if (!clean || seen.has(clean) || out.length >= max) return;
    seen.add(clean);
    out.push(clean);
  });
  return out;
}

function normalizeLandingContent(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const announcement = source.announcement && typeof source.announcement === 'object' ? source.announcement : {};
  const hero = source.hero && typeof source.hero === 'object' ? source.hero : {};
  const meta = source.meta && typeof source.meta === 'object' ? source.meta : {};
  const sections = source.sections && typeof source.sections === 'object' ? source.sections : {};
  const highlights = Array.isArray(source.highlights) ? source.highlights : [];

  return {
    meta: {
      title: sanitizeText(meta.title || 'World Explorer 3D | Explore Any Place on Earth and Beyond', 120),
      description: sanitizeText(
        meta.description || 'Explore real places, Live Earth systems, local weather, buildings, oceans, orbit, and the Moon in one browser-based world.',
        240
      )
    },
    announcement: {
      enabled: announcement.enabled === true,
      eyebrow: sanitizeText(announcement.eyebrow || 'Platform Update', 48),
      title: sanitizeText(announcement.title || '', 120),
      body: sanitizeLongText(announcement.body || '', 260),
      linkLabel: sanitizeText(announcement.linkLabel || '', 48),
      linkHref: sanitizeText(announcement.linkHref || '', 320),
      tone: ['info', 'success', 'warning'].includes(sanitizeText(announcement.tone || 'info', 20))
        ? sanitizeText(announcement.tone || 'info', 20)
        : 'info'
    },
    hero: {
      brand: sanitizeText(hero.brand || 'World Explorer 3D', 80),
      headline: sanitizeText(hero.headline || 'An interactive digital Earth for exploration, discovery, and contribution.', 180),
      lead: sanitizeLongText(
        hero.lead || 'Explore real locations by land, sea, air, or space, experience the real sky and environment, and help expand a shared 3D world built from geographic data.',
        320
      ),
      primaryCtaLabel: sanitizeText(hero.primaryCtaLabel || 'Play Now', 40),
      secondaryCtaLabel: sanitizeText(hero.secondaryCtaLabel || 'Sign In for Multiplayer', 48),
      tertiaryCtaLabel: sanitizeText(hero.tertiaryCtaLabel || 'Account', 32),
      performanceNote: sanitizeLongText(
        hero.performanceNote || 'Performance note: Desktop recommended for best frame rate and rendering quality.',
        180
      )
    },
    sections: {
      highlightsTitle: sanitizeText(sections.highlightsTitle || 'Platform Highlights', 80)
    },
    highlights: highlights.slice(0, 8).map((item, index) => {
      const sourceItem = item && typeof item === 'object' ? item : {};
      return {
        id: sanitizeText(sourceItem.id || `highlight_${index + 1}`, 40),
        title: sanitizeText(sourceItem.title || '', 80),
        body: sanitizeLongText(sourceItem.body || '', 220)
      };
    })
  };
}

function normalizeSiteContentEntryId(value) {
  const clean = sanitizeText(value || LANDING_CONTENT_ENTRY_ID, 80);
  return clean === LANDING_CONTENT_ENTRY_ID ? clean : LANDING_CONTENT_ENTRY_ID;
}

function normalizeAdminActivityEntry(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    actionType: sanitizeText(source.actionType || '', 80),
    targetType: sanitizeText(source.targetType || '', 80),
    targetId: sanitizeText(source.targetId || '', 180),
    title: sanitizeText(source.title || '', 140),
    summary: sanitizeLongText(source.summary || '', 320),
    actorUid: sanitizeText(source.actorUid || '', 160),
    actorName: sanitizeText(source.actorName || '', 80),
    createdAtMs: finiteNumber(source.createdAtMs, 0)
  };
}

function overlaySummary(feature = {}) {
  const tags = feature.tags && typeof feature.tags === 'object' ? feature.tags : {};
  const threeD = feature.threeD && typeof feature.threeD === 'object' ? feature.threeD : {};
  const moderation = feature.moderation && typeof feature.moderation === 'object' ? feature.moderation : {};
  return {
    featureId: sanitizeText(feature.featureId || '', 180),
    presetId: sanitizeText(feature.presetId || '', 80),
    featureClass: sanitizeText(feature.featureClass || '', 40),
    geometryType: sanitizeText(feature.geometryType || '', 20),
    reviewState: sanitizeText(feature.reviewState || 'draft', 40),
    publicationState: sanitizeText(feature.publicationState || 'unpublished', 40),
    mergeMode: sanitizeText(feature.mergeMode || 'additive', 40),
    sourceType: sanitizeText(feature.sourceType || 'overlay_new', 40),
    worldKind: sanitizeText(feature.worldKind || 'earth', 24),
    areaKey: sanitizeText(feature.areaKey || '', 64),
    summary: sanitizeText(feature.summary || tags.name || feature.baseFeatureRef?.displayName || feature.presetId || 'Overlay feature', 140),
    createdBy: sanitizeText(feature.createdBy || '', 160),
    createdByName: sanitizeText(feature.createdByName || 'Explorer', 80),
    updatedByName: sanitizeText(feature.updatedByName || '', 80),
    version: clampInt(feature.version, 1, 9999, 1),
    createdAtMs: finiteNumber(feature.createdAtMs, timestampToMillis(feature.createdAt)),
    updatedAtMs: finiteNumber(feature.updatedAtMs, timestampToMillis(feature.updatedAt)),
    submittedAtMs: finiteNumber(feature.submittedAtMs, timestampToMillis(feature.submittedAt)),
    approvedAtMs: finiteNumber(feature.approvedAtMs, timestampToMillis(feature.approvedAt)),
    publishedAtMs: finiteNumber(feature.publishedAtMs, timestampToMillis(feature.publishedAt)),
    baseFeatureRef: {
      featureId: sanitizeText(feature.baseFeatureRef?.featureId || '', 180),
      displayName: sanitizeText(feature.baseFeatureRef?.displayName || '', 120),
      featureType: sanitizeText(feature.baseFeatureRef?.featureType || '', 40)
    },
    tags: {
      name: sanitizeText(tags.name || '', 120),
      highway: sanitizeText(tags.highway || '', 60),
      railway: sanitizeText(tags.railway || '', 60),
      building: sanitizeText(tags.building || '', 60),
      amenity: sanitizeText(tags.amenity || '', 80),
      landuse: sanitizeText(tags.landuse || '', 80),
      natural: sanitizeText(tags.natural || '', 80),
      surface: sanitizeText(tags.surface || threeD.surface || '', 80)
    },
    threeD: {
      height: Number.isFinite(Number(threeD.height)) ? Number(threeD.height) : null,
      buildingLevels: Number.isFinite(Number(threeD.buildingLevels)) ? Number(threeD.buildingLevels) : null,
      minHeight: Number.isFinite(Number(threeD.minHeight)) ? Number(threeD.minHeight) : null,
      roofShape: sanitizeText(threeD.roofShape || '', 40),
      layer: Number.isFinite(Number(threeD.layer)) ? Number(threeD.layer) : 0,
      bridge: threeD.bridge === true,
      tunnel: threeD.tunnel === true,
      entranceCount: Array.isArray(threeD.entrances) ? threeD.entrances.length : 0
    },
    relations: {
      level: sanitizeText(feature.relations?.level || feature.level || '', 40),
      buildingRef: sanitizeText(feature.relations?.buildingRef || feature.buildingRef || '', 180)
    },
    bbox: {
      minLat: finiteNumber(feature.bbox?.minLat, 0),
      minLon: finiteNumber(feature.bbox?.minLon, 0),
      maxLat: finiteNumber(feature.bbox?.maxLat, 0),
      maxLon: finiteNumber(feature.bbox?.maxLon, 0)
    },
    center: {
      lat: finiteNumber(feature.center?.lat, 0),
      lon: finiteNumber(feature.center?.lon, 0)
    },
    validation: {
      valid: feature.validation?.valid !== false,
      issues: Array.isArray(feature.validation?.issues)
        ? feature.validation.issues.slice(0, 12).map((issue) => ({
            code: sanitizeText(issue.code || '', 60),
            severity: sanitizeText(issue.severity || 'info', 20),
            message: sanitizeText(issue.message || '', 180),
            hint: sanitizeText(issue.hint || '', 220)
          }))
        : []
    },
    submission: {
      contributorNote: sanitizeLongText(feature.submission?.contributorNote || '', 320),
      generatedSummary: sanitizeText(feature.submission?.generatedSummary || '', 240),
      changeSummary: sanitizeText(feature.submission?.changeSummary || '', 180),
      editIntent: sanitizeText(feature.submission?.editIntent || '', 120)
    },
    moderation: {
      note: sanitizeLongText(moderation.note || '', 320),
      actorUid: sanitizeText(moderation.actorUid || '', 160),
      actorName: sanitizeText(moderation.actorName || '', 80)
    }
  };
}

function legacySubmissionSummary(data = {}, submissionId = '') {
  const payload = data.payload && typeof data.payload === 'object' ? data.payload : {};
  const target = data.target && typeof data.target === 'object' ? data.target : {};
  const moderation = data.moderation && typeof data.moderation === 'object' ? data.moderation : {};
  return {
    id: sanitizeText(submissionId || '', 180),
    source: 'legacy',
    editType: sanitizeText(data.editType || '', 40),
    status: sanitizeText(data.status || 'pending', 20),
    title: sanitizeText(payload.title || 'Untitled contribution', 140),
    subtitle: sanitizeText(payload.subtitle || '', 140),
    note: sanitizeLongText(payload.note || '', 320),
    userId: sanitizeText(data.userId || '', 160),
    userDisplayName: sanitizeText(data.userDisplayName || 'Explorer', 80),
    worldKind: sanitizeText(data.worldKind || 'earth', 24),
    areaKey: sanitizeText(data.areaKey || '', 64),
    locationLabel: sanitizeText(target.locationLabel || '', 120),
    buildingLabel: sanitizeText(target.buildingLabel || '', 120),
    destinationLabel: sanitizeText(target.destinationLabel || '', 120),
    target,
    payload,
    moderation: {
      moderatedBy: sanitizeText(moderation.moderatedBy || '', 160),
      moderatedByName: sanitizeText(moderation.moderatedByName || '', 80),
      decisionNote: sanitizeLongText(moderation.decisionNote || '', 200),
      moderatedAtMs: timestampToMillis(moderation.moderatedAt)
    },
    createdAtMs: timestampToMillis(data.createdAt),
    updatedAtMs: timestampToMillis(data.updatedAt)
  };
}

function roomSummary(roomId, data = {}, occupancy = null) {
  const locationTag = data.locationTag && typeof data.locationTag === 'object' ? data.locationTag : {};
  return {
    roomId: sanitizeText(roomId || data.code || '', 80),
    code: sanitizeText(data.code || roomId || '', 80),
    name: sanitizeText(data.name || '', 120),
    visibility: sanitizeText(data.visibility || 'private', 20),
    featured: data.featured === true,
    ownerUid: sanitizeText(data.ownerUid || '', 160),
    cityKey: sanitizeText(data.cityKey || '', 48),
    worldKind: sanitizeText(data.world?.kind || 'earth', 20),
    worldSeed: sanitizeText(data.world?.seed || '', 120),
    locationLabel: sanitizeText(locationTag.label || '', 120),
    locationCity: sanitizeText(locationTag.city || '', 120),
    maxPlayers: clampInt(data.maxPlayers, 2, 64, 10),
    activePlayers: Number.isFinite(Number(occupancy?.activePlayers)) ? Number(occupancy.activePlayers) : null,
    artifactCount: Number.isFinite(Number(occupancy?.artifactCount)) ? Number(occupancy.artifactCount) : null,
    blockCount: Number.isFinite(Number(occupancy?.blockCount)) ? Number(occupancy.blockCount) : null,
    createdAtMs: timestampToMillis(data.createdAt),
    updatedAtMs: timestampToMillis(data.updatedAt),
    rules: data.rules && typeof data.rules === 'object' ? {
      allowChat: data.rules.allowChat !== false,
      allowGhosts: data.rules.allowGhosts !== false,
      paintTimeLimitSec: clampInt(data.rules.paintTimeLimitSec, 30, 1800, 120),
      paintTouchMode: sanitizeText(data.rules.paintTouchMode || 'any', 20)
    } : {}
  };
}

async function safeCount(queryLike) {
  try {
    const snap = await queryLike.count().get();
    return Number(snap.data()?.count || 0);
  } catch (_) {
    return 0;
  }
}

function docRecencyMs(data = {}) {
  return Math.max(
    finiteNumber(data.updatedAtMs, 0),
    timestampToMillis(data.updatedAt),
    finiteNumber(data.createdAtMs, 0),
    timestampToMillis(data.createdAt)
  );
}

function compareRecentDocs(a = {}, b = {}) {
  return docRecencyMs(b) - docRecencyMs(a);
}

async function listAuthUsersWindow(limitValue = 60) {
  const target = clampInt(limitValue, 1, 2000, 60);
  const users = [];
  let pageToken = undefined;

  while (users.length < target) {
    const pageSize = Math.min(1000, target - users.length);
    const page = await admin.auth().listUsers(pageSize, pageToken);
    users.push(...(Array.isArray(page.users) ? page.users : []));
    if (!page.pageToken) break;
    pageToken = page.pageToken;
  }

  return users;
}

async function getUserProfileMap(uids = []) {
  const uniqueUids = uniqueStrings(uids, 500, 160);
  if (!uniqueUids.length) return new Map();
  const refs = uniqueUids.map((uid) => db.collection(USERS_COLLECTION).doc(uid));
  const snaps = await db.getAll(...refs);
  const out = new Map();
  snaps.forEach((snap) => {
    out.set(snap.id, snap.exists ? (snap.data() || {}) : {});
  });
  return out;
}

function adminUserSummary(uid = '', profile = {}, authUser = null) {
  const claims = authUser?.customClaims || {};
  const subscriptionStatus = sanitizeText(profile.subscriptionStatus || 'none', 20).toLowerCase();
  const isAdmin =
    claims.admin === true ||
    String(claims.role || '').toLowerCase() === 'admin' ||
    subscriptionStatus === 'admin';
  const createdAtMs = Math.max(
    timestampToMillis(profile.createdAt),
    timestampToMillis(authUser?.metadata?.creationTime)
  );
  const updatedAtMs = Math.max(
    timestampToMillis(profile.updatedAt),
    timestampToMillis(authUser?.metadata?.lastSignInTime),
    createdAtMs
  );
  return {
    uid: sanitizeText(uid || authUser?.uid || '', 160),
    displayName: sanitizeText(profile.displayName || authUser?.displayName || 'Explorer', 80),
    email: sanitizeText(profile.email || authUser?.email || '', 160),
    role: isAdmin ? 'admin' : 'member',
    plan: sanitizeText(profile.plan || (isAdmin ? 'pro' : 'free'), 20).toLowerCase(),
    subscriptionStatus,
    roomCreateCount: clampInt(profile.roomCreateCount, 0, 10000, 0),
    roomCreateLimit: clampInt(profile.roomCreateLimit, 0, 10000, isAdmin ? 10000 : 0),
    createdAtMs,
    updatedAtMs,
    lastSignInAtMs: timestampToMillis(authUser?.metadata?.lastSignInTime)
  };
}

async function listRecentRoomDocs(limitValue = 24) {
  const target = clampInt(limitValue, 1, 120, 24);
  const seen = new Map();

  const collect = (snap) => {
    snap?.docs?.forEach((row) => {
      if (!seen.has(row.id)) seen.set(row.id, row.data() || {});
    });
  };

  try {
    collect(await db.collection(ROOMS_COLLECTION).orderBy('updatedAt', 'desc').limit(target * 2).get());
  } catch (_) {
    // Some older docs may not have updatedAt indexed or populated.
  }

  try {
    if (seen.size < target) {
      collect(await db.collection(ROOMS_COLLECTION).orderBy('createdAt', 'desc').limit(target * 2).get());
    }
  } catch (_) {
    // Fall back to unordered reads below.
  }

  if (seen.size < target) {
    collect(await db.collection(ROOMS_COLLECTION).limit(Math.max(target * 4, 60)).get());
  }

  return [...seen.entries()]
    .sort((a, b) => compareRecentDocs(a[1], b[1]))
    .slice(0, target)
    .map(([id, data]) => ({ id, data }));
}

async function listRecentAdminActivity(limitValue = 12) {
  try {
    const snap = await db
      .collection(ADMIN_ACTIVITY_COLLECTION)
      .orderBy('createdAtMs', 'desc')
      .limit(clampInt(limitValue, 1, 50, 12))
      .get();
    return snap.docs.map((row) => normalizeAdminActivityEntry(row.data() || {}));
  } catch (_) {
    return [];
  }
}

async function computeRoomOccupancy(roomId, maxPlayers = 10) {
  const now = Date.now();
  const playersSnap = await db
    .collection(ROOMS_COLLECTION)
    .doc(roomId)
    .collection(PLAYERS_SUBCOLLECTION)
    .limit(Math.max(10, Math.min(80, clampInt(maxPlayers, 2, 64, 10) + 12)))
    .get();
  let activePlayers = 0;
  playersSnap.forEach((row) => {
    const data = row.data() || {};
    const expiresAtMs = timestampToMillis(data.expiresAt);
    if (!expiresAtMs || expiresAtMs >= now - ACTIVE_ROOM_PLAYER_GRACE_MS) activePlayers += 1;
  });
  const [artifactCount, blockCount] = await Promise.all([
    safeCount(db.collection(ROOMS_COLLECTION).doc(roomId).collection('artifacts')),
    safeCount(db.collection(ROOMS_COLLECTION).doc(roomId).collection('blocks'))
  ]);
  return { activePlayers, artifactCount, blockCount };
}

function buildAlerts(summary = {}) {
  const alerts = [];
  const pendingTotal = Number(summary.pendingOverlay || 0) + Number(summary.pendingLegacy || 0);
  if (pendingTotal > 0) {
    alerts.push({
      severity: pendingTotal > 12 ? 'warning' : 'info',
      title: `${pendingTotal} item${pendingTotal === 1 ? '' : 's'} waiting for review`,
      detail: `${Number(summary.pendingOverlay || 0)} overlay submission${Number(summary.pendingOverlay || 0) === 1 ? '' : 's'} and ${Number(summary.pendingLegacy || 0)} legacy contribution${Number(summary.pendingLegacy || 0) === 1 ? '' : 's'} are pending.`
    });
  }
  if (summary.notificationConfigured !== true) {
    alerts.push({
      severity: 'warning',
      title: 'Moderation email notifications are not configured',
      detail: 'Pending contribution alerts will not be emailed until Resend and admin notification settings are configured in Functions.'
    });
  }
  if (!summary.siteContentPublishedAtMs) {
    alerts.push({
      severity: 'info',
      title: 'Landing page is still using file defaults',
      detail: 'Publish landing content from the Site Content section to move public messaging into admin-managed content.'
    });
  }
  if (!alerts.length) {
    alerts.push({
      severity: 'success',
      title: 'No operational alerts',
      detail: 'Moderation queues, public content, and admin systems look stable right now.'
    });
  }
  return alerts;
}

function matchesSearch(haystack = [], term = '') {
  if (!term) return true;
  const needle = sanitizeText(term, 80).toLowerCase();
  if (!needle) return true;
  return haystack.join(' ').toLowerCase().includes(needle);
}

function matchesTimeWindow(createdAtMs, windowKey = 'all') {
  const created = finiteNumber(createdAtMs, 0);
  if (!created) return windowKey === 'all';
  const now = Date.now();
  if (windowKey === '24h') return created >= now - 24 * 60 * 60 * 1000;
  if (windowKey === '7d') return created >= now - 7 * 24 * 60 * 60 * 1000;
  if (windowKey === '30d') return created >= now - 30 * 24 * 60 * 60 * 1000;
  return true;
}

function buildAdminDashboardExports(helpers = {}) {
  const setCors = helpers.setCors;
  const requireModerator = helpers.requireModerator;
  const adminConfig = typeof helpers.adminConfig === 'function' ? helpers.adminConfig : (() => ({}));
  const contributionNotificationConfig =
    typeof helpers.contributionNotificationConfig === 'function'
      ? helpers.contributionNotificationConfig
      : (() => ({}));
  const contributionNotificationEnabled =
    typeof helpers.contributionNotificationEnabled === 'function'
      ? helpers.contributionNotificationEnabled
      : (() => false);
  const logAdminActivity =
    typeof helpers.logAdminActivity === 'function'
      ? helpers.logAdminActivity
      : async () => {};

  return {
    getAdminDashboardOverview: functions.region('us-central1').https.onRequest(async (req, res) => {
      if (setCors(req, res)) return;
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const moderator = await requireModerator(req, res);
      if (!moderator) return;
      try {
        const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const notificationCfg = contributionNotificationConfig();
        const [pendingOverlay, needsChangesOverlay, publishedOverlay, pendingLegacy, approvedLegacy, rejectedLegacy, authUsers, totalRooms, publicRooms, featuredRooms, recentActivity, recentRoomRows, publishedLandingSnap] = await Promise.all([
          safeCount(db.collection(OVERLAY_FEATURES_COLLECTION).where('reviewState', '==', 'submitted')),
          safeCount(db.collection(OVERLAY_FEATURES_COLLECTION).where('reviewState', '==', 'needs_changes')),
          safeCount(db.collection(OVERLAY_PUBLISHED_COLLECTION)),
          safeCount(db.collection(LEGACY_SUBMISSIONS_COLLECTION).where('status', '==', 'pending')),
          safeCount(db.collection(LEGACY_SUBMISSIONS_COLLECTION).where('status', '==', 'approved')),
          safeCount(db.collection(LEGACY_SUBMISSIONS_COLLECTION).where('status', '==', 'rejected')),
          listAuthUsersWindow(2000).catch(async () => {
            const snap = await db.collection(USERS_COLLECTION).limit(2000).get();
            return snap.docs.map((row) => ({ uid: row.id, metadata: { creationTime: row.data()?.createdAt || null } }));
          }),
          safeCount(db.collection(ROOMS_COLLECTION)),
          safeCount(db.collection(ROOMS_COLLECTION).where('visibility', '==', 'public')),
          safeCount(db.collection(ROOMS_COLLECTION).where('featured', '==', true)),
          listRecentAdminActivity(10),
          listRecentRoomDocs(5),
          db.collection(SITE_CONTENT_PUBLISHED_COLLECTION).doc(LANDING_CONTENT_ENTRY_ID).get()
        ]);

        const totalUsers = Array.isArray(authUsers) ? authUsers.length : 0;
        const newUsers7d = Array.isArray(authUsers)
          ? authUsers.filter((user) => timestampToMillis(user?.metadata?.creationTime) >= sevenDaysAgoMs).length
          : 0;
        const recentRooms = [];
        for (const row of recentRoomRows) {
          const data = row.data || {};
          const occupancy = await computeRoomOccupancy(row.id, data.maxPlayers);
          recentRooms.push(roomSummary(row.id, data, occupancy));
        }

        const publishedAtMs = publishedLandingSnap.exists ? timestampToMillis(publishedLandingSnap.data()?.publishedAt) : 0;
        const summary = {
          pendingOverlay,
          needsChangesOverlay,
          publishedOverlay,
          pendingLegacy,
          approvedLegacy,
          rejectedLegacy,
          totalUsers,
          newUsers7d,
          totalRooms,
          publicRooms,
          featuredRooms,
          notificationConfigured: contributionNotificationEnabled(notificationCfg),
          notificationEmail: sanitizeText(notificationCfg.adminNotificationEmail || '', 160),
          moderationPanelUrl: sanitizeText(notificationCfg.moderationPanelUrl || '', 320),
          siteContentPublishedAtMs: publishedAtMs
        };

        res.status(200).json({
          reviewer: {
            uid: moderator.auth.uid,
            displayName: moderator.displayName,
            email: sanitizeText(moderator.authUser.email || '', 120)
          },
          summary,
          alerts: buildAlerts(summary),
          recentActivity,
          recentRooms
        });
      } catch (error) {
        console.error('[getAdminDashboardOverview] failed:', error);
        res.status(500).json({ error: error?.message || 'Could not load the admin dashboard overview.' });
      }
    }),

    listAdminOverlayFeatures: functions.region('us-central1').https.onRequest(async (req, res) => {
      if (setCors(req, res)) return;
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const moderator = await requireModerator(req, res);
      if (!moderator) return;
      try {
        const limitValue = clampInt(req.body?.limit, 10, MAX_RESULTS, 60);
        const reviewState = sanitizeText(req.body?.reviewState || 'submitted', 40).toLowerCase();
        const presetFilter = sanitizeText(req.body?.presetId || '', 80).toLowerCase();
        const geometryType = sanitizeText(req.body?.geometryType || '', 20);
        const contributor = sanitizeText(req.body?.contributor || '', 80);
        const region = sanitizeText(req.body?.region || '', 80);
        const search = sanitizeText(req.body?.search || '', 80);
        const timeWindow = sanitizeText(req.body?.timeWindow || 'all', 20).toLowerCase();

        const snap = await db.collection(OVERLAY_FEATURES_COLLECTION).orderBy('updatedAtMs', 'desc').limit(limitValue * 2).get();
        let items = snap.docs.map((row) => overlaySummary(row.data() || {}));
        items = items.filter((item) => {
          if (reviewState && reviewState !== 'all' && item.reviewState !== reviewState) return false;
          if (presetFilter && item.presetId !== presetFilter) return false;
          if (geometryType && geometryType !== 'all' && item.geometryType !== geometryType) return false;
          if (!matchesTimeWindow(item.updatedAtMs || item.createdAtMs, timeWindow)) return false;
          if (contributor && !matchesSearch([item.createdByName, item.createdBy], contributor)) return false;
          if (region && !matchesSearch([item.areaKey, item.baseFeatureRef.displayName], region)) return false;
          if (!matchesSearch([
            item.summary,
            item.presetId,
            item.featureClass,
            item.createdByName,
            item.baseFeatureRef.displayName,
            item.tags.name,
            item.tags.highway,
            item.tags.building,
            item.tags.amenity
          ], search)) return false;
          return true;
        }).slice(0, limitValue);

        const summary = {
          submitted: await safeCount(db.collection(OVERLAY_FEATURES_COLLECTION).where('reviewState', '==', 'submitted')),
          approved: await safeCount(db.collection(OVERLAY_FEATURES_COLLECTION).where('reviewState', '==', 'approved')),
          rejected: await safeCount(db.collection(OVERLAY_FEATURES_COLLECTION).where('reviewState', '==', 'rejected')),
          needsChanges: await safeCount(db.collection(OVERLAY_FEATURES_COLLECTION).where('reviewState', '==', 'needs_changes')),
          published: await safeCount(db.collection(OVERLAY_PUBLISHED_COLLECTION))
        };

        res.status(200).json({ items, summary });
      } catch (error) {
        console.error('[listAdminOverlayFeatures] failed:', error);
        res.status(500).json({ error: error?.message || 'Could not load overlay moderation items.' });
      }
    }),

    getAdminOverlayFeatureDetail: functions.region('us-central1').https.onRequest(async (req, res) => {
      if (setCors(req, res)) return;
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const moderator = await requireModerator(req, res);
      if (!moderator) return;
      try {
        const featureId = sanitizeText(req.body?.featureId || '', 180);
        if (!featureId) {
          res.status(400).json({ error: 'Missing feature id.' });
          return;
        }
        const ref = db.collection(OVERLAY_FEATURES_COLLECTION).doc(featureId);
        const snap = await ref.get();
        if (!snap.exists) {
          res.status(404).json({ error: 'Overlay feature not found.' });
          return;
        }
        const [revisionSnap, moderationSnap] = await Promise.all([
          ref.collection(OVERLAY_REVISIONS_SUBCOLLECTION).orderBy('createdAtMs', 'desc').limit(10).get(),
          ref.collection(OVERLAY_MODERATION_SUBCOLLECTION).orderBy('createdAtMs', 'desc').limit(10).get()
        ]);
        res.status(200).json({
          item: overlaySummary(snap.data() || {}),
          revisions: revisionSnap.docs.map((row) => {
            const data = row.data() || {};
            return {
              revisionId: sanitizeText(data.revisionId || row.id, 180),
              action: sanitizeText(data.action || '', 40),
              reviewState: sanitizeText(data.reviewState || '', 40),
              createdByName: sanitizeText(data.createdByName || '', 80),
              createdAtMs: finiteNumber(data.createdAtMs, timestampToMillis(data.createdAt)),
              diffSummary: sanitizeText(data.diffSummary || '', 240)
            };
          }),
          moderationHistory: moderationSnap.docs.map((row) => {
            const data = row.data() || {};
            return {
              action: sanitizeText(data.action || '', 40),
              note: sanitizeLongText(data.note || '', 320),
              actorName: sanitizeText(data.actorName || '', 80),
              actorUid: sanitizeText(data.actorUid || '', 160),
              fromState: sanitizeText(data.fromState || '', 40),
              toState: sanitizeText(data.toState || '', 40),
              createdAtMs: finiteNumber(data.createdAtMs, timestampToMillis(data.createdAt))
            };
          })
        });
      } catch (error) {
        console.error('[getAdminOverlayFeatureDetail] failed:', error);
        res.status(500).json({ error: error?.message || 'Could not load overlay feature detail.' });
      }
    }),

    listAdminUsers: functions.region('us-central1').https.onRequest(async (req, res) => {
      if (setCors(req, res)) return;
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const moderator = await requireModerator(req, res);
      if (!moderator) return;
      try {
        const search = sanitizeText(req.body?.search || '', 80);
        const roleFilter = sanitizeText(req.body?.role || 'all', 40).toLowerCase();
        const limitValue = clampInt(req.body?.limit, 10, MAX_RESULTS, 60);
        const authUsers = await listAuthUsersWindow(limitValue * 3).catch(async () => {
          const snap = await db.collection(USERS_COLLECTION).limit(limitValue * 3).get();
          return snap.docs.map((row) => ({ uid: row.id, email: row.data()?.email || '', displayName: row.data()?.displayName || '', metadata: { creationTime: row.data()?.createdAt || null } }));
        });
        const profiles = await getUserProfileMap(authUsers.map((entry) => entry.uid));
        const items = authUsers.map((authUser) => adminUserSummary(
          authUser.uid,
          profiles.get(authUser.uid) || {},
          authUser
        )).filter((item) => {
          if (roleFilter !== 'all' && item.role !== roleFilter) return false;
          if (!matchesSearch([item.displayName, item.email, item.uid, item.plan, item.subscriptionStatus], search)) return false;
          return true;
        }).sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0)).slice(0, limitValue);
        res.status(200).json({ items });
      } catch (error) {
        console.error('[listAdminUsers] failed:', error);
        res.status(500).json({ error: error?.message || 'Could not load users.' });
      }
    }),

    getAdminUserDetail: functions.region('us-central1').https.onRequest(async (req, res) => {
      if (setCors(req, res)) return;
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const moderator = await requireModerator(req, res);
      if (!moderator) return;
      try {
        const uid = sanitizeText(req.body?.uid || '', 160);
        if (!uid) {
          res.status(400).json({ error: 'Missing user id.' });
          return;
        }
        const [userSnap, authUser, roomCount, friendCount, inviteCount, overlayCount, legacyCount] = await Promise.all([
          db.collection(USERS_COLLECTION).doc(uid).get(),
          admin.auth().getUser(uid).catch(() => null),
          safeCount(db.collection(ROOMS_COLLECTION).where('ownerUid', '==', uid)),
          safeCount(db.collection(USERS_COLLECTION).doc(uid).collection('friends')),
          safeCount(db.collection(USERS_COLLECTION).doc(uid).collection('incomingInvites')),
          safeCount(db.collection(OVERLAY_FEATURES_COLLECTION).where('createdBy', '==', uid)),
          safeCount(db.collection(LEGACY_SUBMISSIONS_COLLECTION).where('userId', '==', uid))
        ]);

        const userData = userSnap.exists ? userSnap.data() || {} : {};
        const [overlaySnap, legacySnap, ownedRoomSnap] = await Promise.all([
          db.collection(OVERLAY_FEATURES_COLLECTION).where('createdBy', '==', uid).limit(12).get(),
          db.collection(LEGACY_SUBMISSIONS_COLLECTION).where('userId', '==', uid).limit(12).get(),
          db.collection(ROOMS_COLLECTION).where('ownerUid', '==', uid).limit(10).get()
        ]);

        res.status(200).json({
          user: {
            uid,
            displayName: sanitizeText(userData.displayName || authUser?.displayName || 'Explorer', 80),
            email: sanitizeText(userData.email || authUser?.email || '', 160),
            emailVerified: authUser?.emailVerified === true,
            disabled: authUser?.disabled === true,
            plan: sanitizeText(userData.plan || 'free', 20).toLowerCase(),
            subscriptionStatus: sanitizeText(userData.subscriptionStatus || 'none', 20).toLowerCase(),
            role: sanitizeText(userData.subscriptionStatus || '', 20).toLowerCase() === 'admin' ? 'admin' : 'member',
            roomCreateCount: clampInt(userData.roomCreateCount, 0, 10000, 0),
            roomCreateLimit: clampInt(userData.roomCreateLimit, 0, 10000, 0),
            createdAtMs: Math.max(timestampToMillis(userData.createdAt), timestampToMillis(authUser?.metadata?.creationTime)),
            updatedAtMs: timestampToMillis(userData.updatedAt),
            lastSignInAtMs: timestampToMillis(authUser?.metadata?.lastSignInTime)
          },
          stats: {
            ownedRooms: roomCount,
            friends: friendCount,
            invites: inviteCount,
            overlaySubmissions: overlayCount,
            legacySubmissions: legacyCount
          },
          recentOverlay: overlaySnap.docs.map((row) => overlaySummary(row.data() || {})),
          recentLegacy: legacySnap.docs.map((row) => legacySubmissionSummary(row.data() || {}, row.id)),
          ownedRooms: await Promise.all(ownedRoomSnap.docs.map(async (row) => {
            const data = row.data() || {};
            const occupancy = await computeRoomOccupancy(row.id, data.maxPlayers);
            return roomSummary(row.id, data, occupancy);
          }))
        });
      } catch (error) {
        console.error('[getAdminUserDetail] failed:', error);
        res.status(500).json({ error: error?.message || 'Could not load user detail.' });
      }
    }),

    listAdminRooms: functions.region('us-central1').https.onRequest(async (req, res) => {
      if (setCors(req, res)) return;
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const moderator = await requireModerator(req, res);
      if (!moderator) return;
      try {
        const visibility = sanitizeText(req.body?.visibility || 'all', 20).toLowerCase();
        const worldKind = sanitizeText(req.body?.worldKind || 'all', 20).toLowerCase();
        const featuredOnly = boolFromValue(req.body?.featuredOnly, false);
        const search = sanitizeText(req.body?.search || '', 80);
        const limitValue = clampInt(req.body?.limit, 10, 40, 24);
        const rows = [];
        const roomDocs = await listRecentRoomDocs(limitValue * 3);
        for (const row of roomDocs) {
          const data = row.data || {};
          const summary = roomSummary(row.id, data, await computeRoomOccupancy(row.id, data.maxPlayers));
          rows.push(summary);
        }
        const items = rows.filter((item) => {
          if (visibility !== 'all' && item.visibility !== visibility) return false;
          if (worldKind !== 'all' && item.worldKind !== worldKind) return false;
          if (featuredOnly && item.featured !== true) return false;
          if (!matchesSearch([item.code, item.name, item.ownerUid, item.locationLabel, item.locationCity, item.cityKey], search)) return false;
          return true;
        }).slice(0, limitValue);
        res.status(200).json({ items });
      } catch (error) {
        console.error('[listAdminRooms] failed:', error);
        res.status(500).json({ error: error?.message || 'Could not load room administration data.' });
      }
    }),

    updateAdminRoomFlags: functions.region('us-central1').https.onRequest(async (req, res) => {
      if (setCors(req, res)) return;
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const moderator = await requireModerator(req, res);
      if (!moderator) return;
      try {
        const roomId = sanitizeText(req.body?.roomId || '', 80);
        if (!roomId) {
          res.status(400).json({ error: 'Missing room id.' });
          return;
        }
        const ref = db.collection(ROOMS_COLLECTION).doc(roomId);
        const snap = await ref.get();
        if (!snap.exists) {
          res.status(404).json({ error: 'Room not found.' });
          return;
        }
        const featured = req.body && 'featured' in req.body ? req.body.featured === true : snap.data()?.featured === true;
        await ref.set({
          featured,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        await logAdminActivity({
          actorUid: moderator.auth.uid,
          actorName: moderator.displayName,
          actionType: featured ? 'room.featured_on' : 'room.featured_off',
          targetType: 'room',
          targetId: roomId,
          title: featured ? 'Featured room enabled' : 'Featured room disabled',
          summary: `${sanitizeText(snap.data()?.name || roomId, 120)} (${roomId}) is now ${featured ? 'featured' : 'not featured'}.`
        });
        const updated = await ref.get();
        const occupancy = await computeRoomOccupancy(roomId, updated.data()?.maxPlayers);
        res.status(200).json({ item: roomSummary(roomId, updated.data() || {}, occupancy) });
      } catch (error) {
        console.error('[updateAdminRoomFlags] failed:', error);
        res.status(500).json({ error: error?.message || 'Could not update room admin flags.' });
      }
    }),

    getAdminSiteContent: functions.region('us-central1').https.onRequest(async (req, res) => {
      if (setCors(req, res)) return;
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const moderator = await requireModerator(req, res);
      if (!moderator) return;
      try {
        const entryId = normalizeSiteContentEntryId(req.body?.entryId);
        const [draftSnap, publishedSnap] = await Promise.all([
          db.collection(SITE_CONTENT_COLLECTION).doc(entryId).get(),
          db.collection(SITE_CONTENT_PUBLISHED_COLLECTION).doc(entryId).get()
        ]);
        const draftData = draftSnap.exists ? draftSnap.data() || {} : {};
        const publishedData = publishedSnap.exists ? publishedSnap.data() || {} : {};
        res.status(200).json({
          entryId,
          title: 'Landing Page Content',
          draft: normalizeLandingContent(draftData.draft || {}),
          published: normalizeLandingContent(publishedData.content || publishedData || {}),
          meta: {
            updatedAtMs: timestampToMillis(draftData.updatedAt),
            updatedByName: sanitizeText(draftData.updatedByName || '', 80),
            publishedAtMs: timestampToMillis(publishedData.publishedAt),
            publishedByName: sanitizeText(publishedData.publishedByName || '', 80)
          }
        });
      } catch (error) {
        console.error('[getAdminSiteContent] failed:', error);
        res.status(500).json({ error: error?.message || 'Could not load site content.' });
      }
    }),

    saveAdminSiteContentDraft: functions.region('us-central1').https.onRequest(async (req, res) => {
      if (setCors(req, res)) return;
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const moderator = await requireModerator(req, res);
      if (!moderator) return;
      try {
        const entryId = normalizeSiteContentEntryId(req.body?.entryId);
        const content = normalizeLandingContent(req.body?.content || {});
        await db.collection(SITE_CONTENT_COLLECTION).doc(entryId).set({
          entryId,
          draft: content,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: moderator.auth.uid,
          updatedByName: moderator.displayName
        }, { merge: true });
        await logAdminActivity({
          actorUid: moderator.auth.uid,
          actorName: moderator.displayName,
          actionType: 'site_content.save_draft',
          targetType: 'site_content',
          targetId: entryId,
          title: 'Site content draft saved',
          summary: `Saved a landing page draft with ${content.highlights.length} highlight block${content.highlights.length === 1 ? '' : 's'}.`
        });
        res.status(200).json({ entryId, draft: content });
      } catch (error) {
        console.error('[saveAdminSiteContentDraft] failed:', error);
        res.status(500).json({ error: error?.message || 'Could not save site content draft.' });
      }
    }),

    publishAdminSiteContent: functions.region('us-central1').https.onRequest(async (req, res) => {
      if (setCors(req, res)) return;
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const moderator = await requireModerator(req, res);
      if (!moderator) return;
      try {
        const entryId = normalizeSiteContentEntryId(req.body?.entryId);
        const draftRef = db.collection(SITE_CONTENT_COLLECTION).doc(entryId);
        const draftSnap = await draftRef.get();
        if (!draftSnap.exists) {
          res.status(404).json({ error: 'No site content draft exists yet.' });
          return;
        }
        const draftData = draftSnap.data() || {};
        const content = normalizeLandingContent(draftData.draft || {});
        await db.collection(SITE_CONTENT_PUBLISHED_COLLECTION).doc(entryId).set({
          entryId,
          content,
          publishedAt: admin.firestore.FieldValue.serverTimestamp(),
          publishedBy: moderator.auth.uid,
          publishedByName: moderator.displayName
        }, { merge: true });
        await draftRef.set({
          publishedAt: admin.firestore.FieldValue.serverTimestamp(),
          publishedBy: moderator.auth.uid,
          publishedByName: moderator.displayName
        }, { merge: true });
        await logAdminActivity({
          actorUid: moderator.auth.uid,
          actorName: moderator.displayName,
          actionType: 'site_content.publish',
          targetType: 'site_content',
          targetId: entryId,
          title: 'Site content published',
          summary: 'Published landing page messaging and announcement content.'
        });
        res.status(200).json({ entryId, published: content });
      } catch (error) {
        console.error('[publishAdminSiteContent] failed:', error);
        res.status(500).json({ error: error?.message || 'Could not publish site content.' });
      }
    }),

    listAdminActivity: functions.region('us-central1').https.onRequest(async (req, res) => {
      if (setCors(req, res)) return;
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const moderator = await requireModerator(req, res);
      if (!moderator) return;
      try {
        const limitValue = clampInt(req.body?.limit, 10, 80, 40);
        const actionPrefix = sanitizeText(req.body?.actionPrefix || '', 40).toLowerCase();
        let items = await listRecentAdminActivity(limitValue * 2);
        if (actionPrefix) {
          items = items.filter((item) => item.actionType.toLowerCase().startsWith(actionPrefix));
        }
        res.status(200).json({ items: items.slice(0, limitValue) });
      } catch (error) {
        console.error('[listAdminActivity] failed:', error);
        res.status(500).json({ error: error?.message || 'Could not load admin activity.' });
      }
    }),

    getAdminOperationsSnapshot: functions.region('us-central1').https.onRequest(async (req, res) => {
      if (setCors(req, res)) return;
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const moderator = await requireModerator(req, res);
      if (!moderator) return;
      try {
        const cfg = adminConfig();
        const notificationCfg = contributionNotificationConfig();
        const publishedLandingSnap = await db.collection(SITE_CONTENT_PUBLISHED_COLLECTION).doc(LANDING_CONTENT_ENTRY_ID).get();
        res.status(200).json({
          admin: {
            uid: moderator.auth.uid,
            displayName: moderator.displayName,
            email: sanitizeText(moderator.authUser.email || '', 120)
          },
          settings: {
            moderationPanelUrl: sanitizeText(notificationCfg.moderationPanelUrl || cfg.moderationPanelUrl || '', 320),
            notificationConfigured: contributionNotificationEnabled(notificationCfg),
            notificationEmail: sanitizeText(notificationCfg.adminNotificationEmail || '', 160),
            adminAllowlistConfigured: !!sanitizeText(cfg.allowedEmails || cfg.allowedUids || '', 320),
            siteContentPublishedAtMs: publishedLandingSnap.exists ? timestampToMillis(publishedLandingSnap.data()?.publishedAt) : 0
          }
        });
      } catch (error) {
        console.error('[getAdminOperationsSnapshot] failed:', error);
        res.status(500).json({ error: error?.message || 'Could not load operations snapshot.' });
      }
    })
  };
}

module.exports = {
  ADMIN_ACTIVITY_COLLECTION,
  LANDING_CONTENT_ENTRY_ID,
  SITE_CONTENT_COLLECTION,
  SITE_CONTENT_PUBLISHED_COLLECTION,
  buildAdminDashboardExports
};
