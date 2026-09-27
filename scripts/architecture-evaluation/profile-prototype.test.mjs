import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleProfileAtDistance } from '../../app/js/structure-semantics/geometry.js';
import { sampleSortedProfile, validateSortedProfile } from './transport-profile-prototype.js';

test('sorted profile prototype preserves endpoints, ties, degenerate spans and nonfinite height fallbacks', () => {
  for (const ds of [[0], [0, 0], [0, 2, 2, 4], [0, 1e-8, 2], [2, 4, 6]]) {
    for (const vs of [ds.map((_,i)=>i*3), ds.map(()=>NaN), ds.map((_,i)=>i%2?Infinity:5)]) {
      const d = Float64Array.from(ds), v = Float64Array.from(vs);
      validateSortedProfile(d, v);
      for (const q of [-Infinity, -1, 0, 1e-9, 1, 2, 3, 4, 6, 8, Infinity, NaN]) {
        assert.ok(Object.is(sampleSortedProfile(d,v,q), sampleProfileAtDistance(d,v,q)), `${ds}; ${vs}; query ${q}`);
      }
    }
  }
});

test('deterministic generated profiles preserve original output across varied lengths', () => {
  let state = 76231;
  const next = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2**32);
  for (const count of [2,3,14,92,128,1024,3024]) {
    const d = new Float64Array(count), v = new Float64Array(count);
    for (let i=0;i<count;i++) { d[i] = i ? d[i-1]+(next()>.1?next()*10:0) : 0;v[i]=next()*200-100; }
    validateSortedProfile(d,v);
    for(let i=0;i<2000;i++) {
      const q = i < count ? d[i] : next()*d.at(-1);
      assert.equal(sampleSortedProfile(d,v,q), sampleProfileAtDistance(d,v,q));
    }
  }
});

test('prototype rejects profiles that do not meet its stronger sorted-data contract', () => {
  for (const d of [[0,NaN],[2,1],[]]) assert.throws(()=>validateSortedProfile(Float64Array.from(d),Float64Array.from(d)));
});
