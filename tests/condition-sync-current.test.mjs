import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createConditionSync} from '../app/js/player/condition-sync.js';
const {applyPlayerConditionMutation}=createRequire(import.meta.url)('../functions/player-state-authority.js');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function memoryOutbox() {
 let row={uid:'account-a',revision:0,pending:null,operation:null,confirmed:null}, serial=Promise.resolve();
 const run=change=>{const result=serial.then(()=>{const next=structuredClone(row);change?.(next);row=next;return structuredClone(row);});serial=result.catch(()=>{});return result;};
 return {read:()=>run(),update:change=>run(change),durable:()=>true};
}
async function fixture(options={}) {
 const timers=new Map();let id=0;
 const outbox=options.outbox??memoryOutbox();
 const sync=createConditionSync({uid:'account-a',outbox,channelFactory:()=>null,locks:null,
  setTimer:(fn,delay)=>{timers.set(++id,{fn,delay});return id;},clearTimer:id=>timers.delete(id),identity:randomUUID,
  send:async()=>({revision:1}),...options});
 await sync.whenInitialized();return {sync,timers,outbox};
}
test('failed older request retries its identity before preserving and saving the latest value',async()=>{
 const first=deferred(),started=deferred(),sent=[];let server=null;
 const {sync,timers}=await fixture({send:async command=>{sent.push(command);if(sent.length===1){started.resolve();return first.promise;}server=applyPlayerConditionMutation(server,command);return server;}});
 sync.accept({revision:0});sync.queue({after:.9});const running=sync.flush();await started.promise;
 sync.queue({after:.4});await sync.flush();assert.equal(sent.length,1,'single flight');
 first.reject(Error('offline'));await running;await sync.whenDurable();
 assert.equal(sync.snapshot().pending,true);assert.equal(sync.snapshot().latestCondition,.4);assert.ok(timers.size);
 await sync.flush();assert.equal(sent[0].mutationId,sent[1].mutationId);
 await sync.flush();assert.deepEqual(sent.map(c=>c.condition),[.9,.9,.4]);assert.equal(server.condition,.4);assert.equal(sync.snapshot().pending,false);sync.dispose();
});
test('lost acknowledgment and reload replay exactly once, then save newer intent',async()=>{
 let server=null,first=true;
 const send=async command=>{server=applyPlayerConditionMutation(server,command);if(first){first=false;throw Error('ack lost');}return server;};
 const a=await fixture({send});a.sync.accept(null);a.sync.queue({after:.8});await a.sync.flush();a.sync.queue({after:.2});a.sync.dispose();await a.sync.whenDurable();
 const b=await fixture({send,outbox:a.outbox});assert.equal(b.sync.accept(server),false);await b.sync.flush();await b.sync.flush();
 assert.equal(server.revision,2);assert.equal(server.condition,.2);assert.equal(b.sync.snapshot().pending,false);b.sync.dispose();
});
test('conflicting tab revision rebases the newest intent, never an older pending value',async()=>{
 let server=applyPlayerConditionMutation(null,{condition:.7,mutationId:'external-1',expectedRevision:0});
 const {sync}=await fixture({send:async command=>{try{return server=applyPlayerConditionMutation(server,command);}catch(e){e.payload={state:e.state};throw e;}}});
 sync.accept({revision:0});sync.queue({after:.6});await sync.flush();sync.queue({after:.3});await sync.flush();
 assert.equal(server.condition,.3);assert.equal(server.revision,2);assert.equal(sync.accept({revision:1,condition:1}),false);sync.dispose();
});
test('disposed or switched accounts cannot adopt a late acknowledgment or send new work',async()=>{
 const reply=deferred(),started=deferred();let current=true,sends=0;const states=[];
 const {sync,outbox}=await fixture({send:()=>{sends++;started.resolve();return reply.promise;},isCurrent:()=>current,onState:s=>states.push(s)});
 sync.accept(null);sync.queue({after:.5});const running=sync.flush();await started.promise;current=false;sync.dispose();const count=states.length;reply.resolve({revision:99,condition:.5});await running;
 assert.equal(states.length,count);assert.equal(sync.snapshot().revision,0);assert.equal(sync.queue({after:.1}),false);await sync.flush();assert.equal(sends,1);
 assert.equal((await outbox.read()).confirmed.condition,.5,'An acknowledgment can retire its own durable command without updating another account UI');
});
test('storage denial stays visible and does not drop an in-memory save',async()=>{
 const {sync}=await fixture({outbox:undefined,indexedDB:{open(){throw Error('denied');}},storage:{getItem(){throw Error('denied');}}});
 sync.accept(null);sync.queue({after:.5});await sync.whenDurable();assert.equal(sync.snapshot().durable,false);assert.equal(sync.snapshot().pending,true);await sync.flush();assert.equal(sync.snapshot().pending,false);sync.dispose();
});
test('disposal does not overwrite a different tab and accepted storage work finishes',async()=>{
 const a=await fixture(),b=await fixture({outbox:a.outbox});a.sync.queue({after:.9});await a.sync.whenDurable();b.sync.queue({after:.4});await b.sync.whenDurable();a.sync.dispose();
 const c=await fixture({outbox:a.outbox});assert.equal(c.sync.snapshot().latestCondition,.4);
 c.sync.queue({after:.2});c.sync.dispose();await c.sync.whenDurable();assert.equal((await a.outbox.read()).pending.condition,.2);b.sync.dispose();
});
test('durable confirmed revision cannot be replaced by an older initial feed',async()=>{
 const outbox=memoryOutbox(),confirmed=[];await outbox.update(row=>{row.revision=4;row.confirmed={revision:4,condition:.3};});
 const {sync}=await fixture({outbox,onConfirmed:state=>confirmed.push(state)});
 assert.equal(sync.accept({revision:2,condition:1}),false);assert.deepEqual(confirmed,[{revision:4,condition:.3}]);sync.dispose();
});
test('authority rejects reused identities and stale writes, with bounded idempotency receipts',()=>{
 let state=null;const command={condition:.5,mutationId:'command-original',expectedRevision:0};state=applyPlayerConditionMutation(state,command);
 assert.equal(applyPlayerConditionMutation(state,command),state);
 assert.throws(()=>applyPlayerConditionMutation(state,{...command,condition:.4}),e=>e.status===400);
 assert.throws(()=>applyPlayerConditionMutation(state,{...command,mutationId:'command-stale'}),e=>e.status===409&&e.state.revision===1);
 for(let i=1;i<50;i++)state=applyPlayerConditionMutation(state,{condition:.5,expectedRevision:i,mutationId:`command-${i}`});
 assert.equal(state.mutationReceipts.length,32);assert.equal(state.revision,50);
});

