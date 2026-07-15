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
const OVERLAY_REVIEW_STATES = new Set(['draft', 'submitted', 'approved', 'rejected', 'needs_changes', 'superseded']);
const OVERLAY_PUBLICATION_STATES = new Set(['unpublished', 'published', 'rolled_back']);
const OVERLAY_GEOMETRY_TYPES = new Set(['Point', 'LineString', 'Polygon']);
const OVERLAY_SOURCE_TYPES = new Set(['overlay_new', 'base_patch', 'render_override']);
const OVERLAY_MERGE_MODES = new Set(['additive', 'render_override', 'local_replace']);
const OVERLAY_AREA_CELL_DEGREES = 0.06;
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

function computeOverlayAreaKey(lat, lon, worldKind = 'earth') {
  const world = sanitizeSmallText(worldKind || 'earth', 24).toLowerCase() || 'earth';
  const latBucket = Math.floor((clampLat(lat) + 90) / OVERLAY_AREA_CELL_DEGREES);
  const lonBucket = Math.floor((wrapLon(lon) + 180) / OVERLAY_AREA_CELL_DEGREES);
  return `${world}:${latBucket}:${lonBucket}`;
}

function sanitizeSmallText(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function sanitizeLongText(value, max = 320) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .trim()
    .slice(0, max);
}

function timestampMillisNow() {
  return Date.now();
}

function normalizePointCoordinate(raw = {}) {
  return {
    lat: clampLat(raw.lat),
    lon: wrapLon(raw.lon)
  };
}

function geometryPolygonRings(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  if (Array.isArray(source.rings)) {
    return source.rings
      .map((ring) => {
        if (Array.isArray(ring?.points)) return ring.points;
        if (Array.isArray(ring?.coordinates)) return ring.coordinates;
        return Array.isArray(ring) ? ring : [];
      })
      .map((ring) => ring.map((point) => normalizePointCoordinate(point)))
      .filter((ring) => ring.length > 0);
  }
  if (Array.isArray(source.coordinates)) {
    if (source.coordinates.length && Array.isArray(source.coordinates[0])) {
      return source.coordinates
        .map((ring) => Array.isArray(ring) ? ring.map((point) => normalizePointCoordinate(point)) : [])
        .filter((ring) => ring.length > 0);
    }
    return [
      source.coordinates.map((point) => normalizePointCoordinate(point))
    ].filter((ring) => ring.length > 0);
  }
  return [];
}

function normalizeGeometry(raw = {}, explicitType = '') {
  const source = raw && typeof raw === 'object' ? raw : {};
  const type = sanitizeSmallText(explicitType || source.type || 'Point', 20);
  if (type === 'LineString') {
    const coordinates = Array.isArray(source.coordinates)
      ? source.coordinates.map((point) => normalizePointCoordinate(point))
      : [];
    return { type, coordinates };
  }
  if (type === 'Polygon') {
    const rings = geometryPolygonRings(source);
    return {
      type,
      coordinates: rings[0] || [],
      rings: rings.map((ring, index) => ({
        role: index === 0 ? 'outer' : 'inner',
        points: ring
      }))
    };
  }
  return {
    type: 'Point',
    coordinates: normalizePointCoordinate(source.coordinates || source)
  };
}

function geometryPoints(geometry = {}) {
  if (geometry?.type === 'Point') return [normalizePointCoordinate(geometry.coordinates || geometry)];
  if (geometry?.type === 'LineString') return Array.isArray(geometry.coordinates) ? geometry.coordinates.map((point) => normalizePointCoordinate(point)) : [];
  if (geometry?.type === 'Polygon') {
    return geometryPolygonRings(geometry).flatMap((ring) => ring);
  }
  return [];
}

function geometryBbox(geometry = {}) {
  const points = geometryPoints(geometry);
  if (!points.length) {
    return { minLat: 0, minLon: 0, maxLat: 0, maxLon: 0 };
  }
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  points.forEach((point) => {
    minLat = Math.min(minLat, point.lat);
    minLon = Math.min(minLon, point.lon);
    maxLat = Math.max(maxLat, point.lat);
    maxLon = Math.max(maxLon, point.lon);
  });
  return { minLat, minLon, maxLat, maxLon };
}

