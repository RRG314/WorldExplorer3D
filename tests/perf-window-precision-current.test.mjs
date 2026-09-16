import test from 'node:test';
import assert from 'node:assert/strict';
import {recordPerfFrame,getPerfSpikeMetrics} from '../app/js/perf.js';

test('rolling frame counters agree with retained samples through repeated wraparound',()=>{
 const frames=[];
 const samples=[16.7-1e-7,16.7+1e-7,33.3-1e-7,33.3+1e-7,49.9999999,50.0000001,99.9999999,100.0000001];
 for(let i=0;i<12000;i++){
  const dt=samples[i%samples.length]/1000;
  frames.push(dt*1000);recordPerfFrame(dt);
  if(i>1800 && i%997===0){
   const metrics=getPerfSpikeMetrics(true),window=frames.slice(-1800);
   for(const [name,threshold] of [['over16_7',16.7],['over33_3',33.3],['over50',50],['over100',100]]){
    assert.equal(metrics[name],window.filter(ms=>ms>=threshold).length,`${name} at frame ${i}`);
   }
   assert.equal(metrics.windowFrames,1800);assert.ok(metrics.maxFrameMs>=100);
  }
 }
});
