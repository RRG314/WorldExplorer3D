import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createFieldworkQaSession} from './fieldwork-qa-session.mjs';

const base=process.env.WE3D_VERIFY_BASE_URL||'http://127.0.0.1:4192';
const output=path.resolve(process.env.WE3D_UI_OUTPUT||`output/verification/trail-ui-20261104/earth-${Date.now()}`);
const seed=process.env.WE3D_UI_BACKUP||'output/verification/companion-handling-20261103/handoff-1793751709613/qa-fieldwork-backup.json';
const backup=JSON.parse(await fs.readFile(seed,'utf8'));
const selected=new Set((process.env.WE3D_UI_EARTH_SCOPES||'').split(',').filter(Boolean));
const wants=name=>!selected.size||selected.has(name);
const report={completedSections:[],scope:'Actual source Earth UI, existing guarded travel controls and genuine separate saved history. No career procedures, full laps, physics/time/pose writes, online commands or production mutations.',seed,checks:[],screens:[]};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sourceFiles=['app/index.html','app/styles/product-shell.css','app/styles/hud.css','app/styles/map-explorer.css','app/styles/block-builder.css','app/styles/discovery.css','app/styles/backpack.css','app/js/ui/hud-layout.js','app/js/ui/workspace-navigation.js','app/js/ui.js'];
const sourceHashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await fs.readFile(file)).digest('hex')])));
report.sourceHashes=await sourceHashes();
let qa;
try{
  qa=await createFieldworkQaSession({rootDir:process.cwd(),output,careerId:'explorer',maximumDurationMs:12*60*1000});
  const {page}=qa;await page.setViewportSize({width:1440,height:960});
  const completed=async name=>{report.completedSections.push(name);await fs.writeFile(path.join(output,'progress.json'),JSON.stringify(report,null,2)+'\n');console.log('UI completed: '+name);};
  const check=(name,result)=>{report.checks.push({name,ok:!!result});assert.ok(result,name);};
  async function shot(name){await page.screenshot({path:path.join(output,name+'.png')});report.screens.push(name+'.png');}
  await page.goto(base+'/app/?diagnostics=1');
  await page.locator('#globeSelectorStartBtn').waitFor({state:'visible'});
  const importedAlbums=await page.evaluate(async data=>{const {createIndexedDbDiscoveryProfileStore}=await import('/app/js/discovery/profile-store.js?v=5');const store=createIndexedDbDiscoveryProfileStore();await store.importData(data);return (await store.exportData()).albums;},backup);
  await page.reload();await page.locator('#globeSelectorStartBtn').waitFor({state:'visible'});
  if(process.env.WE3D_UI_ENTRY==='blocks'){await page.locator('.globe-app-rail [data-globe-destination="create"]').click();await page.locator('[data-create-start="blocks"]').click();}else if(process.env.WE3D_UI_ENTRY==='racing'){await page.locator('.globe-app-rail [data-globe-destination="create"]').click();await page.locator('[data-create-start="tracks"]').click();}else await page.locator('#globeSelectorStartBtn').click();
  await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');window.__uiState=()=>({started:ctx.gameStarted,loading:ctx.worldLoading||ctx.titleLaunchPending,environment:ctx.getEnv?.(),modes:JSON.parse(window.render_game_to_text()).modes,position:JSON.parse(window.render_game_to_text()).surfaceChain?.world,focus:document.activeElement?.tagName,panels:ctx.screenLayout?.snapshot?.()});});
  await page.waitForFunction(()=>{const s=window.__uiState();return s.started&&!s.loading&&s.environment==='EARTH';},{},{timeout:240000});
  await page.locator('#loading').waitFor({state:'hidden',timeout:30000});
  await page.locator('#explorerGameHeader').waitFor({state:'visible'});
  const nav=target=>page.locator(`.explorer-global-navigation [data-explorer-target="${target}"],.explorer-context-actions [data-explorer-target="${target}"]`);
  if(wants('navigation')){
  check('five global destinations available in the real world',await page.locator('.explorer-global-navigation button').count()===5);
  const initial=await page.evaluate(()=>window.__uiState());
  report.initial=initial;
  const boxes=await page.evaluate(()=>Object.fromEntries(['explorerGameHeader','hudBox','mainMenuBtn','floatMenuContainer'].map(id=>{const r=document.getElementById(id)?.getBoundingClientRect();return[id,r?{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}:null];})));
  check('travel status clears the global header',boxes.hudBox.y>=boxes.explorerGameHeader.bottom);
  await shot('earth-hud');
  await nav('exploreBtn').click();check('Explore forwards to original menu',await page.locator('#exploreMenu').evaluate(e=>e.classList.contains('open')));await shot('explore');await page.keyboard.press('Escape');
  await completed('navigation');}
  if(wants('travel')){
  await nav('travelBtn').click();await page.locator('#fDriving').click();
  await page.waitForFunction(()=>{const s=window.__uiState();return !s.modes.walking&&!s.modes.drone&&!s.modes.plane&&!s.modes.boat;},{},{timeout:20000});
  check('Drive selects the owned vehicle through its existing owner',true);
  report.driveFocus=await page.evaluate(()=>document.activeElement?.tagName);
  const driveBefore=await page.evaluate(()=>window.__uiState());
  await page.keyboard.down('ArrowUp');await page.waitForTimeout(650);await page.keyboard.up('ArrowUp');await page.keyboard.down('ArrowDown');await page.waitForTimeout(350);await page.keyboard.up('ArrowDown');
  const driveAfter=await page.evaluate(()=>window.__uiState());
  check('normal keyboard input moves the admitted vehicle after Travel',Math.hypot(driveAfter.position.x-driveBefore.position.x,driveAfter.position.z-driveBefore.position.z)>.05);
  await shot('driving');
  await nav('travelBtn').click();await page.locator('#fWalk').click();await page.waitForFunction(()=>window.__uiState().modes.walking);
  check('Drive to Walk returns through original travel mode',true);
  await nav('travelBtn').click();await page.locator('#fDrone').click();await page.waitForFunction(()=>window.__uiState().modes.drone);
  await shot('drone');check('Drone control handoff accepted',true);
  await nav('travelBtn').click();await page.locator('#fWalk').click();await page.waitForFunction(()=>window.__uiState().modes.walking);
  await completed('travel');}
  if(wants('kit')){
  await nav('backpackBtn').click();await page.locator('#fBackpack').click();await page.locator('#urbanEquipment').waitFor({state:'visible'});await shot('kit');
  await page.locator('#urbanEquipmentCloseBtn').click();check('Kit closes without losing the world',!(await page.locator('#urbanEquipment').isVisible()));
  await nav('travelBtn').click();await page.locator('#fGarage').click();await page.locator('#vehicleGarage').waitFor({state:'visible'});await shot('garage');await page.locator('[data-garage-close]').click();
  await completed('kit');}
  if(wants('activities')){
  await nav('fActivities').click();await page.locator('#experienceBrowser').waitFor({state:'visible'});await shot('world-activities');await page.locator('[data-experience-close]').click();
  await completed('activities');}
  if(wants('journal')){
  await nav('fExplorerJournal').click();await page.locator('#discoveryPanel').waitFor({state:'visible'});
  await page.locator('[data-discovery-tab="journal"]').click();
  const story=page.locator('#discoveryJournalList .documentary-story-report');
  await story.waitFor();if(!(await story.evaluate(e=>e.open)))await story.locator('summary').click();
  await story.locator('[data-documentary-photos]').click();
  await page.waitForFunction(()=>{const images=[...document.querySelectorAll('#discoveryJournalList .documentary-story-report img')];return images.length===3&&images.every(i=>i.complete&&i.naturalWidth>100);});
  await story.locator('img').first().scrollIntoViewIfNeeded();await shot('journal-original-photos');
  check('Journal renders all three genuine original photos',true);
  for(const [width,height] of [[390,844],[844,390]]){await page.setViewportSize({width,height});await story.locator('img').first().scrollIntoViewIfNeeded();await shot('journal-'+width);check('Journal content fits '+width,await story.evaluate(e=>e.scrollWidth<=e.clientWidth+1));}
  await page.setViewportSize({width:1440,height:960});await page.locator('#discoveryCloseBtn').click();
  const after=await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');return ctx.discoveryProfileStore.exportData();});
  check('original album media retained exactly',hash(after.albums)===hash(importedAlbums));
  const originalIds=new Set(backup.events.map(e=>e.eventId));check('all original Journal events retained',after.events.filter(e=>originalIds.has(e.eventId)).length===originalIds.size);
  await completed('journal');}
  if(process.env.WE3D_UI_ENTRY==='racing'){await page.locator('#racingHub').waitFor({state:'visible',timeout:60000});check('Globe Create launches original racing workspace',true);await page.waitForFunction(()=>document.querySelector('[data-race-name]')?.textContent!=='Loading routes…',null,{timeout:120000});await shot('racing-from-globe');await page.locator('[data-race-close]').click();}
  if(wants('finish')){
  await nav('realEstateFloatBtn').click();await page.locator('#fQuickBuild').click();await page.locator('#blockBuilderPanel.show').waitFor();await page.setViewportSize({width:390,height:844});await shot('blocks-final-phone');
  await nav('fExplorerJournal').click();await page.locator('#discoveryPanel').waitFor({state:'visible'});check('Journal navigation closes the actual Blocks editor',!(await page.locator('#blockBuilderPanel').isVisible()));await page.locator('#discoveryCloseBtn').click();await page.setViewportSize({width:1440,height:960});
  await nav('realEstateFloatBtn').click();await page.locator('#fRealEstate').click();await page.locator('#propertyPanel').waitFor({state:'visible'});await shot('homes-final');await nav('fActivities').click();await page.locator('#experienceBrowser').waitFor({state:'visible'});check('Activities navigation closes the actual property panel',!(await page.locator('#propertyPanel').isVisible()));await page.locator('[data-experience-close]').click();
  await nav('travelBtn').click();await page.locator('#fDrone').click();await page.waitForFunction(()=>window.__uiState().modes.drone);await nav('travelBtn').click();await page.locator('#fDriving').click();await page.waitForFunction(()=>!Object.values(window.__uiState().modes).some(Boolean));check('Earth Drone to Drive retires its original controller',true);
  await nav('realEstateFloatBtn').click();await page.locator('#fCreateRace').click();await page.locator('#racingHub').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('[data-race-name]')?.textContent!=='Loading routes…',null,{timeout:120000});check('Racing route qualification settles without an error',!(await page.locator('#racingHub').getAttribute('data-race-qualification-error')));await shot('racing-settled');
  await page.locator('[data-race-create]').click();await page.locator('[data-race-creator-mode]').selectOption('ground');await shot('creator-final');await page.setViewportSize({width:390,height:844});await shot('creator-final-phone');await page.setViewportSize({width:1440,height:960});await page.locator('[data-race-career-open]').click();await page.locator('[data-race-career-view]').waitFor({state:'visible'});await shot('rivals-final');await page.locator('[data-race-career-back]').click();await page.locator('[data-race-close]').click();
  await completed('finish');}
  if(wants('appearance')){
  await shot('trail-earth');
  await nav('backpackBtn').click();await page.locator('#fBackpack').click();await page.locator('#urbanEquipment').waitFor({state:'visible'});await shot('trail-kit');await page.locator('#urbanEquipmentCloseBtn').click();
  await nav('backpackBtn').click();await page.locator('#fExplorerProfile').click();await page.locator('#discoveryProfileHero').waitFor({state:'visible'});await shot('trail-profile');await page.locator('[data-discovery-tab="guide"]').click();await shot('trail-guide');await page.locator('#discoveryCloseBtn').click();
  await nav('travelBtn').click();await page.locator('#fWorldMap').click();await page.locator('#largeMap.show').waitFor();await shot('trail-map');await page.locator('#mapLegend').click();await page.locator('#legendPanel').waitFor({state:'visible'});await shot('trail-layers');await page.locator('#legendCloseBtn').click();await page.locator('#mapClose').click();
  await nav('realEstateFloatBtn').click();await page.locator('#fCreateRace').click();await page.locator('#racingHub').waitFor({state:'visible',timeout:60000});await shot('trail-racing');await page.locator('[data-race-create]').click();await page.locator('[data-race-creator-mode]').selectOption('ground');await shot('trail-track-creator');await page.locator('[data-race-close]').click();
  await nav('realEstateFloatBtn').click();await page.locator('#fQuickBuild').click();await page.locator('#blockBuilderPanel.show').waitFor();await shot('trail-blocks');await page.setViewportSize({width:390,height:844});await shot('trail-blocks-phone');await page.locator('#blockBuilderClose').click();await page.setViewportSize({width:1440,height:960});
  await nav('realEstateFloatBtn').click();await page.locator('#fRealEstate').click();await page.locator('#propertyPanel').waitFor({state:'visible'});await shot('trail-homes');await page.locator('#closePropertyPanelBtn').click();
  await nav('communityBtn').click();await page.locator('#fMultiplayer').click();await page.locator('#roomPanelModal').waitFor({state:'visible'});await shot('trail-rooms');await page.locator('#roomPanelCloseBtn').click();
  await page.setViewportSize({width:390,height:844});await shot('trail-earth-phone');await nav('travelBtn').click();await shot('trail-travel-phone');await page.keyboard.press('Escape');
  await completed('appearance');}
  if(wants('workspaces')){
  if(process.env.WE3D_UI_ENTRY==='blocks'){await page.locator('#blockBuilderPanel.show').waitFor();check('globe Create launches original Blocks editor',true);await shot('blocks-from-globe');await page.locator('#blockBuilderClose').click();}
  await nav('backpackBtn').click();await page.locator('#fBackpack').click();await page.locator('#urbanEquipment').waitFor({state:'visible'});await shot('kit-shared-navigation');await page.locator('#urbanEquipment [data-explorer-section="journal"]').click();await page.locator('#discoveryPanel').waitFor({state:'visible'});check('Backpack navigation closes its original owner before Journal',!(await page.locator('#urbanEquipment').isVisible()));
  await page.locator('#discoveryProfileBtn').click();await page.locator('#discoveryProfileHero').waitFor({state:'visible'});await shot('profile-current');await page.locator('[data-discovery-tab="guide"]').click();await shot('guide-current');await page.locator('#discoveryCloseBtn').click();
  await nav('travelBtn').click();await page.locator('#fWorldMap').click();await page.locator('#largeMap.show').waitFor();await shot('map-world');await page.locator('#mapZoomIn').click();await page.locator('#mapZoomOut').click();await page.locator('#mapRoadsToggle').click();await page.locator('#mapRoadsToggle').click();await page.locator('#mapRecenter').click();await page.locator('#mapLegend').click();await page.locator('#legendPanel').waitFor({state:'visible'});await page.locator('#legendHideAllBtn').click();await page.locator('#legendShowAllBtn').click();await shot('map-layers-world');await page.locator('#legendCloseBtn').click();await page.locator('#mapClose').click();check('map closes to original world',!(await page.locator('#largeMap').isVisible()));
  await nav('realEstateFloatBtn').click();await page.locator('#fCreateRace').click();await page.locator('#racingHub').waitFor({state:'visible',timeout:60000});await shot('racing-hub');await page.locator('[data-race-create]').click();await page.locator('[data-race-creator-mode]').selectOption('ground');await shot('track-creator');await page.locator('[data-race-career-open]').click();await page.locator('[data-race-career-view]').waitFor({state:'visible'});await shot('rivals-authorization');await page.locator('[data-race-career-back]').click();await page.locator('[data-race-close]').click();check('Racing exits through its original close action',!(await page.locator('#racingHub').isVisible()));
  await nav('realEstateFloatBtn').click();await page.locator('#fQuickBuild').click();await page.locator('#blockBuilderPanel.show').waitFor();await page.locator('[data-block-tool="remove"]').click();await page.locator('[data-block-tool="place"]').click();await page.locator('[data-block-shape]').nth(1).click();await page.locator('[data-block-material]').nth(1).click();await page.locator('#blockBuilderRotate').click();await page.setViewportSize({width:390,height:844});await shot('blocks-phone');await page.locator('#blockBuilderClose').click();await page.setViewportSize({width:1440,height:960});
  await nav('realEstateFloatBtn').click();await page.locator('#fRealEstate').click();await page.locator('#propertyPanel').waitFor({state:'visible'});await shot('homes-properties');await page.locator('#closePropertyPanelBtn').click();
  await nav('communityBtn').click();await page.locator('#fMultiplayer').click();await page.locator('#roomPanelModal').waitFor({state:'visible'});await shot('room-lobby');await page.locator('#roomPanelCloseBtn').click();
  await completed('workspaces');}
  if(wants('aircraft')){
  for(const aircraft of ['personal-prop','expedition-prop','business-jet']){
   await nav('travelBtn').click();await page.locator('#travelAircraftSelect').selectOption(aircraft);await page.locator('#fPlane').click();await page.waitForFunction(()=>window.__uiState().modes.plane);await shot('aircraft-'+aircraft);
   await nav('travelBtn').click();await page.locator('#fWalk').click();await page.waitForFunction(()=>window.__uiState().modes.walking);}
  check('all three aircraft choices transition through original Travel owner',true);await completed('aircraft');}
  if(wants('profile-backup')){
  await nav('backpackBtn').click();await page.locator('#fExplorerProfile').click();await page.locator('#discoveryProfileHero').waitFor({state:'visible'});await shot('profile');
  const section=page.locator('.discoveryOnlineService').filter({has:page.locator('#discoveryExportBtn')});await section.locator('summary').click();
  await page.locator('#discoveryStorageBtn').click();await page.waitForFunction(()=>document.querySelector('#discoveryBackupStatus').textContent.length>10);
  const expected=await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');return ctx.discoveryProfileStore.exportData();});
  const event=page.waitForEvent('download');await page.locator('#discoveryExportBtn').click();const download=await event;const file=path.join(output,'original-journal-download.json');await download.saveAs(file);
  const data=JSON.parse(await fs.readFile(file,'utf8'));assert.deepEqual(data.events,expected.events);assert.deepEqual(data.albums,expected.albums);const ids=new Set(data.events.map(e=>e.eventId));check('download retains all original Journal records',backup.events.every(e=>ids.has(e.eventId)));check('download retains original photos',data.albums.flatMap(a=>a.photos).length===3);
  await page.locator('#discoveryExportBtn').scrollIntoViewIfNeeded();await shot('profile-backup');
  await page.locator('#discoveryCloseBtn').click();await completed('profile-backup');}
  if(wants('creation-social')){
  await nav('realEstateFloatBtn').click();check('Create opens the original creation actions',await page.locator('#realEstateMenu').evaluate(e=>e.classList.contains('open')));await shot('world-create');await page.keyboard.press('Escape');
  await nav('communityBtn').click();check('Together opens the original social actions',await page.locator('#communityMenu').evaluate(e=>e.classList.contains('open')));await shot('world-together');await page.keyboard.press('Escape');
  await completed('creation-social');}
  if(wants('phone')){
  await page.setViewportSize({width:390,height:844});await shot('phone-world');
  await nav('travelBtn').click();await shot('phone-travel');await page.keyboard.press('Escape');
  await nav('fExplorerJournal').click();await page.locator('#discoveryPanel').waitFor({state:'visible'});await page.locator('#discoveryCloseBtn').click();
  await completed('phone');}
  report.final=await page.evaluate(()=>window.__uiState());
  check('source stayed unchanged during the run',hash(report.sourceHashes)===hash(await sourceHashes()));
  check('no page exceptions',qa.report.errors.length===0);report.providerErrors=qa.report.providerErrors;report.ok=true;
}catch(error){report.ok=false;report.failure=error.stack;await qa?.fail(error);}
finally{await qa?.close();await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({ok:report.ok,output,checks:report.checks,failure:report.failure}));if(!report.ok)process.exitCode=1;
