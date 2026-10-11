const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeLookup,lookupUrl,cleanResult,buildPlaceLookupExport,createPlaceLookupService}=require('../functions/place-lookup.js');
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

function memoryDb(){
 const rows=new Map();const snapshot=ref=>({exists:rows.has(ref.path),data:()=>rows.get(ref.path)});
 const db={doc:path=>({path,set:async value=>rows.set(path,value)}),runTransaction:async fn=>fn({get:async ref=>snapshot(ref),set:(ref,value)=>rows.set(ref.path,value),update:(ref,value)=>rows.set(ref.path,{...rows.get(ref.path),...value})})};
 return {db,rows};
}
for(const status of [200,404])test(`unnamed ocean reverse lookup is cached without invented location (HTTP ${status})`,async()=>{
 const {db,rows}=memoryDb();let calls=0,at=100000;
 const query=createPlaceLookupService({db,now:()=>at,fetchImpl:async()=>{calls++;return new Response(JSON.stringify({error:'Unable to geocode'}),{status});}});
 const input={kind:'reverse',lat:-18.2861,lon:147.7};
 assert.deepEqual((await query(input)).payload,{});assert.equal((await query(input)).cache,'shared');assert.equal(calls,1);
 const cache=[...rows.entries()].find(([key])=>key.startsWith('placeLookupCache/'))[1];assert.equal(cache.expiresAtMs,at+86400000);
 at+=86400001;await query(input);assert.equal(calls,2,'negative cache expires instead of permanently hiding a future place');
});
test('geocoder outages, rate limits and malformed payloads never become cached ocean coverage',async()=>{
 for(const [status,payload] of [[429,{error:'Unable to geocode'}],[503,{error:'Unable to geocode'}],[404,{error:'Unknown endpoint'}],[200,{error:'Provider unavailable'}],[200,{}],[200,{lat:999,lon:0}]]){
  const {db,rows}=memoryDb();const query=createPlaceLookupService({db,now:()=>100000,fetchImpl:async()=>new Response(JSON.stringify(payload),{status})});
  await assert.rejects(query({kind:'reverse',lat:-18.2861,lon:147.7}),{statusCode:502});assert.equal([...rows.keys()].some(key=>key.startsWith('placeLookupCache/')),false);
 }
});
test('negative reverse handling does not change valid land addresses or failed searches',async()=>{
 const {db}=memoryDb();let calls=0;const query=createPlaceLookupService({db,now:()=>100000,fetchImpl:async()=>{calls++;return new Response(JSON.stringify({lat:39.29,lon:-76.61,display_name:'Baltimore'}));}});
 const request={kind:'reverse',lat:39.29,lon:-76.61};assert.equal((await query(request)).payload.display_name,'Baltimore');assert.equal((await query(request)).cache,'shared');assert.equal(calls,1);
 const other=memoryDb();const search=createPlaceLookupService({db:other.db,now:()=>100000,fetchImpl:async()=>new Response(JSON.stringify({error:'Unable to geocode'}))});await assert.rejects(search({q:'Baltimore'}),{statusCode:502});
});
