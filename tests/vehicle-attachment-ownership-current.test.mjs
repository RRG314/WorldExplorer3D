import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import vm from'node:vm';import * as THREE from'three';
import {syncVehicleGroundPivot as syncCuratedVehicleGroundPivot} from '../app/js/engine/vehicle-ground-pivot.js';
import {createVehicleInstruments} from '../app/js/transport/vehicle-instruments.js';
import {detachSceneObject}from'../app/js/engine/scene-object-lifecycle.js';
import {createUrbanVehicleVisual}from'../app/js/urban-sandbox/vehicle-visuals.js';
const code=fs.readFileSync(new URL('../app/js/urban-sandbox/curated-traffic-vehicle.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export \{[\s\S]*?\};/g,'');
function setup(){const queue=[],releases=[];const sandbox={detachSceneObject,syncCuratedVehicleGroundPivot,createVehicleInstruments,THREE,Map,Set,Object,Number,String,Math,console,vehicleWheelRig:()=>[],VEHICLE_ROOT_TO_GROUND_METERS:1.12,
 loadModelAsset:()=>new Promise((resolve,reject)=>queue.push({resolve,reject}))};vm.createContext(sandbox);vm.runInContext(code,sandbox);
 const visual=createUrbanVehicleVisual(THREE,{variant:{length:4.5,width:1.8,height:1.5}});
 function complete(index){const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,2),new THREE.MeshStandardMaterial()));let disposed=false;queue[index].resolve({root,record:{id:'road-delorean-dmc12',label:'Car',dimensionsMeters:{width:1.8,height:1.5,length:4.5},budgets:{}},dispose(){if(!disposed){disposed=true;releases.push(index);}}});}
 return {sandbox,visual,queue,releases,complete};
}
test('the generic attachment owner installs cleanup for personal as well as ambient vehicles',async()=>{
 const h=setup(),loading=h.sandbox.attachCuratedTrafficVehicle(THREE,h.visual.root,{variantId:'delorean'});h.complete(0);assert.equal(await loading,true);
 h.visual.dispose();h.visual.dispose();assert.deepEqual(h.releases,[0]);assert.equal(h.visual.root.userData.curatedTrafficVehicleAttachment,undefined);
});
test('disposing before a model resolves prevents late publication and releases its lease',async()=>{
 const h=setup(),loading=h.sandbox.attachCuratedTrafficVehicle(THREE,h.visual.root,{variantId:'delorean'});h.visual.dispose();h.complete(0);
 assert.equal(await loading,false);assert.deepEqual(h.releases,[0]);assert.equal(h.visual.root.userData.curatedTrafficVehicleAttachment,undefined);
});
test('an obsolete failed request cannot dispose a replacement attachment on the same host',async()=>{
 const h=setup(),old=h.sandbox.attachCuratedTrafficVehicle(THREE,h.visual.root,{variantId:'delorean'});h.sandbox.disposeCuratedTrafficVehicle(h.visual.root);
 const replacement=h.sandbox.attachCuratedTrafficVehicle(THREE,h.visual.root,{variantId:'delorean'});h.complete(1);assert.equal(await replacement,true);
 h.queue[0].reject(Object.assign(Error('obsolete'),{name:'AbortError'}));assert.equal(await old,false);assert.ok(h.visual.root.userData.curatedTrafficVehicleAttachment);assert.deepEqual(h.releases,[]);
 h.visual.dispose();assert.deepEqual(h.releases,[1]);
});
