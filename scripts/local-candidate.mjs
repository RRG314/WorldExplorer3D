#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const candidateRoot = path.join(rootDir, '.local-candidates');

function git(args) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function requireCleanSource() {
  const status = git(['status', '--porcelain=v1', '--untracked-files=normal']);
  if (status) {
    throw new Error('Immutable candidates require a clean worktree. Commit the accepted change first.');
  }
}

function safeCandidateId(value) {
  const candidateId = String(value || '').trim();
  if (!/^[a-zA-Z0-9._+-]+$/.test(candidateId)) {
    throw new Error(`Invalid candidate id: ${candidateId || '(empty)'}`);
  }
  return candidateId;
}

async function readManifest(directory, { requireCurrentCommit = false } = {}) {
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'build-manifest.json'), 'utf8'));
  const candidateId = safeCandidateId(manifest?.candidateId);
  if (candidateId !== String(manifest?.buildId || '')) {
    throw new Error('Candidate id and build id differ.');
  }
  if (manifest.sourceDirty !== false) {
    throw new Error('Refusing to preserve an artifact built from dirty source.');
  }
  if (requireCurrentCommit && String(manifest.commit || '') !== git(['rev-parse', 'HEAD'])) {
    throw new Error('Artifact commit does not match HEAD.');
  }
  return manifest;
}

async function createCandidate(firebaseEnvironment = 'staging') {
  requireCleanSource();
  execFileSync(process.execPath, [
    'scripts/hosting-artifact.mjs',
    'build',
    '--firebase-env',
    firebaseEnvironment
  ], { cwd: rootDir, stdio: 'inherit' });
  const manifest = await readManifest(path.join(rootDir, 'dist'), { requireCurrentCommit: true });
  const destination = path.join(candidateRoot, manifest.candidateId);
  await fs.mkdir(candidateRoot, { recursive: true });
  try {
    await fs.access(destination);
    const existing = await readManifest(destination);
    if (existing.contentHash !== manifest.contentHash) {
      throw new Error(`Candidate directory already exists with different content: ${destination}`);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await fs.cp(path.join(rootDir, 'dist'), destination, { recursive: true, errorOnExist: true });
  }
  await fs.writeFile(path.join(candidateRoot, 'latest'), `${manifest.candidateId}\n`, 'utf8');
  return { destination, manifest };
}

async function resolveCandidate(requestedId = '') {
  const candidateId = safeCandidateId(requestedId || String(
    await fs.readFile(path.join(candidateRoot, 'latest'), 'utf8')
  ).trim());
  const destination = path.join(candidateRoot, candidateId);
  const manifest = await readManifest(destination);
  return { destination, manifest };
}

async function serveCandidate(candidate, port = Number(process.env.PORT || 4193)) {
  const child = spawn(process.execPath, ['scripts/serve-local-preview.mjs'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(port),
      WE3D_PREVIEW_ROOT: candidate.destination
    },
    stdio: 'inherit'
  });
  const forward = (signal) => child.kill(signal);
  process.once('SIGINT', forward);
  process.once('SIGTERM', forward);
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(Number(code || 0)));
  });
  process.exitCode = exitCode;
}

const command = String(process.argv[2] || 'create').toLowerCase();
try {
  if (command === 'create') {
    const candidate = await createCandidate(String(process.env.WE3D_FIREBASE_ENV || 'staging'));
    console.log(JSON.stringify({
      ok: true,
      candidateId: candidate.manifest.candidateId,
      commit: candidate.manifest.commit,
      contentHash: candidate.manifest.contentHash,
      directory: candidate.destination
    }, null, 2));
  } else if (command === 'serve') {
    await serveCandidate(await resolveCandidate(process.argv[3] || ''));
  } else if (command === 'create-and-serve') {
    await serveCandidate(await createCandidate(String(process.env.WE3D_FIREBASE_ENV || 'staging')));
  } else {
    throw new Error('Usage: node scripts/local-candidate.mjs <create|serve [candidate-id]|create-and-serve>');
  }
} catch (error) {
  console.error('[local-candidate] Failed:', error?.stack || error?.message || String(error));
  process.exitCode = 1;
}
