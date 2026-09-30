import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveVehicleRoadContactPose} from '../app/js/engine/vehicle-road-attitude.js';
// Exercise the actual internal pose helper without constructing asset hosts.
const source=readFileSync(new URL('../app/js/living-world/population.js',import.meta.url),'utf8');
const body=source.slice(source.indexOf('function agentPose('),source.indexOf('function selectSafeRelocationEdge('));
const pose=new Function('resolveVehicleRoadContactPose',body+';return agentPose;')(resolveVehicleRoadContactPose);

test('distance/crossing decisions retain exact X/Z without solving wheel contact',()=>{
  let wheelSamples=0;
  const surface=(_edge,x,z)=>{wheelSamples++;return .14*x-.08*z+3;};
  for(let i=0;i<180;i++){
    const edge={length:40,p1:{x:i-90,y:0,z:8},p2:{x:i-60,y:4,z:40},surfacePitch:.12};
    const graph={edges:[edge]},agent={edgeIndex:0,progress:i%45,variant:{width:1.8+(i%3),length:3.5+(i%9)}};
    if(i%4===0)agent.bridge={...edge,progress:i%45};
    if(i%7===0){agent.reactionRemaining=1;agent.reactionTarget={x:4,z:7};}
    const before=pose(agent,graph,surface);const count=wheelSamples;
    const after=pose(agent,graph);
    assert.equal(wheelSamples,count);
    assert.equal(after.x,before.x);assert.equal(after.z,before.z);
    for(const point of [{x:0,z:0},{x:40,z:45},{x:after.x+6.5,z:after.z}]){
      const distance=p=>Math.hypot(p.x-point.x,p.z-point.z);
      assert.equal(distance(after),distance(before));
      for(const radius of [7,9,170,720])assert.equal(distance(after)<radius,distance(before)<radius);
    }
  }
  assert.ok(wheelSamples>720,'Full visual poses still sample wheel support.');
});
