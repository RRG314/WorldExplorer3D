#!/usr/bin/env node

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { build as buildJavaScript } from 'esbuild';
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
  'legal',
  'styles'
];
const GENERATED_PATHS = new Set([
  'js/firebase-project-config.js',
  '__/firebase/init.json',
  '__/firebase/init.js'
]);
const GAME_RUNTIME_ENTRYPOINTS = Object.freeze({
  'app-shell-fragments': 'app/js/app-shell-fragments.js',
  'app-auth-shell': 'app/js/app-auth-shell.js',
  bootstrap: 'app/js/bootstrap.js',
  'app-entry': 'app/js/app-entry.js',
  'account-social': 'app/js/multiplayer/social.js',
  'multiplayer-rooms': 'app/js/multiplayer/rooms.js',
  'multiplayer-artifacts': 'app/js/multiplayer/artifacts.js'
});
const ROOT_SHARED_MODULE_DIR = path.join(ROOT, 'js');
const REQUIRED_EXTERNAL_ROOT_MODULES = Object.freeze([
  '/js/firebase-init.js?v=56',
  '/js/auth-ui.js?v=55'
]);
const INDIRECT_RUNTIME_ENTRYPOINTS = new Set([
  'app-entry',
  'multiplayer-rooms',
  'multiplayer-artifacts'
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

function isGameRuntimeSource(relative) {
  return relative.startsWith('app/js/');
}

function isGroundDataSource(relative) {
  return relative.startsWith('app/assets/ground/');
}

async function copySources(sourceFiles) {
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  for (const [relative, source] of sourceFiles) {
    if (isGameRuntimeSource(relative) || isGroundDataSource(relative)) continue;
    const target = path.join(OUTPUT_DIR, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  }
}

async function copyGroundData(sourceFiles, releaseId) {
  const outputRoot = `location-data/ground/${releaseId}`;
  let fileCount = 0;
  let bytes = 0;
  for (const [relative, source] of sourceFiles) {
    if (!isGroundDataSource(relative)) continue;
    const groundRelative = relative.slice('app/assets/ground/'.length);
    const target = path.join(OUTPUT_DIR, outputRoot, groundRelative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
    const stat = await fs.stat(source);
    fileCount += 1;
    bytes += stat.size;
  }
  return Object.freeze({
    releaseId,
    outputRoot,
    catalogUrl: `/${outputRoot}/manifest-catalog.json`,
    fileCount,
    bytes
  });
}

function bundleOutputForEntry(metafile, sourceEntry) {
  const match = Object.entries(metafile.outputs).find(([, details]) =>
    String(details.entryPoint || '').split('?', 1)[0] === sourceEntry
  );
  if (!match) throw new Error(`Bundler did not emit entry point: ${sourceEntry}`);
  return normalizePath(path.relative(path.join(OUTPUT_DIR, 'app'), path.resolve(ROOT, match[0])));
}

async function buildGameRuntime() {
  const externalRootModules = new Set();
  const rootSharedModulePlugin = {
    name: 'one-root-shared-module-authority',
    setup(build) {
      build.onResolve({ filter: /^\.\.?(?:\/\.\.)*\// }, (args) => {
        const queryIndex = args.path.indexOf('?');
        const sourcePath = queryIndex >= 0 ? args.path.slice(0, queryIndex) : args.path;
        const query = queryIndex >= 0 ? args.path.slice(queryIndex) : '';
        const resolved = path.resolve(args.resolveDir, sourcePath);
        const relative = path.relative(ROOT_SHARED_MODULE_DIR, resolved);
        if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
        const externalPath = `/js/${normalizePath(relative)}${query}`;
        externalRootModules.add(externalPath);
        return { path: externalPath, external: true };
      });
    }
  };
  const result = await buildJavaScript({
    absWorkingDir: ROOT,
    entryPoints: GAME_RUNTIME_ENTRYPOINTS,
    outdir: path.join(OUTPUT_DIR, 'app', 'js'),
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    entryNames: 'bundles/[name]-[hash]',
    chunkNames: 'bundles/chunk-[hash]',
    external: ['https://*'],
    plugins: [rootSharedModulePlugin],
    metafile: true,
    write: true,
    logLevel: 'warning'
  });
  const outputFiles = Object.entries(result.metafile.outputs)
    .filter(([, details]) => Number(details.bytes || 0) > 0);
  const entries = Object.fromEntries(
    Object.entries(GAME_RUNTIME_ENTRYPOINTS).map(([name, source]) => [
      name,
      bundleOutputForEntry(result.metafile, source)
    ])
  );
  const sharedModules = [...externalRootModules].sort();
  for (const required of REQUIRED_EXTERNAL_ROOT_MODULES) {
    if (!sharedModules.includes(required)) {
      throw new Error(`Bundled runtime lost its root shared-module authority: ${required}`);
    }
  }
  return Object.freeze({
    strategy: 'esbuild-esm-code-splitting',
    sharedModuleAuthority: 'one-root-hosted-esm-instance',
    externalRootModules: Object.freeze(sharedModules),
    entries: Object.freeze(entries),
    fileCount: outputFiles.length,
    entryFileCount: Object.keys(entries).length,
    bytes: outputFiles.reduce((sum, [, details]) => sum + Number(details.bytes || 0), 0)
  });
}

async function rewriteGameHtml(runtime, groundData) {
  const htmlPath = path.join(OUTPUT_DIR, 'app', 'index.html');
  let html = await fs.readFile(htmlPath, 'utf8');
  const productionConfig = canonicalJson({
    appEntrypoint: `./${runtime.entries['app-entry'].replace(/^js\/bundles\//, '')}`,
    groundCatalogUrl: groundData.catalogUrl,
    groundReleaseId: groundData.releaseId
  }).trim();
  const replacement = [
    `<script>globalThis.__WORLD_EXPLORER_PRODUCTION__ = Object.freeze(${productionConfig});</script>`,
    `<script type="module" src="${runtime.entries['app-shell-fragments']}"></script>`,
    `<script type="module" src="${runtime.entries['app-auth-shell']}"></script>`,
    `<script type="module" src="${runtime.entries.bootstrap}"></script>`
  ].join('\n');
  const sourceScripts = /<script type="module" src="js\/app-shell-fragments\.js\?v=\d+"><\/script>\s*<script type="module" src="js\/app-auth-shell\.js\?v=\d+"><\/script>\s*<script type="module" src="js\/bootstrap\.js\?v=\d+"><\/script>/;
  if (!sourceScripts.test(html)) {
    throw new Error('Game HTML no longer contains the expected source entry scripts.');
  }
  html = html.replace(sourceScripts, replacement);
  await fs.writeFile(htmlPath, html, 'utf8');
}

async function rewriteAccountHtml(runtime) {
  const htmlPath = path.join(OUTPUT_DIR, 'account', 'index.html');
  let html = await fs.readFile(htmlPath, 'utf8');
  const sourceImport = '../app/js/multiplayer/social.js?v=55';
  const bundledImport = `../app/${runtime.entries['account-social']}`;
  if (!html.includes(sourceImport)) {
    throw new Error('Account HTML no longer contains the expected social source import.');
  }
  html = html.replace(sourceImport, bundledImport);
  await fs.writeFile(htmlPath, html, 'utf8');
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

async function sourceReleaseFingerprint(sourceFiles) {
  const records = [];
  for (const [relative, absolute] of sourceFiles) {
    if (
      relative === 'app/assets/ground/manifest-catalog.json' ||
      /\/ground-manifest\.json$/.test(relative)
    ) {
      records.push([relative, await hashFile(absolute)]);
    }
  }
  return {
    sha256: sha256(canonicalJson(records)),
    manifestCount: records.length
  };
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
  const sourceReleases = await sourceReleaseFingerprint(sourceFiles);
  const groundReleaseId = sourceReleases.sha256.slice(0, 16);
  await copySources(sourceFiles);
  const groundData = await copyGroundData(sourceFiles, groundReleaseId);
  const runtimePackaging = await buildGameRuntime();
  await rewriteGameHtml(runtimePackaging, groundData);
  await rewriteAccountHtml(runtimePackaging);
  await writeGeneratedFirebaseFiles(environment, config);

  const files = await hashOutputFiles();
  const packageJson = await readPackage();
  const commit = git(['rev-parse', 'HEAD'], 'unknown');
  const shortCommit = commit.slice(0, 12);
  const contentHash = sha256(canonicalJson(files));
  const fingerprint = await sourceFingerprint(sourceFiles, environment, config);
  const dirty = git(['status', '--porcelain'], '').length > 0;
  const commitTime = git(['show', '-s', '--format=%cI', 'HEAD'], 'unknown');
  const dependencyLockSha256 = await packageLockSha256();
  const buildId = `${packageJson.version}+${shortCommit}.${contentHash.slice(0, 16)}.${environment}`;
  const assetManifest = { schemaVersion: 1, files };
  const assetManifestSha256 = sha256(canonicalJson(assetManifest));

  await fs.writeFile(path.join(OUTPUT_DIR, ASSET_MANIFEST), canonicalJson(assetManifest));
  await fs.writeFile(path.join(OUTPUT_DIR, BUILD_MANIFEST), canonicalJson({
    schemaVersion: 2,
    product: packageJson.name,
    version: packageJson.version,
    buildId,
    candidateId: buildId,
    commit,
    commitTime,
    buildTimestamp: commitTime,
    sourceDirty: dirty,
    sourceFingerprint: fingerprint,
    sourceReleaseManifestSha256: sourceReleases.sha256,
    sourceReleaseManifestCount: sourceReleases.manifestCount,
    runtimePackaging,
    groundData,
    contentHash,
    assetManifestSha256,
    dependencyLockSha256,
    nodeVersion: process.version,
    firebaseEnvironment: environment,
    firebaseProjectId: String(config.projectId || ''),
    deploymentTarget: `${String(config.projectId || '')}:live`,
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
  const sourceReleases = await sourceReleaseFingerprint(sourceFiles);
  for (const [relative, source] of sourceFiles) {
    if (GENERATED_PATHS.has(relative)) continue;
    if (isGameRuntimeSource(relative) || relative === 'app/index.html' || relative === 'account/index.html') continue;
    const outputRelative = isGroundDataSource(relative)
      ? `location-data/ground/${sourceReleases.sha256.slice(0, 16)}/${relative.slice('app/assets/ground/'.length)}`
      : relative;
    const outputHash = expectedFiles[outputRelative];
    if (!outputHash || outputHash !== await hashFile(source)) {
      throw new Error(`Hosting artifact differs from canonical source: ${relative} -> ${outputRelative}`);
    }
  }

  const runtimePackaging = buildManifest.runtimePackaging || {};
  const runtimeFiles = expectedNames.filter((relative) => relative.startsWith('app/js/bundles/'));
  if (
    runtimePackaging.strategy !== 'esbuild-esm-code-splitting' ||
    runtimePackaging.sharedModuleAuthority !== 'one-root-hosted-esm-instance' ||
    !REQUIRED_EXTERNAL_ROOT_MODULES.every((modulePath) =>
      runtimePackaging.externalRootModules?.includes(modulePath)
    ) ||
    runtimePackaging.entryFileCount !== Object.keys(GAME_RUNTIME_ENTRYPOINTS).length ||
    runtimePackaging.fileCount !== runtimeFiles.length ||
    expectedNames.some((relative) => relative.startsWith('app/js/') && !relative.startsWith('app/js/bundles/'))
  ) {
    throw new Error('Hosting artifact runtime packaging no longer matches the bundled-runtime contract.');
  }
  const groundData = buildManifest.groundData || {};
  const expectedGroundReleaseId = sourceReleases.sha256.slice(0, 16);
  const expectedGroundRoot = `location-data/ground/${expectedGroundReleaseId}`;
  const groundFiles = expectedNames.filter((relative) => relative.startsWith(`${expectedGroundRoot}/`));
  if (
    groundData.releaseId !== expectedGroundReleaseId ||
    groundData.outputRoot !== expectedGroundRoot ||
    groundData.catalogUrl !== `/${expectedGroundRoot}/manifest-catalog.json` ||
    groundData.fileCount !== groundFiles.length ||
    expectedNames.some((relative) => relative.startsWith('app/assets/ground/'))
  ) {
    throw new Error('Hosting artifact ground data no longer matches the immutable release contract.');
  }
  const gameHtml = await fs.readFile(path.join(OUTPUT_DIR, 'app', 'index.html'), 'utf8');
  const accountHtml = await fs.readFile(path.join(OUTPUT_DIR, 'account', 'index.html'), 'utf8');
  for (const [name, entry] of Object.entries(runtimePackaging.entries || {})) {
    const referenced = name === 'account-social' ? accountHtml.includes(`../app/${entry}`) : gameHtml.includes(entry);
    if (!referenced && !INDIRECT_RUNTIME_ENTRYPOINTS.has(name)) {
      throw new Error(`Game HTML does not reference bundled entry: ${entry}`);
    }
  }
  const configuredAppEntrypoint = `./${path.basename(runtimePackaging.entries?.['app-entry'] || '')}`;
  if (
    configuredAppEntrypoint === './' ||
    !gameHtml.includes(configuredAppEntrypoint) ||
    !gameHtml.includes(groundData.catalogUrl || '__missing_ground_catalog__')
  ) {
    throw new Error('Game HTML does not publish the bundled app or immutable ground release.');
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
  const assetManifestSha256 = sha256(canonicalJson(assetManifest));
  if (
    buildManifest.schemaVersion !== 2 ||
    buildManifest.buildId !== buildId ||
    buildManifest.candidateId !== buildId ||
    buildManifest.contentHash !== contentHash ||
    buildManifest.sourceFingerprint !== fingerprint ||
    buildManifest.sourceReleaseManifestSha256 !== sourceReleases.sha256 ||
    buildManifest.sourceReleaseManifestCount !== sourceReleases.manifestCount ||
    buildManifest.assetManifestSha256 !== assetManifestSha256 ||
    buildManifest.dependencyLockSha256 !== dependencyLockSha256 ||
    buildManifest.nodeVersion !== process.version ||
    buildManifest.commit !== commit ||
    buildManifest.commitTime !== buildManifest.buildTimestamp ||
    buildManifest.firebaseProjectId !== String(config.projectId || '') ||
    buildManifest.deploymentTarget !== `${String(config.projectId || '')}:live` ||
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
    sourceReleaseManifestSha256: sourceReleases.sha256,
    sourceReleaseManifestCount: sourceReleases.manifestCount,
    runtimeBundleFileCount: runtimeFiles.length,
    groundReleaseId: expectedGroundReleaseId,
    groundFileCount: groundFiles.length,
    assetManifestSha256,
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
