// Native IndexedDB + actual companion owner; controlled delayed-save boundary.
// This is a browser integration fixture, not a substitute for a rendered world.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
const out='output/architecture-consolidation/2026-10-13/companion-service-browser';
await mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4595,4596]});
const checks=[],errors=[];let owned;
try {
 owned=await chromium.launchServer({channel:'chrome',headless:true});
 const browser=await chromium.connect(owned.wsEndpoint()),context=await browser.newContext();
 const html=`<!doctype html><title>Companion save integration</title><style>body{font:18px system-ui;background:#122027;color:#eef4f6;padding:32px}button{font:inherit;padding:12px;margin:8px}pre{white-space:pre-wrap}</style><h1>Companion save integration</h1><p>Actual companion owner and IndexedDB. Delayed saves are controlled for this check.</p><button id="care">Care for first companion</button><button id="select">Select second companion</button><button id="release">Finish delayed save</button><pre id="result">Loading…</pre><script type="module">
 import {createIndexedDbDiscoveryProfileStore} from '/app/js/discovery/profile-store.js';
 import {createCompanionRuntime} from '/app/js/discovery/companion-runtime.js';
 import {createStarterCompanionInstance,createCompanionInstance} from '/app/js/discovery/companions.js';
 const f=window.fixture={};f.store=createIndexedDbDiscoveryProfileStore();
 const rows=await f.store.listCompanions();
 if(!rows.length){await f.store.saveCompanion({...createStarterCompanionInstance({profileIdentity:'browser-service'}),active:true});await f.store.saveCompanion({...createCompanionInstance('trail-hound',{worldIdentity:'browser-service',discoveryId:'second'}),active:false});}
 f.rows=await f.store.listCompanions();f.first=f.rows.find(c=>c.isStarterCompanion).instanceId;f.second=f.rows.find(c=>!c.isStarterCompanion).instanceId;
 f.runtime=await createCompanionRuntime({}, {profileStore:{...f.store,saveCompanion:async(c,update)=>{if(f.delay){f.delay=false;f.pending=true;f.render();await new Promise(resolve=>f.release=resolve);}return f.store.saveCompanion(c,update);}}});
 f.state=()=>({active:f.runtime.snapshot().activeInstanceId,companions:f.runtime.snapshot().companions.map(c=>({id:c.instanceId,active:c.active,xp:c.progression.totalXp})),pending:f.pending===true,done:f.done===true});
 f.render=()=>document.querySelector('#result').textContent=JSON.stringify(f.state(),null,2);
 document.querySelector('#care').onclick=async()=>{f.done=false;f.delay=true;await f.runtime.care(f.first,'feed');f.award=await f.runtime.awardXp({receiptId:'poi-care:delayed-browser-receipt',reasonId:'care-after-outing'},f.first);f.pending=false;f.done=true;f.render();};
 document.querySelector('#select').onclick=async()=>{await f.runtime.setActive(f.second);f.render();};
 document.querySelector('#release').onclick=()=>f.release?.();
 window.render_game_to_text=()=>JSON.stringify(f.state());f.ready=true;f.render();
 </script>`;
 await context.route('**/__companion-service',route=>route.fulfill({contentType:'text/html',body:html}));
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.port}/__companion-service`);
 await page.waitForFunction(()=>window.fixture?.ready);
 await runPrescribedGameActions(page,out,[{buttons:['left_mouse_button'],frames:1,mouse_x:40,mouse_y:20},{buttons:[],frames:3}],'#care');
 await page.waitForFunction(()=>fixture.pending);
 await page.locator('#select').click();await page.waitForFunction(()=>fixture.state().active===fixture.second);
 await page.locator('#release').click();await page.waitForFunction(()=>fixture.done);
 let state=await page.evaluate(()=>fixture.state());
 assert.equal(state.companions.filter(c=>c.active).length,1);
 assert.equal(state.companions.find(c=>c.active).xp,0);
 assert.equal(state.companions.find(c=>!c.active).xp,5);
 checks.push('Selection during delayed care remains selected; only the treated companion gains XP');
 await page.reload();await page.waitForFunction(()=>window.fixture?.ready);
 assert.deepEqual((await page.evaluate(()=>fixture.state())).companions,state.companions);
 checks.push('Native IndexedDB preserves selection and exact XP after reload');
 await page.locator('#care').click();await page.waitForFunction(()=>fixture.pending);
 await page.locator('#release').click();await page.waitForFunction(()=>fixture.done);
 assert.equal(await page.evaluate(()=>fixture.award.reason),'already-awarded');
 assert.deepEqual((await page.evaluate(()=>fixture.state())).companions,state.companions);
 checks.push('Replayed receipt is acknowledged without duplicate XP');
 const failed=await page.evaluate(async()=>{
  const {createCompanionRuntime}=await import('/app/js/discovery/companion-runtime.js');
  let deny=false;const runtime=await createCompanionRuntime({}, {profileStore:{...fixture.store,saveCompanion:(c,update)=>{if(deny)throw new DOMException('Simulated unavailable storage','QuotaExceededError');return fixture.store.saveCompanion(c,update);}}});
  try {deny=true;return await runtime.awardXp({receiptId:'unsaved',reasonId:'care-after-outing'},fixture.first);}finally{runtime.dispose();}
 });
 assert.equal(failed,false);checks.push('Failed durable save returns failure rather than service confirmation');
 await page.screenshot({path:out+'/companion-service.png'});
 await writeFile(out+'/state.json',await page.evaluate(()=>render_game_to_text()));
 assert.deepEqual(errors,[]);
 const report={ok:true,scope:'Native Chrome IndexedDB and actual companion owner; controlled delayed/error persistence; no 3D/world or hosted-service acceptance',checks,pageErrors:errors};
 await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
} catch(error){await writeFile(out+'/report.json',JSON.stringify({ok:false,checks,pageErrors:errors,error:error.message},null,2));throw error;}
finally{if(owned)await closeOwnedBrowser(owned);await server.close();}
