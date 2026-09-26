import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../functions/index.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('async function deleteDocsByQuery'),source.indexOf('async function releaseWorldPropertiesForUser'));
for(const operation of ['deleteDocsByQuery','updateDocsByQuery']) {
 test(`${operation}: failed-precondition cannot be treated as completed cleanup`,async()=>{
  let commits=0;const error=Object.assign(new Error('index missing'),{code:9});
  const scope={db:{batch:()=>({commit:async()=>{commits++;}})}};vm.createContext(scope);vm.runInContext(helpers,scope);
  const query={limit:()=>({get:async()=>{throw error;}})};
  await assert.rejects(scope[operation](query,()=>({})),e=>e===error);assert.equal(commits,0);
 });
 test(`${operation}: commit failures propagate to the deletion handler`,async()=>{
  const error=new Error('write unavailable');const scope={db:{batch:()=>({delete(){},update(){},commit:async()=>{throw error;}})}};
  vm.createContext(scope);vm.runInContext(helpers,scope);
  const query={limit:()=>({get:async()=>({empty:false,size:1,docs:[{ref:{}}]})})};
  await assert.rejects(scope[operation](query,()=>({})),e=>e===error);
 });
}
test('user deletion propagates failure instead of continuing to identity deletion',async()=>{
 const error=new Error('profile delete failed');
 const doc=()=>({collection:()=>({}),delete:async()=>{throw error;}});
 const scope={require:()=>({cleanupCaptureAccount:async()=>{}}),admin:{storage:()=>({bucket:()=>({})})},FieldValue:{},CREATOR_PROFILES_COLLECTION:'creatorProfiles',
 db:{collection:()=>({doc,where:()=>({get:async()=>({docs:[]})})}),collectionGroup:()=>({where:()=>({})})},deleteDocsByQuery:async()=>{},releaseWorldPropertiesForUser:async()=>{},deleteDiscoveryTradesForUser:async()=>{}};
 vm.createContext(scope);vm.runInContext(source.slice(source.indexOf('async function deleteUserData'),source.indexOf('\nfunction timestampToMillis')),scope);
 await assert.rejects(scope.deleteUserData('owner'),e=>e===error);
});

// Emulators do not enforce hosted collection-group indexes. Keep the deployment
// manifest paired with the real cleanup queries so deletion cannot strand Auth.
test('every account cleanup collection-group equality query has a deployed index', async () => {
 const config=JSON.parse(await readFile(new URL('../firestore.indexes.json',import.meta.url),'utf8'));
 const queries=[...source.matchAll(/collectionGroup\('([^']+)'\)\.where\('([^']+)', '==', uid\)/g)];
 assert.ok(queries.length>=9,'Account cleanup query inventory must not be empty');
 for(const [,group,field] of queries){
  const override=config.fieldOverrides.find(row=>row.collectionGroup===group&&row.fieldPath===field);
  assert.ok(override?.indexes.some(index=>index.queryScope==='COLLECTION_GROUP'&&index.order==='ASCENDING'),`${group}.${field} requires a collection-group equality index`);
 }
});
