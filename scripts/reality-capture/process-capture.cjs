#!/usr/bin/env node
'use strict';

const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const admin = (() => {
  try {
    return require('firebase-admin');
  } catch (_) {
    return require('../../functions/node_modules/firebase-admin');
  }
})();
const { FieldValue } = admin.firestore;
const {
  CAPTURE_LIMITS,
  assertCaptureTransition,
  imageSignatureMatches,
  validateUploadedPhotoSet
} = require('../../functions/reality-capture-authority.js');
const { inspectGlb } = require('./glb-inspection.cjs');
const { providerOptions, reconstruct } = require('./reconstruction-providers.cjs');

const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_TRIANGLES = 500_000;

async function claimCapture(db, captureId, processingAttemptId, pipelineVersion) {
  const ref = db.collection('realityCaptures').doc(captureId);
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new Error('capture_not_found');
    const capture = snap.data() || {};
    assertCaptureTransition(capture.status, 'processing');
    transaction.set(ref, {
      status: 'processing',
      processingPipelineVersion: pipelineVersion,
      processingAttemptId,
      processingStartedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      failure: FieldValue.delete()
    }, { merge: true });
    return capture;
  });
}

async function finishAttempt(db, captureId, attemptId, patch) {
  const ref = db.collection('realityCaptures').doc(captureId);
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists || snap.data()?.status !== 'processing' || snap.data()?.processingAttemptId !== attemptId) return false;
    transaction.update(ref, patch);
    return true;
  });
}

async function main() {
  const captureId = String(process.argv[2] || '').trim();
  if (!captureId) throw new Error('Usage: node scripts/reality-capture/process-capture.cjs CAPTURE_ID [--fixture-glb /path/model.glb]');
  const fixtureIndex = process.argv.indexOf('--fixture-glb');
  if (fixtureIndex >= 0 && !process.argv[fixtureIndex + 1]) throw Error('fixture_path_required');
  const fixtureGlb = fixtureIndex >= 0 ? path.resolve(process.argv[fixtureIndex + 1]) : '';
  const provider = providerOptions(process.argv.slice(3));
  const attemptId = randomUUID();
  if (!admin.apps.length) admin.initializeApp();
  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  const work = await fs.mkdtemp(path.join(os.tmpdir(), `we3d-capture-${captureId.slice(0, 12)}-`));
  const images = path.join(work, 'images');
  const output = path.join(work, 'output');
  const cache = path.join(work, 'cache');
  const finalGlb = path.join(work, 'capture.glb');
  let destination = '';
  let uploaded = false;
  try {
    await Promise.all([fs.mkdir(images), fs.mkdir(output), fs.mkdir(cache)]);
    const capture = await claimCapture(db, captureId, attemptId, provider.pipelineVersion);
    const prefix = `reality-captures/${capture.ownerUid}/${captureId}/originals/`;
    const [objects] = await bucket.getFiles({ prefix });
    if (objects.length > CAPTURE_LIMITS[capture.captureKind].maxPhotos) throw Error('too_many_photos');
    const rows = [];
    for (let index = 0; index < objects.length; index += 1) {
      const object = objects[index];
      const [metadata] = await object.getMetadata();
      if (!CAPTURE_LIMITS.allowedMimeTypes.includes(metadata.contentType) || Number(metadata.size) > CAPTURE_LIMITS.maxFileBytes) throw Error('invalid_photo_metadata');
      const bytes = await object.download().then((result) => result[0]);
      if (bytes.length > CAPTURE_LIMITS.maxFileBytes) throw Error('photo_size_exceeded');
      if (!imageSignatureMatches(bytes.subarray(0, 16), metadata.contentType)) throw new Error('photo_signature_mismatch');
      const fileName = object.name.slice(prefix.length);
      if (!/^[a-f0-9]{32}\.(jpg|webp)$/.test(fileName)) throw Error('invalid_photo_name');
      await fs.writeFile(path.join(images, fileName), bytes, { flag: 'wx', mode: 0o600 });
      rows.push({
        name: fileName,
        size: bytes.length,
        contentType: metadata.contentType,
        width: Number(metadata.metadata?.width || 0),
        height: Number(metadata.metadata?.height || 0)
      });
    }
    const inputSummary = validateUploadedPhotoSet(capture, rows);
    let provenance;
    if (fixtureGlb) {
      await fs.copyFile(fixtureGlb, finalGlb);
      provenance = { provider: 'fixture', evidenceClass: 'fixture', realReconstructionAcceptance: false };
    } else {
      provenance = await reconstruct(provider, { images, output, cache, work, finalGlb });
    }
    const modelBytes = await fs.readFile(finalGlb);
    if (modelBytes.length > MAX_OUTPUT_BYTES) throw new Error('optimized_model_budget_exceeded');
    const modelInspection = inspectGlb(modelBytes);
    if (modelInspection.triangles > MAX_OUTPUT_TRIANGLES) throw new Error('optimized_triangle_budget_exceeded');
    destination = `reality-captures/${capture.ownerUid}/${captureId}/processed/${provider.pipelineVersion}/${attemptId}/capture.glb`;
    await bucket.file(destination).save(modelBytes, {
      resumable: false,
      validation: 'crc32c',
      metadata: {
        contentType: 'model/gltf-binary',
        cacheControl: 'private, no-store, max-age=0',
        metadata: { captureId, ownerUid: capture.ownerUid, pipelineVersion: provider.pipelineVersion, attemptId, provider: provenance.provider }
      }
    });
    uploaded = true;
    assertCaptureTransition('processing', 'review_required');
    const finished = await finishAttempt(db, captureId, attemptId, {
      status: 'review_required',
      processed: {
        optimizedModelPath: destination,
        inputSummary,
        modelInspection,
        provenance,
        rawCollisionAllowed: false,
        rawNavigationAllowed: false
      },
      processingCompletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    if (!finished) throw Error('capture_attempt_superseded');
    process.stdout.write(`${JSON.stringify({ captureId, status: 'review_required', destination, inputSummary, modelInspection }, null, 2)}\n`);
  } catch (error) {
    if (uploaded) await bucket.file(destination).delete({ ignoreNotFound: true }).catch(() => {});
    await finishAttempt(db, captureId, attemptId, {
      status: 'processing_failed',
      failure: { code: String(error?.message || error).slice(0, 120), stage: 'reconstruction' },
      updatedAt: FieldValue.serverTimestamp()
    });
    throw error;
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

module.exports = { claimCapture, finishAttempt };

if (require.main === module) {
  main().catch((error) => {
    console.error('[reality-capture-worker]', error?.stack || error);
    process.exitCode = 1;
  });
}
