import test from 'node:test';
import assert from 'node:assert/strict';
import {sustainedTraversalObserved,streetDetailTurnovers} from '../scripts/verification/sustained-traversal-contract.mjs';

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

test('extended ground windows require their complete duration and active movement',()=>{
  const sample={distanceTraveled:600,movingMs:160000,elapsedMs:240000};
  assert.equal(sustainedTraversalObserved('walk',sample,false,240000),true);
  assert.equal(sustainedTraversalObserved('walk',{...sample,elapsedMs:239999},false,240000),false);
  assert.equal(sustainedTraversalObserved('drive',{...sample,movingMs:159999},false,240000),false);
  for(const invalid of [0,89999,NaN,Infinity])assert.equal(sustainedTraversalObserved('walk',sample,false,invalid),false);
});

test('only completed accepted street changes establish streaming coverage',()=>{
  const entry=(x,active)=>({pavement:{focus:{x,z:0},active}});
  assert.equal(streetDetailTurnovers([]),0);
  assert.equal(streetDetailTurnovers([{pavement:null},entry(0,false),entry(0,true),entry(0,false)]),0);
  assert.equal(streetDetailTurnovers([entry(0,false),entry(256,true)]),0);
  assert.equal(streetDetailTurnovers([entry(0,true),entry(256,false)]),1);
  assert.equal(streetDetailTurnovers([entry(0,false),entry(256,true),entry(256,false),entry(256,false),entry(0,false)]),2);
});
