import test from 'node:test';
import assert from 'node:assert/strict';
import {createNumericScratchPool} from '../app/js/structure-semantics/numeric-scratch.js';
import {compileTransportSurfaceModel as compile} from '../app/js/world/compiler/transport-surface-model.js';
import {compileTransportSurfaceModel as reference} from './fixtures/transport-model-before-buffer-packing.js';

test('scratch copies preserve rounding and disjoint writes; reused numeric arrays start at zero', () => {
  const pool = createNumericScratchPool({pageBytes:128,maxRetainedBytes:256});
  const values=[-0,Math.PI,Infinity,-Infinity,NaN,1e-9];
  for (let pass=0;pass<20;pass++) pool.withScratch(allocate => {
    const a=allocate(Float32Array,values), b=allocate(Float64Array,values), empty=allocate(Float32Array,4);
    assert.deepEqual(a,new Float32Array(values)); assert.deepEqual(b,new Float64Array(values));
    assert.deepEqual([...empty],[0,0,0,0]);
    a.fill(43); empty.fill(87);
    assert.deepEqual(b,new Float64Array(values));
  });
  assert.deepEqual(pool.snapshot(),{retainedBytes:128,retainedPages:1,activeScopes:0,createdBuffers:1});
});

test('nested and failed compilations cannot reuse an active page or grow the retained pool', () => {
  const pool=createNumericScratchPool({pageBytes:128,maxRetainedBytes:256});let expired;
  assert.throws(()=>pool.withScratch(outer=>{
    expired=outer;const source=outer(Float64Array,[1,2,3]);
    pool.withScratch(inner=>{
      const next=inner(Float64Array,source);assert.notEqual(source.buffer,next.buffer);next.fill(9);
      inner(Float64Array,1000);inner(Float64Array,2000);
    });
    assert.deepEqual([...source],[1,2,3]);throw Error('terrain unavailable');
  }),/terrain unavailable/);
  assert.throws(()=>expired(Float32Array,1),/scope has ended/);
  assert.equal(pool.snapshot().activeScopes,0);assert.equal(pool.snapshot().retainedBytes,256);
  for(let i=0;i<1000;i++)pool.withScratch(allocate=>assert.deepEqual([...allocate(Float64Array,4)],[0,0,0,0]));
  assert.equal(pool.snapshot().createdBuffers,4);
  assert.throws(()=>pool.withScratch(()=>Promise.resolve()),/must be synchronous/);
});

test('roads, bridges and tunnels keep exact published profiles across scratch reuse and reentrant terrain queries', () => {
  const published=[];
  for(let i=0;i<180;i++){
    const mode=['at_grade','elevated','subgrade'][i%3];
    const feature={id:`scratch-${i}`,width:5+i%7,
      pts:Array.from({length:2+i%9},(_,k)=>({x:k*12,z:Math.sin(k)*3})),
      structureSemantics:{terrainMode:mode,isTunnel:mode==='subgrade'},
      structureTransitionAnchors:[]};
    const ground=(x,z)=>12+x*.025+Math.sin(x*.035+i)*.2+z*.012;
    const expected=reference(feature,ground);let nested=false;
    const actual=compile(feature,(x,z)=>{
      if(!nested){nested=true;compile({id:'inner',pts:[{x:0,z:0},{x:20,z:0}],structureSemantics:{terrainMode:'at_grade'}},()=>37);}
      return ground(x,z);
    });
    assert.deepEqual(actual,expected);published.push({actual,copy:structuredClone(actual)});
    assert.throws(()=>compile(feature,()=>{throw Error('missing terrain');}),/missing terrain/);
  }
  for(const {actual,copy} of published)assert.deepEqual(actual,copy,'Later compilations cannot overwrite a published surface');
});
