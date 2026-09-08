import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{normalizeHybridPreview,footprintSignature}=require('../../functions/reality-capture-hybrid');
const output='output/verification/interior-layout';await mkdir(output,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4494,4495]});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  for(const width of [1100,412]){
    const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<700,isMobile:width<700});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const capture={captureId:'layout-test',ownerUid:'local-verifier',captureKind:'interior_room',room:{widthMeters:4,lengthMeters:6,heightMeters:2.7},consent:{propertyPermissionConfirmed:true},building:{sourceAuthority:'osm',sourceBuildingId:'test-building',spatialContext:{footprint:[{x:0,z:0},{x:10,z:0},{x:10,z:12},{x:0,z:12}],height:{meters:6}}}};
    capture.footprintSignature=footprintSignature(capture.building,capture.room);
    await page.route('**/layout-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body></body>'}));
    await page.route('**/layout-save',async r=>{try{const preview=normalizeHybridPreview(capture,r.request().postDataJSON());capture.hybridPreview=preview;await r.fulfill({json:{preview}});}catch(e){await r.fulfill({status:422,json:{error:e.message}});}});
    await page.goto(`http://127.0.0.1:${server.port}/layout-fixture`);
    await page.evaluate(async capture=>{const {openHomeLayoutEditor}=await import('/app/js/reality-capture/home-layout-editor.js');window.abortEditor=new AbortController();window.openEditor=()=>openHomeLayoutEditor({capture,signal:window.abortEditor.signal,save:async input=>{const r=await fetch('/layout-save',{method:'POST',body:JSON.stringify(input)}),value=await r.json();if(!r.ok)throw Error(value.error);capture.hybridPreview=value.preview;return value;}});await window.openEditor();},capture);
    await page.locator('[data-start]').click();assert.equal(await page.locator('[data-room] option').count(),3);
    await page.locator('[data-name]').fill('Living room');await page.locator('[data-name]').dispatchEvent('change');
    await page.locator('[data-save]').click();await page.getByText('Saved to account · revision 1. Your home remains private.',{exact:true}).waitFor();
    await page.screenshot({path:`${output}/${width}-plan.png`,fullPage:true});
    await page.locator('[data-3d-mode]').click();try{await page.locator('[data-viewer] canvas').waitFor({timeout:15000});}catch(e){console.log(await page.locator('[data-status]').innerText(),errors);throw e;}await page.screenshot({path:`${output}/${width}-shell.png`,fullPage:true});
    await page.locator('[data-inside]').click();await page.locator('[data-viewer] canvas').waitFor();await page.screenshot({path:`${output}/${width}-inside.png`,fullPage:true});
    await page.locator('[data-close]').click();await page.evaluate(()=>window.openEditor());assert.equal(await page.locator('[data-name]').inputValue(),'Living room');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);await context.close();console.log(`${width}: plan, save/reopen, 3D shell and inside view passed (mock HTTP, actual normalizer).`);
  }
}finally{await browser.close();await server.close();}
