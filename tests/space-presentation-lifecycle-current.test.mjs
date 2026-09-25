import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPlayerCharacterHost} from '../app/js/walking/player-character-host.js';
import {attachCuratedExplorerCharacter, disposeCuratedCharacter, EXPLORER_ASSET_ID, EXPLORER_WOMAN_ASSET_ID} from '../app/js/walking/curated-explorer-character.js';
import {attachShipFurnishing} from '../app/js/expedition/ship-furnishings.js';
import {ctx} from '../app/js/shared-context.js?v=55';
import {ensureAtmosphericFlightPresentation, updateAtmosphericFlightPresentation, releaseAtmosphericFlightPresentation} from '../app/js/space/atmospheric-flight-presentation.js';
import {createShipEnvironment, applyShipSurfaceUV} from '../app/js/expedition/ship-environment.js';

test('ship reflection bake releases temporary geometry but retains the owned target',()=>{
 let releasedGeometry=0,releasedMaterials=0,targetReleased=0;
 const target={texture:{},dispose(){targetReleased++;}};
 const generator={fromScene(scene){
  assert.equal(scene.children.length,5);
  scene.children[0].geometry.addEventListener('dispose',()=>releasedGeometry++);
  scene.children.forEach(mesh=>mesh.material.addEventListener('dispose',()=>releasedMaterials++));
  return target;
 }};
 assert.equal(createShipEnvironment(THREE,generator),target);
 assert.equal(releasedGeometry,1);assert.equal(releasedMaterials,5);assert.equal(targetReleased,0);
 target.dispose();assert.equal(targetReleased,1);
});

test('ship bulkheads keep one panel scale across long and short faces',()=>{
 for(const length of [2,13,72]){
  const geometry=new THREE.BoxGeometry(.28,3.42,length);
  applyShipSurfaceUV(geometry,{x:.28,y:3.42,z:length},{x:0,y:1.71,z:0},6.84);
  const uv=geometry.attributes.uv;
  assert.ok(Math.abs(Math.abs(uv.getX(0)-uv.getX(1))-length/6.84)<1e-5);
  assert.ok(Math.abs(Math.abs(uv.getY(0)-uv.getY(2))-.5)<1e-5);
  geometry.dispose();
 }
});

const pending = new Map();
const api = {...THREE, GLTFLoader: class { load(url, resolve) {pending.set(url,resolve);} }};
const resolveModel = (suffix, texture = null) => {
 const entry=[...pending].find(([url])=>url.endsWith(suffix));assert.ok(entry,suffix);
 const scene=new THREE.Group();scene.add(new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshStandardMaterial({map:texture})));
 entry[1]({scene,animations:[]});pending.delete(entry[0]);
};

test('player host has zero legacy render resources; superseded loads cannot reattach a character',async()=>{
 const host=createPlayerCharacterHost(api);let meshCount=0;host.traverse(o=>meshCount+=Number(!!o.isMesh));assert.equal(meshCount,0);
 const first=attachCuratedExplorerCharacter(api,host,{assetId:EXPLORER_ASSET_ID,failClosed:true});
 disposeCuratedCharacter(host);
 const second=attachCuratedExplorerCharacter(api,host,{assetId:EXPLORER_WOMAN_ASSET_ID,failClosed:true});
 disposeCuratedCharacter(host);
 const latest=attachCuratedExplorerCharacter(api,host,{assetId:EXPLORER_ASSET_ID,failClosed:true});
 resolveModel('field-explorer-v1.glb');resolveModel('field-explorer-woman-v1.glb');
 assert.deepEqual(await Promise.all([first,second,latest]),[false,false,true]);
 assert.equal(host.userData.curatedCharacterAssetId,EXPLORER_ASSET_ID);
 assert.equal(host.children.filter(o=>o.userData.curatedCharacterAssetId).length,1);
 disposeCuratedCharacter(host);meshCount=0;host.traverse(o=>meshCount+=Number(!!o.isMesh));assert.equal(meshCount,0);
});

test('ship furniture teardown releases its instance but preserves cached textures for the next visit',async()=>{
 const host=new THREE.Group(), map=new THREE.Texture();let disposed=0;map.addEventListener('dispose',()=>disposed++);
 const first=attachShipFurnishing(api,host,'solis-crew-bed',{isCurrent:()=>true});resolveModel('crew-bed.glb',map);
 assert.equal(await first,true);host.userData.disposeShipFurnishing();assert.equal(host.children.length,0);assert.equal(disposed,0);
 const second=attachShipFurnishing(api,host,'solis-crew-bed',{isCurrent:()=>true});assert.equal(await second,true);
 assert.equal(disposed,0);host.userData.disposeShipFurnishing();
});

