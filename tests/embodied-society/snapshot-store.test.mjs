import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {createSnapshotStore} from '../../scripts/embodied-society/snapshot-store.mjs';
import {createWorkshopService,createWorkshopState} from '../../app/js/experiments/embodied-society/workshop.mjs';
test('persisted workshop survives service recreation and duplicate command recovery',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'we3d-workshop-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const store=createSnapshotStore(directory);
 const initialState=createWorkshopState({runId:'persist-test',actorIds:['alice'],nodes:[{id:'fiber',materialId:'research:fiber',remaining:3}]});
 const authorize=async()=>({allowed:true,inReach:true,targetId:'fiber'});
 const a=createWorkshopService({initialState,authorize,persist:state=>store.save(state)});
 const command={kind:'gather',targetId:'fiber',quantity:1,operationId:'first',expectedRevision:0};
 await a.execute('alice',command,0);
 const b=createWorkshopService({initialState:await store.load(),authorize,persist:state=>store.save(state)});
 await b.execute('alice',command,1);assert.equal(b.snapshot().nodes.fiber.remaining,2);assert.equal(b.inspectInventory('alice').items[0].quantity,1);
});
test('snapshot quota rejection preserves the prior saved state',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'we3d-workshop-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const store=createSnapshotStore(directory,{maxBytes:40});await store.save({revision:1});
 await assert.rejects(store.save({large:'x'.repeat(100)}),/budget/);assert.deepEqual(await store.load(),{revision:1});
});
