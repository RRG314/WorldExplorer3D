import test from 'node:test';
import assert from 'node:assert/strict';
import { convertTilesToElements } from '../app/js/world/overture-building-source.js';
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
