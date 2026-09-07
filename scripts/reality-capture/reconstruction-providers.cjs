'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PROVIDERS = Object.freeze(['meshroom', 'trellis2-image', 'trellis2-texture']);

function providerOptions(argv = [], env = process.env) {
  const value = (flag, fallback = '') => {
    const index = argv.indexOf(flag);
    if (index < 0) return fallback;
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) throw Error(`missing_${flag.slice(2)}`);
    return next;
  };
  const provider = value('--provider', env.WE3D_RECONSTRUCTION_PROVIDER || 'meshroom');
  if (!PROVIDERS.includes(provider)) throw Error('unknown_reconstruction_provider');
  const baseMesh = value('--base-mesh', env.WE3D_RECONSTRUCTION_BASE_MESH || '');
  const referencePhoto = value('--reference-photo', env.WE3D_RECONSTRUCTION_REFERENCE_PHOTO || '');
  if (provider === 'trellis2-texture' && !baseMesh) throw Error('texture_provider_requires_base_mesh');
  if (provider.startsWith('trellis2') && !referencePhoto) throw Error('trellis_provider_requires_selected_reference_photo');
  if (referencePhoto && (referencePhoto !== path.basename(referencePhoto) || !/^[a-f0-9]{32}\.(jpg|webp)$/.test(referencePhoto))) {
    throw Error('invalid_reference_photo');
  }
  return { provider, baseMesh: baseMesh ? path.resolve(baseMesh) : '', referencePhoto,
    pipelineVersion: `we3d-${provider}-blender-v2`,
    evidenceClass: provider === 'meshroom' ? 'observation-derived' : 'synthetic-inferred' };
}

function run(command, args, options = {}) {
  const { timeoutMs = 30 * 60_000, ...spawnOptions } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...spawnOptions, stdio: 'inherit', shell: false, detached: process.platform !== 'win32' });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch (_) {}
    }, timeoutMs);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (timedOut) reject(Error('reconstruction_process_timeout'));
      else if (code === 0) resolve();
      else reject(Error(`${path.basename(command)}_failed_${code ?? signal}`));
    });
  });
}

async function findFirst(directory, fileName) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) { const result = await findFirst(candidate, fileName); if (result) return result; }
    else if (entry.isFile() && entry.name === fileName) return candidate;
  }
  return '';
}

async function reconstruct(options, job, dependencies = {}) {
  const execute = dependencies.run || run;
  const env = dependencies.env || process.env;
  let source;
  if (options.provider === 'meshroom') {
    await execute(env.MESHROOM_BATCH_BIN || 'meshroom_batch', ['--input', job.images, '--output', job.output, '--cache', job.cache], { cwd: job.work });
    source = await findFirst(job.output, 'texturedMesh.obj') || await findFirst(job.cache, 'texturedMesh.obj');
    if (!source) throw Error('meshroom_textured_mesh_missing');
  } else {
    const image = path.join(job.images, options.referencePhoto);
    await fs.access(image);
    if (options.baseMesh) await fs.access(options.baseMesh);
    source = path.join(job.output, 'trellis-candidate.glb');
    const args = [path.join(__dirname, 'trellis2-provider.py'), '--mode', options.provider === 'trellis2-texture' ? 'texture' : 'image',
      '--image', image, '--output', source];
    if (options.baseMesh) args.push('--mesh', options.baseMesh);
    await execute(env.WE3D_RECONSTRUCTION_PYTHON || 'python3', args, { cwd: job.work });
  }
  // All providers converge on the same optimization and GLB inspection path.
  await execute(env.BLENDER_BIN || 'blender', ['--background', '--factory-startup', '--python',
    path.join(__dirname, 'blender-export-glb.py'), '--', '--input', source, '--output', job.finalGlb], { cwd: path.dirname(source) });
  return { provider: options.provider, pipelineVersion: options.pipelineVersion, evidenceClass: options.evidenceClass,
    referencePhoto: options.referencePhoto || null,
    model: options.provider.startsWith('trellis2') ? (env.WE3D_TRELLIS_MODEL || 'microsoft/TRELLIS.2-4B') : null,
    runtimeRevision: env.WE3D_RECONSTRUCTION_REVISION || 'unrecorded',
    usesFullPhotoSet: options.provider === 'meshroom',
    geometryAuthority: 'canonical-mapped-building', collisionAuthority: 'existing-gameplay',
    realReconstructionAcceptance: false };
}

module.exports = { PROVIDERS, providerOptions, reconstruct, run };
