import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createVehicleInstruments} from '../app/js/transport/vehicle-instruments.js';

test('cockpit telemetry uses accepted speed, RPM and direction, updates on changes and releases its instance texture',()=>{
 const originalDocument=globalThis.document,text=[];
 const context={fillRect(){},fillText(value){text.push(value);}};
 globalThis.document={createElement:()=>({getContext:()=>context})};
 try {
  const root=new THREE.Group(),material=new THREE.MeshStandardMaterial(),originalMap=new THREE.Texture();
  material.map=originalMap;
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(),material);root.add(screen);
  assert.equal(createVehicleInstruments(THREE,root),null);
  screen.userData.vehicleInstrumentDisplay=true;
  const instrument=createVehicleInstruments(THREE,root),texture=material.map;let disposals=0;
  texture.addEventListener('dispose',()=>disposals++);
  assert.notEqual(texture,originalMap);assert.equal(material.emissiveMap,texture);
  text.length=0;assert.equal(instrument.update(64.7,6351,4,8000),true);
  assert.ok(text.includes('65')&&text.includes('4')&&text.includes('RPM 6400'));
  text.length=0;assert.equal(instrument.update(64.71,6370,4,8000),false);assert.deepEqual(text,[]);
  instrument.update(-9,1500,1,8000,true);assert.ok(text.includes('9')&&text.includes('R'));
  instrument.dispose();instrument.dispose();assert.equal(disposals,1);assert.equal(material.map,originalMap);
  assert.equal(material.emissiveMap,null);assert.equal(instrument.update(80,6500,5),false);
 } finally {if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;}
});