function geometryCentroid(geometry = {}) {
  const points = geometryPoints(geometry);
  if (!points.length) return { lat: 0, lon: 0 };
  let sumLat = 0;
  let sumLon = 0;
  points.forEach((point) => {
    sumLat += point.lat;
    sumLon += point.lon;
  });
  return {
    lat: sumLat / points.length,
    lon: sumLon / points.length
  };
}

function normalizeTagMap(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const next = {};
  Object.keys(source).forEach((key) => {
    const cleanKey = sanitizeSmallText(key, 64).toLowerCase();
    if (!cleanKey) return;
    const value = source[key];
    if (value == null) return;
    if (typeof value === 'boolean') next[cleanKey] = value ? 'yes' : 'no';
    else if (typeof value === 'number') next[cleanKey] = String(value);
    else {
      const cleanValue = sanitizeSmallText(value, 180);
      if (cleanValue) next[cleanKey] = cleanValue;
    }
  });
  return next;
}

function normalizeBaseFeatureRef(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    source: sanitizeSmallText(source.source || 'osm', 24).toLowerCase() || 'osm',
    featureType: sanitizeSmallText(source.featureType || '', 40).toLowerCase(),
    featureId: sanitizeSmallText(source.featureId || '', 180),
    areaKey: sanitizeSmallText(source.areaKey || '', 64),
    displayName: sanitizeSmallText(source.displayName || '', 120)
  };
}

function normalizeThreeD(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    height: Number.isFinite(Number(source.height)) ? Number(source.height) : null,
    buildingLevels: Number.isFinite(Number(source.buildingLevels)) ? Number(source.buildingLevels) : null,
    minHeight: finiteNumber(source.minHeight, 0),
    roofShape: sanitizeSmallText(source.roofShape || 'flat', 40).toLowerCase() || 'flat',
    layer: Math.round(finiteNumber(source.layer, 0)),
    bridge: source.bridge === true,
    tunnel: source.tunnel === true,
    surface: sanitizeSmallText(source.surface || '', 60).toLowerCase(),
    entrances: Array.isArray(source.entrances)
      ? source.entrances.map((entry) => ({
          lat: clampLat(entry?.lat),
          lon: wrapLon(entry?.lon),
          label: sanitizeSmallText(entry?.label || '', 60),
          kind: sanitizeSmallText(entry?.kind || entry?.type || 'entrance', 40).toLowerCase(),
          elevation: finiteNumber(entry?.elevation, 0),
          yaw: Number.isFinite(Number(entry?.yaw)) ? Number(entry.yaw) : null
        }))
      : [],
    stairs: Array.isArray(source.stairs) ? source.stairs.map((value) => sanitizeSmallText(value, 80)) : [],
    elevators: Array.isArray(source.elevators) ? source.elevators.map((value) => sanitizeSmallText(value, 80)) : []
  };
}

function normalizeRelations(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const indoorShell = source.indoorShell && typeof source.indoorShell === 'object' ? source.indoorShell : {};
  return {
    level: sanitizeSmallText(source.level || '', 40),
    buildingRef: sanitizeSmallText(source.buildingRef || '', 180),
    parentFeatureId: sanitizeSmallText(source.parentFeatureId || '', 180),
    indoorShell: {
      enabled: indoorShell.enabled === true,
      levels: Array.isArray(indoorShell.levels)
        ? indoorShell.levels.map((level) => ({
            level: sanitizeSmallText(level?.level || '', 40),
            label: sanitizeSmallText(level?.label || '', 80)
          }))
        : []
    }
  };
}

function normalizeSubmission(raw = {}, fallback = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const existing = fallback && typeof fallback === 'object' ? fallback : {};
  return {
    contributorNote: sanitizeLongText(source.contributorNote || existing.contributorNote || '', 320),
    generatedSummary: sanitizeSmallText(source.generatedSummary || existing.generatedSummary || '', 240),
    changeSummary: sanitizeSmallText(source.changeSummary || existing.changeSummary || '', 180),
    editIntent: sanitizeSmallText(source.editIntent || existing.editIntent || '', 120)
  };
}

