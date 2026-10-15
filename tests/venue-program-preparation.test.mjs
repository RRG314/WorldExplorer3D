import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createVenueProgramPreparation} from '../app/js/interiors/venue-program-preparation.js';
import {suspendStreetPreparationForInterior} from '../app/js/world/street-interior-suspension.js';
import {ensureLoadedMuseumRuntime, isLoadedMuseumBuilding} from '../app/js/interiors/museum-program-preparation.js';

test('loaded public museum initializes its lazy rendering owner before first play',async()=>{
  let loads=0,current=true,finish;
  const ctx={buildings:[{sourceBuildingId:'house'}],ensureInteriorsReady:()=>{loads++;return new Promise(resolve=>{finish=resolve;});}};
  assert.equal(await ensureLoadedMuseumRuntime(ctx,()=>current),'not-needed');assert.equal(loads,0);
  const museum={buildingProvenance:{metadata:{stable:true,sourceFeatureId:'osm:way:336352958'}}};
  assert.equal(isLoadedMuseumBuilding(museum),true);
  assert.equal(isLoadedMuseumBuilding({buildingProvenance:{metadata:{stable:false,sourceFeatureId:'osm:way:336352958'}}}),false);
  ctx.buildings=[museum];const pending=ensureLoadedMuseumRuntime(ctx,()=>current);
  assert.equal(loads,1);current=false;finish();assert.equal(await pending,'superseded');
  assert.equal(await ensureLoadedMuseumRuntime(ctx,()=>current),'superseded');assert.equal(loads,1);
  current=true;ctx.ensureInteriorsReady=async()=>{loads++;};
  assert.equal(await ensureLoadedMuseumRuntime(ctx,()=>current),'ready');assert.equal(loads,2);
});

const group=()=>new THREE.Group();
function fixture(){
  const compiled=[],disposed=[],built=[];
  const ctx={_worldLoadSequence:1,buildings:[{id:'museum'}],scene:Object.assign(new THREE.Scene(),{fog:new THREE.FogExp2(),environment:new THREE.Texture()}),camera:new THREE.PerspectiveCamera(),renderer:{compile(scene,camera){compiled.push({scene,camera});}}};
  const dependencies={matches:b=>b.id==='museum',resolve:()=>({curatedContent:{id:'museum'}}),build:()=>{const g=group();built.push(g);return{group:g};},dispose:g=>disposed.push(g)};
  return {ctx,dependencies,compiled,disposed,built,api:createVenueProgramPreparation(ctx,THREE,dependencies)};
}

test('prepares one detached gallery without borrowing outdoor camera or environment ownership',()=>{
  const f=fixture();const {ctx}=f,env=ctx.scene.environment;
  assert.equal(f.api.prepare().status,'prepared');
  const compiled=f.compiled[0];
  assert.equal(compiled.scene.environment,null);assert.equal(compiled.scene.fog,ctx.scene.fog);
  assert.equal(compiled.camera.layers.mask,2);assert.equal(f.built[0].layers.mask,2);
  assert.notEqual(compiled.scene,ctx.scene);assert.notEqual(compiled.camera,ctx.camera);
  assert.equal(ctx.camera.layers.mask,1);assert.equal(ctx.scene.environment,env);
  f.api.prepare();assert.equal(f.compiled.length,1);
});
test('world replacement and explicit cleanup release each material lease once',()=>{
  const f=fixture();f.api.prepare();const first=f.built[0];
  f.ctx._worldLoadSequence++;f.api.prepare();
  assert.deepEqual(f.disposed,[first]);assert.equal(first.parent,null);
  f.api.dispose();f.api.dispose();assert.deepEqual(f.disposed,f.built);
});
test('unrelated or denied venues do not construct or compile a gallery',()=>{
  const f=fixture();f.ctx.buildings=[{id:'house'}];assert.equal(f.api.prepare().status,'not-needed');
  f.ctx._worldLoadSequence++;f.ctx.buildings=[{id:'museum'}];f.dependencies.resolve=()=>({accessDenied:true});
  assert.equal(f.api.prepare().status,'not-needed');assert.equal(f.compiled.length,0);assert.equal(f.built.length,0);
});
test('failed preparation releases construction and remains retryable',()=>{
  const f=fixture();const compile=f.ctx.renderer.compile;
  f.ctx.renderer.compile=()=>{throw Error('compile failure');};assert.throws(()=>f.api.prepare(),/compile failure/);
  assert.deepEqual(f.disposed,[f.built[0]]);assert.equal(f.built[0].parent,null);
  f.ctx.renderer.compile=compile;assert.equal(f.api.prepare().status,'prepared');
});
test('interior ownership retires only unfinished street work and permits resumption outside',()=>{
  let suspended=0,cancelled=0;const accepted={coverageBounds:{minX:1}},atlas={};
  const ctx={activeInterior:{},streetPavement:accepted,streetOverview:{atlas,stats:{status:'building'},suspendForDetail(){suspended++;this.stats.status='suspended';}},_cancelStreetPavementBuild:()=>cancelled++};
  assert.equal(suspendStreetPreparationForInterior(ctx),true);assert.equal(suspendStreetPreparationForInterior(ctx),true);
  assert.equal(suspended,1);assert.equal(cancelled,1);assert.equal(ctx._streetPavementDirty,true);
  assert.equal(ctx.streetPavement,accepted);assert.equal(ctx.streetOverview.atlas,atlas);
  ctx.activeInterior=null;assert.equal(suspendStreetPreparationForInterior(ctx),false);
  ctx.activeInterior={};ctx.streetOverview.stats.status='complete';suspendStreetPreparationForInterior(ctx);assert.equal(suspended,1);
});
