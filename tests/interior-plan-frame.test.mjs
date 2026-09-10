import test from 'node:test';
import assert from 'node:assert/strict';
import {planFrame,addPlanRoom,drawAlignedRoom} from '../app/js/reality-capture/plan-frame.js';
import {joinPlanWalls} from '../app/js/reality-capture/layout-drawing.js';
import {makeEmptyLayout,normalizeLayout,floorWalls} from '../functions/interior-layout.mjs';
const angle=.61,c=Math.cos(angle),s=Math.sin(angle),rotate=([x,z])=>({x:c*x-s*z,z:s*x+c*z});
const envelope={footprint:[[0,0],[12,0],[12,8],[9,8],[9,12],[0,12]].map(rotate),holes:[],heightMeters:3};
test('aligned view round trips coordinates and auto places editable rooms in rotated concave boundary',()=>{
 const frame=planFrame(envelope.footprint);for(const p of envelope.footprint){const q=frame.from(frame.to(p));assert.ok(Math.hypot(q.x-p.x,q.z-p.z)<1e-10);}
 let layout=makeEmptyLayout(envelope);for(const shape of ['rectangle','L','rectangle'])layout=addPlanRoom(layout,0,envelope,frame,shape).layout;
 assert.equal(layout.floors[0].rooms.length,3);assert.equal(layout.floors[0].rooms[1].vertices.length,6);normalizeLayout(layout,envelope);
});
test('automatic placement respects courtyard and full floor reports actionable failure',()=>{
 const env={footprint:[{x:0,z:0},{x:8,z:0},{x:8,z:8},{x:0,z:8}],holes:[[{x:3,z:3},{x:5,z:3},{x:5,z:5},{x:3,z:5}]],heightMeters:3};
 const frame=planFrame(env.footprint),result=addPlanRoom(makeEmptyLayout(env),0,env,frame);normalizeLayout(result.layout,env);
 const small={footprint:[{x:0,z:0},{x:1,z:0},{x:1,z:1},{x:0,z:1}],heightMeters:3};assert.throws(()=>addPlanRoom(makeEmptyLayout(small),0,small,planFrame(small.footprint)),/No clear space/);
});
test('moving an independent room flush to its neighbor joins shared walls',()=>{
 const frame=planFrame(envelope.footprint),layout=makeEmptyLayout(envelope),floor=layout.floors[0];
 drawAlignedRoom(floor,{x:1,z:1},{x:4,z:4},frame);drawAlignedRoom(floor,{x:5,z:1},{x:8,z:4},frame);
 for(const id of floor.rooms[1].vertices){const p=frame.to(floor.vertices[id]);floor.vertices[id]=frame.from({x:p.x-1,z:p.z});}
 joinPlanWalls(floor);normalizeLayout(layout,envelope);assert.equal(floorWalls(floor).filter(w=>w.rooms.length===2).length,1);
});
test('reported diagonal building aligns to the grid without altering its saved envelope',()=>{
 const footprint=[{x:16.519762236383606,z:1.8584620704586996},{x:10.737845453649346,z:12.596286578059335},{x:-16.519762236383606,z:-1.8584732970339246},{x:-10.737845453649344,z:-12.59627535148411}],before=structuredClone(footprint),env={footprint,heightMeters:3},frame=planFrame(footprint),view=footprint.map(frame.to);
 assert.ok(Math.abs(view[1].z-view[2].z)<1e-6);const result=addPlanRoom(makeEmptyLayout(env),0,env,frame);normalizeLayout(result.layout,env);assert.deepEqual(footprint,before);
});
