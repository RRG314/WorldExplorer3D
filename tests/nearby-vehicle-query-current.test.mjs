import test from 'node:test';
import assert from 'node:assert/strict';
import {nearbyVehicleSnapshots} from '../app/js/living-world/nearby-vehicles.js';

test('nearby query preserves full snapshot values and order but samples only eligible vehicles',()=>{
 const graph={edges:Array.from({length:30},(_,i)=>({length:80,p1:{x:i*12,z:0},p2:{x:i*12,z:80}}))};
 const agents=Array.from({length:300},(_,i)=>({id:i,edgeIndex:i%30,progress:(i%10)*8,visibility:i%4===0?0:1,promoted:i%17===0,detailPromoted:i%7===0}));
 agents[3].bridge={length:20,progress:10,p1:{x:3,z:0},p2:{x:7,z:0}};
 let samples=0;
 const snapshot=agent=>{samples++;const edge=agent.bridge||graph.edges[agent.edgeIndex];if(!edge)return null;const t=Math.max(0,Math.min(1,(agent.bridge?agent.bridge.progress:agent.progress)/Math.max(.01,edge.length)));return Object.freeze({id:agent.id,x:edge.p1.x+(edge.p2.x-edge.p1.x)*t,z:edge.p1.z+(edge.p2.z-edge.p1.z)*t,y:8,pitch:.2,roll:.1,visible:agent.detailPromoted===true||agent.visibility>.08,promoted:agent.promoted===true});};
 for(const origin of [{x:0,z:0},{x:150,z:40},{x:1000,z:1000},{x:NaN,z:0}])for(const radius of [0,8,25,500]){
  const safe=Math.max(1,Math.min(220,Number(radius)||8));
  const expected=agents.map(snapshot).filter(v=>v&&!v.promoted&&v.visible&&Math.hypot(v.x-origin.x,v.z-origin.z)<=safe).sort((a,b)=>Math.hypot(a.x-origin.x,a.z-origin.z)-Math.hypot(b.x-origin.x,b.z-origin.z));
  samples=0;const actual=nearbyVehicleSnapshots(agents,graph,origin,radius,snapshot);
  assert.deepEqual(actual,expected);assert.equal(samples,expected.length);assert.ok(Object.isFrozen(actual));
 }
 samples=0;assert.deepEqual(nearbyVehicleSnapshots(agents,graph,null,8,snapshot),[]);assert.equal(samples,0);
});
