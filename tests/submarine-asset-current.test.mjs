import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createSubmarineMesh, SUBMARINE_ASSET_ID} from '../app/js/ocean/submarine-visual.js';
import {disposeObject3D} from '../app/js/ocean/scene-assets.js';
import {SUBMARINE_BOUNDS, submarineVerticalClearance} from '../app/js/ocean/submarine-envelope.js';
import {getModelAsset} from '../app/js/assets/model-asset-catalog.js';

test('submarine intake, bundled bytes and runtime catalog agree', () => {
  const record = JSON.parse(fs.readFileSync('docs/visual-quality/assets/atlantic-explorer-submarine.json'));
  const asset = getModelAsset(SUBMARINE_ASSET_ID), bytes = fs.readFileSync('.' + asset.url);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), record.outputSha256);
  assert.ok(bytes.length <= asset.budgets.bytes);
  assert.ok(record.triangles <= asset.budgets.triangles);
  assert.equal(record.license, asset.license);
  assert.equal(record.sourceUrl, asset.sourceUrl);
  assert.ok(record.textures.every(t => Math.max(...t.dimensions) <= 1024));
  for (let axis=0;axis<3;axis++) {
    assert.ok(SUBMARINE_BOUNDS.min[axis] <= record.bounds.min[axis]);
    assert.ok(SUBMARINE_BOUNDS.max[axis] >= record.bounds.max[axis]);
  }
});

test('deck and ocean retirement release leased models once without disposing shared resources', async () => {
  const assetRoot = new THREE.Group();
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  let releases=0, geometryDisposals=0, materialDisposals=0;
  geometry.addEventListener('dispose',()=>geometryDisposals++);
  material.addEventListener('dispose',()=>materialDisposals++);
  assetRoot.add(new THREE.Mesh(geometry,material));
  const sub=createSubmarineMesh({THREE,loadModelAsset:async()=>({root:assetRoot,dispose(){releases++;assetRoot.parent?.remove(assetRoot);}})});
  assert.equal(await sub.userData.visualReady,true);
  assert.equal(sub.userData.visualLoaded,true);
  const scene=new THREE.Scene();scene.add(sub);disposeObject3D(scene);
  sub.userData.disposeCuratedMarineVisual();
  assert.equal(releases,1);assert.equal(geometryDisposals,0);assert.equal(materialDisposals,0);
  assert.equal(sub.userData.visualLoaded,false);
});

test('a late asset cannot publish into an abandoned submarine host', async () => {
  let resolve, signal, releases=0;
  const sub=createSubmarineMesh({THREE,loadModelAsset:(_engine,id,options)=>{
    assert.equal(id,SUBMARINE_ASSET_ID);signal=options.signal;
    return new Promise(done=>resolve=done);
  }});
  sub.userData.disposeCuratedMarineVisual();assert.equal(signal.aborted,true);
  resolve({root:new THREE.Group(),dispose(){releases++;}});
  assert.equal(await sub.userData.visualReady,false);assert.equal(releases,1);
  assert.equal(sub.children.filter(c=>c.isMesh).length,0);
});

test('asset failure is returned to startup without a procedural substitute', async () => {
  const sub=createSubmarineMesh({THREE,loadModelAsset:async()=>{throw new Error('offline');}});
  assert.equal(await sub.userData.visualReady,false);
  assert.equal(sub.userData.visualError,'offline');
  assert.equal(sub.children.filter(c=>c.isMesh).length,0);
  sub.userData.disposeCuratedMarineVisual();
});

test('water and seabed clearance encloses all model corners through pitch and roll', () => {
  for (const pitch of [-.52,-.25,0,.25,.52]) for (const roll of [-.5,0,.5]) for (const yaw of [0,1.2,3]) {
    const margin=submarineVerticalClearance(pitch,roll);
    const rotation=new THREE.Euler(pitch,yaw,roll,'YXZ');
    for (let mask=0;mask<8;mask++) {
      const point=new THREE.Vector3(...[0,1,2].map(axis=>SUBMARINE_BOUNDS[(mask&(1<<axis))?'max':'min'][axis])).multiplyScalar(.86).applyEuler(rotation);
      assert.ok(point.y >= -margin.below+.19999 && point.y <= margin.above-.19999);
    }
  }
});
