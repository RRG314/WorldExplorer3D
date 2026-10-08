import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryDiscoveryProfileStore} from '../app/js/discovery/profile-store.js';
const observation={claimId:'claim:save-test',catalogId:'rock',activityId:'geology-inspect',family:'rock',regionId:'test',name:'Rock'};
test('preference writes use the latest reward state and independent tutorial edits survive',async()=>{
 const store=createMemoryDiscoveryProfileStore();
 await store.getProfile(); // A UI could have read an old profile before the reward.
 await store.recordObservation(observation);
 const earned=await store.getProfile();
 await Promise.all([
  store.saveProfile(p=>({...p,equippedToolId:'field-camera'})),
  store.saveProfile(p=>({...p,tutorials:{...p.tutorials,first:true}})),
  store.saveProfile(p=>({...p,tutorials:{...p.tutorials,second:true}}))
 ]);
 const after=await store.getProfile();
 assert.deepEqual(after.explorerProgress,earned.explorerProgress);
 assert.deepEqual(after.characterState,earned.characterState);
 assert.deepEqual(after.tutorials,{first:true,second:true});
 assert.equal(after.equippedToolId,'field-camera');
});
test('backup import and replay do not duplicate a discovery or its rewards',async()=>{
 const store=createMemoryDiscoveryProfileStore();await store.recordObservation(observation);
 const backup=await store.exportData();const restored=createMemoryDiscoveryProfileStore();
 await restored.importData(backup);const before=await restored.getProfile();
 assert.equal((await restored.recordObservation(observation)).recorded,false);
 assert.deepEqual((await restored.getProfile()).explorerProgress,before.explorerProgress);
 assert.equal((await restored.listEvents()).length,1);
});
test('invalid and asynchronous updates cannot replace the profile',async()=>{
 const store=createMemoryDiscoveryProfileStore();const before=await store.getProfile();
 await assert.rejects(store.saveProfile(async p=>p),/synchronous/);
 await assert.rejects(store.saveProfile(()=>null),/synchronous/);
 assert.deepEqual(await store.getProfile(),before);
 await assert.rejects(store.recordObservation({catalogId:'rock'}),/stable claim/);
 await assert.rejects(store.collect(observation),/instance ID/);
});
