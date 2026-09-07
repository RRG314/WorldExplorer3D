#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
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
  PROCESSING_PIPELINE_VERSION,
  assertCaptureTransition,
  imageSignatureMatches,
  validateUploadedPhotoSet
} = require('../../functions/reality-capture-authority.js');
const { inspectGlb } = require('./glb-inspection.cjs');

const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_TRIANGLES = 500_000;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${command}_failed_${code ?? signal}`)));
  });
}

async function findFirst(directory, fileName) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFirst(candidate, fileName);
      if (nested) return nested;
    } else if (entry.name === fileName) return candidate;
  }
  return '';
}

async function claimCapture(db, captureId) {
  const ref = db.collection('realityCaptures').doc(captureId);
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new Error('capture_not_found');
    const capture = snap.data() || {};
    assertCaptureTransition(capture.status, 'processing');
    transaction.set(ref, {
      status: 'processing',
      processingPipelineVersion: PROCESSING_PIPELINE_VERSION,
      processingStartedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      failure: FieldValue.delete()
    }, { merge: true });
    return capture;
  });
}

async function main() {
  const captureId = String(process.argv[2] || '').trim();
  if (!captureId) throw new Error('Usage: node scripts/reality-capture/process-capture.cjs CAPTURE_ID [--fixture-glb /path/model.glb]');
  const fixtureIndex = process.argv.indexOf('--fixture-glb');
  const fixtureGlb = fixtureIndex >= 0 ? path.resolve(process.argv[fixtureIndex + 1] || '') : '';
  if (!admin.apps.length) admin.initializeApp();
  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  const capture = await claimCapture(db, captureId);
  const work = await fs.mkdtemp(path.join(os.tmpdir(), `we3d-capture-${captureId.slice(0, 12)}-`));
  const images = path.join(work, 'images');
  const output = path.join(work, 'output');
  const cache = path.join(work, 'cache');
  const finalGlb = path.join(work, 'capture.glb');
  await Promise.all([fs.mkdir(images), fs.mkdir(output), fs.mkdir(cache)]);
  try {
    const prefix = `reality-captures/${capture.ownerUid}/${captureId}/originals/`;
    const [objects] = await bucket.getFiles({ prefix });
    const rows = [];
    for (let index = 0; index < objects.length; index += 1) {
      const object = objects[index];
      const [metadata] = await object.getMetadata();
      const bytes = await object.download().then((result) => result[0]);
      if (!imageSignatureMatches(bytes.subarray(0, 16), metadata.contentType)) throw new Error('photo_signature_mismatch');
      const fileName = `${String(index).padStart(3, '0')}.jpg`;
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
    if (fixtureGlb) {
      await fs.copyFile(fixtureGlb, finalGlb);
    } else {
      const meshroom = process.env.MESHROOM_BATCH_BIN || 'meshroom_batch';
      const blender = process.env.BLENDER_BIN || 'blender';
      await run(meshroom, ['--input', images, '--output', output, '--cache', cache], { cwd: work });
      const texturedObj = await findFirst(output, 'texturedMesh.obj') || await findFirst(cache, 'texturedMesh.obj');
      if (!texturedObj) throw new Error('meshroom_textured_mesh_missing');
      await run(blender, [
        '--background', '--factory-startup', '--python', path.resolve(__dirname, 'blender-export-glb.py'), '--',
        '--input', texturedObj, '--output', finalGlb
      ], { cwd: path.dirname(texturedObj) });
    }
    const modelBytes = await fs.readFile(finalGlb);
    if (modelBytes.length > MAX_OUTPUT_BYTES) throw new Error('optimized_model_budget_exceeded');
    const modelInspection = inspectGlb(modelBytes);
    if (modelInspection.triangles > MAX_OUTPUT_TRIANGLES) throw new Error('optimized_triangle_budget_exceeded');
    const destination = `reality-captures/${capture.ownerUid}/${captureId}/processed/${PROCESSING_PIPELINE_VERSION}/capture.glb`;
    await bucket.file(destination).save(modelBytes, {
      resumable: false,
      validation: 'crc32c',
      metadata: {
        contentType: 'model/gltf-binary',
        cacheControl: 'private, no-store, max-age=0',
        metadata: { captureId, ownerUid: capture.ownerUid, pipelineVersion: PROCESSING_PIPELINE_VERSION }
      }
    });
    assertCaptureTransition('processing', 'review_required');
    await db.collection('realityCaptures').doc(captureId).set({
      status: 'review_required',
      processed: {
        optimizedModelPath: destination,
        inputSummary,
        modelInspection,
        rawCollisionAllowed: false,
        rawNavigationAllowed: false
      },
      processingCompletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    process.stdout.write(`${JSON.stringify({ captureId, status: 'review_required', destination, inputSummary, modelInspection }, null, 2)}\n`);
  } catch (error) {
    await db.collection('realityCaptures').doc(captureId).set({
      status: 'processing_failed',
      failure: { code: String(error?.message || error).slice(0, 120), stage: 'reconstruction' },
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    throw error;
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[reality-capture-worker]', error?.stack || error);
    process.exitCode = 1;
  });
}
