import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{normalizeHybridPreview,footprintSignature}=require('../../functions/reality-capture-hybrid');
const {createPatchGlb}=require('../../functions/reality-capture-patch-derivative'),sharp=require('../../functions/node_modules/sharp');
const photoBytes=await sharp({create:{width:320,height:240,channels:3,background:{r:45,g:125,b:170}}}).jpeg().toBuffer(),photoId='a'.repeat(32);
const output='output/verification/interior-layout';await mkdir(output,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4494,4495]});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  for(const width of [1100,412]){
    const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<700,isMobile:width<700});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const capture={captureId:'layout-test',ownerUid:'local-verifier',captureKind:'interior_room',room:{widthMeters:4,lengthMeters:6,heightMeters:2.7},consent:{propertyPermissionConfirmed:true},building:{sourceAuthority:'osm',sourceBuildingId:'test-building',spatialContext:{footprint:[{x:0,z:0},{x:10,z:0},{x:10,z:12},{x:0,z:12}],height:{meters:6}}}};
    capture.footprintSignature=footprintSignature(capture.building,capture.room);
    capture.inputManifest=[{name:`reality-captures/${capture.ownerUid}/${capture.captureId}/originals/${photoId}.jpg`,generation:'1',size:photoBytes.length,sha256:createHash('sha256').update(photoBytes).digest('hex')}];
    await page.route('**/layout-photo.jpg',r=>r.fulfill({contentType:'image/jpeg',body:photoBytes}));
    await page.route('**/layout-submit',async r=>{const body=r.request().postDataJSON();assert.equal(body.publicSharing,false);const glb=await createPatchGlb(capture,capture.hybridPreview,async()=>photoBytes);assert.equal(glb.readUInt32LE(0),0x46546c67);await r.fulfill({json:{revision:capture.hybridPreview.revision,status:'review_required'}});});
    await page.route('**/layout-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body></body>'}));
    await page.route('**/layout-save',async r=>{try{const preview=normalizeHybridPreview(capture,r.request().postDataJSON());capture.hybridPreview=preview;await r.fulfill({json:{preview}});}catch(e){await r.fulfill({status:422,json:{error:e.message}});}});
    await page.goto(`http://127.0.0.1:${server.port}/layout-fixture`);
    await page.evaluate(async ({capture,photoId})=>{const {openHomeLayoutEditor}=await import('/app/js/reality-capture/home-layout-editor.js');window.abortEditor=new AbortController();window.openEditor=()=>openHomeLayoutEditor({capture,signal:window.abortEditor.signal,photos:[{id:photoId}],loadPhoto:async()=>await (await fetch('/layout-photo.jpg')).blob(),submit:async(revision,publicSharing)=>await(await fetch('/layout-submit',{method:'POST',body:JSON.stringify({revision,publicSharing})})).json(),save:async input=>{const r=await fetch('/layout-save',{method:'POST',body:JSON.stringify(input)}),value=await r.json();if(!r.ok)throw Error(value.error);capture.hybridPreview=value.preview;return value;}});await window.openEditor();},{capture,photoId});
    await page.locator('[data-start]').click();assert.equal(await page.locator('[data-room] option').count(),3);
    await page.locator('[data-name]').fill('Living room');await page.locator('[data-name]').dispatchEvent('change');
    await page.locator('[data-save]').click();await page.getByText('Saved to account · revision 1. Your home remains private.',{exact:true}).waitFor();
    await page.locator('[data-photos]').click();const crop=page.locator('.captureHybridEditor');
    await crop.locator('[data-photo]').waitFor();await crop.locator('[data-add]').click();await crop.locator('[data-save]').click();
    await crop.locator('[data-saved]').filter({hasText:/Saved/}).waitFor();await crop.locator('[data-close]').click();
    assert.equal(capture.hybridPreview.roomPhotos[0].patches.length,1);
    await page.locator('.homeLayoutEditor [data-submit]').click();await page.locator('.homeLayoutEditor [data-status]').filter({hasText:/submitted for review/}).waitFor();
    await page.screenshot({path:`${output}/${width}-plan.png`,fullPage:true});
    await page.locator('[data-3d-mode]').click();try{await page.locator('[data-viewer] canvas').waitFor({timeout:15000});}catch(e){console.log(await page.locator('[data-status]').innerText(),errors);throw e;}await page.screenshot({path:`${output}/${width}-shell.png`,fullPage:true});
    await page.locator('[data-inside]').click();await page.locator('[data-viewer] canvas').waitFor();await page.screenshot({path:`${output}/${width}-inside.png`,fullPage:true});
    await page.locator('[data-close]').click();await page.evaluate(()=>window.openEditor());assert.equal(await page.locator('[data-name]').inputValue(),'Living room');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);await context.close();console.log(`${width}: plan, crop/place/save, protected GLB generation, private submission, reopen and 3D passed (mock HTTP, actual normalizer and derivative builder).`);
  }
}finally{await browser.close();await server.close();}