test('all giant atmospheres use finite spherical map coordinates and restore orbital visibility',()=>{
 const oldThree=globalThis.THREE,oldDocument=globalThis.document;
 globalThis.THREE={...THREE,TextureLoader:class {load(){return new THREE.Texture();}}};
 globalThis.document={getElementById(){return null;}};
 try {
  ctx.spaceFlight={scene:new THREE.Scene(),rocket:new THREE.Group(),celestialCatalog:{group:new THREE.Group()}};
  const bodyGroup=new THREE.Group(),body=new THREE.Mesh();bodyGroup.add(body);ctx.spaceFlight.scene.add(bodyGroup);
  ctx.getAllSpaceBodies=()=>[{mesh:body}];ctx.setSolarSystemFrameVisibility=visible=>{bodyGroup.visible=visible;};
  for(const id of ['jupiter','saturn','uranus','neptune']) {
   const state=ensureAtmosphericFlightPresentation(id);assert.equal(bodyGroup.visible,false);
   assert.equal(state.dome.geometry.type,'SphereGeometry');assert.equal(state.group.children.length,1);
   updateAtmosphericFlightPresentation(id,{radial:{x:1,y:0,z:0},altitudeM:20000});
   assert.ok(Number.isFinite(state.dome.material.uniforms.relativeAltitude.value));
   assert.deepEqual(state.dome.material.uniforms.radial.value.toArray(),[1,0,0]);
   assert.deepEqual(state.cloudTexture.repeat.toArray(),[1,1]);
   updateAtmosphericFlightPresentation(id,{altitudeM:-20000});assert.ok(state.dome.material.uniforms.immersion.value>0);
   releaseAtmosphericFlightPresentation();assert.equal(bodyGroup.visible,true);
  }
 } finally {globalThis.THREE=oldThree;globalThis.document=oldDocument;}
});

test('Earth environment refresh cannot relight a ship interior or solid world', async()=>{
 const {ensureHdrEnvironment}=await import('../app/js/engine/quality.js');
 const map={name:'Earth sky'},scene={environment:null};
 const appCtx={scene,activeShipInterior:true};
 const engine={state:{fallbackEnvMap:map},appCtx};
 ensureHdrEnvironment(engine);assert.equal(scene.environment,null);assert.equal(appCtx.earthEnvironmentMap,map);
 appCtx.activeShipInterior=false;appCtx.activePlanetaryBodyId='ceres';
 ensureHdrEnvironment(engine);assert.equal(scene.environment,null);
 appCtx.activePlanetaryBodyId=null;ensureHdrEnvironment(engine);assert.equal(scene.environment,map);
});

test('Pluto and Ceres retain round geometry and catalog imagery in the named-body renderer', async()=>{
 const {createNamedAsteroids}=await import('../app/js/solar-system/minor-bodies.js');
 const {NAMED_ASTEROIDS}=await import('../app/js/solar-system/catalog.js');
 const previous=globalThis.THREE;
 globalThis.THREE={...THREE,TextureLoader:class{load(path){const t=new THREE.Texture();t.userData={path};return t;}}};
 try{
  const state={solarSystem:{group:new THREE.Group()},NAMED_ASTEROIDS:NAMED_ASTEROIDS.filter(b=>['Pluto','Ceres'].includes(b.name)),getEarthHelioPos:()=>({}),createLabel:()=>{},normalizeAngle:a=>a,computeOrbitalPosition:()=>({}),ASTEROID_BELT:{visualScale:1},AU_TO_SCENE:1,helioToScene:()=>({x:0,y:0,z:0}),distanceAU:()=>0};
  createNamedAsteroids(state);
  assert.equal(state.solarSystem.asteroidMeshes.length,2);
  for(const {mesh,asteroid} of state.solarSystem.asteroidMeshes){
   const p=mesh.geometry.attributes.position;
   for(let i=0;i<p.count;i++)assert.ok(Math.abs(Math.hypot(p.getX(i),p.getY(i),p.getZ(i))-asteroid.radiusScaled)<1e-4);
   assert.ok(mesh.material.map.userData.path.endsWith('.jpg'));assert.equal(mesh.material.flatShading,false);
  }
 }finally{globalThis.THREE=previous;}
});
