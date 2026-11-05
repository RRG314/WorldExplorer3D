import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createFieldworkQaSession} from './fieldwork-qa-session.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
const output=path.resolve(`output/verification/player-journey-20261105/home-${Date.now()}`),base=new URL('/app/',process.env.WE3D_VERIFY_BASE_URL||'http://127.0.0.1:4192').href;
const backupFile=process.env.WE3D_HOME_BACKUP_FILE,immutable=process.env.WE3D_REQUIRE_IMMUTABLE==='1';
const savedEnvelope=backupFile?JSON.parse(await fs.readFile(backupFile,'utf8')):null;
const qa=await createFieldworkQaSession({output,maximumDurationMs:440000}),{page,report}=qa;
async function ready(){await page.waitForFunction(()=>__homeCtx.gameStarted&&!__homeCtx.worldLoading&&!__homeCtx.titleLaunchPending&&__homeCtx.initialEarthWorldReady&&!__homeCtx.onMoon,null,{timeout:180000});}
async function journey(){await page.locator('#explorerGameMenuBtn').click();await page.locator('#explorerGameMenu [data-open-player-journey]').click();await page.waitForFunction(()=>document.querySelector('#playerJourney')?.getAttribute('aria-busy')==='false');}
async function exportHome(name){
 const envelope=await page.evaluate(async keys=>{
  const exported=await __homeCtx.discoveryProfileStore.exportData({ownerUid:''}),{receiptOutbox=[],...journal}=exported;delete journal.exportedAt;
  return {schemaVersion:1,ownerUid:'',journal,receiptOutbox,deviceState:{backpack:__homeCtx.playerBackpackStore.load(),local:Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)]))}};
 },Object.keys(savedEnvelope?.deviceState.local||{}));
 await fs.writeFile(path.join(output,name),JSON.stringify(envelope)+'\n',{mode:0o600});
}
async function nativeSnapshot(){return page.evaluate(()=>({walker:{x:__homeCtx.Walk.state.walker.x,y:__homeCtx.Walk.state.walker.y,z:__homeCtx.Walk.state.walker.z},paused:__homeCtx.paused}));}

