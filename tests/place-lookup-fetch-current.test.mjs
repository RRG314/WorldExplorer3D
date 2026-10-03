import test from 'node:test';import assert from 'node:assert/strict';
import {createPlaceLookupFetch} from '../app/js/places/place-lookup-fetch.js';
test('place lookup sends App Check without sign-in and cancellation covers token acquisition',async()=>{
 let headers,calls=0;const request=createPlaceLookupFetch({getToken:async()=>'test-attestation',fetchImpl:async(url,options)=>{calls++;headers=options.headers;return new Response('[]')}});await request('/api/geospatial/search');assert.equal(headers.get('X-Firebase-AppCheck'),'test-attestation');
 let resolve;const controller=new AbortController(),hung=createPlaceLookupFetch({getToken:()=>new Promise(r=>resolve=r),fetchImpl:async()=>calls++});const result=hung('/api/geospatial/search',{signal:controller.signal});controller.abort();await assert.rejects(result,{name:'AbortError'});resolve('late');await new Promise(r=>setTimeout(r,0));assert.equal(calls,1);
});
