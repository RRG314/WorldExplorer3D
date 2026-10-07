import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nearbyPedestrianSnapshots} from '../app/js/living-world/nearby-pedestrians.js';
import {resolveVehicleRoadContactPose} from '../app/js/engine/vehicle-road-attitude.js';
const source=readFileSync(new URL('../app/js/living-world/population.js',import.meta.url),'utf8');
const body=source.slice(source.indexOf('function agentPose('),source.indexOf('function selectSafeRelocationEdge('));
const pose=new Function('resolveVehicleRoadContactPose',body+';return agentPose;')(resolveVehicleRoadContactPose);

test('nearby pedestrian filtering matches actual path poses, offsets, bridge motion, visibility and stable order',()=>{
 const graph={edges:Array.from({length:30},(_,i)=>({length:80,p1:{x:i*12,y:4,z:0},p2:{x:i*12+40,y:5,z:60}}))};
 const agents=Array.from({length:300},(_,i)=>({id:i,edgeIndex:i%30,progress:(i%12)*8,pathOffset:(i%5)-2,visibility:i%4===0?0:1,promoted:i%17===0,detailPromoted:i%7===0}));
 agents[3].bridge={length:20,progress:10,p1:{x:3,y:2,z:0},p2:{x:7,y:3,z:0}};
 agents.push({id:'missing',edgeIndex:90,visibility:1},{...agents[3],id:'stable-tie'});
 let samples=0;
 const snapshot=agent=>{samples++;const p=pose(agent,graph);return p?Object.freeze({id:agent.id,...p,visible:agent.visibility>.08,promoted:agent.promoted===true,reaction:'running',heightScale:1.2}):null};
 for(const origin of [{x:0,z:0},{x:150,z:40},{x:1000,z:1000},{x:NaN,z:0}])for(const radius of [0,8,25,500]){
  const safe=Math.max(1,Math.min(180,Number(radius)||8));
  const expected=agents.map(snapshot).filter(p=>p&&!p.promoted&&p.visible&&Math.hypot(p.x-origin.x,p.z-origin.z)<=safe).sort((a,b)=>Math.hypot(a.x-origin.x,a.z-origin.z)-Math.hypot(b.x-origin.x,b.z-origin.z));
  samples=0;const actual=nearbyPedestrianSnapshots(agents,graph,origin,radius,snapshot);
  assert.deepEqual(actual,expected);assert.equal(samples,expected.length);assert.ok(Object.isFrozen(actual));
 }
 samples=0;assert.deepEqual(nearbyPedestrianSnapshots(agents,graph,null,8,snapshot),[]);assert.equal(samples,0);
});

test('an actor just inside the query by sidewalk offset is retained, while the opposite side is excluded',()=>{
 const graph={edges:[{length:10,p1:{x:0,y:0,z:0},p2:{x:0,y:0,z:10}}]};
 const agents=[-1,1].map(pathOffset=>({id:pathOffset,pathOffset,visibility:1,edgeIndex:0,progress:5}));
 const result=nearbyPedestrianSnapshots(agents,graph,{x:8,z:5},7.1,a=>({...pose(a,graph),id:a.id}));
 assert.deepEqual(result.map(a=>a.id),[-1]);
});
