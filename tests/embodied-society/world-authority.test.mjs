import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldAuthority} from '../../app/js/experiments/embodied-society/world-authority.mjs';
import {createResidentMotor} from '../../app/js/experiments/embodied-society/resident-body.mjs';
import {createWorkshopState,createWorkshopService} from '../../app/js/experiments/embodied-society/workshop.mjs';

function fixture() {
 const body=createResidentMotor({actorId:'a',spawn:{x:0,y:1.7,z:0,yaw:0},world:{walkSurfaceAt:()=>({position:{y:0}}),checkBuildingCollision:()=>false}});
 let permitted=true,visible=true,placementAllowed=true;
 const world={permits:()=>permitted,lineOfSight:()=>visible,placementAllowed:()=>placementAllowed,shelterAt:()=>null,transferConsented:()=>false};
 const initialState=createWorkshopState({runId:'physical',actorIds:['a'],nodes:[{id:'fiber',materialId:'research:fiber',remaining:2,position:{x:0,y:0,z:5}}]});
 let service;
 const authority=createWorldAuthority({runId:'physical',snapshot:()=>service.snapshot(),bodies:new Map([['a',body]]),world});
 service=createWorkshopService({initialState,authorize:authority.authorize,persist:async()=>{}});
 return {body,service,authority,setPermitted:v=>permitted=v,setVisible:v=>visible=v,setPlacementAllowed:v=>placementAllowed=v};
}
test('real walking integrator must bring the resident near a resource; claimed reach is ignored',async()=>{
 const f=fixture(),cmd={kind:'gather',targetId:'fiber',quantity:1,operationId:'gather',expectedRevision:0,inReach:true,position:{x:0,y:0,z:5}};
 await assert.rejects(f.service.execute('a',cmd,0),e=>e.code==='world-permission-denied');
 f.body.command({move:1,frames:60});for(let n=0;n<60;n++)f.body.step();
 await f.service.execute('a',cmd,1);assert.equal(f.service.inspectInventory('a').items[0].quantity,1);
 f.setVisible(false);await assert.rejects(f.service.execute('a',{...cmd,operationId:'wall',expectedRevision:1},2),e=>e.code==='world-permission-denied');
 f.setVisible(true);f.setPermitted(false);await assert.rejects(f.service.execute('a',{...cmd,operationId:'private',expectedRevision:1},2),e=>e.code==='world-permission-denied');
});
test('wrong world, paused body, invented station and shelter claims cannot authorize work',()=>{
 const f=fixture();const request={runId:'physical',actorId:'a',tick:0};
 for(const command of [{kind:'craft',recipeId:'assemble-storage',stationCapabilities:['woodworking']},{kind:'rest',sheltered:true}])assert.equal(f.authority.authorize({...request,command}).allowed,false);
 assert.equal(f.authority.authorize({...request,runId:'other',command:{kind:'consume'}}).allowed,false);
 f.body.pause();assert.equal(f.authority.authorize({...request,command:{kind:'consume'}}).allowed,false);
});
test('placement authorization derives range and permission from host world, not command flags',()=>{
 const f=fixture(),request={runId:'physical',actorId:'a',tick:0,command:{kind:'build',materialId:'research:wall-kit',placementAllowed:true,placement:{gx:0,gy:0,gz:1}}};
 assert.equal(f.authority.authorize(request).placementAllowed,true);
 f.setPlacementAllowed(false);assert.equal(f.authority.authorize(request).allowed,false);
 f.setPlacementAllowed(true);request.command.placement.gx=20;assert.equal(f.authority.authorize(request).allowed,false);
 request.command.placement.gx=0;request.command.placement.gy=.25;assert.equal(f.authority.authorize(request).allowed,false);
});
