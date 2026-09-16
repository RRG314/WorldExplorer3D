import assert from 'node:assert/strict';
import {createRdtCaptureSelector} from '../../app/js/reality-capture/rdt-building-index.js';
import {nearestCaptureBuildingIds} from '../../app/js/reality-capture/nearby-buildings.js';
// Small sequential CPU benchmark; no browser, networking or service writes.
const cases=[];
for(const kind of ['dense','clustered','coincident']){
 const buildings=Array.from({length:23000},(_,i)=>({sourceBuildingId:'b'+(i%17000),
 centerX:kind==='coincident'?0:kind==='clustered'?i%5:(i*7919)%13001-6500,
 centerZ:kind==='coincident'?0:(i*3571)%11003-5500}));
 const selector=createRdtCaptureSelector();let start=performance.now();selector.select(buildings,{x:0,z:0},1);
 const buildAndFirstQueryMs=performance.now()-start,baseline=[],rdt=[];let result;
 for(let i=0;i<35;i++){
  const actor={x:i*23,z:-i*17};let expected;
  const runBase=()=>{const t=performance.now();expected=nearestCaptureBuildingIds(buildings,actor);baseline.push(performance.now()-t);};
  const runRdt=()=>{const t=performance.now();result=selector.select(buildings,actor,1);rdt.push(performance.now()-t);};
  if(i%2){runRdt();runBase();}else{runBase();runRdt();}
  assert.deepEqual(result.ids,expected);
 }
 const median=a=>a.slice(5).sort((a,b)=>a-b)[15];
 cases.push({kind,buildAndFirstQueryMs,baselineMedianMs:median(baseline),rdtMedianMs:median(rdt),last:result.stats});
 selector.clear();
}
console.log(JSON.stringify({scope:'synthetic CPU component benchmark, not whole-app evidence',buildings:23000,samples:30,warmups:5,includesMutationValidation:true,cases},null,2));
