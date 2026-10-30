import test from 'node:test';import assert from 'node:assert/strict';
import {buildRacePaint,raceCourseSurfacePoint} from '../app/js/racing/course-markings.js';
import {buildRaceRoadGraph,createRaceCourse,raceGridPose} from '../app/js/racing/course-rules.js';
import * as THREE from 'three';
import {prepareRacePresentation} from '../app/js/racing/presentation.js';
function course(){const roads=[];for(let i=0;i<30;i++)roads.push({sourceId:'survey:'+i,a:{x:0,y:i*.4,z:i*10},b:{x:0,y:(i+1)*.4,z:(i+1)*10},widthMeters:9,driveable:true,supported:true,
 heightSamples:[{t:0,y:i*.4,leftY:i*.4-.08,rightY:i*.4+.08},{t:1,y:(i+1)*.4,leftY:(i+1)*.4-.08,rightY:(i+1)*.4+.08}],heightSampleSpanMeters:1.2});
 const graph=buildRaceRoadGraph(roads,{metersPerUnit:1.25});return createRaceCourse(graph,graph.edges.filter(e=>e.id.endsWith(':forward')).map(e=>e.id),{locationId:'test',anchor:{lat:43,lon:7},participants:4});}
test('full-class grid chassis fit within the surveyed start, including the back row',()=>{
 const c=course();for(let slot=0;slot<4;slot++){const pose=raceGridPose(c,slot),distance=pose.z*c.metersPerUnit;
 assert.ok(distance-c.vehicleEnvelope.lengthMeters/2>=1);assert.ok(distance+c.vehicleEnvelope.lengthMeters/2<20);}
});
test('the bundled renderer detaches race presentation and releases every owned geometry/material once',async()=>{
 const previous=globalThis.document;
 globalThis.document={createElement:()=>({getContext:()=>({stroke(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fillRect(){},fillText(){}})})};
 try {
 const c=course(),context={scene:new THREE.Scene()},view=await prepareRacePresentation(THREE,context,c,[],{signal:new AbortController().signal,current:()=>true});
 view.mount();assert.equal(view.root.parent,context.scene);const geometries=new Set(),materials=new Set(),released=new Set();
 const paint=view.root.children.find(o=>o.name==='Surveyed finish and full-chassis grid paint');
 assert.ok(paint.material.polygonOffsetFactor<=-6,'paint uses the shared bias ahead of the -2 road surface');
 assert.equal(paint.material.vertexColors,true);assert.equal(paint.material.depthWrite,false);assert.equal(paint.material.transparent,true);assert.equal(paint.geometry.attributes.markingStroke.count,paint.geometry.attributes.position.count);
 assert.equal(paint.geometry.attributes.normal.count,paint.geometry.attributes.position.count,'lit road paint needs the accepted geometry normals');
 view.root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
 for(const resource of [...geometries,...materials])resource.addEventListener('dispose',()=>{assert.ok(!released.has(resource));released.add(resource);});
 assert.ok(geometries.size>3);assert.ok(materials.size>3);view.dispose();view.dispose();
 assert.equal(view.root.parent,null);assert.equal(context.scene.children.length,0);assert.equal(released.size,geometries.size+materials.size);
 }finally{globalThis.document=previous;}
});
test('paint is one bounded vertex buffer and follows real grade/crossfall in metre coordinates',()=>{
 const c=course(),paint=buildRacePaint(c),copy=structuredClone(c);assert.ok(paint.positions.length<20000);assert.equal(paint.positions.length,paint.colors.length);assert.equal(paint.strokeCoverage.length,paint.positions.length/3*4);const legacy=buildRacePaint(c,{filtered:false}),edgePositions=[];for(let i=0;i<paint.strokeCoverage.length;i+=4)if(paint.strokeCoverage[i+3]<0)edgePositions.push(...paint.positions.slice(i/4*3,i/4*3+3));assert.deepEqual(new Float32Array(edgePositions),legacy.positions.slice(0,edgePositions.length),'accepted event edges keep their exact vertices');assert.deepEqual(paint.rectangles,legacy.rectangles);
 assert.equal(paint.rectangles.length,Math.ceil((9-.4)/.6)*2+16+c.segments.length*2);
 for(let i=0;i<paint.positions.length;i+=3){const [x,y,z]=paint.positions.slice(i,i+3);assert.ok(Number.isFinite(x+y+z));
  const lateral=x*c.metersPerUnit,expected=z*.04+lateral*.08/1.2+.018/c.metersPerUnit;
  assert.ok(Math.abs(y-expected)<.00001,JSON.stringify({x,y,z,expected}));}
 assert.deepEqual(c,copy);
 const a=raceCourseSurfacePoint(c,120,-2),b=raceCourseSurfacePoint(c,120,2);assert.ok(b.y>a.y);
 assert.ok(paint.rectangles.every(r=>r.start>=0&&r.end<=c.lengthMeters));
});
