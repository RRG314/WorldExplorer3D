'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { providerOptions, reconstruct } = require('./reconstruction-providers.cjs');
const { inspectGlb } = require('./glb-inspection.cjs');

async function main() {
  const broker = process.env.CAPTURE_BROKER;
  if (!/^https:\/\/us-central1-[\w-]+\.cloudfunctions\.net\/realityCaptureWorker$/.test(broker || '')) throw Error('invalid_broker');
  const identity = await fetch(`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(broker)}`, { headers: { 'Metadata-Flavor': 'Google' } });
  if (!identity.ok) throw Error('worker_identity_unavailable');
  const token = await identity.text();
  const post = async (action, fields = {}) => {
    const r = await fetch(broker, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, captureId: process.env.CAPTURE_ID, attemptId: process.env.CAPTURE_ATTEMPT, ...fields }), signal: AbortSignal.timeout(120000) });
    if (!r.ok) throw Error(`broker_${action}_${r.status}`);
    return r.json();
  };
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'we3d-capture-'));
  try {
    const manifest = await post('claim');
    if (!Array.isArray(manifest.photos) || manifest.photos.length > 48) throw Error('input_budget');
    const job = { work, images: path.join(work, 'images'), output: path.join(work, 'output'), cache: path.join(work, 'cache'), finalGlb: path.join(work, 'capture.glb') };
    await Promise.all([fs.mkdir(job.images), fs.mkdir(job.output), fs.mkdir(job.cache)]);
    for (const photo of manifest.photos) {
      if (!/^[a-f0-9]{32}\.(jpg|webp)$/.test(photo.name) || photo.size > 12 * 1024 * 1024) throw Error('invalid_photo');
      const r = await fetch(photo.url, { signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw Error(`photo_download_${r.status}`);
      const bytes = Buffer.from(await r.arrayBuffer());
      if (bytes.length !== photo.size) throw Error('photo_size_mismatch');
      await fs.writeFile(path.join(job.images, photo.name), bytes, { flag: 'wx', mode: 0o600 });
    }
    const reconstruction = await reconstruct(providerOptions([]), job);
    const bytes = await fs.readFile(job.finalGlb);
    const inspection = inspectGlb(bytes);
    if (bytes.length > 20 * 1024 * 1024 || inspection.triangles > 500000) throw Error('output_budget');
    const upload = await fetch(manifest.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'model/gltf-binary', 'x-goog-if-generation-match':'0' }, body: bytes, signal: AbortSignal.timeout(120000) });
    if (!upload.ok) throw Error(`output_upload_${upload.status}`);
    await post('complete', { revision: process.env.WE3D_RECONSTRUCTION_REVISION, registration: reconstruction.registration });
    console.log('Capture reconstruction completed', inspection);
  } catch (error) {
    await post('failed').catch(() => {});
    // Do not log signed URLs, credentials, photos, or the private source identity.
    console.error('Capture reconstruction failed', String(error.message).replace(/https?:\/\/\S+/g, '[redacted]').slice(0, 160));
    process.exitCode = 1;
  } finally { await fs.rm(work, { recursive: true, force: true }); }
}

main().catch(() => { console.error('Worker startup failed'); process.exitCode = 1; });
