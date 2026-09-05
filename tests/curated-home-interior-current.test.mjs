import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { getModelAsset, modelAssetsForRole } from '../app/js/assets/model-asset-catalog.js';
import { findOwnedHomeForInteriorSupport } from '../app/js/interiors/curated-home-furnishing.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readGlb(file) {
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').replace(/\0+$/, ''));
  return { bytes, json };
}

function triangleCount(json) {
  return (json.meshes || []).reduce((total, mesh) => total + (mesh.primitives || []).reduce((subtotal, primitive) => {
    const accessor = json.accessors?.[primitive.indices ?? primitive.attributes?.POSITION];
    return subtotal + Number(accessor?.count || 0) / 3;
  }, 0), 0);
}

test('the furnished Explorer home is local, licensed, bounded, and decoder-independent', () => {
  const assets = modelAssetsForRole('owned-residential-interior-presentation');
  assert.equal(assets.length, 1);
  const asset = getModelAsset('interior-furnished-explorer-home-v1');
  assert.equal(assets[0], asset);
  assert.equal(asset.license, 'CC-BY-4.0');
  assert.equal(asset.budgets.maxInstances, 1);
  assert.equal(asset.collisionPolicy, 'world-explorer-interior-shell-and-proxy-colliders');
  assert.match(asset.url, /^\/app\/assets\/models\/interiors\//);
  assert.doesNotMatch(asset.url, /^https?:/);

  const file = path.join(root, asset.url.replace(/^\/app\//, 'app/'));
  const { bytes, json } = readGlb(file);
  assert.ok(bytes.length <= asset.budgets.bytes);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), 'a3c6c77e7ba695eaebe45da4d2163e948099eb5bb1188ca73081190985249323');
  assert.ok(triangleCount(json) <= asset.budgets.triangles);
  assert.deepEqual(json.extensionsRequired || [], []);
  assert.equal(json.asset?.extras?.license, 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)');
  assert.match(json.asset?.extras?.author || '', /Paolo Mercogliano/);
  assert.equal(json.asset?.extras?.source, asset.sourceUrl);
  assert.ok((json.images || []).every((image) => image.bufferView != null && !image.uri));
});

test('only the matching owned residential building receives home furnishing', () => {
  const support = { building: { sourceBuildingId: 'osm:way:42', buildingType: 'house' } };
  const owned = { homes: [{ id: 'home:baltimore:osm:way:42', sourceBuildingId: 'osm:way:42', owned: true }] };
  assert.equal(findOwnedHomeForInteriorSupport(support, owned), owned.homes[0]);
  assert.equal(findOwnedHomeForInteriorSupport(support, { homes: [{ ...owned.homes[0], owned: false }] }), null);
  assert.equal(findOwnedHomeForInteriorSupport(support, { homes: [{ ...owned.homes[0], rentedByMe: true }] }), null);
  assert.equal(findOwnedHomeForInteriorSupport({ building: { ...support.building, buildingType: 'office' } }, owned), null);
  assert.equal(findOwnedHomeForInteriorSupport(support, { homes: [{ ...owned.homes[0], sourceBuildingId: 'osm:way:99', id: 'home:baltimore:osm:way:99' }] }), null);
});

test('curated furniture remains presentation beneath functional interior authority', () => {
  const adapter = fs.readFileSync(path.join(root, 'app/js/interiors/curated-home-furnishing.js'), 'utf8');
  const runtime = fs.readFileSync(path.join(root, 'app/js/interiors/runtime.js'), 'utf8');
  const builder = fs.readFileSync(path.join(root, 'app/js/interiors/scene-builder.js'), 'utf8');
  const propertyUi = fs.readFileSync(path.join(root, 'app/js/game/property-ui.js'), 'utf8');
  assert.match(adapter, /presentationOnly\s*=\s*true/);
  assert.match(adapter, /collisionAuthority/);
  assert.match(adapter, /maxInstances/);
  assert.match(runtime, /findOwnedHomeForInteriorSupport/);
  assert.match(runtime, /attachCuratedHomeFurnishing/);
  assert.match(runtime, /disposeCuratedHomeFurnishing/);
  assert.match(builder, /suppressPartitions:\s*options\.curatedHome\s*===\s*true/);
  assert.match(propertyUi, /getExplorerPropertySnapshot\s*=\s*snapshot/);
});
