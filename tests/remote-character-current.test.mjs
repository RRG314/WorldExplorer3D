import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createProxyByType} from '../app/js/multiplayer/ghost-proxies.js';
import {disposeCuratedCharacter} from '../app/js/walking/curated-explorer-character.js?v=8';

test('remote characters share the template but cancel late attachments independently', {timeout:5000}, async()=>{
  let complete,requests=0,loadStarted;
  const pendingLoad=new Promise(resolve=>{loadStarted=resolve;});
  class Loader{register(){return this;}load(url,done){requests++;complete=done;loadStarted();}}
  const api={...THREE,GLTFLoader:Loader};
  const scene=new THREE.Group();
  const departed=createProxyByType(api,'walker'),active=createProxyByType(api,'walker');
  scene.add(departed,active);
  scene.remove(departed);disposeCuratedCharacter(departed);
  const source=new THREE.Group();source.add(new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshStandardMaterial()));
  // Template acquisition starts its shared load on a microtask. Wait for the
  // loader itself so cancellation is tested against a real pending attachment.
  await pendingLoad;
  complete({scene:source,animations:[]});
  assert.equal(await departed.userData.characterReady,false);
  assert.equal(await active.userData.characterReady,true);
  assert.equal(requests,1,'same avatar must not duplicate its network request');
  assert.equal(departed.children.length,0,'late model must not resurrect departed player');
  assert.equal(active.userData.curatedCharacterAssetId,'character-field-explorer-v1');
  assert.ok(active.userData.characterAnimation);
  disposeCuratedCharacter(active);
  assert.equal(active.children.length,0);
  assert.equal(active.userData.characterAnimation,null);
  assert.equal(disposeCuratedCharacter(active),false,'release is idempotent');
});
