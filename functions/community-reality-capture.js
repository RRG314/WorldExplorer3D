'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const {
  ACCESS_MODES,
  assertCaptureTransition,
  createCaptureDraft,
  imageSignatureMatches,
  isDeletableByOwner,
  normalizeReviewedAlignment,
  resolveSpaceAccess,
  stableId,
  validateUploadedPhotoSet
} = require('./reality-capture-authority');

const CAPTURES = 'realityCaptures';
const SPACES = 'privateSpaces';
const ACCESS_REQUESTS = 'privateSpaceAccessRequests';
const REPRESENTATIONS = 'buildingRepresentations';
const SIGNED_URL_TTL_MS = 60 * 1000;

function clean(value, max = 180) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function multiline(value, max = 500) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function errorStatus(error) {
  const code = clean(error?.message || error, 100);
  if (code === 'capture_not_found' || code === 'space_not_found' || code === 'asset_not_found') return 404;
  if (code.includes('permission') || code.includes('owner') || code.includes('access_denied')) return 403;
  if (code.includes('state_transition') || code.includes('already_') || code.includes('approved_capture')) return 409;
  if (code.includes('authentication') || code.includes('app_check')) return 401;
  return 422;
}

function sendKnownError(res, error) {
  const code = clean(error?.message || error, 100) || 'request_failed';
  res.status(errorStatus(error)).json({ error: code.replaceAll('_', ' ') });
}

function actorFromAuth(auth, authUser) {
  return {
    uid: auth.uid,
    email: authUser?.email || auth.email || '',
    displayName: authUser?.displayName || auth.name || auth.email || 'Explorer'
  };
}

async function readObjectPrefix(file, bytes = 16) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    file.createReadStream({ start: 0, end: Math.max(0, bytes - 1) })
      .on('data', (chunk) => chunks.push(chunk))
      .on('error', reject)
      .on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function serializeCapture(snapshot) {
  const data = snapshot.data() || {};
  return {
    id: snapshot.id,
    captureId: clean(data.captureId || snapshot.id, 180),
    captureSchemaVersion: Number(data.captureSchemaVersion) || 1,
    processingPipelineVersion: clean(data.processingPipelineVersion, 100),
    captureKind: clean(data.captureKind, 40),
    status: clean(data.status, 40),
    capturePrivacy: clean(data.capturePrivacy || 'PRIVATE', 40),
    accessMode: clean(data.accessMode || 'PRIVATE', 40),
    publicContributionRequested: data.publicContributionRequested === true,
    building: data.building || {},
    room: data.room || null,
    spaceId: clean(data.spaceId, 180),
    uploadSummary: data.uploadSummary || null,
    quality: data.quality || null,
    failure: data.failure || null,
    review: data.review || null,
    processed: data.processed || null,
    ownerDisplayName: clean(data.ownerDisplayName || 'Explorer', 80),
    createdAtMs: data.createdAt?.toMillis?.() || Number(data.createdAtMs) || 0,
    updatedAtMs: data.updatedAt?.toMillis?.() || Number(data.updatedAtMs) || 0
  };
}

async function deleteQueryDocuments(db, query, batchSize = 200) {
  let deleted = 0;
  while (true) {
    const snapshot = await query.limit(batchSize).get();
    if (snapshot.empty) return deleted;
    const batch = db.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
    deleted += snapshot.size;
    if (snapshot.size < batchSize) return deleted;
  }
}

async function readAccessContext(spaceRef, uid, roomId = '') {
  const memberPromise = spaceRef.collection('members').doc(uid).get();
  const sessionPromise = roomId
    ? spaceRef.collection('sessionGrants').doc(stableId('session', roomId, uid)).get()
    : Promise.resolve(null);
  const oncePromise = spaceRef.collection('oneTimeGrants').where('uid', '==', uid).where('active', '==', true).limit(1).get();
  const [memberSnap, sessionSnap, onceSnap] = await Promise.all([memberPromise, sessionPromise, oncePromise]);
  return {
    member: memberSnap?.exists ? memberSnap.data() : null,
    sessionGrant: sessionSnap?.exists ? sessionSnap.data() : null,
    oneTimeGrant: onceSnap?.empty ? null : onceSnap.docs[0].data(),
    oneTimeGrantRef: onceSnap?.empty ? null : onceSnap.docs[0].ref
  };
}

function timestampMillis(value) {
  const result = value?.toMillis?.() ?? Number(value);
  return Number.isFinite(result) ? result : 0;
}

