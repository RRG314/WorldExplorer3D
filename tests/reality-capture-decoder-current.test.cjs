'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const sharp = require('../functions/node_modules/sharp');
const { validateCaptureObjects } = require('../functions/reality-capture-upload-validation');
const capture = { ownerUid: 'owner', captureId: 'capture-test', captureKind: 'exterior' };

function input(bytes, metadata = {}) {
  const files = Array.from({ length: 20 }, (_, i) => ({ name: `reality-captures/owner/capture-test/originals/${String(i).padStart(32, '0')}.jpg`,
    getMetadata: async () => [{ size: bytes.length, contentType: 'image/jpeg', generation: '987', metadata: { width: 4096, height: 4096 }, ...metadata }] }));
  const bucket = { file: (_, options) => { assert.equal(options.generation, '987'); return { download: async () => [bytes] }; } };
  return { bucket, files };
}

test('real decoding pins generations and does not trust claimed pixel dimensions', async () => {
  const bytes = await sharp({ create: { width: 1280, height: 720, channels: 3, background: '#869db0' } }).jpeg().toBuffer();
  const { bucket, files } = input(bytes);
  const result = await validateCaptureObjects(bucket, capture, files);
  assert.equal(result.manifest.length, 20);
  assert.equal(result.manifest[0].width, 1280);
  assert.equal(result.manifest[0].generation, '987');
  assert.equal(result.manifest[0].sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(result.manifest[0].sector, -1, 'Missing view metadata must not become fabricated front coverage');
});

test('truncated JPEG, disguised PNG, undersized raster and missing generation are rejected before queuing', async () => {
  const raster = sharp({ create: { width: 1280, height: 720, channels: 3, background: '#869db0' } });
  const valid = await raster.clone().jpeg().toBuffer();
  for (const bytes of [valid.subarray(0, Math.floor(valid.length / 2)), await raster.clone().png().toBuffer(),
    await raster.clone().resize(100, 100).jpeg().toBuffer()]) {
    const { bucket, files } = input(bytes);
    await assert.rejects(validateCaptureObjects(bucket, capture, files));
  }
  const { bucket, files } = input(valid, { generation: undefined });
  await assert.rejects(validateCaptureObjects(bucket, capture, files), /generation_required/);
});
