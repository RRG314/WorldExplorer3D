import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const PACKAGE_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VENDOR_ROOT = path.join(ROOT, 'app', 'vendor');
const MANIFEST_PATH = path.join(ROOT, 'app', 'js', 'modules', 'manifest.js');
const VENDOR_INVENTORIES = [
  'three-r128',
  'firebase-12.16.0',
  'satellite-5.0.0',
  'pmtiles-4.4.1'
];

function packageVersion(packageName) {
  return PACKAGE_JSON.dependencies?.[packageName] ||
    PACKAGE_JSON.devDependencies?.[packageName] ||
    JSON.parse(
      fs.readFileSync(path.join(ROOT, 'node_modules', packageName, 'package.json'), 'utf8')
    ).version;
}

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(absolute);
    return entry.isFile() ? [absolute] : [];
  });
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function expectedBundledBytes(record, packageName) {
  if (!record.upstream) return null;
  const upstreamPackage = record.upstreamPackage || packageName;
  const upstreamPath = path.join(ROOT, 'node_modules', upstreamPackage, record.upstream);
  const upstream = fs.readFileSync(upstreamPath);
  if (!record.rewrite) return upstream;

  const source = upstream.toString('utf8');
  assert.ok(
    source.includes(record.rewrite.from),
    `${record.path} rewrite source is absent from pinned upstream package`
  );
  return Buffer.from(source.replaceAll(record.rewrite.from, record.rewrite.to));
}

const runtimeManifest = await import(pathToFileURL(MANIFEST_PATH));
const threeRuntimeSources = [
  ...runtimeManifest.vendorScriptsCritical,
  ...runtimeManifest.vendorScriptsOptional
];
const resolvedThreeRuntimeFiles = new Set(threeRuntimeSources.map((source) => {
  assert.doesNotMatch(source, /^(?:https?:)?\/\//, `runtime source must not use a CDN: ${source}`);
  return fileURLToPath(source);
}));

let totalRuntimeBytes = 0;
let totalRuntimeFiles = 0;
const reports = [];

for (const inventoryDirectory of VENDOR_INVENTORIES) {
  const vendorDirectory = path.join(VENDOR_ROOT, inventoryDirectory);
  const inventory = JSON.parse(
    fs.readFileSync(path.join(vendorDirectory, 'manifest.json'), 'utf8')
  );
  const pinnedVersion = packageVersion(inventory.package);
  assert.equal(inventory.version, pinnedVersion, `${inventory.package} inventory version is not pinned`);

  let runtimeBytes = 0;
  let runtimeFiles = 0;
  for (const record of inventory.files) {
    const bundledPath = path.join(vendorDirectory, record.path);
    const bundled = fs.readFileSync(bundledPath);
    assert.equal(bundled.byteLength, record.bytes, `${inventory.package}/${record.path} byte count drifted`);
    assert.equal(sha256(bundled), record.sha256, `${inventory.package}/${record.path} checksum drifted`);

    const expected = expectedBundledBytes(record, inventory.package);
    if (expected) {
      assert.deepEqual(
        bundled,
        expected,
        `${inventory.package}/${record.path} differs from its declared pinned source`
      );
    }

    if (record.path.endsWith('.js')) {
      runtimeBytes += bundled.byteLength;
      runtimeFiles++;
    }
  }

  assert.equal(runtimeBytes, inventory.runtimeBytes, `${inventory.package} runtime byte total drifted`);
  totalRuntimeBytes += runtimeBytes;
  totalRuntimeFiles += runtimeFiles;
  reports.push(`${inventory.package}@${inventory.version}:${runtimeFiles}/${runtimeBytes}`);

  const inventoriedPaths = new Set(inventory.files.map((record) => (
    path.join(vendorDirectory, record.path)
  )));
  const untrackedFiles = listFiles(vendorDirectory)
    .filter((file) => path.basename(file) !== 'manifest.json')
    .filter((file) => !inventoriedPaths.has(file));
  assert.deepEqual(untrackedFiles, [], `${inventory.package} vendor directory contains untracked files`);
}

const threeInventory = JSON.parse(
  fs.readFileSync(path.join(VENDOR_ROOT, 'three-r128', 'manifest.json'), 'utf8')
);
const inventoriedThreeRuntimeFiles = new Set(
  threeInventory.files
    .filter((record) => record.path.endsWith('.js'))
    .map((record) => path.join(VENDOR_ROOT, 'three-r128', record.path))
);
assert.deepEqual(
  resolvedThreeRuntimeFiles,
  inventoriedThreeRuntimeFiles,
  'Three.js runtime manifest and pinned inventory differ'
);

const sourceRoots = [path.join(ROOT, 'app'), path.join(ROOT, 'js')];
const remoteModuleImports = sourceRoots.flatMap(listFiles)
  .filter((file) => file.endsWith('.js'))
  .flatMap((file) => {
    const source = fs.readFileSync(file, 'utf8');
    return [...source.matchAll(/\b(?:from\s*|import\s*\(\s*)['"](https?:\/\/[^'"]+)/g)]
      .map((match) => `${path.relative(ROOT, file)} -> ${match[1]}`);
  });
assert.deepEqual(remoteModuleImports, [], 'runtime JavaScript still imports executable code remotely');

const localAdapterChecks = [
  ['app/js/platform/firebase/app.js', 'vendor/firebase-12.16.0/firebase-app.js'],
  ['app/js/platform/firebase/auth.js', 'vendor/firebase-12.16.0/firebase-auth.js'],
  ['app/js/platform/firebase/firestore.js', 'vendor/firebase-12.16.0/firebase-firestore.js'],
  ['app/js/platform/firebase/analytics.js', 'vendor/firebase-12.16.0/firebase-analytics.js'],
  ['app/js/live-earth/satellites.js', 'vendor/satellite-5.0.0/satellite.es.js'],
  ['app/js/world/overture-tile-source.js', 'vendor/pmtiles-4.4.1/index.js']
];
for (const [file, requiredReference] of localAdapterChecks) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.ok(source.includes(requiredReference), `${file} does not reference ${requiredReference}`);
}

const moduleExportChecks = [
  ['app/js/platform/firebase/app.js', ['getApps', 'initializeApp']],
  ['app/js/platform/firebase/auth.js', ['getAuth', 'signInAnonymously']],
  ['app/js/platform/firebase/firestore.js', ['collection', 'getFirestore', 'serverTimestamp']],
  ['app/js/platform/firebase/analytics.js', ['getAnalytics', 'isSupported']],
  ['app/vendor/satellite-5.0.0/satellite.es.js', ['propagate', 'twoline2satrec']],
  ['app/vendor/pmtiles-4.4.1/index.js', ['PMTiles']]
];
for (const [file, expectedExports] of moduleExportChecks) {
  const module = await import(pathToFileURL(path.join(ROOT, file)));
  for (const expectedExport of expectedExports) {
    assert.equal(
      typeof module[expectedExport],
      'function',
      `${file} does not export ${expectedExport}()`
    );
  }
}

console.log(
  `[runtime-dependencies] ${totalRuntimeFiles} local runtime files, ` +
  `${totalRuntimeBytes} bytes, pinned sources and checksums verified.`
);
console.log(`[runtime-dependencies] ${reports.join(', ')}`);
