import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createVehicleInstruments} from '../app/js/transport/vehicle-instruments.js';

test('cockpit telemetry uses accepted speed, RPM and direction, updates on changes and releases its instance texture',()=>{
 const originalDocument=globalThis.document,text=[];
 const context={fillRect(){},fillText(value){text.push(value);}};
 globalThis.document={createElement:()=>({getContext:()=>context})};
 try {
  const root=new THREE.Group(),material=new THREE.MeshStandardMaterial({color:0x020405,emissive:0x010203,emissiveIntensity:.45}),originalMap=new THREE.Texture();
  const originalColor=material.color.clone(),originalEmissive=material.emissive.clone();
  material.map=originalMap;
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(),material);root.add(screen);
  assert.equal(createVehicleInstruments(THREE,root),null);
  screen.userData.vehicleInstrumentDisplay=true;
  const instrument=createVehicleInstruments(THREE,root),texture=material.map;let disposals=0;
  texture.addEventListener('dispose',()=>disposals++);
  assert.notEqual(texture,originalMap);assert.equal(material.emissiveMap,texture);
  assert.equal(texture.flipY,false);assert.equal(material.color.getHex(),0xffffff);assert.equal(material.emissive.getHex(),0xffffff);
  text.length=0;assert.equal(instrument.update(64.7,6351,4,8000),true);
  assert.ok(text.includes('65')&&text.includes('4')&&text.includes('RPM 6400'));
  text.length=0;assert.equal(instrument.update(64.71,6370,4,8000),false);assert.deepEqual(text,[]);
  instrument.update(-9,1500,1,8000,true);assert.ok(text.includes('9')&&text.includes('R'));
  instrument.dispose();instrument.dispose();assert.equal(disposals,1);assert.equal(material.map,originalMap);
  assert.equal(material.emissiveMap,null);assert.equal(instrument.update(80,6500,5),false);
  assert.deepEqual(material.color,originalColor);assert.deepEqual(material.emissive,originalEmissive);
  assert.equal(material.emissiveIntensity,.45);assert.equal(material.toneMapped,true);
 } finally {if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;}
});

test('the five-dial cabin reads accepted speed, RPM and gear without inventing auxiliary telemetry',()=>{
 const originalDocument=globalThis.document,text=[],segments=[];
 const context={fillRect(){},fillText(value){text.push(value);},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(x,y){segments.push([x,y]);}};
 globalThis.document={createElement:()=>({getContext:()=>context})};
 try{
  const root=new THREE.Group(),material=new THREE.MeshStandardMaterial(),screen=new THREE.Mesh(new THREE.PlaneGeometry(),material);
  screen.userData.vehicleInstrumentDisplay=true;screen.userData.vehicleInstrumentStyle='five-dial';root.add(screen);
  const instrument=createVehicleInstruments(THREE,root);text.length=0;segments.length=0;
  assert.equal(instrument.update(71.7,6351,4,8000),true);
  assert.ok(text.includes('72')&&text.includes('RPM ×1000')&&text.includes('G 4'));
  assert.equal(text.filter(t=>t==='—').length,3);
  const first=segments.map(p=>p.slice());text.length=0;segments.length=0;
  assert.equal(instrument.update(100,7800,5,8000),true);assert.notDeepEqual(segments,first);
  assert.ok(text.includes('100')&&text.includes('G 5'));instrument.dispose();
 }finally{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;}
});
