import test from 'node:test';import assert from 'node:assert/strict';
import {classifyWaterTraversal,createSwimState,stepSwimming} from '../app/js/walking/water/model.js';
test('water traversal distinguishes banks, deck support, jumps, wading and deep swimming',()=>{
 assert.equal(classifyWaterTraversal({surfaceY:0,bottomY:2,eyeY:3.7}),'dry');
 assert.equal(classifyWaterTraversal({surfaceY:0,bottomY:-.6,eyeY:1.1}),'wading');
 assert.equal(classifyWaterTraversal({surfaceY:0,bottomY:-8,eyeY:8}),'dry');
 assert.equal(classifyWaterTraversal({surfaceY:0,bottomY:-8,eyeY:1}),'swimming');
 assert.equal(classifyWaterTraversal({surfaceY:0,bottomY:-1.42,eyeY:.18,wasSwimming:true}),'swimming');
 assert.equal(classifyWaterTraversal({surfaceY:null,bottomY:-8,eyeY:1}),'dry');
});
test('gear is automatic for a deep dive and never required for ordinary surface swimming',()=>{
 const state=createSwimState();const surface=stepSwimming(state,{eyeY:.18,surfaceY:0,bottomY:-10,dt:.1});assert.equal(surface.state.equipment,'none');
 const dive=stepSwimming(state,{eyeY:.18,surfaceY:0,bottomY:-10,dt:.1,vertical:-1});assert.equal(dive.state.equipment,'scuba');assert.ok(dive.y<.18);
 const shallow=stepSwimming(state,{eyeY:.18,surfaceY:0,bottomY:-2,dt:.1,vertical:-1});assert.equal(shallow.state.equipment,'none');
});
test('low air forces ascent and cannot be refilled by briefly touching the surface',()=>{
 let state=createSwimState({equipment:'scuba',airSeconds:15}),eyeY=-5;
 for(let i=0;i<80;i++){const result=stepSwimming(state,{eyeY,surfaceY:0,bottomY:-10,dt:.1,vertical:-1});state=result.state;eyeY=result.y;assert.equal(result.recovering,true);}
 assert.ok(eyeY>-.3);assert.ok(state.airSeconds<=15);
 assert.equal(stepSwimming(state,{eyeY:.18,surfaceY:0,bottomY:-10,dt:.1,vertical:-1}).y,.18);
});
test('depth, bottom, stamina and background elapsed time remain bounded',()=>{
 let state=createSwimState(),eyeY=.18;
 for(let i=0;i<400;i++){const r=stepSwimming(state,{eyeY,surfaceY:0,bottomY:-100,dt:.1,vertical:-1,moving:true,boost:true});state=r.state;eyeY=r.y;}
 assert.ok(eyeY>=-18);assert.ok(state.stamina>=0);
 const resumed=stepSwimming(state,{eyeY:-3,surfaceY:0,bottomY:-4,dt:900});assert.ok(resumed.state.airSeconds>=state.airSeconds-.101);assert.ok(resumed.y>=-3.35);
});

import {createWalkingWaterRuntime} from '../app/js/walking/water/runtime.js';
function runtimeFixture(){
 const state={walker:{x:0,y:.18,z:0,yaw:0,angle:0,vy:0}},ctx={METERS_PER_WORLD_UNIT:1};
 let bottom=-8,covered=true,hidden=0;
 const controller=createWalkingWaterRuntime({ctx,state,CFG:{eyeHeight:1.7},groundAt:()=>({effectiveGroundY:bottom}),sample:()=>({surfaceY:0,coverage:covered?'known-water-body':'unresolved',volume:{volumeId:'lake'}}),moveVector:({forward,speed,dt})=>({x:0,z:forward*speed*dt}),animate:()=>{},hudFactory:()=>({vertical:()=>0,show:()=>{},hide:()=>hidden++})});
 const update=(actions={},forward=0)=>controller.update(.1,{actions,forward,strafe:0,groundState:{effectiveGroundY:bottom}});
 return {state,ctx,controller,update,setBottom:v=>bottom=v,setCovered:v=>covered=v,hidden:()=>hidden};
}
test('walking water runtime moves, blocks walls, releases authority on shallow support and GPS',()=>{
 const f=runtimeFixture();assert.equal(f.update({},1),true);assert.ok(f.state.walker.z>0);assert.equal(f.state.walker.swimming.equipment,'none');
 const z=f.state.walker.z;f.ctx.checkBuildingCollision=()=>({collision:true});f.update({},1);assert.equal(f.state.walker.z,z);
 f.ctx.liveGpsTranslationOwned=()=>true;assert.equal(f.update({},1),false);assert.equal(f.state.walker.swimming,null);assert.ok(f.hidden()>0);
 f.ctx.liveGpsTranslationOwned=()=>false;f.setBottom(-.5);assert.equal(f.update(),false);
});
test('unknown water never captures walking and a blocked higher bank never lifts a swimmer',()=>{
 const f=runtimeFixture();f.setCovered(false);assert.equal(f.update(),false);
 f.setCovered(true);f.update();f.controller.recover();assert.equal(f.state.walker.y,.18);
 f.setBottom(3);assert.equal(f.update(),false);assert.equal(f.state.walker.y,.18);
});
test('automatic scuba consumes air and returning to land resets the equipment',()=>{
 const f=runtimeFixture();for(let i=0;i<30;i++)f.update({vertical:-1});assert.equal(f.state.walker.swimming.equipment,'scuba');assert.ok(f.state.walker.swimming.airSeconds<180);assert.ok(f.state.walker.y<-.5);
 f.setCovered(false);f.setBottom(0);f.state.walker.y=1.7;f.update();assert.equal(f.controller.snapshot().resources.equipment,'none');
});

