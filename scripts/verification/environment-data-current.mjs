import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc} from 'firebase/firestore';
const projectId='we3d-staging-20260712';
assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(localhost|127\.0\.0\.1):\d+$/);
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');initializeApp({projectId});const db=getFirestore();
const {createEnvironmentService}=require('./environment-data.js');
const out='output/verification/environment-data';await mkdir(out,{recursive:true});
const report={scope:'Actual Firestore transaction/cache isolation and rules, controlled upstream; actual Functions HTTP and public model data separately below. Emulator attestation exemption is not ordinary hosted evidence.',cases:[],live:[]};
const at=Date.now(),time=new Date(Math.floor(at/3600000)*3600000).toISOString();
const payload={properties:{meta:{updated_at:time},timeseries:[{time,data:{instant:{details:{air_temperature:20,wind_speed:5}},next_1_hours:{summary:{symbol_code:'clearsky_day'},details:{precipitation_amount:0}}}}]}};
let resolve,calls=0;
const options={db,now:()=>at,wait:async()=>{},fetchImpl:async()=>{calls++;return new Promise(r=>resolve=()=>r(new Response(JSON.stringify(payload))))}};
const one=createEnvironmentService(options),two=createEnvironmentService(options),q={kind:'weather',latitude:89.12,longitude:32.34};
try{
 const pending=one(q);while(!resolve)await new Promise(r=>setTimeout(r,20));await assert.rejects(two(q),e=>e.statusCode===429);resolve();const first=await pending;const cached=await two(q);assert.deepEqual(cached,first);assert.equal(calls,1);report.cases.push('separate service instances serialize same-point acquisition and share successful data');
 const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');const env=await initializeTestEnvironment({projectId:`environment-rules-${at}`,firestore:{host,port:Number(port),rules:await readFile('firestore.rules','utf8')}});
 try{for(const client of [env.authenticatedContext('model-test').firestore(),env.unauthenticatedContext().firestore()]){await assertFails(getDoc(doc(client,'environmentDataCache','private')));await assertFails(setDoc(doc(client,'environmentDataCache','private'),{payload:'forged'}));await assertFails(setDoc(doc(client,'serviceControls','environment-met-norway'),{count:0}));}}finally{await env.cleanup();}
 report.cases.push('signed-in and anonymous clients cannot read/forge cached models or change provider budgets');
 const base=`http://127.0.0.1:5001/${projectId}/us-central1/getEnvironmentalData`;
 assert.equal((await fetch(base+'?kind=weather&latitude=91&longitude=0')).status,400);
 for(const [kind,lat,lon] of [['weather',39.29,-76.61],['marine',-18.5,147.5]]){
  const response=await fetch(`${base}?kind=${kind}&latitude=${lat}&longitude=${lon}`,{signal:AbortSignal.timeout(55000)});assert.equal(response.status,200,`${kind} HTTP`);const data=await response.json();report.live.push({kind,data});await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
  if(kind==='weather'){assert.ok(Number.isFinite(data[0]?.current?.temperature_2m));assert.equal(data[0].sourceId,'met-norway');assert.equal(data[0].current.apparent_temperature,null);}
  else{assert.ok(Number.isFinite(data.current?.wave_height));assert.ok(Number.isFinite(data.current?.ocean_current_velocity));assert.ok(Number.isFinite(data.current?.sea_surface_temperature));assert.ok(['pacioos-ww3','noaa-ww3'].includes(data.sources[0].sourceId));assert.equal(data.sources[1].sourceId,'hycom-espc');}
 }
 report.passed=true;await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,cases:report.cases,live:report.live.map(v=>v.kind)}));
}finally{await db.terminate();}
