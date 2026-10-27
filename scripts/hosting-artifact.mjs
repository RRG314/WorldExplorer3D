#!/usr/bin/env node

import { firebaseProjectScript, firebaseInitJson, generatedFirebaseFiles } from './lib/firebase-artifact-config.mjs';
import crypto from 'node:crypto';
import {resolveHostingOutput} from './lib/hosting-output.mjs';
import {assertModelAssetRevisions} from './update-model-asset-revisions.mjs';
import { canonicalBundledModule, rewritePackagedModuleReference } from './lib/runtime-module-identity.mjs';
import { readReleaseSourceIdentity, assertCompatibleReleaseSourceIdentity } from './lib/release-source-identity.mjs';
import { sourceFingerprint as inputFingerprint, SHIPPED_SOURCE_ENTRIES } from './verification/source-fingerprint.mjs';
import { build as buildJavaScript } from 'esbuild';
import {runtimeGeneration, generationModulePath, pinHtmlRootModules, snapshotRootModules, retainRuntimeGenerations, verifyRuntimeGenerations, retainedLegacyRootFiles} from './lib/hosting-runtime-generation.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const command = String(process.argv[2] || 'build').toLowerCase();
const OUTPUT_DIR = command==='verify'&&process.env.WE3D_VERIFY_ROOT&&!readFlag('--output-dir')
  ? path.resolve(ROOT,process.env.WE3D_VERIFY_ROOT)
  : await resolveHostingOutput(ROOT,readFlag('--output-dir'),{building:command==='build'});
