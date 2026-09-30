import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateNearestRoadCandidate as reference} from './fixtures/nearest-road-before-pruning.js';
const source=readFileSync(new URL('../app/js/world/navigation.js',import.meta.url),'utf8');
const start=source.indexOf('function evaluateNearestRoadCandidate('),end=source.indexOf('\n// Camera probes',start);
const typed=a=>a instanceof Float32Array||a instanceof Float64Array;
test('road pruning preserves winners, heights and transition locks across curved stacked roads',()=>{
 let samples=0,connections=0;
 const runtime={sampleFeatureSurfaceY:(r,x,z,p)=>{samples++;return r.height+p.t*.6;},areRoadsConnected:(a,b)=>{connections++;return a.connectedFeatures.start.some(e=>e.feature===b);}};
 const select=Function('runtime','isNumericProfileArray',source.slice(start,end)+';return evaluateNearestRoadCandidate;')(runtime,typed);
 const roads=Array.from({length:12},(_,r)=>({height:r%3*7,pts:Array.from({length:32},(_,i)=>({x:i*6,z:r*7+Math.sin(i*.2)*12})),structureSemantics:{terrainMode:['elevated','subgrade','surface'][r%3],gradeSeparated:r%3!==2},structureTransitionAnchors:[{distance:12,span:5}],connectedFeatures:{start:[],end:[]}}));
 roads[0].connectedFeatures.start.push({feature:roads[1]});
 let oldSamples=0,newSamples=0;
 for(let x=-10;x<220;x+=9)for(let z=-10;z<100;z+=11)for(const preferred of [null,roads[0]])for(const targetY of [NaN,8,32]){
  let expected=null,actual=null;
  for(const r of roads){
   samples=0;const a=reference(r,x,z,targetY,20,preferred,runtime,typed);oldSamples+=samples;
   samples=0;const b=select(r,x,z,targetY,20,preferred,actual?.weightedDist??Infinity);newSamples+=samples;
   if(a&&(!expected||a.weightedDist<expected.weightedDist))expected=a;
   if(b&&(!actual||b.weightedDist<actual.weightedDist))actual=b;
  }
  assert.deepEqual(actual,expected);
 }
 assert.ok(newSamples<oldSamples*.25,`${newSamples}/${oldSamples} expensive height samples`);
});
