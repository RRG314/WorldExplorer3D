import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const require=createRequire(import.meta.url),{footprintSignature,normalizeHybridPreview}=require('../../functions/reality-capture-hybrid');
const out='output/verification/reality-capture-hybrid';await mkdir(out,{recursive:true});
const privateDir=process.env.WE3D_PRIVATE_CAPTURE_REPLAY;
const building=privateDir?JSON.parse(await readFile(`${privateDir}/hybrid-building.json`,'utf8')):{sourceAuthority:'osm',sourceBuildingId:'osm:way:fixture',spatialContext:{footprint:[{x:-15,z:-6},{x:15,z:-6},{x:15,z:6},{x:-15,z:6}],height:{meters:6,evidence:'inferred'}}};
const capture={captureId:'private-local-replay',ownerUid:'local-verifier',captureKind:'exterior',building,footprintSignature:footprintSignature(building)};
const ids=['a'.repeat(32),'b'.repeat(32)];capture.inputManifest=ids.map(id=>({name:`reality-captures/local-verifier/private-local-replay/originals/${id}.jpg`,generation:'local-replay-only'}));
const source=privateDir?await readFile(`${privateDir}/photos/06.jpg`):await require('../../functions/node_modules/sharp')({create:{width:1600,height:2000,channels:3,background:'#cb9876'}}).jpeg().toBuffer();
const server=await startStaticServer({rootDir:process.cwd(),ports:[4492,4493]});
const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
try{
  for(const width of [1100,390]){
    const context=await browser.newContext({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390});const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
    const saved=structuredClone(capture);
    await page.route('**/private-replay-photo',route=>route.fulfill({contentType:'image/jpeg',body:source}));
    await page.route('**/private-replay-save',async route=>{try{const preview=normalizeHybridPreview(saved,route.request().postDataJSON());saved.hybridPreview=preview;await route.fulfill({json:{preview}});}catch(e){await route.fulfill({status:409,json:{error:e.message}});}});
    await page.route('**/hybrid-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>'}));
    await page.goto(`http://127.0.0.1:${server.port}/hybrid-fixture`);
    await page.evaluate(async data=>{
      document.body.replaceChildren();window.replayCapture=data;window.replayAbort=new AbortController();
      window.openReplay=async()=>{const {openHybridEditor}=await import('/app/js/reality-capture/hybrid-editor.js?v=1');window.editor=await openHybridEditor({capture:window.replayCapture,photos:[{id:'a'.repeat(32)},{id:'b'.repeat(32)}],signal:replayAbort.signal,loadPhoto:async(_,signal)=>(await fetch('/private-replay-photo',{signal})).blob(),save:async preview=>{const r=await fetch('/private-replay-save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(preview)});const result=await r.json();if(!r.ok)throw Error(result.error);window.replayCapture.hybridPreview=result.preview;return result;}});};
      await openReplay();window.render_game_to_text=()=>JSON.stringify(editor.getState());
    },capture);
    await page.locator('[data-height]').fill('6');await page.locator('[data-roof]').selectOption('gabled');await page.locator('[data-rebuild]').click();await page.locator('[data-add]').waitFor();
    await page.locator('[data-wall]').selectOption('1');
    // Explicit manual correspondence for a crop in the real photo, NOT solved
    // registration. The chosen mapped region is provisional and not published.
    const quad=[[.24,.432],[.68,.426],[.68,.665],[.24,.660]];
    for(let i=0;i<4;i++){
      await page.locator('[data-corner]').selectOption(String(i));await page.locator('[data-x]').fill(String(quad[i][0]*100));await page.locator('[data-y]').fill(String(quad[i][1]*100));await page.locator('[data-y]').press('Tab');
    }
    for(const [i,n] of [.4,.15,.6,1].entries())await page.locator(`[data-region="${i}"]`).fill(String(n*100));
    await page.locator('[data-add]').click();await page.waitForFunction(()=>window.editor?.getState().patches===1);await page.locator('[data-save]').click();await page.waitForFunction(()=>window.editor?.getState().revision===1);
    assert.equal(saved.hybridPreview.patches.length,1);assert.equal(saved.hybridPreview.visibility,'PRIVATE');assert.equal(saved.hybridPreview.roofShape,'gabled');
    saved.hybridPreview.patches[0].quad.forEach((p,i)=>p.forEach((n,j)=>assert.ok(Math.abs(n-quad[i][j])<.001,`Corner ${i}/${j}: ${n}, expected ${quad[i][j]}`)));
    await page.locator('[data-viewer]').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${width}-preview.png`});
    await page.locator('[data-viewer]').screenshot({path:`${out}/${width}-model.png`});
    await page.locator('[data-patches] button',{hasText:'Remove'}).click();await page.waitForFunction(()=>window.editor.getState().patches===0);
    await page.locator('[data-undo]').click();await page.waitForFunction(()=>window.editor.getState().patches===1);
    await page.locator('[data-close]').click();assert.equal(await page.locator('.captureHybridEditor').count(),0);
    await page.evaluate(()=>openReplay());assert.equal(await page.evaluate(()=>editor.getState().patches),1);
    const dimensions=await page.evaluate(()=>({w:innerWidth,scroll:document.querySelector('.captureHybridEditor').scrollWidth,client:document.querySelector('.captureHybridEditor').clientWidth}));assert.ok(dimensions.scroll<=dimensions.client+2);
    await page.evaluate(()=>replayAbort.abort());assert.equal(await page.locator('.captureHybridEditor').count(),0);
    await context.close();
  }
  assert.deepEqual(errors,[]);await writeFile(`${out}/report.json`,JSON.stringify({passed:true,actualOwnerPhoto:!!privateDir,checks:['real photo decode and four-point rectification','procedural mapped-footprint shell and shared gabled roof generator','manual region placement','private revision save via actual validator with transport double','remove/undo/reopen','390px fit','abort disposal'],limitations:['Manual example alignment is not an automatically registered reconstruction.','No cloud write, physical phone, or world publication tested here.'],errors},null,2));console.log('Hybrid UI passed on desktop and mobile width; no cloud reconstruction.');
}finally{await browser.close();await server.close();}
