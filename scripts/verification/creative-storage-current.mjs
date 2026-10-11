import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
import {collectBrowserGraphicsErrors} from './browser-graphics-errors.mjs';
const dir=process.env.WE3D_CREATIVE_OUTPUT||'output/verification/creative-storage-current';await mkdir(dir,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4487]});let browser;
const report={passed:false,scope:'Actual Chromium storage, builder DOM, Three geometry and collision in an isolated controlled scene; not mapped-city or terrain-editing acceptance',cases:[],errors:[]};
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 collectBrowserGraphicsErrors(page,report.errors);
 page.on('dialog',dialog=>dialog.accept());
 const markup=(await readFile('app/index.html','utf8')).match(/<aside id="blockBuilderPanel"[\s\S]*?<\/aside>/)?.[0];assert.ok(markup);
 await page.route('**/__creative_storage_fixture',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><title>Creative storage verification</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/app/styles/block-builder.css"><style>body{margin:0;background:#132330;color:white;font:14px Arial}</style><script src="/app/vendor/three/build/three.min.js"></script>${markup}`}));
 await page.goto(`http://127.0.0.1:${server.port}/__creative_storage_fixture`);
 report.cases=await page.evaluate(async()=>{
  const {createLocalWorldModificationStore,PRIMARY_KEY,BACKUP_KEY}=await import('/app/js/editable-world/local-store.js');
  const checks=[],expect=(ok,id)=>{if(!ok)throw Error(id);checks.push({id,passed:true});};
  const op=id=>({action:'suppress_base_building',suppression:{sourceFeatureId:id}});let failKey='';
  const storage={getItem:k=>localStorage.getItem(k),removeItem:k=>localStorage.removeItem(k),setItem(k,v){if(k===failKey)throw Error('controlled browser write failure');localStorage.setItem(k,v);}};
  const open=()=>{const s=createLocalWorldModificationStore({storage});s.initialize();return s;};
  let s=open(),stale=open();expect(s.commit('home',op('osm:1')).committed,'first-edit-commits');
  expect(stale.commit('home',op('osm:2')).reason==='storage-conflict','stale-tab-cannot-replace-edit');
  failKey=BACKUP_KEY;expect(s.commit('home',op('osm:3')).committed&&open().isBuildingSuppressed('home','osm:3'),'backup-failure-retains-successful-primary');
  failKey=PRIMARY_KEY;expect(!s.commit('home',op('osm:4')).committed&&!open().isBuildingSuppressed('home','osm:4'),'primary-failure-retains-previous-world');failKey='';
  for(let i=1;i<24;i++){if(!s.commit(`area:${i}`,op(`osm:${i}`)).committed)throw Error(`area ${i}`);}
  expect(s.commit('area:24',op('osm:24')).reason==='world-limit','new-area-limit-does-not-evict');
  s=open();expect(s.status().worldCount===24&&s.isBuildingSuppressed('home','osm:1')&&s.isBuildingSuppressed('area:23','osm:23'),'reload-retains-first-and-last-areas');
  const future=JSON.stringify({schemaVersion:2,worlds:{home:{futureField:'keep'}}});localStorage.setItem(PRIMARY_KEY,future);s=open();
  expect(!s.status().enabled&&!s.commit('home',op('osm:5')).committed&&localStorage.getItem(PRIMARY_KEY)===future,'newer-primary-preserved-without-downgrade');
  const rawBackup=localStorage.getItem(BACKUP_KEY),malformed=JSON.parse(rawBackup);malformed.worlds.home.objects=[{id:'unsupported-original',type:'future-tree',important:'preserve'}];
  const original=JSON.stringify(malformed);localStorage.setItem(PRIMARY_KEY,original);s=open();
  expect(!s.status().enabled&&!s.commit('home',op('osm:6')).committed&&JSON.parse(s.exportRecovery()).primary===original,'malformed-nested-creations-retained-byte-for-byte');
  localStorage.removeItem(PRIMARY_KEY);localStorage.setItem(BACKUP_KEY,'{unreadable-only-backup');s=open();
  expect(!s.status().enabled&&!s.commit('home',op('osm:7')).committed&&JSON.parse(s.exportRecovery()).backup==='{unreadable-only-backup','unreadable-only-backup-cannot-be-overwritten');
  localStorage.setItem(PRIMARY_KEY,original);localStorage.setItem(BACKUP_KEY,rawBackup);
  return checks;
 });
 async function mountBuilder(){await page.evaluate(async()=>{
  const {ctx}=await import('/app/js/shared-context.js?v=55');window.creativeCtx=ctx;ctx.LOC={lat:39.3,lon:-76.6};
  ctx.SCALE=111320;ctx.getEnv=()=> 'EARTH';ctx.gameStarted=true;ctx.car={x:0,y:0,z:0};ctx.scene=new THREE.Scene();
  ctx.scene.add(new THREE.AmbientLight(0xffffff,1));ctx.camera=new THREE.PerspectiveCamera(45,900/600,.1,100);ctx.camera.position.set(10,7,14);ctx.camera.lookAt(4,0,6);
  ctx.renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});ctx.renderer.setSize(900,600);ctx.renderer.setClearColor(0x203345);document.body.append(ctx.renderer.domElement);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:0x65745f}));floor.rotation.x=-Math.PI/2;ctx.scene.add(floor);
  const building=new THREE.Mesh(new THREE.BoxGeometry(2,4,2),new THREE.MeshStandardMaterial({color:0x9b8a75}));building.position.set(-2,2,0);building.userData.sourceBuildingId='fixture:building';ctx.scene.add(building);
  ctx.buildingMeshes=[building];ctx.buildings=[{sourceBuildingId:'fixture:building',name:'Saved building',minX:-3,maxX:-1,minZ:-1,maxZ:1}];
  const {initEditableWorldRuntime}=await import('/app/js/editable-world/runtime.js?v=4');initEditableWorldRuntime(ctx);
  await import('/app/js/blocks.js');
  const {syncBlockBuilderUi}=await import('/app/js/block-builder/ui.js');syncBlockBuilderUi({enabled:true,shared:false,count:0,maxCount:500});
  ctx.toggleBlockBuildMode(true);ctx.refreshBlockBuilderForCurrentLocation();ctx.renderer.render(ctx.scene,ctx.camera);
  window.advanceTime=()=>ctx.renderer.render(ctx.scene,ctx.camera);window.render_game_to_text=()=>JSON.stringify({blocks:ctx.getBlockBuilderSnapshot(),storage:ctx.getBuildPersistenceStatus()});
 });}
 await mountBuilder();
 assert.equal(await page.locator('#editableWorldSaveNotice').isVisible(),true);
 const downloadEvent=page.waitForEvent('download');await page.locator('#editableWorldRecovery').click();const download=await downloadEvent;
 const file=`${dir}/building-edits-recovery.json`;await download.saveAs(file);const exported=JSON.parse(await readFile(file,'utf8'));
 const saved=await page.evaluate(()=>({primary:localStorage.getItem('worldExplorer3D.worldModifications.v1'),backup:localStorage.getItem('worldExplorer3D.worldModifications.backup.v1')}));
 assert.equal(exported.primary,saved.primary);assert.equal(exported.backup,saved.backup);assert.ok(exported.primary.includes('unsupported-original'));
 await page.screenshot({path:`${dir}/recovery-ui.png`});report.cases.push({id:'actual-builder-recovery-button-downloads-unaltered-primary-and-backup',passed:true});
 assert.equal(await page.evaluate(()=>creativeCtx.placeBuildBlock(4,.5,6,2,{shape:'wall'})),true);
 assert.equal(await page.evaluate(()=>creativeCtx.getBuildCollisionAtWorldXZ(4,6,0,.1,1.8).blocked),true);
 assert.equal(await page.evaluate(()=>{
  const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='worldExplorer3D.buildBlocks.backup.v2'){Storage.prototype.setItem=original;throw Error('injected redundant backup failure');}return original.call(this,key,value);};
  return creativeCtx.placeBuildBlock(5,.5,6,2,{shape:'wall'});
 }),true);
 assert.equal(await page.evaluate(()=>creativeCtx.getBuildPersistenceStatus().backupAvailable),false);
 assert.equal(await page.evaluate(()=>creativeCtx.placeBuildBlock(6,.5,6,2,{shape:'wall'})),true);
 const blocksBefore=await page.evaluate(()=>localStorage.getItem('worldExplorer3D.buildBlocks.v2'));
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='worldExplorer3D.buildBlocks.v2'){Storage.prototype.setItem=original;throw Error('injected primary failure');}return original.call(this,key,value);};});
 await page.locator('#blockBuilderClear').click();
 assert.equal(await page.evaluate(()=>creativeCtx.getBuildPersistenceStatus().enabled),false);
 assert.equal(await page.evaluate(()=>localStorage.getItem('worldExplorer3D.buildBlocks.v2')),blocksBefore);
 assert.equal(await page.evaluate(()=>creativeCtx.getBuildCollisionAtWorldXZ(4,6,0,.1,1.8).blocked),true);
 const blockDownloadEvent=page.waitForEvent('download');await page.locator('#blockBuilderRecovery').click();const blockDownload=await blockDownloadEvent;
 await blockDownload.saveAs(`${dir}/blocks-recovery.json`);const blockCopy=JSON.parse(await readFile(`${dir}/blocks-recovery.json`,'utf8'));assert.equal(blockCopy.primary,blocksBefore);
 await page.evaluate(()=>creativeCtx.renderer.render(creativeCtx.scene,creativeCtx.camera));await page.screenshot({path:`${dir}/retained-blocks.png`});
 report.cases.push({id:'actual-block-render-collision-and-save-stay-aligned-through-primary-and-backup-failure',passed:true});
 report.cases.push({id:'actual-block-recovery-button-exports-original-saves',passed:true});
 await page.reload();await mountBuilder();
 assert.equal(await page.locator('#blockBuilderRecovery').isVisible(),false);
 assert.equal(await page.evaluate(()=>creativeCtx.getBuildCollisionAtWorldXZ(4,6,0,.1,1.8).blocked),true);
 await page.locator('#blockBuilderClear').click();assert.equal(await page.evaluate(()=>creativeCtx.getBuildTopSurfaceAtWorldXZ(4,6)),null);
 assert.deepEqual(JSON.parse(await page.evaluate(()=>localStorage.getItem('worldExplorer3D.buildBlocks.v2'))),[]);
 report.cases.push({id:'reload-restores-real-blocks-and-successful-clear-removes-render-collision-and-save-together',passed:true});
 // A fresh, valid mapped-edit database belongs only to this isolated fixture.
 // Exercise each UI action against actual owners, including a failed reset.
 await page.evaluate(()=>{localStorage.removeItem('worldExplorer3D.worldModifications.v1');localStorage.removeItem('worldExplorer3D.worldModifications.backup.v1');});
 await page.reload();await mountBuilder();
 assert.equal(await page.evaluate(()=>creativeCtx.placeBuildBlock(4,.5,6,2,{shape:'wall'})),true);
 await page.locator('#editableWorldSelectBuilding').click();await page.locator('#editableWorldSuppressBuilding').click();
 await page.waitForFunction(()=>creativeCtx.isLocalBuildingSuppressed('fixture:building'));
 assert.equal(await page.evaluate(()=>creativeCtx.buildingMeshes[0].visible),false);
 const resetBefore=await page.evaluate(()=>({mapped:localStorage.getItem('worldExplorer3D.worldModifications.v1'),blocks:localStorage.getItem('worldExplorer3D.buildBlocks.v2')}));
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='worldExplorer3D.worldModifications.v1'){Storage.prototype.setItem=original;throw Error('injected building reset failure');}return original.call(this,key,value);};});
 await page.locator('#editableWorldReset').click();
 assert.equal(await page.evaluate(()=>localStorage.getItem('worldExplorer3D.worldModifications.v1')),resetBefore.mapped);
 assert.equal(await page.evaluate(()=>creativeCtx.buildingMeshes[0].visible),false);
 assert.match(await page.locator('#blockBuilderStatus').innerText(),/could not/i);
 await page.locator('#editableWorldReset').click();
 await page.waitForFunction(()=>!creativeCtx.isLocalBuildingSuppressed('fixture:building'));
 assert.equal(await page.evaluate(()=>creativeCtx.buildingMeshes[0].visible),true);
 assert.equal(await page.evaluate(()=>localStorage.getItem('worldExplorer3D.buildBlocks.v2')),resetBefore.blocks);
 assert.equal(await page.evaluate(()=>creativeCtx.getBuildCollisionAtWorldXZ(4,6,0,.1,1.8).blocked),true);
 assert.equal(await page.locator('#blockBuilderStatus').innerText(),'Building edits reset.');
 report.cases.push({id:'building-reset-failure-retains-suppression-and-retry-resets-only-its-owned-edits',passed:true});
 // Older Earth rows intentionally stored null grid coordinates. They must
 // render from geography and remove by stable saved ID, including after reload.
 await page.evaluate(()=>{const key='worldExplorer3D.buildBlocks.v2',rows=JSON.parse(localStorage.getItem(key));rows[0].gx=null;rows[0].gz=null;const raw=JSON.stringify(rows);localStorage.setItem(key,raw);localStorage.setItem('worldExplorer3D.buildBlocks.backup.v2',raw);});
 await page.reload();await mountBuilder();
 assert.equal(await page.evaluate(()=>creativeCtx.getBuildPersistenceStatus().enabled),true);
 assert.equal(await page.evaluate(()=>creativeCtx.getBuildCollisionAtWorldXZ(4,6,0,.1,1.8).blocked),true);
 assert.equal(await page.evaluate(()=>creativeCtx.removeBuildBlock(4,.5,6)),true);
 assert.deepEqual(JSON.parse(await page.evaluate(()=>localStorage.getItem('worldExplorer3D.buildBlocks.v2'))),[]);
 await page.reload();await mountBuilder();
 assert.equal(await page.evaluate(()=>creativeCtx.getBuildTopSurfaceAtWorldXZ(4,6)),null);
 report.cases.push({id:'legacy-geographic-blocks-keep-position-and-actually-remove-from-save-across-reload',passed:true});
 await runPrescribedGameActions(page,dir,[{buttons:[],frames:3}],'canvas');
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;}
finally{await writeFile(`${dir}/browser.json`,JSON.stringify(report,null,2));await browser?.close();await server.close();}
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,failure:report.failure}));
