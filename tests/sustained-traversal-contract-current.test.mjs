import test from 'node:test';
import assert from 'node:assert/strict';
import {sustainedTraversalObserved} from '../scripts/verification/sustained-traversal-contract.mjs';

test('only complete active routes satisfy sustained travel, even when recovery lets the remaining audit finish',()=>{
  for(const [mode,distanceTraveled] of Object.entries({walk:100,drive:300,plane:1000})) {
    const complete={distanceTraveled,movingMs:60000,elapsedMs:90000};
    assert.equal(sustainedTraversalObserved(mode,complete),true);
    assert.equal(sustainedTraversalObserved(mode,complete,true),false);
    for(const [key,value] of Object.entries(complete)) {
      for(const invalid of [value-.01,NaN,Infinity,undefined])
        assert.equal(sustainedTraversalObserved(mode,{...complete,[key]:invalid}),false,`${mode} ${key} ${invalid}`);
    }
    assert.equal(sustainedTraversalObserved(mode,{...complete,movingMs:1000,elapsedMs:900000}),false);
  }
  assert.equal(sustainedTraversalObserved('unknown',{distanceTraveled:2000,movingMs:90000,elapsedMs:90000}),false);
});
