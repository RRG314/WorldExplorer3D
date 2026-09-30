import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createServiceLightPool} from '../app/js/urban-sandbox/service-light-pool.js';

test('service emitters preserve scene light count through spawn, movement, hiding and disposal', () => {
  const scene=new THREE.Scene(), owner=new THREE.Group(); scene.add(owner);
  const pool=createServiceLightPool(THREE,owner,4);
  const lights=()=>{const values=[];scene.traverseVisible(o=>{if(o.isLight)values.push(o);});return values;};
  const initial=lights();assert.equal(initial.length,4);
  const vehicle=new THREE.Group();owner.add(vehicle);vehicle.position.set(20,2,5);
  const emitter=pool.createEmitter(0xff2435);emitter.position.x=.32;emitter.intensity=2.2;vehicle.add(emitter);
  pool.update(new THREE.Vector3());assert.deepEqual(lights(),initial);
  assert.equal(initial[0].intensity,2.2);assert.equal(initial[0].color.getHex(),0xff2435);
  assert.ok(initial[0].position.distanceTo(new THREE.Vector3(20.32,2,5))<1e-8);
  vehicle.position.z=30;pool.update(new THREE.Vector3());assert.equal(initial[0].position.z,30);
  vehicle.visible=false;pool.update(new THREE.Vector3());assert.ok(initial.every(l=>l.intensity===0));assert.deepEqual(lights(),initial);
  vehicle.visible=true;pool.update(new THREE.Vector3());assert.equal(initial[0].intensity,2.2);
  pool.release(emitter);vehicle.parent.remove(vehicle);pool.update(new THREE.Vector3());assert.ok(initial.every(l=>l.intensity===0));assert.deepEqual(lights(),initial);
  pool.dispose();assert.equal(lights().length,0);
});

test('pool retains the nearest active emitters without changing its allocation',()=>{
  const scene=new THREE.Scene(),pool=createServiceLightPool(THREE,scene,2),emitters=[];
  for(let i=0;i<5;i++){const e=pool.createEmitter(0xffffff);e.position.x=i*5;e.intensity=2;scene.add(e);emitters.push(e);}
  pool.update(new THREE.Vector3(20,0,0));
  const active=scene.children.filter(o=>o.isLight&&o.intensity>0);assert.equal(active.length,2);assert.deepEqual(active.map(o=>o.position.x),[20,15]);
  emitters[4].intensity=0;pool.update(new THREE.Vector3(20,0,0));assert.deepEqual(active.map(o=>o.position.x),[15,10]);pool.dispose();
});

import {setRetainedNpcPresentation} from '../app/js/urban-sandbox/presentation-focus.js';
test('retained distant NPC skips bone propagation and restores current transforms on approach',()=>{
 const root=new THREE.Group(),bone=new THREE.Bone();root.add(bone);let updates=0;
 const original=bone.updateMatrixWorld;bone.updateMatrixWorld=function(force){updates++;return original.call(this,force);};
 const actor={x:0,y:300,z:2000,source:'plane'};
 assert.equal(setRetainedNpcPresentation(root,actor),false);root.position.x=24;root.updateMatrixWorld(true);assert.equal(updates,0);
 actor.y=0;actor.z=0;assert.equal(setRetainedNpcPresentation(root,actor),true);root.updateMatrixWorld(true);assert.equal(updates,1);assert.equal(bone.matrixWorld.elements[12],24);
});
