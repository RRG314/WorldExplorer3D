import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createStreetFrontagePolicy } from '../../app/js/world/compiler/street-frontage-policy.js';
const source = execFileSync('git', ['show', 'ee1bca65:app/js/world/compiler/street-frontage-policy.js'], {encoding:'utf8'})
  .replace("'../road-units.js'", JSON.stringify(new URL('../../app/js/world/road-units.js',import.meta.url).href))
  .replace("'./street-section.js'", JSON.stringify(new URL('../../app/js/world/compiler/street-section.js',import.meta.url).href));
const baseline = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
function compare(buildings, queries) {
  const old=baseline.createStreetFrontagePolicy(buildings),next=createStreetFrontagePolicy(buildings);
  const indices=p=>new Map(p.edges.map((edge,i)=>[edge,i]));
  const oi=indices(old),ni=indices(next);
  for(const [a,b,pad] of queries) assert.deepEqual(next.query(a,b,pad).map(e=>ni.get(e)),old.query(a,b,pad).map(e=>oi.get(e)),JSON.stringify({a,b,pad}));
  old.dispose();next.dispose();
}
test('frontage exact ordered hits remain unchanged at contact, epsilon and bucket boundaries',()=>{
  for(const shift of [0,-128,1e6,-1e9]){
    const p=(x,z)=>({x:x+shift,z:z+shift});
    const buildings=[{pts:[p(0,0),p(32,0),p(32,32),p(0,32)]},{pts:[p(32,0),p(64,32),p(32,32)]}];
    const queries=[];
    for(const pad of [0,1e-9,3,20])for(const epsilon of [-2e-8,-1e-8,0,1e-8,2e-8]){
      queries.push([p(-pad-epsilon,16),p(-pad-epsilon,16),pad]);
      queries.push([p(-pad-epsilon,-10),p(-pad-epsilon,40),pad]);
      queries.push([p(-10,-10),p(70,70),pad]);
      queries.push([p(64/1.11,0),p(64/1.11,32),pad]);
    }
    compare(buildings,queries);
  }
});
test('frontage preserves randomized segment and point results under translation',()=>{
  let seed=32874;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
  for(const shift of [0,-10000,1e8]){
    const p=()=>({x:shift+(random()-.5)*500,z:shift+(random()-.5)*500});
    const buildings=Array.from({length:80},()=>({pts:[p(),p(),p()]}));
    const queries=Array.from({length:3000},(_,i)=>{const a=p();return[a,i%2?a:p(),random()*25];});
    compare(buildings,queries);
  }
});
test('street-section decisions and disposal stay equivalent',()=>{
  const buildings=[{pts:[{x:0,z:0},{x:10,z:0},{x:10,z:10},{x:0,z:10}]}];
  const old=baseline.createStreetFrontagePolicy(buildings),next=createStreetFrontagePolicy(buildings);
  for(const z of [-100,-20,0,20,100])for(const gradeSeparated of [false,true]){
    const road={pts:[{x:-5,z},{x:20,z}],type:'residential',structureSemantics:{gradeSeparated}};
    assert.deepEqual(next.section(road),old.section(road));
    assert.equal(next.section(road),next.section(road));
  }
  next.dispose();assert.deepEqual(next.query({x:0,z:0}),[]);
});
