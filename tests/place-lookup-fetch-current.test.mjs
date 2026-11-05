import test from 'node:test';import assert from 'node:assert/strict';
import {createPlaceLookupFetch} from '../app/js/places/place-lookup-fetch.js';
test('place lookup sends App Check without sign-in and cancellation covers token acquisition',async()=>{
 let headers,calls=0;const request=createPlaceLookupFetch({getToken:async()=>'test-attestation',fetchImpl:async(url,options)=>{calls++;headers=options.headers;return new Response('[]')}});await request('/api/geospatial/search');assert.equal(headers.get('X-Firebase-AppCheck'),'test-attestation');
 let resolve;const controller=new AbortController(),hung=createPlaceLookupFetch({getToken:()=>new Promise(r=>resolve=r),fetchImpl:async()=>calls++});const result=hung('/api/geospatial/search',{signal:controller.signal});controller.abort();await assert.rejects(result,{name:'AbortError'});resolve('late');await new Promise(r=>setTimeout(r,0));assert.equal(calls,1);
});


test('authenticated data transport never acquires a token for an unrelated endpoint',async()=>{
 let tokenCalls=0;const request=createPlaceLookupFetch({getToken:async()=>{tokenCalls++;return 'test';},fetchImpl:async()=>new Response('{}')});
 await assert.rejects(request('/unrelated'),TypeError);assert.equal(tokenCalls,0);
});

test('shared lookup cooldown retries are bounded, authenticated and honor Retry-After',async()=>{
 let calls=0,tokens=0;const waits=[];
 const request=createPlaceLookupFetch({getToken:async()=>{tokens++;return 'test-attestation';},waitImpl:async ms=>waits.push(ms),fetchImpl:async(url,options)=>{
  assert.equal(options.headers.get('X-Firebase-AppCheck'),'test-attestation');calls++;
  return calls<3?new Response('{}',{status:429,headers:{'Retry-After':'2'}}):new Response('[]');
 }});
 assert.equal((await request('/api/geospatial/search')).status,200);assert.equal(calls,3);assert.equal(tokens,1);assert.deepEqual(waits,[2000,2000]);
 calls=0;const busy=createPlaceLookupFetch({getToken:async()=>'',waitImpl:async()=>{},fetchImpl:async()=>{calls++;return new Response('{}',{status:429,headers:{'Retry-After':'2'}});}});
 assert.equal((await busy('/api/geospatial/search')).status,429);assert.equal(calls,3);
});
test('closing a search interrupts its cooldown before another request',async()=>{
 const controller=new AbortController();let calls=0;
 const request=createPlaceLookupFetch({getToken:async()=>'',fetchImpl:async()=>{calls++;return new Response('{}',{status:429,headers:{'Retry-After':'2'}});}});
 const pending=request('/api/geospatial/search',{signal:controller.signal});
 await new Promise(resolve=>setTimeout(resolve,5));controller.abort();
 await assert.rejects(pending,{name:'AbortError'});assert.equal(calls,1);
});
