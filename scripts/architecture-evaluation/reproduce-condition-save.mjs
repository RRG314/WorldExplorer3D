// Audit-only execution of the current module with its four network imports
// replaced by controlled dependencies. No player data or Firebase calls.
import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const file='app/js/player/connected-player-state.js';
const source=await fs.readFile(file,'utf8');
const imports=source.match(/^import .*;$/gm)||[];
assert.equal(imports.length,4);
const body=source.replace(/^import .*;\n/gm,'').replace('export { createConnectedPlayerState };','globalThis.createConnectedPlayerState = createConnectedPlayerState;');
const timers=new Map(), listeners=[], sends=[], failures=[];
let sequence=0,change,condition=1,rejectFirst;
const context=vm.createContext({
  getCurrentUser:()=>({uid:'audit-user'}),initFirebase:()=>({db:{}}),doc:()=>({}),
  onSnapshot(ref,callback){listeners.push(callback);return()=>{};},
  setTimeout(callback){const id=++sequence;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id),
  saveExplorerPlayerCondition(payload){sends.push(payload);if(sends.length===1)return new Promise((resolve,reject)=>{rejectFirst=reject;});return Promise.resolve();}
});
vm.runInContext(body,context,{filename:file});
const api=context.createConnectedPlayerState({conditionAuthority:{snapshot:()=>({condition}),hydrate:v=>{condition=v;},subscribe:fn=>{change=fn;return()=>{};}},vehicleUpgradeStore:{snapshot:()=>({}),exportState:()=>({}),hydrate(){}},onError:e=>failures.push(e.message)});
listeners[0]({exists:()=>true,data:()=>({condition:1})});listeners[1]({exists:()=>true,data:()=>({vehicles:{}})});
function nextTimer(){const [id,fn]=timers.entries().next().value;timers.delete(id);return fn();}
change({after:.9,reason:'first-damage'});const first=nextTimer();
change({after:.4,reason:'newer-damage'});
rejectFirst(Error('Controlled network failure'));await first;
const pendingAfterFailure=api.snapshot().pending;
assert.equal(pendingAfterFailure,false);
await nextTimer();
assert.deepEqual(sends.map(s=>s.condition),[.9,.9]);
assert.equal(api.snapshot().pending,false);
assert.equal(timers.size,0);
api.dispose();
const report={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope:'Actual connected-player-state module in VM with controlled auth/subscription/timer/transport dependencies. Not a hosted persistence test.',scenario:'First .9-condition write is in flight. New .4 change is queued. First write rejects before the newer timer fires.',observedWrites:sends,expectedLatestCondition:.4,newerConditionDropped:true,errors:failures,snapshotPendingAfterFailure:pendingAfterFailure,retryTimersRemaining:timers.size};
await fs.mkdir('docs/system-review/2026-10-04',{recursive:true});
await fs.writeFile('docs/system-review/2026-10-04/condition-save-reproduction.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
