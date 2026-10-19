import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ctx} from '../app/js/shared-context.js?v=55';
import {addEarthWorldObject,enforceEnvironmentSceneOwnership} from '../app/js/planetary/scene-ownership.js';
import {acquireVenueLighting} from '../app/js/interiors/venue-lighting.js';
import {actorRequestsRoadDetail,actorNeedsRoadDetail} from '../app/js/terrain/transport-detail-plan.js';
import {createCoreFrameSystems} from '../app/js/runtime/core-frame-systems.js';

test('an exclusive venue retains the city without traversing it and restores it on exit',()=>{
 globalThis.THREE=THREE;
 Object.assign(ctx,{scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),worldLoading:false,earthResumePending:false,ENV:{EARTH:'EARTH'},getEnv:()=> 'EARTH'});
 const city=new THREE.Object3D(),venue=new THREE.Group(),fixture=new THREE.Object3D();let cityUpdates=0,venueUpdates=0;
 const cityUpdate=city.updateMatrixWorld,fixtureUpdate=fixture.updateMatrixWorld;
 city.updateMatrixWorld=function(force){cityUpdates++;cityUpdate.call(this,force);};
 fixture.updateMatrixWorld=function(force){venueUpdates++;fixtureUpdate.call(this,force);};
 addEarthWorldObject(city);venue.add(fixture);ctx.scene.add(venue);enforceEnvironmentSceneOwnership();ctx.scene.updateMatrixWorld(true);
 const cityRoot=ctx.earthSceneRoot,lease=acquireVenueLighting(ctx,venue);
 assert.equal(cityRoot.visible,false,'The visitor camera does not present the exterior city');
 city.position.x=24;
 for(let i=0;i<90;i++){enforceEnvironmentSceneOwnership();ctx.scene.updateMatrixWorld(true);}
 assert.equal(cityUpdates,1,'Main and water passes must not traverse hidden city transforms');
 assert.equal(venueUpdates,91,'The occupied venue remains animated');
 assert.equal(city.parent,cityRoot);assert.equal(cityRoot.parent,ctx.scene);
 lease.release();assert.equal(cityRoot.visible,true);ctx.scene.updateMatrixWorld(true);
 assert.equal(cityUpdates,2);assert.equal(new THREE.Vector3().setFromMatrixPosition(city.matrixWorld).x,24);
 lease.release();assert.equal(ctx.camera.layers.mask,1);
});

test('outdoor road readiness cannot stall movement on an occupied interior floor',()=>{
 let requests=0;
 const app={gameStarted:true,activeInterior:{},transportDetail:{step(point){if(actorRequestsRoadDetail(point))requests++;},readyForActor:point=>!actorNeedsRoadDetail(point)},activeEarthActorPosition:()=>({x:10,z:20,source:'walk'})};
 const readiness=createCoreFrameSystems(app).find(s=>s.id==='core.readiness'),inside={flags:{}};
 readiness.update(inside);assert.equal(requests,0);assert.equal(inside.flags.simulationBlocked,undefined);
 app.activeInterior=null;const outside={flags:{}};readiness.update(outside);
 assert.equal(requests,1);assert.equal(outside.flags.simulationBlocked,true,'Outdoor driving/walking keeps its physical road guard');
});
