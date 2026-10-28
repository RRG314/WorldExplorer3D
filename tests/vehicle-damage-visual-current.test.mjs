import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createUrbanVehicleVisual} from '../app/js/urban-sandbox/vehicle-visuals.js';
import {createVehicleDamageVisual} from '../app/js/transport/vehicle-damage-visual.js';
import {transportDamagePresentation} from '../app/js/transport/damage-model.js';

test('an unloaded host is safe and attached damage clones only instance geometry, repairs restore vertices',()=>{
 const host=new THREE.Group(),effect=createVehicleDamageVisual(THREE,host,{length:4.5});
 effect.condition(.6,transportDamagePresentation(.6));
 const source=new THREE.Group(),original=new THREE.BoxGeometry(1,1,3),body=new THREE.Mesh(original,new THREE.MeshStandardMaterial());body.position.y=.8;
 const wheel=new THREE.Mesh(original,new THREE.MeshStandardMaterial());wheel.userData.transportPart='wheel';source.add(body,wheel);host.add(source);
 host.userData.curatedTrafficVehicleAttachment={visual:source};
 const initial=Array.from(original.attributes.position.array);effect.condition(.1,transportDamagePresentation(.3));
 assert.notEqual(body.geometry,original);assert.equal(wheel.geometry,original);assert.deepEqual(Array.from(original.attributes.position.array),initial);
 assert.notDeepEqual(Array.from(body.geometry.attributes.position.array),initial);
 effect.condition(1,transportDamagePresentation(1));assert.deepEqual(Array.from(body.geometry.attributes.position.array),initial);
 let releases=0;body.geometry.addEventListener('dispose',()=>releases++);effect.dispose();effect.dispose();
 assert.equal(body.geometry,original);assert.equal(releases,1);
});
test('the actual visual host updates smoke using its frame method and releases its resources once',()=>{
 const previous=globalThis.document;globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
 try{
 const visual=createUrbanVehicleVisual(THREE,{variant:{length:4.5,width:1.8,height:1.5},condition:.1});
 const source=new THREE.Group();source.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,3),new THREE.MeshStandardMaterial()));visual.root.add(source);
 visual.root.userData.curatedTrafficVehicleAttachment={visual:source};visual.root.userData.onCuratedTrafficAttached();
 const sprites=[];visual.root.traverse(o=>{if(o.isSprite)sprites.push(o);});assert.equal(sprites.length,10);
 const before=sprites[0].position.y;visual.updateDamageVisual(1);assert.notEqual(sprites[0].position.y,before);
 const resources=new Set(sprites.flatMap(s=>[s.material,s.material.map]));let releases=0;for(const r of resources)r.addEventListener('dispose',()=>releases++);
 visual.dispose();visual.dispose();assert.equal(releases,4);
 }finally{globalThis.document=previous;}
});