import {createSwimResumeStore,validateSwimResume,SWIM_RESUME_KEY} from '../app/js/walking/water/resume.js';
test('swim checkpoint is bounded, region-bound and rejects stale or damaged input',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const store=createSwimResumeStore({storage,now:()=>100000});const origin={lat:39,lon:-76};
 assert.equal(store.write(origin,{x:4,z:8,yaw:.2},{equipment:'scuba',airSeconds:71}),true);
 assert.equal(store.read(origin).airSeconds,71);assert.equal(store.read({lat:40,lon:-76}),null);
 assert.equal(validateSwimResume({...store.read(origin),airSeconds:-1},100000),null);
 assert.equal(validateSwimResume({...store.read(origin),savedAt:-90000000},100000),null);
 data.set(SWIM_RESUME_KEY,'broken');assert.equal(store.read(origin),null);
 const denied=createSwimResumeStore({storage:{getItem(){throw Error('denied')},setItem(){throw Error('quota')},removeItem(){throw Error('denied')}}});assert.equal(denied.read(origin),null);assert.equal(denied.write(origin,{x:0,z:0,yaw:0},createSwimState()),false);denied.clear();
});
test('closing an older swimming session cannot erase another tab checkpoint',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const first=createSwimResumeStore({storage}),second=createSwimResumeStore({storage});const origin={lat:1,lon:2},pose={x:0,z:0,yaw:0};
 first.write(origin,pose,createSwimState());second.write(origin,pose,createSwimState({airSeconds:42}));first.clear();assert.equal(second.read(origin).airSeconds,42);second.clear();assert.equal(second.read(origin),null);
});

import * as THREE from 'three';
import {beginSwimmingRender} from '../app/js/walking/water/presentation.js';
test('underwater presentation restores weather and sky exactly after the render',()=>{
 const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0xabcdef,.001);scene.background=new THREE.Color(0x112233);
 const sky=new THREE.Group(),camera=new THREE.PerspectiveCamera();camera.position.y=-3;
 const ctx={scene,camera,getEnv:()=> 'EARTH',earthAtmosphere:sky,Walk:{state:{walker:{swimming:{surfaceY:0}}}}};
 const restore=beginSwimmingRender(ctx);assert.equal(sky.visible,false);assert.ok(scene.fog.density>.04);restore();assert.equal(sky.visible,true);assert.equal(scene.fog.color.getHex(),0xabcdef);assert.equal(scene.fog.density,.001);assert.equal(scene.background.getHex(),0x112233);
 camera.position.y=2;assert.equal(beginSwimmingRender(ctx),null);camera.position.y=-3;ctx.getEnv=()=> 'OCEAN';assert.equal(beginSwimmingRender(ctx),null);
});

import {reconcileActorsAfterSurfaceRebuild} from '../app/js/terrain/actor-reprojection.js';
test('asynchronous terrain refinement cannot drag a swimmer onto the seabed',()=>{
 const walker={x:0,z:0,y:-1,vy:.2,speedMph:0,swimming:{surfaceY:0}};
 const ctx={Walk:{state:{walker}},GroundHeight:{invalidate(){},walkSurfaceY:()=>-20}};
 reconcileActorsAfterSurfaceRebuild(ctx);assert.equal(walker.y,-1);assert.equal(walker.vy,.2);
 walker.swimming=null;reconcileActorsAfterSurfaceRebuild(ctx);assert.equal(walker.y,-18.3);
});

test('a stationary diver keeps the full avatar above the bottom and wave crests do not redefine bed depth',()=>{
 const result=stepSwimming(createSwimState({equipment:'scuba'}),{eyeY:-2,surfaceY:0,bottomY:-3,vertical:-1,dt:.1});
 assert.ok(result.y-1.6>=-3);
 assert.equal(classifyWaterTraversal({surfaceY:.3,baseY:0,bottomY:-1.2,eyeY:.18,wasSwimming:true}),'wading');
});
