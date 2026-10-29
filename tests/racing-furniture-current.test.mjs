import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {buildRaceRoadGraph,createRaceCourse} from '../app/js/racing/course-rules.js';
import {buildRaceFurniture,prepareRaceFurniture} from '../app/js/racing/course-furniture.js';

function course(){const roads=[];for(let i=0;i<30;i++)roads.push({sourceId:String(i),a:{x:0,y:i*.4,z:i*10},b:{x:0,y:(i+1)*.4,z:(i+1)*10},widthMeters:9,driveable:true,supported:true,
 heightSamples:[{t:0,y:i*.4,leftY:i*.4-.08,rightY:i*.4+.08},{t:1,y:(i+1)*.4,leftY:(i+1)*.4-.08,rightY:(i+1)*.4+.08}],heightSampleSpanMeters:1.2});
 const g=buildRaceRoadGraph(roads,{metersPerUnit:1.25});return createRaceCourse(g,g.edges.filter(e=>e.id.endsWith(':forward')).map(e=>e.id),{locationId:'test',anchor:{lat:43,lon:7},participants:4});}

test('temporary barriers and fences follow grade/crossfall and leave the admitted chassis corridor clear',()=>{
 const c=course(),before=structuredClone(c),data=buildRaceFurniture(c);let vertices=0;
 for(const chunk of data.chunks){vertices+=chunk.positions.length/3;assert.equal(chunk.positions.length/3,chunk.uvs.length/2);
  for(let i=0;i<chunk.positions.length;i+=3){const [x,y,z]=chunk.positions.slice(i,i+3),height=y-z*.04-x*c.metersPerUnit*.08/1.2;
   assert.ok(Math.abs(x)*c.metersPerUnit>=9/2-.2-1e-8,'inner barrier foot meets the existing physical clearance');
   assert.ok(height>=-1e-8&&height<=.86/c.metersPerUnit+1e-8);}
  for(let i=0;i<chunk.fencePositions.length;i+=3)assert.ok(Math.abs(chunk.fencePositions[i])*c.metersPerUnit>=9/2+.35);
 }
 assert.ok(vertices<20000,'equipment is bounded by four-metre segments, not a high-resolution world duplicate');
 assert.deepEqual(c,before);assert.equal(data.boards.length,0,'a straight has no invented braking corner');
});
test('failed equipment preparation retires already-created materials without touching borrowed maps',()=>{
 const previous=globalThis.document;globalThis.document=undefined;let made=0,released=0,borrowed=0;
 const three={...T,MeshStandardMaterial:class extends T.MeshStandardMaterial{constructor(o){super(o);made++;this.addEventListener('dispose',()=>released++);}}};
 const map=new T.Texture();map.addEventListener('dispose',()=>borrowed++);
 try {assert.throws(()=>prepareRaceFurniture(three,{concreteDiffuse:map},course()));assert.ok(made>0);assert.equal(released,made);assert.equal(borrowed,0);}
 finally{globalThis.document=previous;map.dispose();}
});
