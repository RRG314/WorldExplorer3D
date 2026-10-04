import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const directory=process.env.WE3D_BACKPACK_OUTPUT || 'output/verification/architecture-polish/backpack-presentation';
await mkdir(directory,{recursive:true});
const productHtml=await readFile('app/index.html','utf8');
const markup=productHtml.match(/<aside id="urbanEquipment"[\s\S]*?<\/aside>/)?.[0];assert.ok(markup);
const server=await startStaticServer({rootDir:process.cwd(),ports:[4397,4398]});let browser;
const report={scope:'Actual equipment model/runtime and product DOM/CSS in a disposable component browser; not assembled-world acceptance',errors:[]};
try {
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1365,height:1000}});
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.route('**/backpack-presentation-fixture',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Backpack history presentation</title><style>@layer legacy, interface;</style><link rel="stylesheet" href="/app/styles/runtime-shell.css"><link rel="stylesheet" href="/app/styles/interface-v4.css"><link rel="stylesheet" href="/app/styles/discovery.css"><link rel="stylesheet" href="/app/styles/accessibility.css"><body style="background:#13212c">${markup}<button id="toggle">Backpack</button><div id="reticle"></div>`}));
  await page.goto(`http://127.0.0.1:${server.port}/backpack-presentation-fixture`);
  report.setup=await page.evaluate(async()=>{
    const {createEquipmentInventory}=await import('/app/js/urban-sandbox/equipment-model.js');
    const {createUrbanEquipmentRuntime}=await import('/app/js/urban-sandbox/equipment-runtime.js');
    const {createLocalBackpackStore,BACKPACK_STORAGE_KEY,BACKPACK_CONTROLS_KEY}=await import('/app/js/player/backpack-store.js?v=2');
    const {ctx}=await import('/app/js/shared-context.js?v=55');
    const inventory=createEquipmentInventory();
    const store=createLocalBackpackStore();
    if(!store.save(inventory.exportState()))throw Error('Disposable base inventory did not save');
    const fullSave=localStorage.getItem(BACKPACK_STORAGE_KEY);
    inventory.registerDefinitions([{id:'specimen',category:'specimen',label:'Field specimen',verbs:['inspect']}]);
    for(let i=0;i<50000;i++)inventory.upsertItem({instanceId:`history:${String(i).padStart(6,'0')}`,catalogId:'specimen',sourceEventId:`event:${i}`},{silent:true});
    inventory.equip('pulse-sidearm');inventory.prepareUse(1000);
    if(!store.saveControls(inventory.exportControls()))throw Error('Equipment controls did not save');
    if(localStorage.getItem(BACKPACK_STORAGE_KEY)!==fullSave)throw Error('Equipment use rewrote the complete inventory');
    const recovered=createEquipmentInventory({persistedState:createLocalBackpackStore().load()});
    if(recovered.item('pulse-sidearm').magazine!==11)throw Error('Ammunition update did not survive reload');
    const id=name=>document.getElementById(name);
    window.state={equipment:{...inventory,snapshot(){throw Error('Presentation requested a full inventory snapshot');}},equipmentOpen:false,mobile:false,backpackFilter:'all',backpackSelectedId:'',npcs:[],
      equipmentUi:{root:id('urbanEquipment'),toggle:id('toggle'),slots:id('urbanEquipmentSlots'),contents:id('urbanBackpackContents'),filters:id('urbanBackpackFilters'),detail:id('urbanBackpackDetail'),status:id('urbanEquipmentStatus'),reticle:id('reticle')}};
    ctx.Walk={state:{mode:'walk',walker:{speedMph:0}}};
    window.runtime=createUrbanEquipmentRuntime({state,isActive:()=>true,setStatus:()=>{}});
    const started=performance.now();for(let i=0;i<1000;i++)runtime.render();const closedRenderMs=performance.now()-started;
    if(state.equipmentUi.contents.childElementCount||state.equipmentUi.slots.childElementCount)throw Error('Closed Backpack built hidden item DOM');
    const opened=performance.now();runtime.toggle(true);const openMs=performance.now()-opened;
    state.equipmentUi.contents.addEventListener('click',event=>{const paging=event.target.closest('[data-backpack-page]');if(paging){runtime.changePage(paging.dataset.backpackPage);return;}const item=event.target.closest('[data-equipment-id]');if(item)runtime.inspectItem(item.dataset.equipmentId);});
    state.equipmentUi.filters.addEventListener('click',event=>{const button=event.target.closest('[data-backpack-filter]');if(button)runtime.setFilter(button.dataset.backpackFilter);});
    return {count:inventory.summary().count,closedRenderMs,openMs,visibleItems:state.equipmentUi.contents.querySelectorAll('[data-equipment-id]').length,
      controlsBytes:localStorage.getItem(BACKPACK_CONTROLS_KEY).length,controlsReloaded:true,fullInventoryNotRewritten:true};
  });
  assert.equal(report.setup.visibleItems,48);assert.ok(report.setup.count>=50000);
  await page.locator('[data-backpack-filter="specimen"]').click();
  const first=page.locator('#urbanBackpackContents [data-equipment-id]').first();const firstId=await first.getAttribute('data-equipment-id');
  await first.focus();await first.click();assert.equal(await page.evaluate(()=>document.activeElement?.dataset.equipmentId),firstId);
  await page.locator('[data-backpack-page="next"]').click();assert.notEqual(await first.getAttribute('data-equipment-id'),firstId);
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset.backpackPage),'next');
  await page.locator('[data-backpack-page="previous"]').click();assert.equal(await first.getAttribute('data-equipment-id'),firstId);
  await page.locator('[data-backpack-filter="gear"]').click();assert.equal(await page.locator('.urbanBackpackPages').count(),0);
  await page.locator('[data-backpack-filter="specimen"]').click();
  await page.screenshot({path:`${directory}/desktop.png`});
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{state.mobile=true;runtime.render();});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`${directory}/phone-viewport.png`});
  assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.error=error.stack;throw error;}
finally{await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));await browser?.close();await server.close();}
console.log(JSON.stringify(report));
