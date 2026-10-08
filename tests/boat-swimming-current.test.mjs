import test from 'node:test';
import assert from 'node:assert/strict';
import {boatSwimAdmission,createBoatSwimming} from '../app/js/boat-mode/swimming.js';
const allowed={speed:0,coverage:'known-water-body',depth:8};
test('surface swimming rejects motion, unknown coverage, synthetic transition water and shallow beds',()=>{
 assert.equal(boatSwimAdmission(allowed).allowed,true);
 for(const override of [{speed:2},{speed:NaN},{coverage:'unresolved'},{depth:1},{depth:null},{synthetic:true},{walkingReady:false}])assert.equal(boatSwimAdmission({...allowed,...override}).allowed,false);
});
function fixture(){
 let env='EARTH',bottom=-8;
 const walker={x:0,y:2,z:0};
 const ctx={LOC:{lat:39,lon:-76},getEnv:()=>env,METERS_PER_WORLD_UNIT:1,boat:{x:0,y:0,z:0,angle:0,speed:0,vx:0,vz:0},boatMode:{active:true,transportEntityId:'same-boat',transportCatalogId:'marina-runabout',mesh:{visible:true},currentWater:{}},Walk:{state:{mode:'drive',walker,characterMesh:{}},setModeWalk(){this.state.mode='walk'},setModeDrive(){this.state.mode='drive'}}};
 const api=createBoatSwimming({ctx,sample:()=>({coverage:'known-water-body',surfaceY:0}),groundY:()=>bottom,park:()=>{ctx.boatMode.active=false},resume:()=>{ctx.boatMode.active=true},updateParked:()=>{},hudFactory:()=>({show(){},hide(){},dispose(){}})});
 return {ctx,api,walker,setEnvironment:v=>env=v,setBottom:v=>bottom=v};
}
test('ladder swim and boarding retain vessel identity and parked position',()=>{
 const f=fixture();assert.equal(f.api.start(),true);assert.equal(f.ctx.boatMode.active,false);assert.equal(f.ctx.Walk.state.mode,'walk');assert.equal(f.walker.y,.18);
 assert.equal(f.api.collision(0,0,.35,{actorBaseY:-.3,actorHeight:.9}),true);
 assert.equal(f.api.collision(0,0,.35,{actorBaseY:-8,actorHeight:.9}),false);
 f.walker.x+=10;assert.equal(f.api.board(),false);f.walker.x-=10;f.walker.y=-3;assert.equal(f.api.board(),false);f.walker.y=.18;
 assert.equal(f.api.board(),true);assert.equal(f.ctx.boatMode.active,true);assert.equal(f.ctx.boatMode.transportEntityId,'same-boat');assert.equal(f.ctx.boat.x,0);assert.equal(f.ctx.boat.z,0);assert.equal(f.ctx.Walk.state.mode,'drive');
});
test('recovery and environment cleanup cannot board an old or different vessel',()=>{
 const f=fixture();f.api.start();f.walker.x=100;assert.equal(f.api.board(true),true);
 f.api.start();f.ctx.LOC={lat:40,lon:-76};assert.equal(f.api.board(true),false);f.api.update(.1);assert.equal(f.api.active,false);assert.equal(f.ctx.boatMode.mesh.visible,false);
 const g=fixture();g.api.start();g.setEnvironment('OCEAN');g.api.update(.1);assert.equal(g.api.active,false);
});

import {vesselWaterSamples,fitVesselWaterPlane} from '../app/js/boat-mode/water-contact.js';
test('vessel waterline follows a fitted plane without lifting its keel above the waves',()=>{
 for(const size of [{length:7.4,width:2.6},{length:78,width:16}]){
  const points=vesselWaterSamples(size);
  const flat=fitVesselWaterPlane(points.map(p=>({...p,height:4})));assert.equal(flat.height,4);assert.ok(Math.abs(flat.pitch)<1e-9);assert.equal(flat.roll,0);
  const slope=fitVesselWaterPlane(points.map(p=>({...p,height:4+.1*p.side+.2*p.forward})));
  assert.ok(Math.abs(slope.height-4)<1e-9);assert.ok(Math.abs(slope.pitch+Math.atan(.2))<1e-9);assert.ok(Math.abs(slope.roll-Math.atan(.1))<1e-9);
 }
 assert.equal(fitVesselWaterPlane([]),null);
});
