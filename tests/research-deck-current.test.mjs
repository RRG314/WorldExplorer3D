import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {RESEARCH_DECK,RESEARCH_STATIONS,researchDeckCollision,moveOnResearchDeck} from '../app/js/boat-mode/research/layout.js';
import {createResearchDeck} from '../app/js/boat-mode/research/runtime.js';
import {researchLabRecord} from '../app/js/boat-mode/research/lab.js';

test('bridge door and station approaches are passable while walls and rail boundaries block traversal',()=>{
 assert.equal(researchDeckCollision(0,-1),false);assert.equal(researchDeckCollision(3,-1),true);assert.equal(researchDeckCollision(7.1,-10),true);
 for(const station of RESEARCH_STATIONS)assert.equal(researchDeckCollision(station.x,station.z),false,station.id);
 let pose={x:0,z:-3};for(let i=0;i<50;i++)pose=moveOnResearchDeck(pose,0,.1);assert.ok(pose.z>1);
 const blocked=moveOnResearchDeck({x:3,z:-1.5},0,1);assert.equal(blocked.z,-1.5);
});
function fixture(){
 globalThis.THREE=THREE;
 const scene=new THREE.Scene(),mesh=new THREE.Group(),host=new THREE.Group();scene.add(mesh,host);
 let actions={},message='';
 const ctx={LOC:{lat:0,lon:0},SCALE:100000,getEnv:()=> 'EARTH',METERS_PER_WORLD_UNIT:1,boat:{x:0,y:0,z:0,angle:0,speed:0,vx:0,vz:0},boatMode:{active:true,transportCatalogId:'ocean-research-vessel',transportEntityId:'research-1',mesh},Walk:{state:{characterMesh:host}},camera:new THREE.PerspectiveCamera(),readControlActions:()=>actions};
 const api=createResearchDeck({ctx,resetDynamics:()=>{ctx.boat.speed=ctx.boat.vx=ctx.boat.vz=0},updateVessel:()=>{},hudFactory:()=>({show(){},hide(){},message:text=>message=text,dispose(){}})});
 return {ctx,api,scene,mesh,host,input:value=>actions=value,message:()=>message};
}
test('deck rider follows the exact ship transform, blocks powered exit, and returns original avatar ownership',()=>{
 const f=fixture();f.ctx.boat.speed=2;assert.equal(f.api.enter(),false);f.ctx.boat.speed=0;assert.equal(f.api.enter(),true);assert.equal(f.ctx.boatMode.moored,true);assert.equal(f.host.parent,f.mesh);
 f.mesh.position.set(100,5,200);f.mesh.rotation.set(.06,.7,-.04);f.api.update(.016);
 const expected=f.mesh.localToWorld(new THREE.Vector3(f.api.snapshot().pose.x,RESEARCH_DECK.y+RESEARCH_DECK.eyeHeight,f.api.snapshot().pose.z));
 assert.ok(Math.abs(f.api.navigationActor().position.x-expected.x)<1e-9);assert.ok(Math.abs(f.api.navigationActor().position.z-expected.z)<1e-9);
 assert.equal(f.api.camera(),true);assert.ok(f.ctx.camera.position.toArray().every(Number.isFinite));
 f.input({move:1});f.api.update(.05);assert.ok(f.api.snapshot().pose.z>-23.4);
 f.api.release();assert.equal(f.host.parent,f.scene);assert.equal(f.host.visible,false);assert.equal(f.api.active,false);assert.equal(f.api.camera(),false);
});
test('lab records retain unknown/model provenance, geographic location and no reward grant',()=>{
 const f=fixture(),unknown=researchLabRecord(f.ctx,3600000);assert.equal(unknown.metadata.truthType,'unknown');assert.equal(unknown.progress.points,0);assert.equal(unknown.projections.profile,false);assert.match(unknown.detail,/unavailable/);
 f.ctx.activeWaterOpticsEvidence={wave:{truthType:'modeled',waveHeightM:0,wavePeriodS:8,sourceId:'fixture-model',validAt:'2026-10-02T12:00:00Z'}};f.ctx.boat.x=100;
 const model=researchLabRecord(f.ctx,3600000);assert.equal(model.metadata.waveHeightM,0);assert.ok(Math.abs(model.locationSnapshot.lon-.001)<1e-12);assert.match(model.detail,/Regional wave model/);assert.notEqual(model.eventId,unknown.eventId);
});
test('distant stations cannot act and environment changes remove deck authority',async()=>{
 const f=fixture();f.api.enter();f.api.select('lab');assert.equal(await f.api.act(),false);
 f.ctx.LOC={lat:1,lon:0};f.api.update(.016);assert.equal(f.api.active,false);assert.equal(f.host.parent,f.scene);
});
