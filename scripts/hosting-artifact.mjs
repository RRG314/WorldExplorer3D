#!/usr/bin/env node

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'dist');
const ASSET_MANIFEST = 'asset-manifest.json';
const BUILD_MANIFEST = 'build-manifest.json';
const SOURCE_ENTRIES = [
  'about.html',
  'favicon.svg',
  'index.html',
  'about',
  'account',
  'app',
  'assets',
  'js',
  'legal'
];
const GENERATED_PATHS = new Set([
  'js/firebase-project-config.js',
  '__/firebase/init.json',
  '__/firebase/init.js'
]);

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readFlag(name, fallback = '') {
  const exact = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback;
}

function git(args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

async function listFiles(directory, base = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = base ? path.join(base, entry.name) : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolute, relative));
    else if (entry.isFile()) files.push(normalizePath(relative));
  }
  return files;
}

async function collectSourceFiles() {
  const files = new Map();
  for (const entry of SOURCE_ENTRIES) {
    const absolute = path.join(ROOT, entry);
    const stat = await fs.stat(absolute);
    if (stat.isFile()) {
      files.set(normalizePath(entry), absolute);
      continue;
    }
    for (const relative of await listFiles(absolute)) {
      files.set(normalizePath(path.join(entry, relative)), path.join(absolute, relative));
    }
  }
  return new Map([...files.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

async function copySources(sourceFiles) {
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  for (const [relative, source] of sourceFiles) {
    const target = path.join(OUTPUT_DIR, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  }
}

function firebaseConfigPath(environment) {
  if (environment !== 'production' && environment !== 'staging') {
    throw new Error(`Unknown Firebase environment "${environment}". Expected production or staging.`);
  }
  return path.join(ROOT, 'config', `firebase.${environment}.json`);
}

function firebaseProjectScript(environment, config) {
  return `window.WORLD_EXPLORER_FIREBASE_ENV = ${JSON.stringify(environment)};\n` +
    `window.WORLD_EXPLORER_FIREBASE = window.WORLD_EXPLORER_FIREBASE || ${JSON.stringify(config, null, 2)};\n`;
}

function firebaseInitJson(config) {
  const payload = {
    apiKey: String(config.apiKey || ''),
    appId: String(config.appId || ''),
    authDomain: String(config.authDomain || ''),
    measurementId: String(config.measurementId || ''),
    messagingSenderId: String(config.messagingSenderId || ''),
    projectId: String(config.projectId || ''),
    storageBucket: String(config.storageBucket || '')
  };
  return canonicalJson(payload);
}

async function writeGeneratedFirebaseFiles(environment, config) {
  const files = {
    'js/firebase-project-config.js': firebaseProjectScript(environment, config),
    '__/firebase/init.json': firebaseInitJson(config),
    '__/firebase/init.js': `self.__FIREBASE_DEFAULTS__ = ${firebaseInitJson(config).trim()};\n`
  };
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(OUTPUT_DIR, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
  }
}

async function hashFile(filePath) {
  return sha256(await fs.readFile(filePath));
}

async function hashOutputFiles() {
  const files = {};
  for (const relative of await listFiles(OUTPUT_DIR)) {
    if (relative === ASSET_MANIFEST || relative === BUILD_MANIFEST) continue;
    files[relative] = await hashFile(path.join(OUTPUT_DIR, relative));
  }
  return files;
}

async function sourceFingerprint(sourceFiles, environment, config) {
  const records = [];
  for (const [relative, absolute] of sourceFiles) {
    records.push([relative, await hashFile(absolute)]);
  }
  records.push([`config/firebase.${environment}.json`, sha256(canonicalJson(config))]);
  return sha256(canonicalJson(records));
}

async function readPackage() {
  return JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));
}

async function packageLockSha256() {
  return hashFile(path.join(ROOT, 'package-lock.json'));
}

async function buildArtifact(environment) {
  const sourceFiles = await collectSourceFiles();
  const config = JSON.parse(await fs.readFile(firebaseConfigPath(environment), 'utf8'));
  await copySources(sourceFiles);
  await writeGeneratedFirebaseFiles(environment, config);

  const files = await hashOutputFiles();
  const packageJson = await readPackage();
  const commit = git(['rev-parse', 'HEAD'], 'unknown');
  const shortCommit = commit.slice(0, 12);
  const contentHash = sha256(canonicalJson(files));
  const fingerprint = await sourceFingerprint(sourceFiles, environment, config);
  const dirty = git(['status', '--porcelain', '--untracked-files=no'], '').length > 0;
  const commitTime = git(['show', '-s', '--format=%cI', 'HEAD'], 'unknown');
  const dependencyLockSha256 = await packageLockSha256();
  const buildId = `${packageJson.version}+${shortCommit}.${contentHash.slice(0, 16)}.${environment}`;

  await fs.writeFile(path.join(OUTPUT_DIR, ASSET_MANIFEST), canonicalJson({ schemaVersion: 1, files }));
  await fs.writeFile(path.join(OUTPUT_DIR, BUILD_MANIFEST), canonicalJson({
    schemaVersion: 1,
    product: packageJson.name,
    version: packageJson.version,
    buildId,
    commit,
    commitTime,
    sourceDirty: dirty,
    sourceFingerprint: fingerprint,
    contentHash,
    dependencyLockSha256,
    nodeVersion: process.version,
    firebaseEnvironment: environment,
    firebaseProjectId: String(config.projectId || ''),
    fileCount: Object.keys(files).length
  }));

  return verifyArtifact();
}

async function verifyArtifact() {
  const [assetManifest, buildManifest, packageJson, firebaseJson] = await Promise.all([
    fs.readFile(path.join(OUTPUT_DIR, ASSET_MANIFEST), 'utf8').then(JSON.parse),
    fs.readFile(path.join(OUTPUT_DIR, BUILD_MANIFEST), 'utf8').then(JSON.parse),
    readPackage(),
    fs.readFile(path.join(ROOT, 'firebase.json'), 'utf8').then(JSON.parse)
  ]);
  if (firebaseJson?.hosting?.public !== 'dist') {
    throw new Error('firebase.json must serve the generated dist artifact.');
  }
  const environment = String(buildManifest.firebaseEnvironment || '');
  const config = JSON.parse(await fs.readFile(firebaseConfigPath(environment), 'utf8'));
  const expectedFiles = assetManifest.files || {};
  const actualFiles = (await listFiles(OUTPUT_DIR)).filter((relative) =>
    relative !== ASSET_MANIFEST && relative !== BUILD_MANIFEST
  ).sort();
  const expectedNames = Object.keys(expectedFiles).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedNames)) {
    throw new Error('Hosting artifact file list does not match asset-manifest.json. Rebuild the artifact.');
  }

  for (const relative of expectedNames) {
    const actualHash = await hashFile(path.join(OUTPUT_DIR, relative));
    if (actualHash !== expectedFiles[relative]) {
      throw new Error(`Hosting artifact hash mismatch: ${relative}`);
    }
  }

  const sourceFiles = await collectSourceFiles();
  for (const [relative, source] of sourceFiles) {
    if (GENERATED_PATHS.has(relative)) continue;
    const outputHash = expectedFiles[relative];
    if (!outputHash || outputHash !== await hashFile(source)) {
      throw new Error(`Hosting artifact differs from canonical source: ${relative}`);
    }
  }

  const expectedConfig = firebaseProjectScript(environment, config);
  if (expectedFiles['js/firebase-project-config.js'] !== sha256(expectedConfig)) {
    throw new Error('Hosting artifact contains the wrong Firebase environment configuration.');
  }
  const contentHash = sha256(canonicalJson(expectedFiles));
  const fingerprint = await sourceFingerprint(sourceFiles, environment, config);
  const dependencyLockSha256 = await packageLockSha256();
  const commit = git(['rev-parse', 'HEAD'], 'unknown');
  const buildId = `${packageJson.version}+${commit.slice(0, 12)}.${contentHash.slice(0, 16)}.${environment}`;
  if (
    buildManifest.buildId !== buildId ||
    buildManifest.contentHash !== contentHash ||
    buildManifest.sourceFingerprint !== fingerprint ||
    buildManifest.dependencyLockSha256 !== dependencyLockSha256 ||
    buildManifest.nodeVersion !== process.version ||
    buildManifest.commit !== commit ||
    buildManifest.firebaseProjectId !== String(config.projectId || '') ||
    buildManifest.fileCount !== expectedNames.length
  ) {
    throw new Error('Hosting build identity no longer matches the current source and artifact.');
  }

  const result = {
    ok: true,
    buildId,
    firebaseEnvironment: environment,
    firebaseProjectId: buildManifest.firebaseProjectId,
    sourceDirty: buildManifest.sourceDirty,
    dependencyLockSha256,
    nodeVersion: process.version,
    fileCount: expectedNames.length
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

const command = String(process.argv[2] || 'build').toLowerCase();
try {
  if (command === 'build') {
    await buildArtifact(String(readFlag('--firebase-env', process.env.WE3D_FIREBASE_ENV || 'staging')).toLowerCase());
  } else if (command === 'verify') {
    await verifyArtifact();
  } else {
    throw new Error('Usage: node scripts/hosting-artifact.mjs <build|verify> [--firebase-env staging|production]');
  }
} catch (error) {
  console.error('[hosting-artifact] Failed:', error?.stack || error?.message || String(error));
  process.exit(1);
}
