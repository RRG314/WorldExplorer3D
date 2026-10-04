import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {sceneBudgetFailures} from '../scripts/verification/scene-budget-check.mjs';
import {sceneResourceSnapshot,measureSceneAnimation} from '../app/js/runtime/scene-resources.js';

test('named scene ceilings reject missing measurements, excess resources and excessive animation cost',()=>{
 const budgets=JSON.parse(readFileSync(new URL('../config/scene-resource-budgets.json',import.meta.url)));
 for(const [id,budget] of Object.entries(budgets.scenes)){
  const sample={id,after:{resources:{...budget.maximum,colliders:{...budget.colliders}}},animation:{elapsedMs:2000,totalMs:0}};
  assert.deepEqual(sceneBudgetFailures(sample,budget),[]);
  for(const key of Object.keys(budget.maximum)){
   const value=sample.after.resources[key];delete sample.after.resources[key];assert.ok(sceneBudgetFailures(sample,budget).length>0);
   sample.after.resources[key]=value+1;assert.ok(sceneBudgetFailures(sample,budget).length>0);sample.after.resources[key]=value;
  }
  sample.animation.totalMs=2000*(budget.maximumAnimationTimeRatio+.01);assert.ok(sceneBudgetFailures(sample,budget).length>0);
 }
});

test('scene accounting deduplicates shared resources and includes shader, cube, shadow and instance sources',()=>{
 const scene=new THREE.Scene(),geometry=new THREE.BoxGeometry(1,1,1),texture=new THREE.DataTexture(new Uint8Array(4*4*4),4,4);
 texture.generateMipmaps=true;
 const cube=new THREE.CubeTexture(Array.from({length:6},()=>({width:2,height:2})));cube.generateMipmaps=false;
 const material=new THREE.ShaderMaterial({uniforms:{layers:{value:[texture,cube]}}});
 const a=new THREE.Mesh(geometry,material),b=new THREE.InstancedMesh(geometry,material,10);scene.add(a,b);a.visible=false;scene.environment=cube;
 const skeleton=new THREE.Skeleton([new THREE.Bone()]);b.skeleton=skeleton;
 const shadow=new THREE.DataTexture(new Float32Array(4),2,2,THREE.RedFormat,THREE.FloatType);shadow.generateMipmaps=false;
 scene.add(Object.assign(new THREE.Object3D(),{shadow:{map:{texture:shadow}}}));
 const value=sceneResourceSnapshot({scene,renderer:{info:{render:{calls:2,triangles:132},programs:[{}]}},colliders:{mappedBuildings:3,dynamic:2}});
 const expectedGeometryBytes=Object.values(geometry.attributes).reduce((n,a)=>n+a.array.byteLength,geometry.index.array.byteLength)+b.instanceMatrix.array.byteLength;
 assert.equal(value.geometries,1);assert.equal(value.materials,1);assert.equal(value.textures,3);assert.equal(value.skeletons,1);assert.equal(value.instances,10);assert.equal(value.geometrySourceBytes,expectedGeometryBytes);
 assert.equal(value.textureSourceBytes,84+72+16);assert.equal(value.unknownTextures,0);assert.equal(value.colliders.dynamic,2);assert.equal(value.drawCalls,2);
 scene.clear();assert.equal(sceneResourceSnapshot({scene}).textureSourceBytes,72,'Scene environment remains owned after removing children');scene.environment=null;assert.equal(sceneResourceSnapshot({scene}).textureSourceBytes,0);
 geometry.dispose();material.dispose();texture.dispose();cube.dispose();shadow.dispose();
});
test('unknown image dimensions stay unknown and explicit compressed mip storage is counted',()=>{
 const scene=new THREE.Scene(),material=new THREE.MeshBasicMaterial({map:new THREE.Texture()});
 const compressed=new THREE.CompressedTexture([{data:new Uint8Array(32),width:8,height:8},{data:new Uint8Array(8),width:4,height:4}],8,8);material.envMap=compressed;
 scene.add(new THREE.Mesh(new THREE.BoxGeometry(),material));const stats=sceneResourceSnapshot({scene});assert.equal(stats.unknownTextures,1);assert.equal(stats.textureSourceBytes,40);
});
test('animation probes count only the selected scene and restore instrumentation on completion and cancellation',async()=>{
 let now=0;class Mixer{constructor(root){this.root=root;}getRoot(){return this.root;}update(){now+=2;return this;}}
 const scene={},root={parent:scene},other={parent:{}};const mixer=new Mixer(root),unrelated=new Mixer(other),original=Mixer.prototype.update;
 const promise=measureSceneAnimation({AnimationMixer:Mixer},scene,{durationMs:50,now:()=>now});
 assert.equal(mixer.update(),mixer);unrelated.update();mixer.update();
 await assert.rejects(measureSceneAnimation({AnimationMixer:Mixer},scene,{durationMs:50}),/already running/);
 const result=await promise;assert.equal(result.calls,2);assert.equal(result.mixers,1);assert.equal(result.totalMs,4);assert.equal(Mixer.prototype.update,original);
 const controller=new AbortController(),cancelled=measureSceneAnimation({AnimationMixer:Mixer},scene,{signal:controller.signal});controller.abort();await assert.rejects(cancelled,{name:'AbortError'});assert.equal(Mixer.prototype.update,original);
});