function normalizeReviewState(value, fallback = 'draft') {
  const next = sanitizeSmallText(value || fallback, 40).toLowerCase();
  return OVERLAY_REVIEW_STATES.has(next) ? next : fallback;
}

function normalizePublicationState(value, fallback = 'unpublished') {
  const next = sanitizeSmallText(value || fallback, 40).toLowerCase();
  return OVERLAY_PUBLICATION_STATES.has(next) ? next : fallback;
}

function normalizeSourceType(value, fallback = 'overlay_new') {
  const next = sanitizeSmallText(value || fallback, 40).toLowerCase();
  return OVERLAY_SOURCE_TYPES.has(next) ? next : fallback;
}

function normalizeMergeMode(value, fallback = 'additive') {
  const next = sanitizeSmallText(value || fallback, 40).toLowerCase();
  return OVERLAY_MERGE_MODES.has(next) ? next : fallback;
}

function geometryValid(geometry = {}) {
  if (!OVERLAY_GEOMETRY_TYPES.has(geometry.type)) return false;
  if (geometry.type === 'Point') {
    return Number.isFinite(geometry.coordinates?.lat) && Number.isFinite(geometry.coordinates?.lon);
  }
  if (geometry.type === 'LineString') {
    return Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2;
  }
  const rings = geometryPolygonRings(geometry);
  return Array.isArray(rings[0]) && rings[0].length >= 3;
}

function overlayFeatureLabel(feature = {}) {
  return sanitizeSmallText(
    feature?.tags?.name ||
      feature?.summary ||
      feature?.baseFeatureRef?.displayName ||
      feature?.presetId ||
      'Overlay feature',
    120
  ) || 'Overlay feature';
}

function overlaySearchText(feature = {}) {
  return sanitizeSmallText([
    feature.presetId,
    feature.featureClass,
    feature.tags?.name,
    feature.tags?.highway,
    feature.tags?.railway,
    feature.tags?.building,
    feature.tags?.amenity,
    feature.baseFeatureRef?.displayName
  ].filter(Boolean).join(' '), 240).toLowerCase();
}

function validateOverlayFeaturePayload(feature = {}) {
  if (!feature.featureId) return 'Missing feature id.';
  if (!feature.presetId) return 'Missing preset id.';
  if (!feature.featureClass) return 'Missing feature class.';
  if (!feature.geometryType) return 'Missing geometry type.';
  if (!geometryValid(feature.geometry)) return 'Geometry is missing or invalid.';
  if ((feature.mergeMode === 'render_override' || feature.mergeMode === 'local_replace') && !feature.baseFeatureRef?.featureId) {
    return 'Render overrides and local replacements need a base feature reference.';
  }
  return '';
}

