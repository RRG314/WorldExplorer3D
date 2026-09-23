import test from 'node:test';import assert from 'node:assert/strict';
import {publicProviderFixtureRequest as key} from '../scripts/verification/provider-fixture-key.mjs';
test('equivalent Overpass mirror requests share data despite execution-time budgets',()=>{
 const query='[out:json][timeout:20];way["bridge"](39,-77,40,-76);out body;';
 const a=key({method:'POST',url:'https://lz4.overpass-api.de/api/interpreter',body:new URLSearchParams({data:query}).toString()});
 const b=key({method:'POST',url:'https://overpass.private.coffee/api/interpreter',body:query.replace('timeout:20','timeout:8')});
 assert.deepEqual(a,b);assert.equal(a.semanticOverpass,true);
 const c=key({method:'POST',url:'https://overpass-api.de/api/interpreter',body:query.replace('39,-77','38,-77')});assert.notDeepEqual(a,c);
});
test('non-Overpass bodies, hosts and byte ranges remain distinct',()=>{
 const base={method:'GET',url:'https://s3.amazonaws.com/public/map',range:'bytes=0-99',body:''};
 assert.notDeepEqual(key(base),key({...base,range:'bytes=100-199'}));
 assert.notDeepEqual(key(base),key({...base,url:'https://s3.amazonaws.com/public/other'}));
 assert.notDeepEqual(key({...base,method:'POST',body:'[timeout:8]'}),key({...base,method:'POST',body:'[timeout:20]'}));
 assert.equal(key(base).semanticOverpass,false);
});


test('backend map replay verifies captured bytes and only fulfills the exact query', async () => {
 const {installRecordedOverpassFixture}=await import('../scripts/verification/recorded-overpass-fixture.mjs');
 const {readFile}=await import('node:fs/promises');
 for(const profile of ['desktop','mobile']){
  const meta=JSON.parse(await readFile(new URL(`./fixtures/multiplayer/logan-primary-${profile}.meta.json`,import.meta.url),'utf8'));
  let handler;const context={route:async(_pattern,fn)=>{handler=fn;}};
  const receipt=await installRecordedOverpassFixture(context,profile);
  let fulfilled=0,continued=0;
  for(const exact of [false,true]){
   const query=exact?meta.query.replace('[timeout:30]','[timeout:8]'):meta.query.replace('41.7','42.7');
   await handler({request:()=>({method:()=> 'POST',url:()=> 'https://overpass.private.coffee/api/interpreter',postData:()=>new URLSearchParams({data:query}).toString()}),
    continue:async()=>{continued++;},fulfill:async result=>{fulfilled++;assert.equal(result.status,200);assert.equal(JSON.parse(result.body).elements.length,meta.elements);}});
  }
  assert.equal(fulfilled,1);assert.equal(continued,1);assert.equal(receipt.hits,1);
 }
});
