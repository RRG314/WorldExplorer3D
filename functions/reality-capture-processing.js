'use strict';

const functions = require('firebase-functions/v1');
const { GoogleAuth, OAuth2Client } = require('google-auth-library');
const { randomUUID } = require('node:crypto');
const { FieldValue } = require('firebase-admin/firestore');

const PIPELINE = 'we3d-meshroom-blender-v2';
const LEASE_MS = 40 * 60_000;
const MAX_DAILY_JOBS = 12;

async function finishCaptureAttempt(db, captureId, attemptId, patch) {
  const ref = db.collection('realityCaptures').doc(captureId);
  const leaseRef = db.doc('captureProcessing/control');
  return db.runTransaction(async (tx) => {
    const [capture, lease] = await Promise.all([tx.get(ref), tx.get(leaseRef)]);
    if (lease.data()?.captureId !== captureId || lease.data()?.attemptId !== attemptId) return false;
    const current = capture.exists && capture.data().status === 'processing' && capture.data().processingAttemptId === attemptId;
    if (current) tx.update(ref, { ...patch, updatedAt: FieldValue.serverTimestamp() });
    tx.update(leaseRef, { captureId: null, attemptId: null, expiresAtMs: 0 });
    return !!current;
  });
}

function buildCaptureProcessingExports({ db, bucket }) {
  const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  const workerEmail = `capture-worker@${project}.iam.gserviceaccount.com`;
  const audience = `https://us-central1-${project}.cloudfunctions.net/realityCaptureWorker`;
  const leaseRef = db.doc('captureProcessing/control');
  const google = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

  async function dispatch() {
    const candidates = await db.collection('realityCaptures').where('status', '==', 'queued').limit(12).get();
    const now = Date.now();
    const currentLease = await leaseRef.get();
    const expired = currentLease.data();
    if (expired?.captureId && expired.expiresAtMs < now) {
      await finish(expired.captureId, expired.attemptId, { status: 'processing_failed', failure: { code: 'processing_time_limit', stage: 'reconstruction' } });
    }
    for (const row of candidates.docs) {
      const attemptId = randomUUID();
      const admitted = await db.runTransaction(async (tx) => {
        const [lease, capture] = await Promise.all([tx.get(leaseRef), tx.get(row.ref)]);
        if (lease.data()?.captureId || !capture.exists || capture.data().status !== 'queued') return false;
        const day = new Date(now).toISOString().slice(0, 10);
        const count = lease.data()?.day === day ? Number(lease.data()?.count || 0) : 0;
        if (count >= MAX_DAILY_JOBS) {
          tx.update(row.ref, { status: 'processing_failed', failure: { code: 'daily_processing_capacity', stage: 'admission' }, updatedAt: FieldValue.serverTimestamp() });
          return false;
        }
        if (!capture.data().inputManifest?.length) {
          tx.update(row.ref, { status: 'processing_failed', failure: { code: 'validated_photos_required', stage: 'admission' }, updatedAt: FieldValue.serverTimestamp() });
          return false;
        }
        tx.set(leaseRef, { day, count: count + 1, captureId: row.id, attemptId, expiresAtMs: now + LEASE_MS });
        tx.update(row.ref, { status: 'processing', processingAttemptId: attemptId,
          processingPipelineVersion: PIPELINE, processingStartedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        return true;
      });
      if (!admitted) continue;
      try {
        const client = await google.getClient();
        await client.request({ url: `https://run.googleapis.com/v2/projects/${project}/locations/us-central1/jobs/capture-meshroom:run`, method: 'POST',
          data: { overrides: { containerOverrides: [{ env: [{ name: 'CAPTURE_ID', value: row.id }, { name: 'CAPTURE_ATTEMPT', value: attemptId }] }] } } });
      } catch (error) {
        // A failed dispatch is visible, never represented as a completed model.
        await finish(row.id, attemptId, { status: 'processing_failed', failure: { code: 'worker_start_failed', stage: 'dispatch' } });
        console.error('Capture worker dispatch failed', error.code || 'unknown');
      }
      break;
    }
  }

  async function finish(captureId, attemptId, patch) {
    return finishCaptureAttempt(db, captureId, attemptId, patch);
  }

  const realityCaptureWorker = functions.region('us-central1').runWith({ timeoutSeconds: 120, memory: '512MB', maxInstances: 2 }).https.onRequest(async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (req.method !== 'POST') return res.status(405).end();
    try {
      const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
      const ticket = await new OAuth2Client().verifyIdToken({ idToken: token, audience });
      if (ticket.getPayload()?.email !== workerEmail || ticket.getPayload()?.email_verified !== true) return res.status(403).end();
      const { captureId, attemptId, action } = req.body || {};
      if (!/^[\w-]{1,180}$/.test(captureId || '') || !/^[\w-]{1,100}$/.test(attemptId || '')) return res.status(400).end();
      const ref = db.collection('realityCaptures').doc(captureId);
      const [snap, lease] = await Promise.all([ref.get(), leaseRef.get()]);
      const capture = snap.data();
      if (!capture || capture.status !== 'processing' || capture.processingAttemptId !== attemptId ||
          lease.data()?.attemptId !== attemptId || lease.data()?.expiresAtMs < Date.now()) return res.status(409).end();
      const destination = `reality-captures/${capture.ownerUid}/${captureId}/processed/${PIPELINE}/${attemptId}/capture.glb`;
      const expires = Date.now() + 35 * 60_000;
      if (action === 'claim') {
        const photos = await Promise.all(capture.inputManifest.map(async (photo) => {
          const [url] = await bucket.file(photo.name, { generation: photo.generation }).getSignedUrl({ version: 'v4', action: 'read', expires });
          return { ...photo, name: photo.name.split('/').pop(), url };
        }));
        const [uploadUrl] = await bucket.file(destination).getSignedUrl({ version: 'v4', action: 'write', expires, contentType: 'model/gltf-binary' });
        return res.json({ captureKind: capture.captureKind, photos, uploadUrl,
          worldContext: { building: capture.building, room: capture.room || null,
            trust: 'capture-context-requires-registration-review' } });
      }
      if (action === 'failed') {
        await finish(captureId, attemptId, { status: 'processing_failed', failure: { code: 'reconstruction_failed', stage: 'reconstruction' } });
        return res.json({ saved: true });
      }
      if (action !== 'complete') return res.status(400).end();
      const file = bucket.file(destination);
      const [metadata] = await file.getMetadata();
      if (Number(metadata.size) > 20 * 1024 * 1024 || Number(metadata.size) < 20) throw Error('model_budget');
      const [bytes] = await file.download();
      const { inspectGlb } = require('./reality-capture-glb');
      const modelInspection = inspectGlb(bytes);
      if (modelInspection.triangles < 1 || modelInspection.triangles > 500000) throw Error('model_triangles');
      await file.setMetadata({ cacheControl: 'private, no-store, max-age=0', contentType: 'model/gltf-binary' });
      const saved = await finish(captureId, attemptId, { status: 'review_required', processingCompletedAt: FieldValue.serverTimestamp(),
        processed: { optimizedModelPath: destination, inputSummary: capture.uploadSummary, modelInspection,
          provenance: { provider: 'meshroom', pipelineVersion: PIPELINE, evidenceClass: 'observation-derived', usesFullPhotoSet: true,
            realReconstructionAcceptance: false, runtimeRevision: String(req.body.revision || '').slice(0, 100) },
          rawCollisionAllowed: false, rawNavigationAllowed: false } });
      if (!saved) await file.delete({ ignoreNotFound: true });
      return res.json({ saved });
    } catch (error) {
      console.error('Capture worker request rejected', error.code || error.name);
      return res.status(422).json({ error: 'Worker request could not be completed.' });
    }
  });

  return {
    realityCaptureWorker,
    dispatchRealityCapture: functions.region('us-central1').runWith({ maxInstances: 1, timeoutSeconds: 120 }).firestore.document('realityCaptures/{captureId}').onWrite(async (change) => {
      if (change.after.data()?.status === 'queued' || change.before.data()?.status === 'processing') await dispatch();
    }),
    recoverRealityCaptureQueue: functions.region('us-central1').runWith({ maxInstances: 1, timeoutSeconds: 120 }).pubsub.schedule('every 5 minutes').onRun(dispatch)
  };
}

module.exports = { buildCaptureProcessingExports, finishCaptureAttempt };
