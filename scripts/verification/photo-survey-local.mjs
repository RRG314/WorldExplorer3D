import assert from 'node:assert/strict';
import {mkdir,readdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const folders=process.argv.slice(2);if(!folders.length)throw Error('Pass the supplied photo directories explicitly. Photos are never uploaded.');
const files=[];for(const dir of folders)for(const name of(await readdir(dir)).sort())if(/\.jpg$/i.test(name))files.push(`${dir}/${name}`);
const out='output/verification/photo-survey-local';await mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4496,4497]});
const origin=`http://127.0.0.1:${server.port}`,browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const width of [1100,412]){
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width<700,hasTouch:width<700}),page=await context.newPage(),errors=[],uploads=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/auth-ui.js*',r=>r.fulfill({contentType:'text/javascript',body:'export const getCurrentUser=()=>null;export const observeAuth=cb=>{cb(null);return()=>{}};'}));
  await page.route('**/function-api.js*',r=>r.fulfill({contentType:'text/javascript',body:'export const postProtectedFunction=async()=>({representations:[]});export const postAppCheckedFunction=postProtectedFunction;'}));
  page.on('request',r=>{if(r.method()!=='GET')uploads.push(r.url());});
  await page.goto(`${origin}/app/survey.html`);await page.click('#openSurvey');
  const subset=width===1100?files:files.slice(0,2);
  await page.locator('[data-survey-import]').setInputFiles(subset);
  await page.locator('[data-survey-status]').filter({hasText:new RegExp(`${subset.length} photos added`)}).waitFor({timeout:120000});
  await page.locator('[data-survey-import]').setInputFiles(subset[0]);
  await page.locator('[data-survey-status]').filter({hasText:'1 exact duplicates skipped'}).waitFor();
  await page.screenshot({path:`${out}/${width}-import.png`,fullPage:true});
  await page.click('[data-survey-close]');
  await page.evaluate(async()=>{
    const {loadClassicScript}=await import('/app/js/modules/script-loader.js?v=56'),{vendorScriptsCritical}=await import('/app/js/modules/manifest.js?v=597');await loadClassicScript(vendorScriptsCritical[0]);
    const {openPhotoSurvey}=await import('/app/js/reality-capture/survey-ui.js');
    const make=(id,x)=>({sourceBuildingId:id,geometrySource:'osm',pts:[{x,z:0},{x:x+10,z:0},{x:x+10,z:8},{x,z:8}],centerX:x+5,centerZ:4,minX:x,maxX:x+10,minZ:0,maxZ:8,bodyHeightMeters:6,baseY:0});
    window.surveyCtx={LOC:{lat:39.65,lon:-76.88},buildings:[make('osm:survey-fixture-a',0),make('osm:survey-fixture-b',20)],scene:new THREE.Scene(),initialEarthWorldReady:true,_worldLoadSequence:1,worldToLatLon:(x,z)=>({lat:39.65-z/111320,lon:-76.88+x/(111320*Math.cos(39.65*Math.PI/180))}),activeTransportActor:()=>({position:{x:0,z:0}})};
    window.reopenSurvey=()=>openPhotoSurvey({appCtx:surveyCtx});await reopenSurvey();
  });
  await page.locator('[data-survey-gallery] input').nth(0).check();await page.selectOption('[data-survey-wall]','0');await page.click('[data-survey-assign]');await page.locator('[data-survey-status]').filter({hasText:'Assignment saved'}).waitFor();
  await page.click('[data-survey-edit]');await page.locator('.captureHybridEditor [data-photo]').waitFor();await page.click('.captureHybridEditor [data-add]');await page.click('.captureHybridEditor [data-save]');
  await page.locator('.captureHybridEditor [data-saved]').filter({hasText:'Saved on this device'}).waitFor();await page.screenshot({path:`${out}/${width}-editor.png`,fullPage:true});await page.click('.captureHybridEditor [data-close]');
  // A second independently confirmed building uses the same editor and store.
  await page.locator('[data-survey-gallery] input').nth(0).uncheck();await page.locator('[data-survey-gallery] input').nth(1).check();await page.selectOption('[data-survey-building]','1');await page.selectOption('[data-survey-wall]','2');await page.click('[data-survey-assign]');await page.click('[data-survey-edit]');await page.locator('.captureHybridEditor [data-save]:enabled').waitFor();assert.equal(await page.locator('.captureHybridEditor [data-wall]').inputValue(),'2');await page.click('.captureHybridEditor [data-add]');await page.click('.captureHybridEditor [data-save]');await page.locator('.captureHybridEditor [data-saved]').filter({hasText:'Saved on this device'}).waitFor();await page.click('.captureHybridEditor [data-close]');await page.click('[data-survey-close]');
  const state=await page.evaluate(async()=>{const runtime=await import('/app/js/reality-capture/runtime.js?v=1');await runtime.refreshCommunityRealityCapturePresentation(surveyCtx);const roots=surveyCtx.scene.children.filter(x=>x.userData.communityRealityCapture);const {loadSurvey}=await import('/app/js/reality-capture/survey-store.js');const {survey}=await loadSurvey();return {roots:roots.map(r=>({id:r.userData.communityRealityCapture.sourceBuildingId,x:r.position.x,patches:r.children.length})),entries:survey.entries.length,unlocated:survey.entries.filter(e=>!e.metadata.location).length,previews:Object.keys(survey.previews).length};});
  assert.equal(state.roots.length,2);assert.equal(state.previews,2);assert.equal(state.entries,subset.length);assert.equal(state.unlocated,subset.length);assert.notEqual(state.roots[0].x,state.roots[1].x);
  await page.reload();await page.click('#openSurvey');await page.locator('[data-survey-status]').filter({hasText:`${subset.length} photos saved`}).waitFor();
  const stored=await page.evaluate(async()=>{const {loadSurvey,saveSurvey}=await import('/app/js/reality-capture/survey-store.js');const {survey}=await loadSurvey(),stale=structuredClone(survey);await saveSurvey(survey);let rejected=false;try{await saveSurvey(stale);}catch(e){rejected=e.message.includes('another tab');}if(!rejected)throw Error('Stale survey overwrote current draft');return Object.values(survey.previews).map(r=>r.preview.patches.length);});assert.deepEqual(stored,[1,1]);assert.deepEqual(uploads,[]);assert.deepEqual(errors,[]);
  await page.screenshot({path:`${out}/${width}-reload.png`,fullPage:true});console.log(JSON.stringify({width,...state,uploads:uploads.length,errors}));await context.close();
}}finally{await browser.close();await server.close();}
