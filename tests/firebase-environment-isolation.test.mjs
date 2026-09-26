import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {assertFirebaseEnvironment,assertFunctionsOrigin} from '../js/firebase-environment-policy.js';
const production=JSON.parse(await readFile(new URL('../config/firebase.production.json',import.meta.url)));
const staging=JSON.parse(await readFile(new URL('../config/firebase.staging.json',import.meta.url)));
for(const origin of ['http://localhost:4195','http://127.0.0.1:4195','http://192.168.1.4:4195','file:///tmp/app.html','https://preview.example.test','https://we3d-staging-20260712.web.app']) {
  test(`production rejected at ${origin}`,()=>{
    assert.throws(()=>assertFirebaseEnvironment(production,new URL(origin)),/blocked/);
    assert.equal(assertFirebaseEnvironment(staging,new URL(origin)),staging);
    assert.throws(()=>assertFirebaseEnvironment({...staging,storageBucket:production.storageBucket},new URL(origin)),/blocked/);
  });
}
test('live site accepts only production',()=>{
  const url=new URL('https://worldexplorer3d.io');
  assert.equal(assertFirebaseEnvironment(production,url),production);
  assert.throws(()=>assertFirebaseEnvironment(staging,url),/cannot/);
});
test('endpoint override cannot send staging token to production',()=>{
  const local=new URL('http://localhost:4195');
  assert.throws(()=>assertFunctionsOrigin('https://us-central1-worldexplorer3d-d9b83.cloudfunctions.net',staging,local),/blocked/);
  assert.match(assertFunctionsOrigin('https://us-central1-we3d-staging-20260712.cloudfunctions.net',staging,local),/staging/);
});
test('source config overrides stale production globals with staging',async()=>{
  const context={window:{WORLD_EXPLORER_FIREBASE:production}};
  vm.runInNewContext(await readFile(new URL('../js/firebase-project-config.js',import.meta.url),'utf8'),context);
  assert.equal(context.window.WORLD_EXPLORER_FIREBASE.projectId,staging.projectId);
  assert.equal(context.window.WORLD_EXPLORER_FIREBASE_ENV,'staging');
});