function normalizeOverlayFeatureInput(raw = {}, options = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const geometry = normalizeGeometry(source.geometry || {}, source.geometryType || '');
  const centroid = geometryCentroid(geometry);
  const tags = normalizeTagMap(source.tags || {});
  const nowMs = timestampMillisNow();
  const existing = options.existing || null;
  const user = options.user || {};
  const createdBy = sanitizeSmallText(existing?.createdBy || user.uid || '', 160);
  const createdByName = sanitizeSmallText(existing?.createdByName || user.displayName || '', 80);
  const version = Math.max(1, Math.round(finiteNumber(existing?.version, 0)) + 1);
  const feature = {
    featureId: sanitizeSmallText(source.featureId || existing?.featureId || '', 180),
    worldKind: sanitizeSmallText(source.worldKind || existing?.worldKind || 'earth', 24).toLowerCase() || 'earth',
    areaKey: sanitizeSmallText(source.areaKey || computeOverlayAreaKey(centroid.lat, centroid.lon, source.worldKind || existing?.worldKind || 'earth'), 64),
    presetId: sanitizeSmallText(source.presetId || existing?.presetId || '', 80).toLowerCase(),
    featureClass: sanitizeSmallText(source.featureClass || existing?.featureClass || '', 40).toLowerCase(),
    sourceType: normalizeSourceType(source.sourceType || existing?.sourceType || 'overlay_new'),
    mergeMode: normalizeMergeMode(source.mergeMode || existing?.mergeMode || 'additive'),
    baseFeatureRef: normalizeBaseFeatureRef(source.baseFeatureRef || existing?.baseFeatureRef || {}),
    geometryType: sanitizeSmallText(source.geometryType || geometry.type, 20),
    geometry,
    tags,
    threeD: normalizeThreeD(source.threeD || existing?.threeD || {}),
    relations: normalizeRelations(source.relations || existing?.relations || {}),
    submission: normalizeSubmission(source.submission || existing?.submission || {}, existing?.submission || {}),
    bbox: geometryBbox(geometry),
    level: sanitizeSmallText(source.level || source.relations?.level || existing?.level || '', 40),
    buildingRef: sanitizeSmallText(source.buildingRef || source.relations?.buildingRef || existing?.buildingRef || '', 180),
    reviewState: normalizeReviewState(existing?.reviewState || 'draft'),
    publicationState: normalizePublicationState(existing?.publicationState || 'unpublished'),
    validation: {
      valid: source.validation?.valid !== false,
      issues: Array.isArray(source.validation?.issues) ? source.validation.issues.slice(0, 24) : [],
      updatedAtMs: finiteNumber(source.validation?.updatedAtMs, nowMs)
    },
    summary: sanitizeSmallText(source.summary || tags.name || existing?.summary || '', 120),
    searchText: '',
    version,
    headRevisionId: sanitizeSmallText(source.headRevisionId || existing?.headRevisionId || '', 180),
    createdBy,
    createdByName,
    updatedBy: sanitizeSmallText(user.uid || createdBy, 160),
    updatedByName: sanitizeSmallText(user.displayName || createdByName, 80),
    createdAtMs: finiteNumber(existing?.createdAtMs, nowMs),
    updatedAtMs: nowMs,
    submittedAtMs: finiteNumber(existing?.submittedAtMs, 0),
    approvedAtMs: finiteNumber(existing?.approvedAtMs, 0),
    publishedAtMs: finiteNumber(existing?.publishedAtMs, 0),
    rejectedAtMs: finiteNumber(existing?.rejectedAtMs, 0),
    needsChangesAtMs: finiteNumber(existing?.needsChangesAtMs, 0),
    supersedes: sanitizeSmallText(source.supersedes || existing?.supersedes || '', 180),
    supersededBy: sanitizeSmallText(existing?.supersededBy || '', 180),
    moderation: {
      note: sanitizeLongText(existing?.moderation?.note || '', 320),
      actorUid: sanitizeSmallText(existing?.moderation?.actorUid || '', 160),
      actorName: sanitizeSmallText(existing?.moderation?.actorName || '', 80)
    },
    runtimeFlags: {
      hidden: existing?.runtimeFlags?.hidden === true,
      replaceInTraversal: existing?.runtimeFlags?.replaceInTraversal === true
    }
  };
  feature.summary = overlayFeatureLabel(feature);
  feature.searchText = overlaySearchText(feature);
  return feature;
}

function featureRevisionDoc(feature = {}, revisionId, action, actor = {}) {
  return {
    revisionId,
    featureId: feature.featureId,
    version: feature.version,
    action: sanitizeSmallText(action || 'save_draft', 40),
    reviewState: feature.reviewState,
    createdBy: sanitizeSmallText(actor.uid || feature.updatedBy || '', 160),
    createdByName: sanitizeSmallText(actor.displayName || feature.updatedByName || '', 80),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtMs: timestampMillisNow(),
    snapshot: feature,
    diffSummary: sanitizeSmallText(`${action}:${feature.summary}`, 240)
  };
}

function moderationEventDoc(feature = {}, action, actor = {}, note = '', fromState = '', toState = '') {
  return {
    featureId: feature.featureId,
    action: sanitizeSmallText(action || '', 40),
    note: sanitizeLongText(note || '', 320),
    actorUid: sanitizeSmallText(actor.uid || '', 160),
    actorName: sanitizeSmallText(actor.displayName || '', 80),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtMs: timestampMillisNow(),
    fromState: sanitizeSmallText(fromState || '', 40),
    toState: sanitizeSmallText(toState || '', 40)
  };
}