const ASSET_MANIFEST = 'asset-manifest.json';
const BUILD_MANIFEST = 'build-manifest.json';
const SOURCE_ENTRIES = SHIPPED_SOURCE_ENTRIES;
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
  'account-contributions': 'account/contribution-workspace.js',
  'living-portal': 'app/js/portal/page.js',
  'capture-phone': 'app/js/reality-capture/phone-entry.js',
  'capture-review': 'app/js/reality-capture/result-viewer.js',
  'multiplayer-rooms': 'app/js/multiplayer/rooms.js',
  'multiplayer-artifacts': 'app/js/multiplayer/artifacts.js',
  'tunnel-solid-worker': 'app/js/world/compiler/tunnel-solid-worker.js',
  'street-pavement-worker': 'app/js/world/compiler/street-pavement-worker.js',
  'street-overview-worker': 'app/js/world/compiler/street-overview-worker.js',
  'transport-detail-worker': 'app/js/terrain/transport-detail-worker.js',
  'regional-building-worker': 'app/js/terrain/regional-building-worker.js',
  'canvas-red-mask-worker': 'app/js/terrain/canvas-red-mask-worker.js'
});
const ROOT_SHARED_MODULE_DIR = path.join(ROOT, 'js');
const GAME_SHARED_CONTEXT_MODULE = 'app/js/shared-context.js';
const REQUIRED_EXTERNAL_ROOT_MODULES = Object.freeze([
  '/js/firebase-init.js?v=58',
  '/js/auth-ui.js?v=56',
  '/app/js/shared-context.js?v=55'
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

function readRepeatedFlag(name) {
  const result = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i].startsWith(`${name}=`)) result.push(process.argv[i].slice(name.length + 1));
    else if (process.argv[i] === name) {
      if (!process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw Error(`Missing value for ${name}`);
      result.push(process.argv[++i]);
    }
  }
  return result;
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
    if ((isGameRuntimeSource(relative) && relative !== GAME_SHARED_CONTEXT_MODULE) || isGroundDataSource(relative)) continue;
    const target = path.join(OUTPUT_DIR, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  }
  // Firebase's automatic association response outranks rewrites. Publish the
  // canonical URL as static content from this one authored declaration.
  const association = path.join(OUTPUT_DIR, '.well-known', 'assetlinks.json');
  await fs.mkdir(path.dirname(association), {recursive:true});
  await fs.copyFile(path.join(ROOT, 'app', 'assetlinks.json'), association);
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

async function buildGameRuntime(generation) {
  const externalRootModules = new Set();
  const rootSharedModulePlugin = {
    name: 'one-root-shared-module-authority',
    setup(build) {
      build.onResolve({ filter: /^\.\.?(?:\/\.\.)*\// }, (args) => {
        const queryIndex = args.path.indexOf('?');
        const sourcePath = queryIndex >= 0 ? args.path.slice(0, queryIndex) : args.path;
        const query = queryIndex >= 0 ? args.path.slice(queryIndex) : '';
        const resolved = path.resolve(args.resolveDir, sourcePath);
        if (resolved === path.join(ROOT, GAME_SHARED_CONTEXT_MODULE)) {
          const externalPath = `/app/js/shared-context.js${query}`;
          externalRootModules.add(externalPath);
          return { path: generationModulePath(generation, externalPath), external: true };
        }
        const relative = path.relative(ROOT_SHARED_MODULE_DIR, resolved);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          const canonical = canonicalBundledModule(args.path, args.resolveDir);
          return canonical ? { path: canonical } : null;
        }
        const externalPath = `/js/${normalizePath(relative)}${query}`;
        externalRootModules.add(externalPath);
        return { path: generationModulePath(generation, externalPath), external: true };
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
    external: ['https://*', '/app/vendor/manifold/manifold.js'],
    plugins: [rootSharedModulePlugin],
    metafile: true,
    write: true,
    logLevel: 'warning'
  });
  // Empty chunks are still emitted files and must be counted in the artifact.
  const outputFiles = Object.entries(result.metafile.outputs);
  const entries = Object.fromEntries(
    Object.entries(GAME_RUNTIME_ENTRYPOINTS).map(([name, source]) => [
      name,
      bundleOutputForEntry(result.metafile, source)
    ])
  );
  const sharedModules = [...externalRootModules].sort();
  const emittedExternals=[...new Set(outputFiles.flatMap(([,details])=>details.imports.filter(row=>row.external).map(row=>row.path)))];
  if(emittedExternals.some(url=>url.startsWith('/js/')||url.startsWith('/app/js/shared-context.js')))throw Error('Current bundle escaped its pinned shared authority');
  for (const required of REQUIRED_EXTERNAL_ROOT_MODULES) {
    if (!sharedModules.includes(required)) {
      throw new Error(`Bundled runtime lost its root shared-module authority: ${required}`);
    }
  }
  return Object.freeze({
    strategy: 'esbuild-esm-code-splitting',
    sharedModuleAuthority: 'one-generation-hosted-esm-instance',
    externalRootModules: Object.freeze(sharedModules),
    pinnedExternalRootModules: Object.freeze(emittedExternals.filter(url=>url.startsWith(generation.prefix+'/')).sort()),
    entries: Object.freeze(entries),
    bundlePaths: Object.freeze(outputFiles.map(([file]) => normalizePath(path.relative(OUTPUT_DIR, path.resolve(ROOT, file)))).sort()),
    fileCount: outputFiles.length,
    entryFileCount: Object.keys(entries).length,
    bytes: outputFiles.reduce((sum, [, details]) => sum + Number(details.bytes || 0), 0)
  });
}

async function rewriteGameHtml(runtime, groundData, generation, sourceIdentity, version) {
  const htmlPath = path.join(OUTPUT_DIR, 'app', 'index.html');
  let html = await fs.readFile(htmlPath, 'utf8');
  const productionConfig = canonicalJson({
    appEntrypoint: `./${runtime.entries['app-entry'].replace(/^js\/bundles\//, '')}`,
    tunnelSolidWorkerUrl: `/app/${runtime.entries['tunnel-solid-worker']}`,
    streetPavementWorkerUrl: `/app/${runtime.entries['street-pavement-worker']}`,
    streetOverviewWorkerUrl: `/app/${runtime.entries['street-overview-worker']}`,
    transportDetailWorkerUrl: `/app/${runtime.entries['transport-detail-worker']}`,
    regionalBuildingWorkerUrl: `/app/${runtime.entries['regional-building-worker']}`,
    canvasRedMaskWorkerUrl: `/app/${runtime.entries['canvas-red-mask-worker']}`,
    groundCatalogUrl: groundData.catalogUrl,
    groundReleaseId: groundData.releaseId,
    runtimeReleaseId: generation.id,
    sharedModulePrefix: generation.prefix,
    sourceCommit: sourceIdentity.commit,
    sourceVersion: version
  }).trim();
  const replacement = [
    `<script>globalThis.__WORLD_EXPLORER_PRODUCTION__ = Object.freeze(${productionConfig});</script>`,
    `<script type="module" data-startup-critical src="${runtime.entries['app-shell-fragments']}"></script>`,
    `<script type="module" src="${runtime.entries['app-auth-shell']}"></script>`,
    `<script type="module" data-startup-critical src="${runtime.entries.bootstrap}"></script>`
  ].join('\n');
  const sourceScripts = /<script type="module" data-startup-critical src="js\/app-shell-fragments\.js\?v=\d+"><\/script>\s*<script type="module" src="js\/app-auth-shell\.js\?v=\d+"><\/script>\s*<script type="module" data-startup-critical src="js\/bootstrap\.js\?v=\d+"><\/script>/;
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
  if(!html.includes('./contribution-workspace.js'))throw new Error('Account contributions entry is missing.');
  html = html.replace('./contribution-workspace.js',`../app/${runtime.entries['account-contributions']}`);
  await fs.writeFile(htmlPath, html, 'utf8');
}

async function rewritePortalHtml(runtime) {
  const htmlPath=path.join(OUTPUT_DIR,'portal','index.html');
  const html=await fs.readFile(htmlPath,'utf8');
  const source='../app/js/portal/page.js';
  if(!html.includes(source))throw new Error('Portal HTML entry is missing.');
  await fs.writeFile(htmlPath,html.replace(source,`../app/${runtime.entries['living-portal']}`));
}

function firebaseConfigPath(environment) {
  if (environment !== 'production' && environment !== 'staging') {
    throw new Error(`Unknown Firebase environment "${environment}". Expected production or staging.`);
  }
  return path.join(ROOT, 'config', `firebase.${environment}.json`);
}

async function writeGeneratedFirebaseFiles(environment, config) {
  const files = generatedFirebaseFiles(environment, config);
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
  await assertModelAssetRevisions();
  // Check provenance before replacing any generated artifact.
  const sourceIdentity = readReleaseSourceIdentity(ROOT);
  const inputBefore = inputFingerprint(ROOT);
  if (sourceIdentity.sourceDirty || inputBefore.dirty) throw new Error('Commit all shipped source inputs before replacing a release artifact.');
  const sourceFiles = await collectSourceFiles();
  const config = JSON.parse(await fs.readFile(firebaseConfigPath(environment), 'utf8'));
  const packageJson = await readPackage();
  const sourceReleases = await sourceReleaseFingerprint(sourceFiles);
  const groundReleaseId = sourceReleases.sha256.slice(0, 16);
  await copySources(sourceFiles);
  const groundData = await copyGroundData(sourceFiles, groundReleaseId);
  const generation = runtimeGeneration(inputBefore.acceptanceFingerprint, environment);
  const runtime = await buildGameRuntime(generation);
  await rewriteGameHtml(runtime, groundData, generation, sourceIdentity, packageJson.version);
  await rewriteAccountHtml(runtime);
  await rewritePortalHtml(runtime);
  const captureHtmlPath = path.join(OUTPUT_DIR, 'app', 'capture.html');
  const captureHtml = await fs.readFile(captureHtmlPath, 'utf8');
  await fs.writeFile(captureHtmlPath, captureHtml.replace('js/reality-capture/phone-entry.js?v=1', runtime.entries['capture-phone']));
  const adminModulePath = path.join(OUTPUT_DIR, 'js', 'admin-dashboard.js');
  const adminModule = await fs.readFile(adminModulePath, 'utf8');
  await fs.writeFile(adminModulePath, rewritePackagedModuleReference(adminModule, '../app/js/reality-capture/result-viewer.js', `../app/${runtime.entries['capture-review']}`));
  await writeGeneratedFirebaseFiles(environment, config);
  const snapshot = await snapshotRootModules(OUTPUT_DIR, [...sourceFiles.keys()], generation, runtime.entries['capture-review']);
  const rootModules = new Set([...sourceFiles.keys()].filter(relative => relative.startsWith('js/') && relative.endsWith('.js')));
  for(const relative of [...rootModules,GAME_SHARED_CONTEXT_MODULE])await fs.copyFile(path.join(OUTPUT_DIR,generation.prefix.slice(1),relative),path.join(OUTPUT_DIR,relative));
  for (const relative of await listFiles(OUTPUT_DIR)) {
    if (!relative.endsWith('.html')) continue;
    const absolute = path.join(OUTPUT_DIR, relative), html = await fs.readFile(absolute, 'utf8');
    await fs.writeFile(absolute, pinHtmlRootModules(html, relative, generation, rootModules));
  }
  const compatibility = await retainRuntimeGenerations({output: OUTPUT_DIR, predecessors: readRepeatedFlag('--retain-runtime-from'), environment, projectId: config.projectId, currentGeneration:snapshot});
  const rootModuleAliases={};
  for(const relative of [...rootModules,GAME_SHARED_CONTEXT_MODULE].sort())rootModuleAliases[relative]=await hashFile(path.join(OUTPUT_DIR,relative));
  const runtimePackaging = {...runtime, generation: snapshot, compatibility, rootModuleAliases,
    retainedBundlePaths: [...new Set(compatibility.flatMap(previous => Object.keys(previous.files).filter(relative => relative.startsWith('app/js/bundles/'))))].sort()};

  const files = await hashOutputFiles();
  const { commit, commitTime, sourceDirty: dirty } = sourceIdentity;
  const shortCommit = commit.slice(0, 12);
  const contentHash = sha256(canonicalJson(files));
  const fingerprint = await sourceFingerprint(sourceFiles, environment, config);
  const dependencyLockSha256 = await packageLockSha256();
  const buildId = `${packageJson.version}+${shortCommit}.${contentHash.slice(0, 16)}.${environment}`;
  const assetManifest = { schemaVersion: 1, files };
  const assetManifestSha256 = sha256(canonicalJson(assetManifest));
  const inputAfter = inputFingerprint(ROOT);
  if (inputBefore.acceptanceFingerprint !== inputAfter.acceptanceFingerprint || inputAfter.dirty) {
    throw new Error('Release inputs changed during the build; the artifact cannot be accepted.');
  }

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
    sourceInputFingerprint: inputBefore.acceptanceFingerprint,
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
  if (!expectedFiles['.well-known/assetlinks.json'] ||
      expectedFiles['.well-known/assetlinks.json'] !== expectedFiles['app/assetlinks.json']) {
    throw new Error('Canonical Android association must match its authored declaration.');
  }
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
  const generation = buildManifest.runtimePackaging?.generation;
  const rootModules = new Set([...sourceFiles.keys()].filter(relative => relative.startsWith('js/') && relative.endsWith('.js')));
  const runtimePackaging = buildManifest.runtimePackaging || {};
  const retainedBundles = verifyRuntimeGenerations(runtimePackaging, expectedFiles);
  const legacyRoots=retainedLegacyRootFiles(runtimePackaging);
  for (const [relative, source] of sourceFiles) {
    if (GENERATED_PATHS.has(relative)) continue;
    if ((isGameRuntimeSource(relative) && relative !== GAME_SHARED_CONTEXT_MODULE) || relative === 'app/index.html' || relative === 'app/capture.html' || relative === 'account/index.html' || relative === 'portal/index.html') continue;
    const outputRelative = isGroundDataSource(relative)
      ? `location-data/ground/${sourceReleases.sha256.slice(0, 16)}/${relative.slice('app/assets/ground/'.length)}`
      : relative;
    const outputHash = expectedFiles[outputRelative];
    const sourceHash = relative === 'js/admin-dashboard.js'
      ? sha256(rewritePackagedModuleReference(await fs.readFile(source, 'utf8'), '../app/js/reality-capture/result-viewer.js', `/app/${buildManifest.runtimePackaging?.entries?.['capture-review']}`))
      : relative.endsWith('.html') ? sha256(pinHtmlRootModules(await fs.readFile(source, 'utf8'), relative, generation, rootModules))
      : await hashFile(source);
    if(legacyRoots.has(relative)){
      const currentHash=relative==='js/admin-dashboard.js'
        ?sha256(rewritePackagedModuleReference(await fs.readFile(source,'utf8'),'../app/js/reality-capture/result-viewer.js',`/app/${runtimePackaging.entries['capture-review']}`))
        :sourceHash;
      if(outputHash!==legacyRoots.get(relative)||generation.files[`${generation.prefix.slice(1)}/${relative}`]!==currentHash)throw Error(`Legacy alias or current immutable source changed: ${relative}`);
      continue;
    }
    if (!outputHash || outputHash !== sourceHash) {
      throw new Error(`Hosting artifact differs from canonical source: ${relative} -> ${outputRelative}`);
    }
  }

  const snapshotNames = [...rootModules, GAME_SHARED_CONTEXT_MODULE].map(relative => `${generation.prefix.slice(1)}/${relative}`).sort();
  if (JSON.stringify(snapshotNames) !== JSON.stringify(Object.keys(generation.files).sort())) throw Error('Current shared runtime snapshot is incomplete');
  for (const [relative, digest] of Object.entries(generation.files)) {
    const rootPath = relative.slice(generation.prefix.length);
    let bytes = rootPath==='js/firebase-project-config.js'
      ?Buffer.from(firebaseProjectScript(environment,config))
      :await fs.readFile(sourceFiles.get(rootPath));
    if (rootPath === 'js/admin-dashboard.js') bytes = Buffer.from(rewritePackagedModuleReference(bytes.toString(),'../app/js/reality-capture/result-viewer.js',`/app/${runtimePackaging.entries['capture-review']}`));
    if (sha256(bytes) !== digest) throw Error(`Runtime shared module differs from the current source: ${rootPath}`);
  }
  const runtimeFiles = expectedNames.filter((relative) => relative.startsWith('app/js/bundles/'));
  if (
    runtimePackaging.strategy !== 'esbuild-esm-code-splitting' ||
    runtimePackaging.sharedModuleAuthority !== 'one-generation-hosted-esm-instance' ||
    !REQUIRED_EXTERNAL_ROOT_MODULES.every((modulePath) =>
      runtimePackaging.externalRootModules?.includes(modulePath)
    ) ||
    runtimePackaging.entryFileCount !== Object.keys(GAME_RUNTIME_ENTRYPOINTS).length ||
    runtimePackaging.fileCount !== runtimePackaging.bundlePaths?.length ||
    JSON.stringify(runtimePackaging.pinnedExternalRootModules)!==JSON.stringify(runtimePackaging.externalRootModules.map(url=>generationModulePath(generation,url)).sort()) ||
    JSON.stringify([...new Set([...(runtimePackaging.bundlePaths || []), ...retainedBundles])].sort()) !== JSON.stringify(runtimeFiles.sort()) ||
    expectedNames.some((relative) => relative.startsWith('app/js/') &&
      !relative.startsWith('app/js/bundles/') && relative !== GAME_SHARED_CONTEXT_MODULE)
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
  const portalHtml = await fs.readFile(path.join(OUTPUT_DIR, 'portal', 'index.html'), 'utf8');
  const captureHtml = await fs.readFile(path.join(OUTPUT_DIR, 'app', 'capture.html'), 'utf8');
  const currentAdminModule=await fs.readFile(path.join(OUTPUT_DIR,generation.prefix.slice(1),'js/admin-dashboard.js'),'utf8');
  for(const relative of actualFiles.filter(p=>p.endsWith('.html'))){
    const html=await fs.readFile(path.join(OUTPUT_DIR,relative),'utf8');
    if(pinHtmlRootModules(html,relative,generation,rootModules)!==html)throw Error(`Current page escaped its pinned shared authority: ${relative}`);
  }
  for (const [name, entry] of Object.entries(runtimePackaging.entries || {})) {
    if (!expectedFiles[`app/${entry}`]) {
      throw new Error(`Packaged runtime entry is missing: ${name} -> ${entry}`);
    }
    const referenced = (name === 'account-social'||name === 'account-contributions') ? accountHtml.includes(`../app/${entry}`)
      : name === 'living-portal' ? portalHtml.includes(`../app/${entry}`)
      : name === 'capture-phone' ? captureHtml.includes(entry)
      : name === 'capture-review' ? currentAdminModule.includes(`/app/${entry}`) : gameHtml.includes(entry);
    if (!referenced && !INDIRECT_RUNTIME_ENTRYPOINTS.has(name)) {
      throw new Error(`Game HTML does not reference bundled entry: ${entry}`);
    }
  }
  for (const name of Object.keys(GAME_RUNTIME_ENTRYPOINTS)) {
    if (!runtimePackaging.entries?.[name]) throw new Error(`Missing runtime entry: ${name}`);
  }
  const configuredAppEntrypoint = `./${path.basename(runtimePackaging.entries?.['app-entry'] || '')}`;
  if (
    configuredAppEntrypoint === './' ||
    !gameHtml.includes(configuredAppEntrypoint) ||
    !gameHtml.includes(`"sharedModulePrefix": "${generation.prefix}"`) ||
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
  assertCompatibleReleaseSourceIdentity(buildManifest, ROOT);
  const { commit } = buildManifest;
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
    runtimeReleaseId: generation.id,
    retainedRuntimeGenerations: runtimePackaging.compatibility.length,
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

try {
  if (command === 'build') {
    await buildArtifact(String(readFlag('--firebase-env', process.env.WE3D_FIREBASE_ENV || 'staging')).toLowerCase());
  } else if (command === 'verify') {
    await verifyArtifact();
  } else {
    throw new Error('Usage: node scripts/hosting-artifact.mjs <build|verify> [--firebase-env staging|production] [--output-dir output/hosting-validation/<name>]');
  }
} catch (error) {
  console.error('[hosting-artifact] Failed:', error?.stack || error?.message || String(error));
  process.exit(1);
}
