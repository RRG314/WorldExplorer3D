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
