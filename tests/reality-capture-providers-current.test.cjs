'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { providerOptions, reconstruct, run } = require('../scripts/reality-capture/reconstruction-providers.cjs');
const { finishCaptureAttempt } = require('../functions/reality-capture-processing');

test('provider selection preserves Meshroom default and explicitly identifies generated candidates', () => {
  assert.equal(providerOptions([], {}).provider, 'meshroom');
  assert.throws(() => providerOptions(['--provider', 'unknown'], {}), /unknown_reconstruction/);
  assert.throws(() => providerOptions(['--provider'], {}), /missing_provider/);
  assert.throws(() => providerOptions(['--provider', 'trellis2-texture'], {}), /base_mesh/);
  assert.throws(() => providerOptions(['--provider', 'trellis2-image'], {}), /reference_photo/);
  assert.throws(() => providerOptions(['--reference-photo', '../private.jpg'], {}), /invalid_reference_photo/);
  const options = providerOptions(['--provider', 'trellis2-image', '--reference-photo', `${'a'.repeat(32)}.jpg`], {});
  assert.equal(options.evidenceClass, 'synthetic-inferred');
});

test('all real provider paths converge on the same optimizer (command contract, not GPU inference)', async () => {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'we3d-provider-test-'));
  try {
    const job = { work, images: path.join(work, 'images'), output: path.join(work, 'output'), cache: path.join(work, 'cache'), finalGlb: path.join(work, 'final.glb') };
    for (const dir of [job.images, job.output, job.cache]) await fs.mkdir(dir);
    const referencePhoto = `${'a'.repeat(32)}.jpg`;
    await fs.writeFile(path.join(job.images, referencePhoto), 'command-contract-only');
    const baseMesh = path.join(work, 'base.glb');
    await fs.writeFile(baseMesh, 'command-contract-only');
    for (const provider of ['meshroom', 'trellis2-image', 'trellis2-texture']) {
      const calls = [];
      const options = providerOptions(['--provider', provider, '--reference-photo', referencePhoto, '--base-mesh', baseMesh], {});
      const result = await reconstruct(options, job, { env: {}, run: async (command, args) => {
        calls.push({ command, args });
        if (command === 'meshroom_batch') await fs.writeFile(path.join(job.output, 'texturedMesh.obj'), 'contract');
      } });
      assert.equal(calls.length, 2);
      assert.equal(calls[1].command, 'blender');
      assert.equal(calls[1].args.at(-1), job.finalGlb);
      assert.equal(result.provider, provider);
      assert.equal(result.realReconstructionAcceptance, false);
      if (provider === 'meshroom') {
        assert.ok(calls[0].args.includes('FeatureExtraction:forceCpuExtraction=false'));
        assert.ok(calls[0].args.includes('FeatureExtraction:maxThreads=4'));
      }
      if (provider !== 'meshroom') assert.ok(calls[0].args.includes(path.join(job.images, referencePhoto)));
    }
  } finally { await fs.rm(work, { recursive: true, force: true }); }
});

test('process runner reports success, failure and timeout from actual child processes', async () => {
  await run(process.execPath, ['-e', 'process.exit(0)']);
  await assert.rejects(run(process.execPath, ['-e', 'process.exit(3)']), /failed_3/);
  await assert.rejects(run(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 100 }), /timeout/);
});

test('stale worker completion cannot recreate deleted or superseded captures', async () => {
  for (const data of [null, { status: 'approved', processingAttemptId: 'mine' }, { status: 'processing', processingAttemptId: 'newer' }, { status: 'processing', processingAttemptId: 'mine' }]) {
    const updates = [];
    const ref = {}, lease = {};
    const db = { doc: () => lease, collection: () => ({ doc: () => ref }), runTransaction: async (callback) => callback({
      get: async (reference) => reference === lease ? { exists: true, data: () => ({ captureId: 'capture', attemptId: 'mine' }) } :
        { exists: data !== null, data: () => data }, update: (reference, patch) => updates.push({ reference, patch })
    }) };
    const allowed = data?.status === 'processing' && data.processingAttemptId === 'mine';
    assert.equal(await finishCaptureAttempt(db, 'capture', 'mine', { status: 'review_required' }), allowed);
    assert.equal(updates.filter(row => row.reference === ref).length, allowed ? 1 : 0);
    assert.equal(updates.filter(row => row.reference === lease).length, 1);
  }
});
