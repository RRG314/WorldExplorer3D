import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {stagingCaptureAttestation} from './staging-capture-attestation.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const privateDir=await fs.mkdtemp(path.join(tmpdir(),'we3d-backup-ui-'));
let identity;
const server=await startStaticServer({rootDir:process.cwd(),ports:[4396]});
const browser=await chromium.launch({channel:'chrome',headless:true});
const dir='output/verification/product-plan';
await fs.mkdir(dir,{recursive:true});
const report={scope:'Actual app backup download, damaged/cancelled restore, confirmed restore/reload and Undo; disposable browser profile, controlled local marker',errors:[]};
try {
 identity=await stagingCaptureAttestation();
 const credential=path.join(privateDir,'attestation.json');
 await fs.writeFile(credential,JSON.stringify({projectId:'we3d-staging-20260712',appId:'1:524178734996:web:f59acbc9014f0e26f51981',expiresAt:new Date(Date.now()+600000).toISOString(),token:identity.token}),{mode:0o600});
 process.env.WE3D_STAGING_APP_CHECK_FILE=credential;
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await configureStagingAppCheck(page,`http://127.0.0.1:${server.port}`);
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',async msg=>{if(msg.text().startsWith('[WorldLoad] Essential Earth gameplay')){report.startupStack=await msg.args()[1]?.evaluate(e=>e?.stack);}});
 async function openBackup(){
  if(await page.locator('#landingPrimaryCta').isVisible())await page.locator('#landingPrimaryCta').click();
  await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__===true,null,{timeout:90000});
  if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
  await page.locator('#globeSelectorStartBtn').click();
  await page.evaluate(async()=>{window.backupUiCtx=(await import('/app/js/shared-context.js?v=55')).ctx;});
  try {await page.waitForFunction(()=>typeof backupUiCtx.openWorldDiscoverySection==='function' || backupUiCtx.worldLoadRuntimeState?.status==='failed',null,{timeout:45000});}
  catch(error){
   report.startup=await page.evaluate(()=>({gameStarted:backupUiCtx.gameStarted,worldLoading:backupUiCtx.worldLoading,ready:backupUiCtx.initialEarthWorldReady,environment:backupUiCtx.getEnv?.(),publication:!!backupUiCtx.worldPublication,loadingText:document.getElementById('loading')?.innerText}));
   await page.screenshot({path:`${dir}/backup-startup-failure.png`});throw error;
  }
  const startupFailure=await page.evaluate(()=>backupUiCtx.worldLoadRuntimeState?.gameplayRuntimeError || backupUiCtx.worldLoadRuntimeState?.firstRenderError || null);
  if(startupFailure)throw Error(`Earth startup failed: ${startupFailure}`);
  await page.evaluate(()=>backupUiCtx.openWorldDiscoverySection('profile')); 
  await page.locator('#discoveryExportBtn').waitFor({state:'attached'});
  await page.locator('details.discoveryOnlineService').evaluate(el=>{el.open=true});
 }
 async function marker(value){return page.evaluate(async value=>{
  const {createIndexedDbDiscoveryProfileStore}=await import('/app/js/discovery/profile-store.js?v=5');
  const store=createIndexedDbDiscoveryProfileStore();
  if(value)await store.saveProfile(p=>({...p,tutorials:{...p.tutorials,backupUiMarker:value}}));
  return (await store.getProfile()).tutorials.backupUiMarker;
 },value);}
 await page.goto(`http://127.0.0.1:${server.port}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=walking`,{waitUntil:'load'});
 await openBackup();
 await marker('before-download');
 let download;try{[download]=await Promise.all([page.waitForEvent('download'),page.locator('#discoveryExportBtn').click({timeout:10000})]);}catch(error){report.backupStatus=await page.locator('#discoveryBackupStatus').innerText();await page.screenshot({path:`${dir}/backup-download-failure.png`});throw error;}const backup=JSON.parse(await fs.readFile(await download.path(),'utf8'));
 assert.equal(backup.profile.tutorials.backupUiMarker,'before-download');report.download=true;
 await marker('before-restore');
 const upload=data=>page.locator('#discoveryImportFile').setInputFiles({name:'journal.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
 page.once('dialog',dialog=>dialog.accept());await upload({...backup,items:[{}]});
 await page.waitForFunction(()=>/damaged/.test(document.querySelector('#discoveryBackupStatus').textContent));
 assert.equal(await marker(),'before-restore');report.damagedPreserved=true;
 page.once('dialog',dialog=>dialog.dismiss());await upload(backup);await page.waitForTimeout(200);
 assert.equal(await marker(),'before-restore');report.cancelPreserved=true;
 page.once('dialog',dialog=>dialog.accept());
 await Promise.all([page.waitForEvent('load'),upload(backup)]);
 await openBackup();assert.equal(await marker(),'before-download');report.restoreReload=true;
 page.once('dialog',dialog=>dialog.accept());
 await Promise.all([page.waitForEvent('load'),page.locator('#discoveryUndoImportBtn').click()]);
 await openBackup();assert.equal(await marker(),'before-restore');report.undoReload=true;
 page.once('dialog',dialog=>dialog.accept());await page.locator('#discoveryUndoImportBtn').click();
 await page.waitForFunction(()=>/no Journal restore/.test(document.querySelector('#discoveryBackupStatus').textContent));
 await page.locator('#discoverySaveStatus').scrollIntoViewIfNeeded();
 await page.screenshot({path:`${dir}/backup-ui-desktop.png`});
 await page.setViewportSize({width:390,height:844});await page.locator('#discoverySaveStatus').scrollIntoViewIfNeeded();await page.screenshot({path:`${dir}/backup-ui-phone.png`});
 assert.deepEqual(report.errors,[]);report.passed=true;
}finally{await fs.writeFile(`${dir}/backup-ui.json`,JSON.stringify(report,null,2));await browser.close();await server.close();await identity?.cleanup();await fs.rm(privateDir,{recursive:true,force:true});}
console.log(JSON.stringify(report));