test('connected feed waits for durable recovery and fences late success and error callbacks by account',async()=>{
 const initialized=deferred(),feeds=new Map(),hydrated=[],errors=[];let uid='a',syncOptions,accepted=0,unsubscribed=0;
 const source=(await readFile(new URL('../app/js/player/connected-player-state.js',import.meta.url),'utf8'))
   .replace(/^import .*;$/gm,'').replace('export { createConnectedPlayerState };','globalThis.create = createConnectedPlayerState;');
 const sandbox={getCurrentUser:()=>({uid}),initFirebase:()=>({db:{}}),doc:(_, ...parts)=>parts.at(-1),
  onSnapshot:(path,success,error)=>{feeds.set(path,{success,error});return()=>unsubscribed++;},saveExplorerPlayerCondition:()=>{},
  createConditionSync:options=>{syncOptions=options;return {whenInitialized:()=>initialized.promise,queue:()=>{},accept:()=>{accepted++;return true;},snapshot:()=>({pending:false}),retry:()=>{},dispose:()=>{}};}};
 vm.runInNewContext(source,sandbox);
 const api=sandbox.create({conditionAuthority:{snapshot:()=>({condition:1}),hydrate:v=>hydrated.push(v),subscribe:()=>()=>unsubscribed++},
  vehicleUpgradeStore:{snapshot:()=>({}),exportState:()=>({}),hydrate:()=>hydrated.push('upgrades')},onError:error=>errors.push(error.message)});
 const delayed=feeds.get('condition').success({exists:()=>true,data:()=>({condition:.4,revision:1})});
 assert.equal(accepted,0);uid='b';initialized.resolve();await delayed;
 for(const feed of feeds.values()){await feed.success({exists:()=>true,data:()=>({condition:.2,vehicles:{}})});feed.error(Error('old account error'));}
 syncOptions.onConfirmed({condition:.1,revision:2});
 assert.equal(accepted,0);assert.deepEqual(hydrated,[]);assert.deepEqual(errors,[]);
 uid='a';await feeds.get('condition').success({exists:()=>true,data:()=>({condition:.4,revision:1})});
 syncOptions.onConfirmed({condition:.3,revision:2});assert.deepEqual(hydrated,[.4,.3]);api.dispose();assert.equal(unsubscribed,3);
 feeds.get('condition').error(Error('after disposal'));assert.deepEqual(errors,[]);
});
