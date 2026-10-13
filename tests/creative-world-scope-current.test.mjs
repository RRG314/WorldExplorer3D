import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {creativeEnvironment,roomEditFrame,isRoomEditFrameCurrent} from '../app/js/editable-world/scope.js';

test('room coordinates require the same environment and declared Earth origin, including longitude wrap',()=>{
 const earth={getEnv:()=> 'EARTH',LOC:{lat:39.3,lon:-76.6}};
 const frame=roomEditFrame({kind:'earth',lat:39.3,lon:-76.6});
 assert.equal(isRoomEditFrameCurrent(earth,frame),true);
 assert.equal(isRoomEditFrameCurrent({...earth,LOC:{lat:39.31,lon:-76.6}},frame),false);
 for(const env of ['MOON','MARS','PLANETARY','SPACE_FLIGHT','OCEAN'])assert.equal(isRoomEditFrameCurrent({...earth,getEnv:()=>env},frame),false);
 assert.equal(isRoomEditFrameCurrent({...earth,getEnv:()=> 'MOON'},roomEditFrame({kind:'moon'})),true);
 assert.equal(isRoomEditFrameCurrent({...earth,LOC:{lat:10,lon:-180}},roomEditFrame({kind:'earth',lat:10,lon:180})),true);
 for(const world of [null,{}, {kind:'earth',lat:null,lon:0},{kind:'earth',lat:91,lon:0},{kind:'space'}])assert.equal(roomEditFrame(world),null);
 assert.equal(creativeEnvironment({onMoon:true}),'moon');assert.equal(creativeEnvironment({getEnv:()=> 'SPACE_FLIGHT',onMoon:true}),'space_flight');
});

let runtimeId=0;
async function withRuntime(run){
 const previous={THREE:globalThis.THREE,localStorage:globalThis.localStorage};
 const values=new Map();globalThis.THREE=THREE;globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 try{
  const runtime=await import(`../app/js/editable-world/runtime.js?scope-test=${++runtimeId}`);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,4,2),new THREE.MeshBasicMaterial());mesh.userData.sourceBuildingId='osm:scope';
  let env='EARTH',invalidations=0;const ctx={LOC:{lat:39.3,lon:-76.6},getEnv:()=>env,scene:new THREE.Scene(),car:{x:0,y:0,z:0},initialEarthWorldReady:true,
   buildingMeshes:[mesh],buildings:[{sourceBuildingId:'osm:scope',minX:-1,maxX:1,minZ:-1,maxZ:1}],invalidateTraversalNetworks(){invalidations++;}};
  runtime.initEditableWorldRuntime(ctx);
  await run({ctx,mesh,runtime,values,setEnv:value=>{env=value;},invalidations:()=>invalidations});
  ctx.disposeEditableWorldPresentation();mesh.geometry.dispose();mesh.material.dispose();
 }finally{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
}

const room=(id,extra={})=>({enabled:true,roomId:id,worldId:`room-world:${id}:earth:test`,world:{kind:'earth',lat:39.3,lon:-76.6},canManage:true,...extra});

test('solo removal is visually and physically isolated from room state, including an empty room and return',()=>withRuntime(async({ctx,mesh,invalidations})=>{
 ctx.selectNearestEditableBuilding();assert.equal((await ctx.suppressSelectedEditableBuilding()).committed,true);assert.equal(mesh.visible,false);
 const before=invalidations();ctx.configureSharedEditableWorld(room('A'));
 assert.equal(mesh.visible,true);assert.equal(ctx.isLocalBuildingSuppressed('osm:scope'),false);assert.ok(invalidations()>before);
 assert.equal(ctx.editableWorldRuntimeSnapshot().worldId,'room-world:A:earth:test');assert.equal(ctx.editableWorldRuntimeSnapshot().selectedSourceFeatureId,'');
 ctx.configureSharedEditableWorld({enabled:false});assert.equal(mesh.visible,false);assert.equal(ctx.isLocalBuildingSuppressed('osm:scope'),true);
}));

test('Earth building tools cannot mutate or render Earth creations on another body',()=>withRuntime(async({ctx,setEnv,values})=>{
 assert.equal(ctx.placeDiscoveryWorldObject({id:'marker',position:{x:0,y:0,z:0}}).committed,true);
 const original=values.get('worldExplorer3D.worldModifications.v1');assert.equal(ctx.editableWorldRuntimeSnapshot().presentation.objects,1);
 setEnv('MOON');ctx.refreshEditableWorldPresentation();assert.equal(ctx.editableWorldRuntimeSnapshot().active,false);assert.equal(ctx.editableWorldRuntimeSnapshot().presentation.objects,0);
 assert.equal((await ctx.resetLocalEditableWorld()).committed,false);assert.equal(ctx.placeDiscoveryWorldObject({id:'wrong',position:{x:0,y:0,z:0}}).committed,false);
 assert.equal(values.get('worldExplorer3D.worldModifications.v1'),original);
 setEnv('EARTH');ctx.refreshEditableWorldPresentation();assert.equal(ctx.editableWorldRuntimeSnapshot().presentation.objects,1);
}));

test('delayed room writes retain their original identity and cannot select targets in the next room',()=>withRuntime(async({ctx})=>{
 let resolve;const pending=new Promise(r=>{resolve=r;});ctx.configureSharedEditableWorld(room('A',{suppress:()=>pending}));ctx.selectNearestEditableBuilding();
 const writing=ctx.suppressSelectedEditableBuilding();ctx.configureSharedEditableWorld(room('B'));resolve();
 const receipt=await writing;assert.equal(receipt.committed,true);assert.equal(receipt.roomId,'A');assert.equal(receipt.previousWorld,true);
 assert.equal((await ctx.suppressSelectedEditableBuilding()).reason,'no-building-selected');
 ctx.configureSharedEditableWorld(room('B',{canManage:false,reset:()=>{throw Error('must not call');}}));
 assert.equal((await ctx.resetLocalEditableWorld()).reason,'room-manager-permission-required');
}));
