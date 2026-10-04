import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const {applyPlayerConditionMutation}=createRequire(import.meta.url)('../../functions/player-state-authority.js');
const directory=process.env.WE3D_CONDITION_OUTPUT || 'output/verification/architecture-polish/condition-tabs';
await mkdir(directory,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4399,4400]});
let browser;
const report={scope:'Real same-origin tabs and browser storage; controlled transport executes the actual condition mutation authority, not an SDK/emulator or hosted acceptance',cases:[],errors:[]};
const states=new Map(),commands=[];
let loseNextReply=false,delayNextReply=false,releaseReply=null;
try {
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext();
  await context.route('**/condition-tabs-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Condition synchronization verification</title><h1>Disposable condition synchronization</h1><pre id="state"></pre>'}));
  await context.exposeBinding('sendCondition',async(_,uid,command)=>{
    commands.push({uid,...command});
    try {
      const state=applyPlayerConditionMutation(states.get(uid),command);states.set(uid,state);
      if(loseNextReply){loseNextReply=false;return {failed:true,status:0,message:'Acknowledgment deliberately lost after commit'};}
      if(delayNextReply){delayNextReply=false;await new Promise(resolve=>{releaseReply=resolve;});}
      return {state};
    }catch(error){return {failed:true,status:error.status,message:error.message,state:error.state};}
  });
  async function open(uid='account-a',options={}) {
    const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.port}/condition-tabs-fixture`);
    await page.evaluate(async({uid,state,options})=>{
      const {createConditionSync}=await import('/app/js/player/condition-sync.js');
      window.current=true;window.confirmed=[];window.notices=[];
      window.storageWarnings=[];
      if(options.legacy)localStorage.setItem(`world-explorer:condition-outbox:v1:${uid}`,JSON.stringify({uid,...options.legacy}));
      window.sync=createConditionSync({uid,isCurrent:()=>window.current,
        // Explicit flushes make interleavings deterministic; browser storage
        // and Web Locks remain real, shared across the separate tabs.
        setTimer:()=>1,clearTimer:()=>{},
        ...(options.denied?{indexedDB:{open(){throw new DOMException('Storage denied','SecurityError');}},storage:{getItem(){throw Error('Storage denied');},setItem(){throw Error('Storage denied');}}}:{}),
        ...(options.noLocks?{locks:null,channelFactory:()=>null}:{}),
        send:async command=>{const response=await window.sendCondition(uid,command);if(response.failed)throw Object.assign(Error(response.message),{status:response.status,payload:{state:response.state}});return response.state;},
        onError:error=>{if(error.code==='condition-storage-unavailable')window.storageWarnings.push(error.message);},
        onConfirmed:state=>window.confirmed.push(state),onState:state=>{window.notices.push(state);document.querySelector('#state').textContent=JSON.stringify(state,null,2);}
      });
      await sync.whenInitialized?.();sync.accept(state);
    },{uid,state:states.get(uid)||null,options});
    return page;
  }
  const queue=(page,after)=>page.evaluate(async after=>{sync.queue({after,reason:'two-tab-fixture'});await sync.whenDurable?.();},after);
  const flush=page=>page.evaluate(()=>sync.flush());
  let a=await open(),b=await open();
  await queue(a,.9);await queue(b,.4);
  await a.evaluate(()=>sync.dispose());await a.close();
  let c=await open();
  assert.equal(await c.evaluate(()=>sync.snapshot().latestCondition),.4,'Closing an older tab must not replace newer durable intent');
  await flush(c);assert.equal(states.get('account-a').condition,.4);
  report.cases.push('older-tab-disposal-preserves-newer-intent');
  await b.close();await c.close();

  a=await open();b=await open();
  const revisionBefore=states.get('account-a').revision;
  loseNextReply=true;await queue(a,.8);await flush(a);
  await queue(b,.2);await a.close();
  c=await open();await flush(c);await flush(c);
  assert.equal(states.get('account-a').condition,.2);
  assert.equal(states.get('account-a').revision,revisionBefore+2,'Uncertain command must replay its original idempotency identity');
  assert.equal(await c.evaluate(()=>sync.snapshot().pending),false);
  report.cases.push('lost-acknowledgment-and-closed-tab-recover-once');
  await b.close();await c.close();

  a=await open();delayNextReply=true;await queue(a,.6);
  await a.evaluate(()=>{window.inflight=sync.flush();});
  for(let i=0;i<100&&!releaseReply;i++)await new Promise(resolve=>setTimeout(resolve,20));
  assert.ok(releaseReply,'Fixture did not reach committed in-flight mutation');
  const delayedRevision=states.get('account-a').revision;
  await a.close();c=await open();await flush(c);
  assert.equal(states.get('account-a').revision,delayedRevision,'Closing a dispatching tab must not duplicate the accepted mutation');
  assert.equal(await c.evaluate(()=>sync.snapshot().pending),false);
  assert.equal(await c.evaluate(()=>confirmed.at(-1)?.condition),.6,'Recovered acknowledgment must reconcile the actual confirmed condition');
  releaseReply();releaseReply=null;
  report.cases.push('tab-closure-during-dispatch-reconciles-confirmed-state');
  await c.close();

  a=await open();b=await open('account-b');await queue(a,.3);await queue(b,.7);
  await a.evaluate(()=>{window.current=false;sync.dispose();});
  const aRevision=states.get('account-a').revision;
  await flush(a);await flush(b);
  assert.equal(states.get('account-a').revision,aRevision);assert.equal(states.get('account-b').condition,.7);
  c=await open();assert.equal(await c.evaluate(()=>sync.snapshot().latestCondition),.3);await flush(c);
  assert.equal(states.get('account-a').condition,.3);
  report.cases.push('account-switch-retains-own-work-without-cross-account-dispatch');
  await a.close();await b.close();await c.close();

  const legacyOperation={condition:.8,reason:'legacy',expectedRevision:0,mutationId:'legacy-uncertain'};
  states.set('account-legacy',applyPlayerConditionMutation(null,legacyOperation));
  a=await open('account-legacy',{legacy:{operation:legacyOperation,pending:{condition:.2,reason:'newer'}}});
  assert.equal(await a.evaluate(()=>localStorage.getItem('world-explorer:condition-outbox:v1:account-legacy')),null,'Remove legacy work only after its durable import');
  await flush(a);await flush(a);assert.equal(states.get('account-legacy').condition,.2);assert.equal(states.get('account-legacy').revision,2);
  await a.close();a=await open('account-legacy',{legacy:{pending:{condition:.9}}});
  assert.equal(await a.evaluate(()=>sync.snapshot().pending),false,'A restored old-format key cannot overwrite an already migrated account');
  report.cases.push('legacy-uncertain-operation-migrates-once-with-newer-intent');await a.close();

  a=await open('account-no-locks',{noLocks:true});b=await open('account-no-locks',{noLocks:true});
  await queue(a,.3);await Promise.all([flush(a),flush(b)]);
  assert.equal(states.get('account-no-locks').revision,1,'Concurrent fallback dispatch remains idempotent');
  await queue(b,.7);await flush(b);assert.equal(states.get('account-no-locks').condition,.7);
  report.cases.push('no-web-locks-fallback-remains-idempotent');await a.close();await b.close();

  a=await open('account-quota');
  await a.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='accounts')throw new DOMException('Quota full','QuotaExceededError');return put.apply(this,args);};});
  await queue(a,.4);assert.equal(await a.evaluate(()=>sync.snapshot().durable),false);assert.equal(await a.evaluate(()=>sync.snapshot().latestCondition),.4);
  assert.equal(await a.evaluate(()=>storageWarnings.length),1);await flush(a);assert.equal(states.get('account-quota').condition,.4);
  report.cases.push('quota-failure-preserves-pending-work-and-emits-visible-warning');await a.close();

  a=await open('account-denied',{denied:true});await queue(a,.5);
  assert.equal(await a.evaluate(()=>sync.snapshot().durable),false,'Denied storage must never be reported durable');
  assert.equal(await a.evaluate(()=>sync.snapshot().pending),true);
  assert.equal(await a.evaluate(()=>storageWarnings.length),1);
  await flush(a);assert.equal(states.get('account-denied').condition,.5);
  report.cases.push('denied-storage-retains-visible-in-memory-work');
  await pageStateImage(a);await a.close();
  assert.deepEqual(report.errors,[]);report.commandCount=commands.length;report.passed=true;
  async function pageStateImage(page){await page.screenshot({path:`${directory}/condition.png`});}
}catch(error){report.error=error.stack;throw error;}
finally {
  releaseReply?.();await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));
  await browser?.close();await server.close();
}
console.log(JSON.stringify(report));
