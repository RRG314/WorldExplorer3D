import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_ASSET_CATALOG } from '../../app/js/assets/model-asset-catalog.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const attribution = fs.readFileSync(path.join(repoRoot, 'app/assets/models/ATTRIBUTION.md'), 'utf8');
const seenIds = new Set();
const seenRoleOwners = new Map();

for (const entry of MODEL_ASSET_CATALOG) {
  assert.equal(seenIds.has(entry.id), false, `duplicate curated model id: ${entry.id}`);
  seenIds.add(entry.id);
  assert.match(entry.url, /^\/app\/assets\/models\//, `${entry.id} must be bundled`);
  assert.match(entry.sourceUrl, /^https:\/\//, `${entry.id} requires public provenance`);
  assert.ok(entry.attribution.length >= 8, `${entry.id} requires useful attribution`);
  assert.ok(entry.roles.length > 0, `${entry.id} requires at least one role`);
  assert.ok(entry.budgets.mobileBytes <= entry.budgets.desktopBytes, `${entry.id} mobile byte budget cannot exceed desktop`);

  const relativePath = entry.url.replace(/^\/app\//, 'app/');
  const absolutePath = path.join(repoRoot, relativePath);
  assert.ok(fs.existsSync(absolutePath), `${entry.id} model is missing: ${relativePath}`);
  const stat = fs.statSync(absolutePath);
  assert.ok(stat.size <= entry.budgets.desktopBytes, `${entry.id} exceeds its desktop byte budget`);
  assert.ok(
    stat.size <= entry.budgets.mobileBytes || entry.delivery.mobile === 'procedural-fallback',
    `${entry.id} exceeds its mobile byte budget without a mobile fallback`
  );
  const header = Buffer.alloc(4);
  const handle = fs.openSync(absolutePath, 'r');
  fs.readSync(handle, header, 0, 4, 0);
  fs.closeSync(handle);
  assert.equal(header.toString('ascii'), 'glTF', `${entry.id} is not a binary glTF file`);
  assert.ok(attribution.includes(path.basename(relativePath)), `${entry.id} is missing from the shipped attribution ledger`);

  for (const role of entry.roles) {
    const owners = seenRoleOwners.get(role) || [];
    owners.push(entry.id);
    seenRoleOwners.set(role, owners);
  }
}

const runtimeSources = [
  'app/js/walking/character.js',
  'app/js/planetary/vehicles.js',
  'app/js/world/landmark-models.js'
].map((relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')).join('\n');
assert.equal(/new\s+THREE\.GLTFLoader\s*\(/.test(runtimeSources), false, 'runtime owners must use the shared curated model loader');
assert.match(runtimeSources, /model-asset-runtime\.js/, 'runtime owners must import the shared curated model loader');

console.log(JSON.stringify({
  status: 'pass',
  schemaVersion: MODEL_ASSET_CATALOG[0]?.schemaVersion || null,
  assets: MODEL_ASSET_CATALOG.length,
  roles: Object.fromEntries([...seenRoleOwners.entries()])
}, null, 2));