try{
 if(immutable){const manifest=JSON.parse(await fs.readFile(path.join(process.env.WE3D_VERIFY_ROOT,'build-manifest.json'),'utf8'));report.buildId=manifest.buildId;}
 report.scope='Original mapped personal purchase and newly changed home interior/cross-environment return. Current-city performance and accepted field methods are not replayed.';
 await configureStagingAppCheck(page,base,{proxyGeospatial:false});
 await page.goto(base);await page.locator('#playerEntryScreen').waitFor({state:'visible',timeout:90000});
 await page.evaluate(async()=>window.__homeCtx=(await import((globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix||document.documentElement.dataset.runtimeModulePrefix||'')+'/app/js/shared-context.js?v=55')).ctx);
 await page.waitForFunction(()=>__homeCtx.canStartPlayerJourney?.()===true);
 if(backupFile){
  const envelope=savedEnvelope;
  if(immutable){await page.evaluate(async envelope=>{await __homeCtx.playerBackpackStore.ready;if(!__homeCtx.playerBackpackStore.restoreJourneySnapshot(envelope.deviceState.backpack))throw Error('The original possessions owner rejected the accepted fixture.');await __homeCtx.discoveryProfileStore.importData(envelope.journal);},envelope);}else await page.evaluate(async envelope=>{const {createJourneyRestoreOwner}=await import('/app/js/player/journey-snapshot.js');await createJourneyRestoreOwner({store:__homeCtx.discoveryProfileStore,backpackStore:__homeCtx.playerBackpackStore,writeBinding:()=>{},reload:()=>{}}).restore(envelope,null);},envelope);
  await page.reload();await page.locator('#playerEntryScreen').waitFor({state:'visible',timeout:90000});await page.evaluate(async()=>window.__homeCtx=(await import((globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix||document.documentElement.dataset.runtimeModulePrefix||'')+'/app/js/shared-context.js?v=55')).ctx);await page.waitForFunction(()=>__homeCtx.canStartPlayerJourney?.()===true);
 }else{
  await page.locator('#playerEntryScreen [data-entry=explore]').first().click();await page.evaluate(()=>__homeCtx.globeSelector.setSelection(39.2904,-76.6122,{name:'Baltimore',focus:false}));
  await page.locator('#globeSelectorStartBtn').click();await ready();await journey();await page.locator('#playerJourney [data-journey=homes]').click();
  const offers=await page.evaluate(async()=>{const {personalHomeOffers}=await import('/app/js/game/property-ui.js?v=10');return personalHomeOffers().map(h=>({id:h.id,price:h.price}));});assert.ok(offers.length);
  const id=offers[0].id;await page.locator(`[data-journey-visit="${id}"]`).click();await page.waitForFunction(()=>document.querySelector('#playerJourney')?.getAttribute('aria-busy')==='false');
  const before=await page.evaluate(()=>__homeCtx.explorerHousing.snapshot());await page.locator(`[data-journey-buy="${id}"]`).click();await page.waitForFunction(()=>document.querySelector('#playerJourney')?.getAttribute('aria-busy')==='false');
  const after=await page.evaluate(()=>__homeCtx.explorerHousing.snapshot());assert.equal(after.homes.length,before.homes.length+1);assert.equal(after.credits,before.credits-offers[0].price);
  report.purchase={id,price:offers[0].price,chargedOnce:true};await exportHome('purchased-home-envelope.json');console.log('Mapped home purchase exported');
  await page.locator('#playerJourney [data-journey=return-home]').click();await page.waitForFunction(()=>!document.querySelector('#playerJourney')?.open||document.querySelector('#playerJourney')?.getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('#playerJourney').evaluate(el=>el.open),false,await page.locator('.journey-status').textContent());
  assert.equal(await page.evaluate(()=>!!__homeCtx.activeInterior),true);await page.screenshot({path:path.join(output,'owned-home-interior.png')});console.log('Native home interior entered');
  await page.locator('#explorerGameMenuBtn').click();await page.locator('#explorerGameMenu [data-explorer-target=mainMenuBtn]').click();await page.locator('#globeSelectorBackBtn').click();
 }
 if(process.env.WE3D_HOME_VISUAL_ONLY==='1'){
  await page.locator('#playerEntryScreen [data-entry=explore]').first().click();await page.evaluate(()=>__homeCtx.globeSelector.setSelection(39.2904,-76.6122,{name:'Baltimore',focus:false}));await page.locator('#globeSelectorStartBtn').click();await ready();await journey();await page.locator('#playerJourney [data-journey=return-home]').click();
  await page.waitForFunction(()=>__homeCtx.activeInterior||document.querySelector('#playerJourney')?.open&&document.querySelector('#playerJourney')?.getAttribute('aria-busy')==='false',null,{timeout:30000});
  assert.equal(await page.locator('#playerJourney').evaluate(el=>el.open),false,await page.locator('.journey-status').textContent());
  await page.waitForTimeout(900);await page.screenshot({path:path.join(output,'fitted-owned-home.png')});
  report.interior=await page.evaluate(()=>({fitted:__homeCtx.activeInterior.group.userData.fittedHomeFurniture,wholeHouse:!!__homeCtx.activeInterior.curatedHomeFurnishing,colliders:__homeCtx.activeInterior.dynamicColliders?.length,canonicalBuilding:__homeCtx.buildings.includes(__homeCtx.activeInterior.support.building),walker:{...__homeCtx.Walk.state.walker},camera:__homeCtx.camera.position.toArray()}));
  assert.equal(report.interior.fitted,true);assert.equal(report.interior.wholeHouse,false);assert.equal(report.interior.canonicalBuilding,true);
  const before=await nativeSnapshot();await page.keyboard.down('w');await page.waitForTimeout(800);await page.keyboard.up('w');const after=await nativeSnapshot();report.movement={before:before.walker,after:after.walker};assert.ok(Math.hypot(after.walker.x-before.walker.x,after.walker.z-before.walker.z)>.15);
  await page.screenshot({path:path.join(output,'fitted-home-walking.png')});await page.keyboard.press('e');await page.waitForFunction(()=>!__homeCtx.activeInterior);await exportHome('accepted-home-envelope.json');await qa.succeed();
 }else{
 await page.locator('#playerEntryScreen [data-entry-world=moon]').click();
 await page.waitForFunction(()=>__homeCtx.gameStarted&&!__homeCtx.titleLaunchPending&&__homeCtx.onMoon,null,{timeout:150000});
 await journey();await page.locator('#playerJourney [data-journey=return-home]').click();await page.waitForFunction(()=>__homeCtx.activeInterior||document.querySelector('#playerJourney')?.open&&document.querySelector('#playerJourney')?.getAttribute('aria-busy')==='false',null,{timeout:180000});
 assert.equal(await page.locator('#playerJourney').evaluate(el=>el.open),false,await page.locator('.journey-status').textContent());await ready();
 report.returnFromMoon=await page.evaluate(()=>({onMoon:__homeCtx.onMoon,environment:__homeCtx.getEnv(),interior:!!__homeCtx.activeInterior,label:__homeCtx.activeInterior?.label||__homeCtx.activeInterior?.definition?.label,home:__homeCtx.explorerHousing.snapshot().primaryHome.id}));
 assert.equal(report.returnFromMoon.interior,true);assert.equal(report.returnFromMoon.onMoon,false);
 await page.screenshot({path:path.join(output,'moon-return-to-home.png')});await exportHome('returned-home-envelope.json');await qa.succeed();
 }
}catch(error){await qa.fail(error);process.exitCode=1;}finally{await qa.close();}
