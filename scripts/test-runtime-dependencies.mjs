import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const PACKAGE_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VENDOR_ROOT = path.join(ROOT, 'app', 'vendor', 'three-r128');
const INVENTORY = JSON.parse(fs.readFileSync(path.join(VENDOR_ROOT, 'manifest.json'), 'utf8'));
const MANIFEST_PATH = path.join(ROOT, 'app', 'js', 'modules', 'manifest.js');
const runtimeManifest = await import(pathToFileURL(MANIFEST_PATH));
const runtimeSources = [
  ...runtimeManifest.vendorScriptsCritical,
  ...runtimeManifest.vendorScriptsOptional
];

assert.equal(PACKAGE_JSON.dependencies?.three, '0.128.0', 'Three.js must be pinned exactly');
assert.equal(INVENTORY.package, 'three');
assert.equal(INVENTORY.version, PACKAGE_JSON.dependencies.three);
assert.equal(INVENTORY.license, 'MIT');
assert.ok(runtimeSources.length > 0, 'runtime manifest must declare Three.js sources');

const resolvedRuntimeFiles = new Set(runtimeSources.map((source) => {
  assert.doesNotMatch(source, /^(?:https?:)?\/\//, `runtime source must not use a CDN: ${source}`);
  const resolved = fileURLToPath(source);
  assert.ok(
    resolved.startsWith(`${VENDOR_ROOT}${path.sep}`),
    `runtime source must resolve inside the pinned vendor directory: ${source}`
  );
  return resolved;
}));

let runtimeBytes = 0;
for (const record of INVENTORY.files) {
  const bundledPath = path.join(VENDOR_ROOT, record.path);
  const upstreamPath = path.join(ROOT, 'node_modules', 'three', record.upstream);
  const bundled = fs.readFileSync(bundledPath);
  const upstream = fs.readFileSync(upstreamPath);
  const sha256 = crypto.createHash('sha256').update(bundled).digest('hex');

  assert.equal(bundled.byteLength, record.bytes, `${record.path} byte count drifted`);
  assert.equal(sha256, record.sha256, `${record.path} checksum drifted`);
  assert.deepEqual(bundled, upstream, `${record.path} differs from pinned upstream package`);

  if (record.path !== 'LICENSE.txt') {
    runtimeBytes += bundled.byteLength;
    assert.ok(
      resolvedRuntimeFiles.has(bundledPath),
      `${record.path} is bundled but absent from the runtime manifest`
    );
  }
}

assert.equal(runtimeBytes, INVENTORY.runtimeBytes, 'runtime dependency byte total drifted');
assert.equal(
  resolvedRuntimeFiles.size,
  INVENTORY.files.length - 1,
  'runtime manifest contains a file outside the pinned inventory'
);

console.log(
  `[runtime-dependencies] Three.js ${INVENTORY.version}: ` +
  `${resolvedRuntimeFiles.size} local runtime files, ${runtimeBytes} bytes, checksums verified.`
);
