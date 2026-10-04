import test from 'node:test';
import assert from 'node:assert/strict';
import {createSupportRecorder} from '../app/js/runtime/support-receipt.js';

test('support reports retain useful build/session categories while excluding hostile personal and capture fields',()=>{
 let now=20;const recorder=createSupportRecorder({now:()=>now});
 const buildId='5.4.0+1532bdfbb5c1.319d215f60318297.production';
 const privateValue='PRIVATE_COORDINATE_UID_TOKEN_CAPTURE';
 recorder.bindContext(()=>({buildId,sessionGeneration:4,worldGeneration:7,environment:'OCEAN',mode:'diver',transition:{generation:4,from:'EARTH',to:'OCEAN',phase:'completed',metadata:privateValue},uid:privateValue,location:privateValue,media:privateValue}));
 const error=Object.assign(new Error(privateValue),{status:429,url:privateValue,token:privateValue});
 recorder.record({operation:'provider-query',provider:'open-meteo-marine',error});
 now=35;recorder.record({operation:privateValue,provider:privateValue,category:privateValue,error:new DOMException(privateValue,'QuotaExceededError')});
 const report=recorder.snapshot();assert.equal(report.buildId,buildId);assert.equal(report.events[0].provider,'marine-model');assert.equal(report.events[0].category,'rate-limited');assert.equal(report.events[1].category,'storage-full');assert.equal(report.events[1].elapsedMs,15);
 assert.doesNotMatch(JSON.stringify(report),new RegExp(privateValue));assert.equal(report.events[1].provider,null);
 report.events[0].transition.phase='corrupted';assert.equal(recorder.snapshot().events[0].transition.phase,'completed');
});
test('bounded support history cannot accept user-shaped build/mode/environment identifiers',()=>{
 const recorder=createSupportRecorder({now:()=>1});recorder.bindContext(()=>({buildId:'user@example.invalid',mode:'user-id',environment:'coordinates',sessionGeneration:Infinity,worldGeneration:-1}));
 for(let n=0;n<100;n++)recorder.record({operation:'journal-save',error:new Error('private')});
 const report=recorder.snapshot();assert.equal(report.events.length,32);assert.equal(report.eventCount,100);assert.equal(report.events[0].sequence,69);assert.equal(report.worldGeneration,0);assert.equal(report.sessionGeneration,0);assert.doesNotMatch(JSON.stringify(report),/example\.invalid|user-id|coordinates|private/);
});
