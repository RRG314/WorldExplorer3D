import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js';
import {createRegionalRoadContact} from '../app/js/terrain/regional-road-contact.js';
const mesh=(y,baseY)=>({geometry:{attributes:{position:{array:Float32Array.from([0,y,0,10,y,0,0,y,10])},roadBaseY:{array:Float32Array.from([baseY,baseY+.01,baseY+.02])}},getIndex:()=>({array:Uint16Array.from([0,2,1])})},userData:{terrainMode:'at_grade',roadSurfaceMaterial:'edge-band'}});
test('base and top come from the same selected published triangle, including precision projection',()=>{
 const contact=createRegionalRoadContact(createRoadContactIndex([mesh(10.05,10),mesh(20.05,20)]));
 try{
  for(const base of[10,20]){const p=contact.sampleProfileAt(1,2,base,'at_grade');assert.ok(Math.abs(p.y-base-.05)<.00001);assert.ok(Math.abs(p.baseY-base-.005)<.00001);assert.equal(contact.sampleAt(1,2,base,'at_grade'),p.y);}
  const p=contact.nearestProfileAt(-.0001,1,.001,'at_grade');assert.ok(p.distance<.000101);assert.ok(Math.abs(p.baseY-10.002)<.00001);assert.ok(Math.abs(p.y-10.05)<.00001);
 }finally{contact.dispose();}
 assert.equal(contact.sampleProfileAt(1,2,10,'at_grade'),null);
});
test('ordinary published asphalt witnesses its own top without an additional height allocation',()=>{
 const plain=mesh(3,3);delete plain.geometry.attributes.roadBaseY;delete plain.userData.roadSurfaceMaterial;
 const contact=createRoadContactIndex([plain]);try{assert.deepEqual(contact.sampleProfileAt(1,2),{y:3,baseY:3});}finally{contact.dispose();}
});

test('a labelled raised mesh cannot publish a missing or malformed base witness',()=>{
 for(const kind of['missing','count','nonfinite']){const bad=mesh(10.05,10);if(kind==='missing')delete bad.geometry.attributes.roadBaseY;else bad.geometry.attributes.roadBaseY.array=kind==='count'?new Float32Array([10]):new Float32Array([10,NaN,10]);assert.throws(()=>createRoadContactIndex([bad]),/base_witness/);}
});