async function syncCreatorContributionStats(mergeCreatorProfile, userId) {
  const cleanUserId = sanitizeSmallText(userId || '', 160);
  if (!cleanUserId || typeof mergeCreatorProfile !== 'function') return;
  const [allSnap, publishedSnap] = await Promise.all([
    db.collection(OVERLAY_FEATURES_COLLECTION).where('createdBy', '==', cleanUserId).get(),
    db.collection(OVERLAY_PUBLISHED_COLLECTION).where('createdBy', '==', cleanUserId).get()
  ]);
  await mergeCreatorProfile(db, cleanUserId, {
    stats: {
      contributionsCount: allSnap.size,
      publishedContributions: publishedSnap.size
    }
  });
}

async function ensureOwnerCanEdit(ref, auth) {
  const snap = await ref.get();
  if (!snap.exists) return { exists: false, data: null };
  const data = snap.data() || {};
  if (sanitizeSmallText(data.createdBy || '', 160) !== sanitizeSmallText(auth.uid || '', 160)) {
    throw new Error('Only the feature owner can edit this draft.');
  }
  if (!['draft', 'needs_changes', 'rejected'].includes(normalizeReviewState(data.reviewState || 'draft'))) {
    throw new Error('This overlay feature is no longer editable as a draft.');
  }
  return { exists: true, data };
}

