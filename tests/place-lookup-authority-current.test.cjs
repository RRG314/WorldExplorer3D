const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeLookup,lookupUrl,cleanResult,buildPlaceLookupExport}=require('../functions/place-lookup.js');
test('place proxy validates bounded input and cannot be redirected by a client URL',()=>{
 assert.throws(()=>normalizeLookup({q:'x'}));assert.throws(()=>normalizeLookup({kind:'reverse',lat:91,lon:0}));assert.equal(normalizeLookup({q:'x'.repeat(200)}).q.length,120);
 const url=new URL(lookupUrl(normalizeLookup({q:'https://private.invalid',url:'https://private.invalid'})));assert.equal(url.hostname,'nominatim.openstreetmap.org');assert.equal(url.searchParams.get('limit'),'8');assert.throws(()=>lookupUrl({kind:'search'},'http://127.0.0.1/'));
 assert.equal(cleanResult({lat:999,lon:0}),null);assert.deepEqual(cleanResult({lat:1,lon:2,secret:'no'}),{lat:'1',lon:'2',address:{},namedetails:{},extratags:{}});
});
test('production HTTP handler requires App Check before allocating any provider budget',async()=>{
 let reads=0;const response={status(code){this.code=code;return this},json(body){this.body=body;return this}};
 const functions={region:()=>({runWith:()=>({https:{onRequest:fn=>fn}})})};
 const handler=buildPlaceLookupExport({functions,db:{doc:()=>({}),runTransaction:()=>{reads++;}},setCors:()=>false,verifyAppCheck:async(req,res)=>{res.status(401).json({error:'Missing App Check token.'});return null;}});
 await handler({method:'GET',query:{q:'Baltimore'}},response);assert.equal(response.code,401);assert.equal(reads,0);
});
