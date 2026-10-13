import test from 'node:test';
import assert from 'node:assert/strict';
import { convertTilesToElements } from '../app/js/world/overture-building-source.js';
import { buildingPartsCoverFootprint } from '../app/js/world/building-part-coverage.js';
import { readFile } from 'node:fs/promises';
const ring = (x=0) => [[x,0],[x+1,0],[x+1,1],[x,1],[x,0]];
const feature = (properties, coords) => ({toGeoJSON:()=>({properties,geometry:{type:'Polygon',coordinates:[coords]}})});
const run = (partRing, complete=true) => convertTilesToElements([{z:14,x:0,y:0,tile:{layers:{
  building:{length:1,feature:()=>feature({id:'parent',has_parts:true,height:100},ring())},
  building_part:{length:1,feature:()=>feature({id:'part',building_id:'parent',height:100},partRing)}
}}}],{minLon:0,maxLon:2,minLat:0,maxLat:2},{coverageComplete:complete});
test('rejected and out-of-window parts cannot remove the mapped parent',()=>{
  for (const part of [[], ring(10), [[0,0],[1,0],[NaN,1],[0,0]]]) {
    const result=run(part);
    assert.equal(result.suppressedParents,0);
    assert.equal(result.elements.filter(e=>e.type==='way' && e.tags.building).length,1);
  }
});
test('valid accepted parts replace a parent only with complete coverage',()=>{
  assert.equal(run(ring()).suppressedParents,1);
  assert.equal(run(ring(),false).suppressedParents,0);
});
test('a roof fragment, overlapping parts or a gap cannot erase the uncovered mapped building',()=>{
  const small=[[0,0],[.25,0],[.25,.25],[0,.25],[0,0]];
  assert.equal(run(small).suppressedParents,0);
  assert.equal(buildingPartsCoverFootprint(ring(),Array(20).fill(small)),false,'Overlapping area must not count repeatedly');
  const left=[[0,0],[.49,0],[.49,1],[0,1],[0,0]],right=[[.51,0],[1,0],[1,1],[.51,1],[.51,0]];
  assert.equal(buildingPartsCoverFootprint(ring(),[left,right]),false);
  left[1][0]=left[2][0]=.51;
  assert.equal(buildingPartsCoverFootprint(ring(),[left,right]),true,'Several parts can jointly cover an outline');
});
test('the pinned Baltimore aquarium keeps every uncovered parent component with its actual source identity',async()=>{
  const source=JSON.parse(await readFile(new URL('./fixtures/baltimore-aquarium-building-parts.json',import.meta.url),'utf8'));
  const layers=Object.fromEntries(['building','building_part'].map(name=>{const rows=source.features.filter(f=>f.layer===name);return[name,{length:rows.length,feature:i=>({toGeoJSON:()=>rows[i]})}];}));
  const result=convertTilesToElements([{z:14,x:0,y:0,tile:{layers}}],undefined,{coverageComplete:true});
  const ways=result.elements.filter(e=>e.type==='way');
  assert.equal(result.suppressedParents,0);
  assert.equal(ways.filter(w=>w.tags._sourceFeatureId==='overture:7bacec0b-326a-401f-ad9f-f3ebed72c8cf').length,3);
  assert.equal(ways.filter(w=>w.tags['building:part']).length,1,'Preserve the mapped roof part; do not invent replacements');
});
