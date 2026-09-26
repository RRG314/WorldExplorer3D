import test from 'node:test';
import assert from 'node:assert/strict';
import { compileEnvironmentContext } from '../app/js/discovery/environment-context.js';

test('environment loading visits polygon coordinates once per compile, not once per cell',()=>{
  let reads=0,coordinate=0;
  const buildings=Array.from({length:12},()=>({pts:Array.from({length:4},()=>({get x(){reads++;return coordinate;},z:0}))}));
  const options={snapshot:Object.freeze({type:'WorldSnapshot',requestId:'test',sequence:1}),
    worldIdentity:{type:'WorldIdentity',location:{lat:39}},buildings,gridRadius:4,sampleSurfaceY:()=>10};
  const first=compileEnvironmentContext(options);
  assert.equal(reads,48);
  assert.ok(first.cells.find(c=>c.cellId==='cell:0:0').contexts.includes('urban-core'));
  coordinate=10000;
  const next=compileEnvironmentContext(options);
  assert.equal(reads,96,'no cache survives into a later source publication');
  assert.ok(!next.cells.find(c=>c.cellId==='cell:0:0').contexts.includes('urban-core'));
});