function buildOverlayExports(helpers = {}) {
  const setCors = helpers.setCors;
  const verifyAuth = helpers.verifyAuth;
  const requireModerator = helpers.requireModerator;
  const logAdminActivity =
    typeof helpers.logAdminActivity === 'function'
      ? helpers.logAdminActivity
      : async () => {};
  const mergeCreatorProfile =
    typeof helpers.mergeCreatorProfile === 'function'
      ? helpers.mergeCreatorProfile
      : async () => null;

  return {
    saveOverlayFeatureDraft: functions.region('us-central1').https.onRequest(async (req, res) => {
      if (setCors(req, res)) return;
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }

      const auth = await verifyAuth(req, res);
      if (!auth) return;

      try {
        const authUser = await admin.auth().getUser(auth.uid);
        const featureId = sanitizeSmallText(req.body?.featureId || '', 180) || db.collection(OVERLAY_FEATURES_COLLECTION).doc().id;
        const ref = db.collection(OVERLAY_FEATURES_COLLECTION).doc(featureId);
        const existing = await ensureOwnerCanEdit(ref, auth).catch((error) => {
          if (String(error?.message || '').includes('owner')) throw error;
          if (String(error?.message || '').includes('editable')) throw error;
          return { exists: false, data: null };
        });
        const normalized = normalizeOverlayFeatureInput(
          {
            ...(req.body || {}),
            featureId
          },
          {
            existing: existing?.data || null,
            user: {
              uid: auth.uid,
              displayName: sanitizeSmallText(authUser.displayName || authUser.email || 'Explorer', 80)
            }
          }
        );
        const validationError = validateOverlayFeaturePayload(normalized);
        if (validationError) {
          res.status(400).json({ error: validationError });
          return;
        }

        const revisionRef = ref.collection(OVERLAY_REVISIONS_SUBCOLLECTION).doc();
        normalized.headRevisionId = revisionRef.id;
        normalized.reviewState = 'draft';
        normalized.publicationState = existing?.data?.publicationState || 'unpublished';

        const payload = {
          ...normalized,
          createdAt: existing?.data?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await ref.set(payload, { merge: true });
        await revisionRef.set(featureRevisionDoc(normalized, revisionRef.id, existing?.exists ? 'save_draft' : 'create_draft', {
          uid: auth.uid,
          displayName: normalized.updatedByName
        }));
        await syncCreatorContributionStats(mergeCreatorProfile, normalized.createdBy);

        res.status(200).json({ item: normalized });
      } catch (error) {
        console.error('[saveOverlayFeatureDraft] failed:', error);
        res.status(500).json({ error: error?.message || 'Could not save this overlay draft right now.' });
      }
    }),

    submitOverlayFeature: functions.region('us-central1').https.onRequest(async (req, res) => {
      if (setCors(req, res)) return;
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const auth = await verifyAuth(req, res);
      if (!auth) return;
      try {
        const featureId = sanitizeSmallText(req.body?.featureId || '', 180);
        if (!featureId) {
          res.status(400).json({ error: 'Missing feature id.' });
          return;
        }
        const ref = db.collection(OVERLAY_FEATURES_COLLECTION).doc(featureId);
        const existing = await ensureOwnerCanEdit(ref, auth);
        if (!existing.exists || !existing.data) {
          res.status(404).json({ error: 'Overlay feature not found.' });
          return;
        }
        const data = existing.data;
        const updated = {
          ...data,
          reviewState: 'submitted',
          submittedAt: admin.firestore.FieldValue.serverTimestamp(),
          submittedAtMs: timestampMillisNow(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAtMs: timestampMillisNow()
        };
        const revisionRef = ref.collection(OVERLAY_REVISIONS_SUBCOLLECTION).doc();
        updated.headRevisionId = revisionRef.id;
        await ref.set(updated, { merge: true });
        await revisionRef.set(featureRevisionDoc(updated, revisionRef.id, 'submit', {
          uid: auth.uid,
          displayName: sanitizeSmallText(data.updatedByName || 'Explorer', 80)
        }));
        res.status(200).json({ item: updated });
      } catch (error) {
        console.error('[submitOverlayFeature] failed:', error);
        res.status(500).json({ error: error?.message || 'Could not submit this overlay feature right now.' });
      }
    }),

    deleteOverlayFeatureDraft: functions.region('us-central1').https.onRequest(async (req, res) => {
      if (setCors(req, res)) return;
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const auth = await verifyAuth(req, res);
      if (!auth) return;
      try {
        const featureId = sanitizeSmallText(req.body?.featureId || '', 180);
        if (!featureId) {
          res.status(400).json({ error: 'Missing feature id.' });
          return;
        }
        const ref = db.collection(OVERLAY_FEATURES_COLLECTION).doc(featureId);
        const existing = await ensureOwnerCanEdit(ref, auth);
        if (!existing.exists) {
          res.status(404).json({ error: 'Overlay feature not found.' });
          return;
        }
        await ref.delete();
        await syncCreatorContributionStats(mergeCreatorProfile, existing?.data?.createdBy || auth.uid);
        res.status(200).json({ ok: true, featureId });
      } catch (error) {
        console.error('[deleteOverlayFeatureDraft] failed:', error);
        res.status(500).json({ error: error?.message || 'Could not delete this overlay draft right now.' });
      }
    }),

    moderateOverlayFeature: functions.region('us-central1').https.onRequest(async (req, res) => {
      if (setCors(req, res)) return;
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const moderator = await requireModerator(req, res);
      if (!moderator) return;

      try {
        const featureId = sanitizeSmallText(req.body?.featureId || '', 180);
        const action = sanitizeSmallText(req.body?.action || '', 40).toLowerCase();
        const note = sanitizeLongText(req.body?.note || '', 320);
        if (!featureId) {
          res.status(400).json({ error: 'Missing feature id.' });
          return;
        }
        if (!['approve', 'reject', 'needs_changes'].includes(action)) {
          res.status(400).json({ error: 'Moderation action must be approve, reject, or needs_changes.' });
          return;
        }
        const ref = db.collection(OVERLAY_FEATURES_COLLECTION).doc(featureId);
        const snap = await ref.get();
        if (!snap.exists) {
          res.status(404).json({ error: 'Overlay feature not found.' });
          return;
        }
        const data = snap.data() || {};
        const fromState = normalizeReviewState(data.reviewState || 'draft');
        if (fromState !== 'submitted' && fromState !== 'approved') {
          res.status(409).json({ error: 'Only submitted overlay features can be moderated.' });
          return;
        }

        const nowMs = timestampMillisNow();
        const nextReviewState =
          action === 'approve' ? 'approved' :
          action === 'needs_changes' ? 'needs_changes' :
          'rejected';
        const nextPublicationState = action === 'approve' ? 'published' : 'unpublished';
        const updated = {
          ...data,
          reviewState: nextReviewState,
          publicationState: nextPublicationState,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAtMs: nowMs,
          approvedAt: action === 'approve' ? admin.firestore.FieldValue.serverTimestamp() : data.approvedAt || null,
          approvedAtMs: action === 'approve' ? nowMs : finiteNumber(data.approvedAtMs, 0),
          publishedAt: action === 'approve' ? admin.firestore.FieldValue.serverTimestamp() : data.publishedAt || null,
          publishedAtMs: action === 'approve' ? nowMs : finiteNumber(data.publishedAtMs, 0),
          needsChangesAt: action === 'needs_changes' ? admin.firestore.FieldValue.serverTimestamp() : data.needsChangesAt || null,
          needsChangesAtMs: action === 'needs_changes' ? nowMs : finiteNumber(data.needsChangesAtMs, 0),
          rejectedAt: action === 'reject' ? admin.firestore.FieldValue.serverTimestamp() : data.rejectedAt || null,
          rejectedAtMs: action === 'reject' ? nowMs : finiteNumber(data.rejectedAtMs, 0),
          moderation: {
            note,
            actorUid: moderator.auth.uid,
            actorName: moderator.displayName
          }
        };

        const revisionRef = ref.collection(OVERLAY_REVISIONS_SUBCOLLECTION).doc();
        updated.headRevisionId = revisionRef.id;
        await ref.set(updated, { merge: true });
        await revisionRef.set(featureRevisionDoc(updated, revisionRef.id, action, {
          uid: moderator.auth.uid,
          displayName: moderator.displayName
        }));
        await ref.collection(OVERLAY_MODERATION_SUBCOLLECTION).add(
          moderationEventDoc(updated, action, {
            uid: moderator.auth.uid,
            displayName: moderator.displayName
          }, note, fromState, nextReviewState)
        );

        if (action === 'approve') {
          const publishedDoc = {
            ...updated,
            publicationState: 'published',
            publishedRevisionId: revisionRef.id,
            publishedBy: moderator.auth.uid,
            publishedByName: moderator.displayName
          };
          await db.collection(OVERLAY_PUBLISHED_COLLECTION).doc(featureId).set(publishedDoc, { merge: true });
          if (updated.supersedes) {
            const oldRef = db.collection(OVERLAY_FEATURES_COLLECTION).doc(updated.supersedes);
            const oldSnap = await oldRef.get();
            if (oldSnap.exists) {
              await oldRef.set({
                reviewState: 'superseded',
                publicationState: 'rolled_back',
                supersededBy: featureId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAtMs: nowMs
              }, { merge: true });
              await db.collection(OVERLAY_PUBLISHED_COLLECTION).doc(updated.supersedes).delete().catch(() => {});
            }
          }
        } else {
          await db.collection(OVERLAY_PUBLISHED_COLLECTION).doc(featureId).delete().catch(() => {});
        }
        await syncCreatorContributionStats(mergeCreatorProfile, updated.createdBy);

        await logAdminActivity({
          actorUid: moderator.auth.uid,
          actorName: moderator.displayName,
          actionType:
            action === 'approve'
              ? 'overlay.approve'
              : action === 'needs_changes'
                ? 'overlay.needs_changes'
                : 'overlay.reject',
          targetType: 'overlay_feature',
          targetId: featureId,
          title:
            action === 'approve'
              ? 'Overlay feature approved'
              : action === 'needs_changes'
                ? 'Overlay feature sent back for changes'
                : 'Overlay feature rejected',
          summary: `${sanitizeSmallText(updated.summary || updated.presetId || featureId, 120)} moved from ${fromState} to ${nextReviewState}.`
        });

        res.status(200).json({ item: updated });
      } catch (error) {
        console.error('[moderateOverlayFeature] failed:', error);
        res.status(500).json({ error: error?.message || 'Could not moderate this overlay feature right now.' });
      }
    })
  };
}

module.exports = {
  buildOverlayExports
};