function roomWorldId(room = {}) {
  const lat = Number(room.world?.lat);
  const lon = Number(room.world?.lon);
  if (String(room.world?.kind || 'earth').toLowerCase() !== 'earth' ||
      !Number.isFinite(lat) || !Number.isFinite(lon)) return '';
  return `earth:v1:${Math.round(lat * 1e7)}:${Math.round(lon * 1e7)}`;
}

async function sharedRoomOwnerIsOnline(db, roomId, requesterUid, ownerUid, expectedWorldId = '') {
  if (!roomId || !requesterUid || !ownerUid) return false;
  const roomRef = db.collection('rooms').doc(roomId);
  const [roomSnap, requesterSnap, ownerSnap] = await Promise.all([
    roomRef.get(),
    roomRef.collection('players').doc(requesterUid).get(),
    roomRef.collection('players').doc(ownerUid).get()
  ]);
  if (!roomSnap.exists || !requesterSnap.exists || !ownerSnap.exists) return false;
  if (expectedWorldId && roomWorldId(roomSnap.data() || {}) !== expectedWorldId) return false;
  const nowMs = Date.now();
  const isFresh = (snapshot) => {
    const presence = snapshot.data() || {};
    const lastSeenMs = timestampMillis(presence.lastSeenAt);
    const expiresAtMs = timestampMillis(presence.expiresAt);
    return lastSeenMs > 0 && nowMs - lastSeenMs <= 120_000 &&
      (!expiresAtMs || expiresAtMs >= nowMs - 2_000);
  };
  return isFresh(requesterSnap) && isFresh(ownerSnap);
}

async function consumeOneTimeGrant(db, ref) {
  if (!ref) throw new Error('access_denied');
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (!current.exists || current.data()?.active !== true) throw new Error('access_denied');
    transaction.delete(ref);
  });
}

