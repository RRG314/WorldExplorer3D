// Real browser storage/Web Locks, actual client and server domain modules.
// Only Firebase identity/transport and transactional persistence are controlled.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
const {settleCommerceTransaction,settleCommerceOutcome}=createRequire(import.meta.url)('../../functions/economy-authority.js');
const out='output/architecture-consolidation/2026-10-13/commerce-browser';
await fs.mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4595,4596]});
const cloud=new Map(),calls=[],checks=[],errors=[];
let owned,browser,drop=true;
const ref=id=>({id,get:async()=>({exists:cloud.has(id),data:()=>cloud.get(id)})});
const runTransaction=async callback=>callback({get:r=>r.get(),set:(r,v)=>cloud.set(r.id,v)});
const module=body=>({contentType:'application/javascript',body});
try {
 owned=await chromium.launchServer({channel:'chrome',headless:true});browser=await chromium.connect(owned.wsEndpoint());
 const context=await browser.newContext();
 await context.route('**/js/auth-ui.js*',route=>route.fulfill(module(`export const getCurrentUser=()=>({uid:window.fixtureAccount||'account-a'});export const getCurrentUserToken=async()=> 'fixture-token';`)));
 await context.route('**/js/firebase-init.js*',route=>route.fulfill(module(`export const initFirebase=()=>({db:{}});export const readFirebaseConfig=()=>({projectId:'fixture-project'});export const getFirebaseAppCheckToken=async()=> 'fixture-check';`)));
 await context.route('https://www.gstatic.com/firebasejs/**/firebase-firestore.js',route=>route.fulfill(module(`export const doc=(_db,...parts)=>parts.join('/');export const onSnapshot=()=>()=>{};`)));
 await context.route('**/commitExplorerCommerceAction',async route=>{
  const input=route.request().postDataJSON();calls.push(input);
  const result=await settleCommerceTransaction({runTransaction,walletRef:ref('wallet'),receiptRef:ref(input.requestId),itemRef:ref(input.catalogId),stockRef:ref(input.dayKey+input.storeId+input.catalogId),timestampFromMs:ms=>ms,uid:'account-a',input,nowMs:Date.now()});
  if(drop){drop=false;await route.abort('connectionreset');}else await route.fulfill({json:result});
 });
 await context.route('**/settleExplorerCommerceOutcome',async route=>{
  const input=route.request().postDataJSON();const result=await settleCommerceOutcome({runTransaction,walletRef:ref('wallet'),receiptRef:ref(input.requestId),timestampFromMs:ms=>ms,input});await route.fulfill({json:result});
 });
 const html=`<!doctype html><title>Commerce recovery integration</title><style>body{font:18px system-ui;padding:32px;background:#122027;color:#eef4f6}button{font:inherit;padding:12px;margin:8px}pre{white-space:pre-wrap}</style><h1>Commerce recovery integration</h1><p>Actual wallet, Backpack and receipt modules. Disposable accounts and controlled services.</p><button id="buy">Buy trail supplies</button><button id="recover">Recover pending purchase</button><pre id="result">Loading…</pre><script type="module">
 import {createConnectedExplorerWallet} from '/app/js/economy/connected-wallet-authority.js';
 import {createEquipmentInventory} from '/app/js/urban-sandbox/equipment-model.js';
 import {createLocalBackpackStore} from '/app/js/player/backpack-store.js';
 import {createLocalCommerceModel,mappedCommercePlaces} from '/app/js/urban-sandbox/commerce-model.js';
 const f=window.commerceFixture={};f.backpack=createLocalBackpackStore();const persisted=f.backpack.load();await f.backpack.ready;
 f.inventory=createEquipmentInventory({persistedState:persisted});f.wallet=createConnectedExplorerWallet();
 f.model=createLocalCommerceModel({inventory:f.inventory,backpackStore:f.backpack,transactionAuthority:f.wallet});
 f.store=mappedCommercePlaces([{type:'shop=convenience',sourceFeatureId:'node:20',sourceElementType:'node',sourceElementId:'20',name:'Corner store',x:0,z:0,tags:{shop:'convenience'}}])[0];
 f.item=f.model.snapshot(f.store).standard.find(item=>item.id==='route-snack');
 f.state=()=>({saveStatus:f.backpack.saveStatus(),result:f.result,items:f.inventory.snapshot().items.filter(item=>item.metadata?.explorerWalletItem).map(item=>({id:item.catalogId,quantity:item.quantity}))});
 f.render=()=>document.querySelector('#result').textContent=JSON.stringify(f.state(),null,2);
 document.querySelector('#buy').onclick=async()=>{f.result=await f.model.buy(f.store,f.item.id);f.render();};
 document.querySelector('#recover').onclick=async()=>{f.result=await f.model.recoverPending();f.render();};
 window.render_game_to_text=()=>JSON.stringify(f.state());f.ready=true;f.render();
 </script>`;
 await context.route('**/__commerce-recovery',route=>route.fulfill({contentType:'text/html',body:html}));
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const url=`http://127.0.0.1:${server.port}/__commerce-recovery`;
 await page.goto(url);await page.waitForFunction(()=>window.commerceFixture?.ready);
 // Use the skill's exact mouse/keyboard choreography on the real purchase button.
 await runPrescribedGameActions(page,out,[{buttons:['left_mouse_button'],frames:1,mouse_x:40,mouse_y:20},{buttons:[],frames:3}],'#buy');
 await page.waitForFunction(()=>commerceFixture.result);
 assert.equal((await page.evaluate(()=>commerceFixture.result)).reason,'commerce_recovery_required');
 assert.equal(calls.length,1);assert.equal(cloud.get('wallet').credits,999994);
 checks.push('Dropped server reply leaves one durable request and one charge');
 await page.reload();await page.waitForFunction(()=>window.commerceFixture?.ready);
 await page.locator('#recover').click();await page.waitForFunction(()=>commerceFixture.result);
 assert.deepEqual(await page.evaluate(()=>commerceFixture.result),{recovered:1,remaining:0});
 assert.equal(calls.length,2);assert.equal(calls[0].requestId,calls[1].requestId);
 assert.equal(await page.evaluate(()=>commerceFixture.inventory.item('route-snack').quantity),1);
 assert.equal(cloud.get('wallet').credits,999994);
 checks.push('Page reload recovers the original request and exactly one item');
 const other=await context.newPage();other.on('pageerror',e=>errors.push(e.message));await other.goto(url);await other.waitForFunction(()=>window.commerceFixture?.ready);
 await other.locator('#buy').click();await other.waitForFunction(()=>commerceFixture.result);
 assert.equal((await other.evaluate(()=>commerceFixture.result)).reason,'save_failed');assert.equal(calls.length,2);
 await other.close();checks.push('Second browser tab cannot charge while another tab owns possessions');
 await page.locator('#buy').click();await page.waitForFunction(()=>commerceFixture.result?.ok);
 assert.equal(calls.length,3);assert.notEqual(calls[2].requestId,calls[1].requestId);
 assert.equal(await page.evaluate(()=>commerceFixture.inventory.item('route-snack').quantity),2);
 checks.push('Next deliberate purchase uses a new request after recovery completes');
 await page.screenshot({path:out+'/commerce-recovery.png'});
 await fs.writeFile(out+'/state.json',await page.evaluate(()=>render_game_to_text()));
 assert.deepEqual(errors,[]);
 const report={ok:true,scope:'Chrome native Web Locks/localStorage; actual client and server modules; controlled Firebase boundaries, not live commerce acceptance',checks,pageErrors:errors};
 await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
} catch(error) {await fs.writeFile(out+'/report.json',JSON.stringify({ok:false,checks,pageErrors:errors,error:error.message},null,2));throw error;}
finally {if(owned)await closeOwnedBrowser(owned);await server.close();}
