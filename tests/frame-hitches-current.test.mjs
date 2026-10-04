import test from 'node:test';
import assert from 'node:assert/strict';
import {frameHitches} from '../scripts/verification/frame-hitches.mjs';
test('rare severe frames fail even when percentiles and average can look healthy',()=>{
 const frames=Array(5399).fill(1000/60);frames.splice(2700,0,650);
 const result=frameHitches(frames);assert.equal(result.passed,false);assert.equal(result.over250,1);assert.equal(result.worstFrameMs,650);
 assert.equal(result.outliers.length,1);assert.equal(result.longFrameMs,650);
});
test('hitch rate, clustering, raw intervals and RAF threshold precision are explicit',()=>{
 assert.equal(frameHitches(Array(3600).fill(1000/60)).passed,true);
 assert.equal(frameHitches([...Array(3600).fill(1000/60),150]).passed,true);
 const clustered=frameHitches([...Array(12000).fill(1000/60),150,16.7,150]);
 assert.ok(clustered.over100PerMinute<1);assert.equal(clustered.passed,false);assert.ok(clustered.minimumGapMs<10000);
 assert.equal(frameHitches([...Array(3600).fill(1000/60),100.000001]).over100,0);
 assert.equal(frameHitches([...Array(100).fill(16.7),150]).passed,false);
 for(const input of [[],[0],[NaN],[-1]])assert.throws(()=>frameHitches(input),TypeError);
});