function buildCommunityRealityCaptureExports(helpers = {}) {
  const db = helpers.db || admin.firestore();
  const bucket = helpers.bucket || admin.storage().bucket();
  const setCors = helpers.setCors;
  const verifyAuth = helpers.verifyAuth;
  const verifyAppCheck = helpers.verifyAppCheck;
  const requireModerator = helpers.requireModerator;
  const logAdminActivity = helpers.logAdminActivity || (async () => {});

  async function guard(req, res, options = {}) {
    if (setCors(req, res)) return null;
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return null;
    }
    if (verifyAppCheck && !(await verifyAppCheck(req, res, { required: options.appCheck !== false }))) return null;
    const auth = await verifyAuth(req, res);
    if (!auth) return null;
    return auth;
  }

  const createRealityCaptureDraft = functions.region('us-central1').https.onRequest(async (req, res) => {
    const auth = await guard(req, res);
    if (!auth) return;
    try {
      const authUser = await admin.auth().getUser(auth.uid);
      const draft = createCaptureDraft(req.body || {}, actorFromAuth(auth, authUser));
      const ref = db.collection(CAPTURES).doc(draft.captureId);
      await db.runTransaction(async (transaction) => {
        const spaceRef = draft.spaceId ? db.collection(SPACES).doc(draft.spaceId) : null;
        const existing = spaceRef ? await transaction.get(spaceRef) : null;
        transaction.create(ref, { ...draft, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        if (!spaceRef) return;
        if (existing.exists && existing.data()?.ownerUid !== auth.uid) throw new Error('space_owner_required');
        transaction.set(spaceRef, {
          spaceId: draft.spaceId,
          kind: 'residential_interior',
          ownerUid: auth.uid,
          canonicalBuilding: draft.building,
          pendingCaptureId: draft.captureId,
          accessMode: existing.exists ? (existing.data()?.accessMode || 'PRIVATE') : 'PRIVATE',
          createdAt: existing.exists ? (existing.data()?.createdAt || FieldValue.serverTimestamp()) : FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        transaction.set(spaceRef.collection('members').doc(auth.uid), {
          uid: auth.uid,
          role: 'owner',
          active: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      });
      res.status(200).json({ capture: { ...draft, uploadPrefix: `reality-captures/${auth.uid}/${draft.captureId}/originals/` } });
    } catch (error) {
      console.error('[createRealityCaptureDraft]', error);
      sendKnownError(res, error);
    }
  });

  const listMyRealityCaptures = functions.region('us-central1').https.onRequest(async (req, res) => {
    const auth = await guard(req, res);
    if (!auth) return;
    try {
      const snap = await db.collection(CAPTURES).where('ownerUid', '==', auth.uid).limit(60).get();
      const captures = snap.docs.map(serializeCapture).sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      res.status(200).json({ captures });
    } catch (error) {
      console.error('[listMyRealityCaptures]', error);
      res.status(500).json({ error: 'Unable to list captures.' });
    }
  });

  const finalizeRealityCaptureUpload = functions.region('us-central1').https.onRequest(async (req, res) => {
    const auth = await guard(req, res);
    if (!auth) return;
    const captureId = clean(req.body?.captureId, 180);
    const ref = db.collection(CAPTURES).doc(captureId);
    try {
      const snap = await ref.get();
      if (!snap.exists) throw new Error('capture_not_found');
      const capture = snap.data() || {};
      if (capture.ownerUid !== auth.uid) throw new Error('capture_owner_required');
      if (!['draft', 'uploading'].includes(capture.status)) throw new Error('invalid_capture_state_transition');
      if (capture.status === 'draft') {
        assertCaptureTransition('draft', 'uploading');
        await ref.set({ status: 'uploading', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      const prefix = `reality-captures/${auth.uid}/${captureId}/originals/`;
      const [files] = await bucket.getFiles({ prefix });
      const rows = [];
      for (const file of files) {
        const [metadata] = await file.getMetadata();
        const contentType = clean(metadata.contentType, 80).toLowerCase();
        const signature = await readObjectPrefix(file, 16);
        if (!imageSignatureMatches(signature, contentType)) throw new Error('photo_signature_mismatch');
        rows.push({
          name: file.name,
          size: Number(metadata.size),
          contentType,
          width: Number(metadata.metadata?.width || 0),
          height: Number(metadata.metadata?.height || 0)
        });
      }
      const uploadSummary = validateUploadedPhotoSet(capture, rows);
      assertCaptureTransition('uploading', 'uploaded');
      await ref.set({ status: 'uploaded', uploadSummary, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      assertCaptureTransition('uploaded', 'queued');
      await ref.set({ status: 'queued', queuedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      res.status(200).json({ captureId, status: 'queued', uploadSummary });
    } catch (error) {
      console.error('[finalizeRealityCaptureUpload]', error);
      if (captureId) await ref.set({
        status: 'processing_failed',
        failure: { code: clean(error?.message || error, 100), stage: 'upload_validation' },
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true }).catch(() => {});
      sendKnownError(res, error);
    }
  });

  const deleteRealityCapture = functions.region('us-central1').https.onRequest(async (req, res) => {
    const auth = await guard(req, res);
    if (!auth) return;
    const captureId = clean(req.body?.captureId, 180);
    try {
      const ref = db.collection(CAPTURES).doc(captureId);
      const snap = await ref.get();
      if (!snap.exists) throw new Error('capture_not_found');
      const capture = snap.data() || {};
      if (!isDeletableByOwner(capture, auth.uid)) throw new Error(capture.status === 'approved' ? 'approved_capture_admin_workflow_required' : 'capture_owner_required');
      const [files] = await bucket.getFiles({ prefix: `reality-captures/${auth.uid}/${captureId}/` });
      await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
      let deletedRelatedDocuments = 0;
      if (capture.spaceId) {
        const spaceRef = db.collection(SPACES).doc(capture.spaceId);
        const spaceSnap = await spaceRef.get();
        if (spaceSnap.exists && spaceSnap.data()?.ownerUid === auth.uid) {
          const space = spaceSnap.data() || {};
          if (space.captureId === captureId || (!space.captureId && space.pendingCaptureId === captureId)) {
            deletedRelatedDocuments += await deleteQueryDocuments(db, spaceRef.collection('members'));
            deletedRelatedDocuments += await deleteQueryDocuments(db, spaceRef.collection('sessionGrants'));
            deletedRelatedDocuments += await deleteQueryDocuments(db, spaceRef.collection('oneTimeGrants'));
            deletedRelatedDocuments += await deleteQueryDocuments(db, db.collection(ACCESS_REQUESTS).where('spaceId', '==', capture.spaceId));
            await spaceRef.delete();
          } else if (space.pendingCaptureId === captureId) {
            await spaceRef.set({ pendingCaptureId: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          }
        }
      }
      await ref.delete();
      res.status(200).json({ deleted: true, captureId, deletedObjects: files.length, deletedRelatedDocuments });
    } catch (error) {
      console.error('[deleteRealityCapture]', error);
      sendKnownError(res, error);
    }
  });

  const resolvePrivateSpaceEntry = functions.region('us-central1').https.onRequest(async (req, res) => {
    const auth = await guard(req, res);
    if (!auth) return;
    try {
      const spaceId = clean(req.body?.spaceId, 180);
      const roomId = clean(req.body?.roomId, 180);
      const spaceSnap = await db.collection(SPACES).doc(spaceId).get();
      if (!spaceSnap.exists) throw new Error('space_not_found');
      const space = spaceSnap.data() || {};
      const spaceRef = db.collection(SPACES).doc(spaceId);
      const context = await readAccessContext(spaceRef, auth.uid, roomId);
      const ownerOnline = await sharedRoomOwnerIsOnline(
        db,
        roomId,
        auth.uid,
        clean(space.ownerUid, 180),
        clean(space.canonicalBuilding?.worldId, 220)
      );
      const decision = resolveSpaceAccess({
        space,
        requesterUid: auth.uid,
        ...context,
        roomId,
        ownerOnline
      });
      if (decision.allowed && decision.scope === 'one_time') await consumeOneTimeGrant(db, context.oneTimeGrantRef);
      res.status(decision.allowed ? 200 : 403).json({ ...decision, spaceId, label: decision.allowed ? clean(space.label || 'Interior', 120) : 'Private Residence' });
    } catch (error) {
      console.error('[resolvePrivateSpaceEntry]', error);
      sendKnownError(res, error);
    }
  });

  const resolveBuildingInteriorRepresentation = functions.region('us-central1').https.onRequest(async (req, res) => {
    const auth = await guard(req, res);
    if (!auth) return;
    try {
      const sourceBuildingId = clean(req.body?.sourceBuildingId, 220);
      const worldId = clean(req.body?.worldId, 220);
      const roomId = clean(req.body?.roomId, 180);
      if (!sourceBuildingId || !worldId) throw new Error('canonical_building_required');
      const spacesSnap = await db.collection(SPACES)
        .where('canonicalBuilding.sourceBuildingId', '==', sourceBuildingId)
        .limit(12)
        .get();
      const matching = spacesSnap.docs.filter((row) => clean(row.data()?.canonicalBuilding?.worldId, 220) === worldId);
      if (!matching.length) return res.status(200).json({ available: false, reason: 'no_captured_interior' });
      let deniedAccess = null;
      const ownerPresence = new Map();
      for (const row of matching) {
        const space = row.data() || {};
        const context = await readAccessContext(row.ref, auth.uid, roomId);
        const ownerUid = clean(space.ownerUid, 180);
        if (!ownerPresence.has(ownerUid)) {
          ownerPresence.set(ownerUid, await sharedRoomOwnerIsOnline(db, roomId, auth.uid, ownerUid, worldId));
        }
        const access = resolveSpaceAccess({
          space,
          requesterUid: auth.uid,
          ...context,
          roomId,
          ownerOnline: ownerPresence.get(ownerUid) === true
        });
        if (!access.allowed) {
          deniedAccess ||= { ...access, spaceId: row.id };
          continue;
        }
        const captureSnap = await db.collection(CAPTURES).doc(space.captureId).get();
        if (!captureSnap.exists) continue;
        const capture = captureSnap.data() || {};
        if (capture.status !== 'approved' || !capture.processed?.optimizedModelPath) continue;
        const file = bucket.file(capture.processed.optimizedModelPath);
        const [exists] = await file.exists();
        if (!exists) continue;
        const expiresAtMs = Date.now() + SIGNED_URL_TTL_MS;
        const [url] = await file.getSignedUrl({ version: 'v4', action: 'read', expires: expiresAtMs });
        if (access.scope === 'one_time') await consumeOneTimeGrant(db, context.oneTimeGrantRef);
        res.set('Cache-Control', 'private, no-store');
        return res.status(200).json({
          available: true,
          authorized: true,
          spaceId: row.id,
          captureId: captureSnap.id,
          room: capture.room || null,
          alignment: capture.review?.alignment || null,
          model: { url, expiresAtMs, cache: 'private-no-store' },
          access
        });
      }
      return res.status(403).json({
        available: true,
        authorized: false,
        reason: deniedAccess?.reason || 'private_residence',
        requestable: deniedAccess?.requestable === true,
        spaceId: deniedAccess?.spaceId || '',
        label: 'Private Residence'
      });
    } catch (error) {
      console.error('[resolveBuildingInteriorRepresentation]', error);
      sendKnownError(res, error);
    }
  });

  const resolveBuildingExteriorRepresentation = functions.region('us-central1').https.onRequest(async (req, res) => {
    if (setCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    if (verifyAppCheck && !(await verifyAppCheck(req, res, { required: true }))) return;
    try {
      const sourceBuildingId = clean(req.body?.sourceBuildingId, 220);
      const worldId = clean(req.body?.worldId, 220);
      if (!sourceBuildingId || !worldId) throw new Error('canonical_building_required');
      const snap = await db.collection(REPRESENTATIONS)
        .where('canonicalBuilding.sourceBuildingId', '==', sourceBuildingId)
        .limit(8)
        .get();
      const match = snap.docs.find((row) => {
        const data = row.data() || {};
        return data.status === 'approved' && data.visibility === 'public' && data.captureKind === 'exterior' &&
          clean(data.canonicalBuilding?.worldId, 220) === worldId;
      });
      if (!match) return res.status(200).json({ available: false });
      const representation = match.data() || {};
      const file = bucket.file(representation.modelPath);
      const [exists] = await file.exists();
      if (!exists) return res.status(200).json({ available: false, reason: 'approved_asset_missing' });
      const expiresAtMs = Date.now() + 10 * 60 * 1000;
      const [url] = await file.getSignedUrl({ version: 'v4', action: 'read', expires: expiresAtMs });
      res.set('Cache-Control', 'public, max-age=300');
      return res.status(200).json({
        available: true,
        representationId: match.id,
        model: { url, expiresAtMs },
        alignment: representation.alignment || null,
        captureSchemaVersion: representation.captureSchemaVersion,
        processingPipelineVersion: representation.processingPipelineVersion
      });
    } catch (error) {
      console.error('[resolveBuildingExteriorRepresentation]', error);
      sendKnownError(res, error);
    }
  });

  const listApprovedExteriorRepresentations = functions.region('us-central1').https.onRequest(async (req, res) => {
    if (setCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    if (verifyAppCheck && !(await verifyAppCheck(req, res, { required: true }))) return;
    try {
      const worldId = clean(req.body?.worldId, 220);
      if (!worldId) throw new Error('canonical_building_required');
      const snapshot = await db.collection(REPRESENTATIONS)
        .where('canonicalBuilding.worldId', '==', worldId)
        .where('status', '==', 'approved')
        .where('visibility', '==', 'public')
        .limit(60)
        .get();
      const representations = [];
      for (const row of snapshot.docs) {
        const data = row.data() || {};
        if (data.captureKind !== 'exterior' || !data.modelPath) continue;
        const file = bucket.file(data.modelPath);
        const [exists] = await file.exists();
        if (!exists) continue;
        const expiresAtMs = Date.now() + 10 * 60 * 1000;
        const [url] = await file.getSignedUrl({ version: 'v4', action: 'read', expires: expiresAtMs });
        representations.push({
          representationId: row.id,
          sourceBuildingId: clean(data.canonicalBuilding?.sourceBuildingId, 220),
          model: { url, expiresAtMs },
          alignment: data.alignment || null,
          captureSchemaVersion: data.captureSchemaVersion,
          processingPipelineVersion: data.processingPipelineVersion
        });
      }
      res.set('Cache-Control', 'private, max-age=120');
      res.status(200).json({ worldId, representations });
    } catch (error) {
      console.error('[listApprovedExteriorRepresentations]', error);
      sendKnownError(res, error);
    }
  });

  const updatePrivateSpaceAccess = functions.region('us-central1').https.onRequest(async (req, res) => {
    const auth = await guard(req, res);
    if (!auth) return;
    try {
      const spaceId = clean(req.body?.spaceId, 180);
      const action = clean(req.body?.action, 40).toLowerCase();
      const spaceRef = db.collection(SPACES).doc(spaceId);
      const spaceSnap = await spaceRef.get();
      if (!spaceSnap.exists) throw new Error('space_not_found');
      const space = spaceSnap.data() || {};
      if (space.ownerUid !== auth.uid) throw new Error('space_owner_required');
      if (action === 'set_mode') {
        const accessMode = clean(req.body?.accessMode, 32).toUpperCase();
        if (!ACCESS_MODES.includes(accessMode)) throw new Error('invalid_access_mode');
        await spaceRef.set({ accessMode, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        res.status(200).json({ spaceId, accessMode });
        return;
      }
      const targetUid = clean(req.body?.targetUid, 180);
      if (!targetUid || targetUid === auth.uid) throw new Error('invalid_guest_identity');
      const memberRef = spaceRef.collection('members').doc(targetUid);
      if (action === 'revoke') {
        await memberRef.delete();
        res.status(200).json({ spaceId, targetUid, revoked: true });
        return;
      }
      if (action !== 'grant') throw new Error('invalid_access_action');
      const role = clean(req.body?.role || 'guest', 24).toLowerCase();
      if (!['co_owner', 'household', 'guest'].includes(role)) throw new Error('invalid_access_role');
      await memberRef.set({ uid: targetUid, role, active: true, grantedBy: auth.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      res.status(200).json({ spaceId, targetUid, role, active: true });
    } catch (error) {
      console.error('[updatePrivateSpaceAccess]', error);
      sendKnownError(res, error);
    }
  });

  const requestPrivateSpaceAccess = functions.region('us-central1').https.onRequest(async (req, res) => {
    const auth = await guard(req, res);
    if (!auth) return;
    try {
      const spaceId = clean(req.body?.spaceId, 180);
      const spaceSnap = await db.collection(SPACES).doc(spaceId).get();
      if (!spaceSnap.exists) throw new Error('space_not_found');
      const space = spaceSnap.data() || {};
      if (space.ownerUid === auth.uid) throw new Error('already_space_owner');
      if (space.accessMode === 'PRIVATE') throw new Error('access_request_not_available');
      const roomId = clean(req.body?.roomId, 180);
      if (!(await sharedRoomOwnerIsOnline(
        db,
        roomId,
        auth.uid,
        clean(space.ownerUid, 180),
        clean(space.canonicalBuilding?.worldId, 220)
      ))) {
        throw new Error('access_request_not_available');
      }
      const requestId = stableId('access', spaceId, auth.uid);
      const requestRef = db.collection(ACCESS_REQUESTS).doc(requestId);
      const existing = await requestRef.get();
      if (existing.exists && existing.data()?.status === 'pending') {
        return res.status(200).json({ requestId, status: 'pending', existing: true });
      }
      await requestRef.set({
        requestId, spaceId, ownerUid: space.ownerUid, requesterUid: auth.uid,
        roomId, status: 'pending', message: multiline(req.body?.message, 240),
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
      }, { merge: false });
      res.status(200).json({ requestId, status: 'pending' });
    } catch (error) {
      console.error('[requestPrivateSpaceAccess]', error);
      sendKnownError(res, error);
    }
  });

  const decidePrivateSpaceAccessRequest = functions.region('us-central1').https.onRequest(async (req, res) => {
    const auth = await guard(req, res);
    if (!auth) return;
    try {
      const requestId = clean(req.body?.requestId, 180);
      const decision = clean(req.body?.decision, 40).toLowerCase();
      const roomId = clean(req.body?.roomId, 180);
      const requestRef = db.collection(ACCESS_REQUESTS).doc(requestId);
      const requestSnap = await requestRef.get();
      if (!requestSnap.exists) throw new Error('access_request_not_found');
      const accessRequest = requestSnap.data() || {};
      if (accessRequest.ownerUid !== auth.uid) throw new Error('space_owner_required');
      if (accessRequest.status !== 'pending') throw new Error('access_request_already_decided');
      const spaceRef = db.collection(SPACES).doc(accessRequest.spaceId);
      if (decision === 'allow_once') {
        await spaceRef.collection('oneTimeGrants').doc(stableId('once', requestId)).set({ uid: accessRequest.requesterUid, active: true, createdAt: FieldValue.serverTimestamp() });
      } else if (decision === 'allow_session') {
        const requestedRoomId = clean(accessRequest.roomId, 180);
        if (!requestedRoomId || (roomId && roomId !== requestedRoomId)) throw new Error('room_required_for_session_access');
        const spaceSnap = await spaceRef.get();
        if (!spaceSnap.exists) throw new Error('space_not_found');
        if (!(await sharedRoomOwnerIsOnline(
          db,
          requestedRoomId,
          accessRequest.requesterUid,
          auth.uid,
          clean(spaceSnap.data()?.canonicalBuilding?.worldId, 220)
        ))) {
          throw new Error('active_shared_room_required');
        }
        await spaceRef.collection('sessionGrants').doc(stableId('session', requestedRoomId, accessRequest.requesterUid)).set({
          uid: accessRequest.requesterUid,
          roomId: requestedRoomId,
          active: true,
          createdAt: FieldValue.serverTimestamp()
        });
      } else if (decision === 'add_guest') {
        await spaceRef.collection('members').doc(accessRequest.requesterUid).set({ uid: accessRequest.requesterUid, role: 'guest', active: true, grantedBy: auth.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      } else if (decision !== 'deny') {
        throw new Error('invalid_access_decision');
      }
      await requestRef.set({ status: decision === 'deny' ? 'denied' : 'approved', decision, decidedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      res.status(200).json({ requestId, decision });
    } catch (error) {
      console.error('[decidePrivateSpaceAccessRequest]', error);
      sendKnownError(res, error);
    }
  });

  const moderateRealityCapture = functions.region('us-central1').https.onRequest(async (req, res) => {
    if (setCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    if (verifyAppCheck && !(await verifyAppCheck(req, res, { required: true }))) return;
    const moderator = await requireModerator(req, res);
    if (!moderator) return;
    try {
      const captureId = clean(req.body?.captureId, 180);
      const decision = clean(req.body?.decision, 40).toLowerCase();
      if (!['approved', 'rejected'].includes(decision)) throw new Error('invalid_moderation_decision');
      const ref = db.collection(CAPTURES).doc(captureId);
      const snap = await ref.get();
      if (!snap.exists) throw new Error('capture_not_found');
      const capture = snap.data() || {};
      assertCaptureTransition(capture.status, decision);
      if (decision === 'approved' && !clean(capture.processed?.optimizedModelPath, 500)) {
        throw new Error('processed_asset_required_for_approval');
      }
      const review = {
        decision,
        note: multiline(req.body?.note, 400),
        alignment: normalizeReviewedAlignment(req.body?.alignment || {}, capture.captureKind),
        moderatorUid: moderator.auth.uid,
        moderatorName: moderator.displayName,
        reviewedAt: FieldValue.serverTimestamp()
      };
      const batch = db.batch();
      batch.set(ref, { status: decision, review, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      let representationId = '';
      if (decision === 'approved' && capture.captureKind === 'exterior' && capture.publicContributionRequested === true) {
        representationId = stableId('representation', capture.building?.worldId, capture.building?.sourceBuildingId, capture.processingPipelineVersion);
        batch.set(db.collection(REPRESENTATIONS).doc(representationId), {
          representationId,
          captureId,
          captureKind: 'exterior',
          canonicalBuilding: capture.building,
          modelPath: capture.processed?.optimizedModelPath || '',
          alignment: review.alignment,
          status: 'approved',
          visibility: 'public',
          captureSchemaVersion: capture.captureSchemaVersion,
          processingPipelineVersion: capture.processingPipelineVersion,
          approvedAt: FieldValue.serverTimestamp(),
          approvedBy: moderator.auth.uid
        }, { merge: true });
      }
      if (decision === 'approved' && capture.captureKind === 'interior_room' && capture.spaceId) {
        batch.set(db.collection(SPACES).doc(capture.spaceId), {
          captureId,
          pendingCaptureId: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      }
      await batch.commit();
      await logAdminActivity({
        actorUid: moderator.auth.uid, actorName: moderator.displayName,
        actionType: `reality_capture.${decision}`, targetType: 'reality_capture', targetId: captureId,
        title: `Reality capture ${decision}`, summary: clean(capture.building?.label || captureId, 140)
      });
      res.status(200).json({ captureId, status: decision, representationId });
    } catch (error) {
      console.error('[moderateRealityCapture]', error);
      sendKnownError(res, error);
    }
  });

  const listRealityCaptureModeration = functions.region('us-central1').https.onRequest(async (req, res) => {
    if (setCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    if (verifyAppCheck && !(await verifyAppCheck(req, res, { required: true }))) return;
    const moderator = await requireModerator(req, res);
    if (!moderator) return;
    try {
      const status = clean(req.body?.status || 'review_required', 40).toLowerCase();
      const allowed = new Set(['all', 'queued', 'processing', 'processing_failed', 'review_required', 'approved', 'rejected']);
      if (!allowed.has(status)) throw new Error('invalid_capture_status');
      const base = db.collection(CAPTURES);
      const snapshot = await (status === 'all' ? base : base.where('status', '==', status)).limit(40).get();
      const items = snapshot.docs.map(serializeCapture).sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      res.set('Cache-Control', 'private, no-store');
      res.status(200).json({ items, status });
    } catch (error) {
      console.error('[listRealityCaptureModeration]', error);
      sendKnownError(res, error);
    }
  });

  const getRealityCaptureModerationDetail = functions.region('us-central1').https.onRequest(async (req, res) => {
    if (setCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    if (verifyAppCheck && !(await verifyAppCheck(req, res, { required: true }))) return;
    const moderator = await requireModerator(req, res);
    if (!moderator) return;
    try {
      const captureId = clean(req.body?.captureId, 180);
      const snapshot = await db.collection(CAPTURES).doc(captureId).get();
      if (!snapshot.exists) throw new Error('capture_not_found');
      const capture = snapshot.data() || {};
      const expiresAtMs = Date.now() + SIGNED_URL_TTL_MS;
      const [originals] = await bucket.getFiles({ prefix: `reality-captures/${capture.ownerUid}/${captureId}/originals/`, maxResults: 12 });
      const thumbnails = [];
      for (const file of originals) {
        const [url] = await file.getSignedUrl({ version: 'v4', action: 'read', expires: expiresAtMs });
        thumbnails.push({ name: file.name.split('/').pop(), url, expiresAtMs });
      }
      let model = null;
      if (capture.processed?.optimizedModelPath) {
        const file = bucket.file(capture.processed.optimizedModelPath);
        const [exists] = await file.exists();
        if (exists) {
          const [url] = await file.getSignedUrl({ version: 'v4', action: 'read', expires: expiresAtMs });
          model = { url, expiresAtMs, path: capture.processed.optimizedModelPath };
        }
      }
      res.set('Cache-Control', 'private, no-store');
      res.status(200).json({ capture: serializeCapture(snapshot), thumbnails, model });
    } catch (error) {
      console.error('[getRealityCaptureModerationDetail]', error);
      sendKnownError(res, error);
    }
  });

  const getRealityCaptureAssetAccess = functions.region('us-central1').https.onRequest(async (req, res) => {
    const auth = await guard(req, res);
    if (!auth) return;
    try {
      const captureId = clean(req.body?.captureId, 180);
      const assetKind = clean(req.body?.assetKind || 'processed', 30).toLowerCase();
      const captureSnap = await db.collection(CAPTURES).doc(captureId).get();
      if (!captureSnap.exists) throw new Error('capture_not_found');
      const capture = captureSnap.data() || {};
      let allowed = capture.ownerUid === auth.uid;
      if (!allowed && capture.captureKind === 'interior_room' && capture.spaceId) {
        const spaceSnap = await db.collection(SPACES).doc(capture.spaceId).get();
        const memberSnap = await db.collection(SPACES).doc(capture.spaceId).collection('members').doc(auth.uid).get();
        allowed = spaceSnap.exists && resolveSpaceAccess({
          space: spaceSnap.data(), requesterUid: auth.uid,
          member: memberSnap.exists ? memberSnap.data() : null
        }).allowed;
      }
      if (!allowed && !(capture.captureKind === 'exterior' && capture.status === 'approved' && capture.publicContributionRequested === true)) {
        throw new Error('asset_access_denied');
      }
      const path = assetKind === 'original'
        ? clean(req.body?.path, 500)
        : clean(capture.processed?.optimizedModelPath, 500);
      const expectedPrefix = `reality-captures/${capture.ownerUid}/${captureId}/`;
      if (!path.startsWith(expectedPrefix)) throw new Error('asset_access_denied');
      const file = bucket.file(path);
      const [exists] = await file.exists();
      if (!exists) throw new Error('asset_not_found');
      const expiresAtMs = Date.now() + SIGNED_URL_TTL_MS;
      const [url] = await file.getSignedUrl({ version: 'v4', action: 'read', expires: expiresAtMs });
      res.set('Cache-Control', 'private, no-store');
      res.status(200).json({ url, expiresAtMs, cache: 'private-no-store' });
    } catch (error) {
      console.error('[getRealityCaptureAssetAccess]', error);
      sendKnownError(res, error);
    }
  });

  return {
    createRealityCaptureDraft,
    decidePrivateSpaceAccessRequest,
    deleteRealityCapture,
    finalizeRealityCaptureUpload,
    getRealityCaptureAssetAccess,
    getRealityCaptureModerationDetail,
    listMyRealityCaptures,
    listApprovedExteriorRepresentations,
    listRealityCaptureModeration,
    moderateRealityCapture,
    requestPrivateSpaceAccess,
    resolveBuildingExteriorRepresentation,
    resolveBuildingInteriorRepresentation,
    resolvePrivateSpaceEntry,
    updatePrivateSpaceAccess
  };
}

module.exports = { buildCommunityRealityCaptureExports };
