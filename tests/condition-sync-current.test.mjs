import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {createConditionSync} from '../app/js/player/condition-sync.js';
const {applyPlayerConditionMutation}=createRequire(import.meta.url)('../functions/player-state-authority.js');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(options={}) {
 const timers=new Map(),values=new Map();let id=0;
 const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 const sync=createConditionSync({uid:'account-a',storage,setTimer:(fn,delay)=>{timers.set(++id,{fn,delay});return id;},clearTimer:id=>timers.delete(id),identity:randomUUID,send:async()=>({revision:1}),...options});
 return {sync,timers,values,storage};
}
test('failed older request retries its identity before preserving and saving the latest value',async()=>{
 const first=deferred(),sent=[];let server=null;
 const {sync,timers}=fixture({send:async command=>{sent.push(command);if(sent.length===1)return first.promise;server=applyPlayerConditionMutation(server,command);return server;}});
 sync.accept({revision:0});sync.queue({after:.9});const running=sync.flush();
 sync.queue({after:.4});await sync.flush();assert.equal(sent.length,1,'single flight');
 first.reject(Error('offline'));await running;
 assert.equal(sync.snapshot().pending,true);assert.equal(sync.snapshot().latestCondition,.4);assert.ok(timers.size);
 await sync.flush();assert.equal(sent[0].mutationId,sent[1].mutationId);
 await sync.flush();assert.deepEqual(sent.map(c=>c.condition),[.9,.9,.4]);assert.equal(server.condition,.4);assert.equal(sync.snapshot().pending,false);sync.dispose();
});
test('lost acknowledgment and reload replay exactly once, then save newer intent',async()=>{
 let server=null,first=true;
 const send=async command=>{server=applyPlayerConditionMutation(server,command);if(first){first=false;throw Error('ack lost');}return server;};
 const a=fixture({send});a.sync.accept(null);a.sync.queue({after:.8});await a.sync.flush();a.sync.queue({after:.2});a.sync.dispose();
 const b=fixture({send,storage:a.storage});assert.equal(b.sync.accept(server),false);await b.sync.flush();await b.sync.flush();
 assert.equal(server.revision,2);assert.equal(server.condition,.2);assert.equal(b.sync.snapshot().pending,false);b.sync.dispose();
});
test('conflicting tab revision rebases the newest intent, never an older pending value',async()=>{
 let server=applyPlayerConditionMutation(null,{condition:.7,mutationId:'external-1',expectedRevision:0});
 const {sync}=fixture({send:async command=>{try{return server=applyPlayerConditionMutation(server,command);}catch(e){e.payload={state:e.state};throw e;}}});
 sync.accept({revision:0});sync.queue({after:.6});await sync.flush();sync.queue({after:.3});await sync.flush();
 assert.equal(server.condition,.3);assert.equal(server.revision,2);assert.equal(sync.accept({revision:1,condition:1}),false);sync.dispose();
});
test('disposed or switched accounts cannot adopt a late acknowledgment or send new work',async()=>{
 const reply=deferred();let current=true,sends=0;const states=[];
 const {sync}=fixture({send:()=>{sends++;return reply.promise;},isCurrent:()=>current,onState:s=>states.push(s)});
 sync.accept(null);sync.queue({after:.5});const running=sync.flush();current=false;sync.dispose();const count=states.length;reply.resolve({revision:99});await running;
 assert.equal(states.length,count);assert.equal(sync.snapshot().revision,0);assert.equal(sync.queue({after:.1}),false);await sync.flush();assert.equal(sends,1);
});
test('storage quota failure stays visible and does not drop an in-memory save',async()=>{
 const {sync}=fixture({storage:{getItem:()=>null,setItem:()=>{throw Error('quota');}}});sync.accept(null);sync.queue({after:.5});assert.equal(sync.snapshot().durable,false);assert.equal(sync.snapshot().pending,true);await sync.flush();assert.equal(sync.snapshot().pending,false);sync.dispose();
});
test('authority rejects reused identities and stale writes, with bounded idempotency receipts',()=>{
 let state=null;const command={condition:.5,mutationId:'command-original',expectedRevision:0};state=applyPlayerConditionMutation(state,command);
 assert.equal(applyPlayerConditionMutation(state,command),state);
 assert.throws(()=>applyPlayerConditionMutation(state,{...command,condition:.4}),e=>e.status===400);
 assert.throws(()=>applyPlayerConditionMutation(state,{...command,mutationId:'command-stale'}),e=>e.status===409&&e.state.revision===1);
 for(let i=1;i<50;i++)state=applyPlayerConditionMutation(state,{condition:.5,expectedRevision:i,mutationId:`command-${i}`});
 assert.equal(state.mutationReceipts.length,32);assert.equal(state.revision,50);
});
