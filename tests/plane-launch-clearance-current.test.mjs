import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
import {safePlaneLaunchAboveUrbanGeometry} from '../app/js/plane-mode.js';
const box=(x,z,height,extra={})=>({minX:x-1,maxX:x+1,minZ:z-1,maxZ:z+1,minY:0,maxY:height,...extra});
function launch(buildings,yaw=0){ctx.buildings=buildings;ctx.getNearbyBuildings=undefined;return safePlaneLaunchAboveUrbanGeometry(0,0,0,.72,yaw);}
test('urban launch clears the taller obstacle ahead, including thin walls between samples',()=>{
 assert.equal(launch([box(0,0,30),box(0,186,143)]).y,155.72);
 assert.equal(launch([box(186,0,143)],Math.PI/2).y,155.72);
 assert.equal(launch([box(0,0,30),box(0,-100,300),box(100,100,400)]).y,42.72);
});
test('open ground and non-solid structures do not force an airborne launch',()=>{
 for(const extra of [{collisionDisabled:true},{allowsPassageBelow:true},{collisionKind:'barrier'}])assert.equal(launch([box(0,50,150,extra)]).required,false);
 assert.equal(launch([]).y,.72);
 assert.equal(launch([box(0,300,150)]).required,false);
});
test('spatial query covers the full forward corridor without querying the whole region',()=>{
 let query;
 ctx.getNearbyBuildings=(...args)=>(query=args,[box(180,0,80)]);
 try {assert.equal(safePlaneLaunchAboveUrbanGeometry(0,0,0,.72,Math.PI/2).y,92.72);assert.ok(Math.abs(query[0]-120)<1e-8);assert.equal(query[2],156);}
 finally {ctx.getNearbyBuildings=undefined;ctx.buildings=[];}
});
