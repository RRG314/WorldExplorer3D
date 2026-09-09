import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const require=createRequire(import.meta.url),{footprintSignature,normalizeHybridPreview}=require('../../functions/reality-capture-hybrid');
const roomTest=process.env.WE3D_ROOM_EDITOR_TEST==='1';
const out=roomTest?'output/verification/reality-capture-room-editor':'output/verification/reality-capture-hybrid';await mkdir(out,{recursive:true});
const privateDir=process.env.WE3D_PRIVATE_CAPTURE_REPLAY;
const building=privateDir?JSON.parse(await readFile(`${privateDir}/hybrid-building.json`,'utf8')):{sourceAuthority:'osm',sourceBuildingId:'osm:way:fixture',lat:39.6572,lon:-76.88618,spatialContext:{footprint:[{x:-15,z:-6},{x:15,z:-6},{x:15,z:6},{x:-15,z:6}],height:{meters:6,evidence:'inferred'}}};
const capture={captureId:'private-local-replay',ownerUid:'local-verifier',captureKind:'exterior',building,footprintSignature:footprintSignature(building)};
if(roomTest){capture.captureKind='interior_room';capture.room={widthMeters:4,lengthMeters:6,heightMeters:2.7};capture.consent={propertyPermissionConfirmed:true};capture.footprintSignature=footprintSignature(building,capture.room);}
const ids=['a','b','c','d','e','f','0'].map(c=>c.repeat(32));capture.inputManifest=ids.map(id=>({name:`reality-captures/local-verifier/private-local-replay/originals/${id}.jpg`,generation:'local-replay-only'}));
const source=privateDir?await readFile(`${privateDir}/photos/06.jpg`):await require('../../functions/node_modules/sharp')({create:{width:1600,height:2000,channels:3,background:'#cb9876'}}).jpeg().toBuffer();
const sources=privateDir?await Promise.all(['06','08','01','02','03','04','05'].map(n=>readFile(`${privateDir}/photos/${n}.jpg`))):ids.map(()=>source);
const server=await startStaticServer({rootDir:process.cwd(),ports:[4492,4493]});
const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
try{
  for(const width of [1100,412,390]){
    const context=await browser.newContext({viewport:{width,height:900},isMobile:width<700,hasTouch:width<700,...(width===412?{userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'}:{})});const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
    const saved=structuredClone(capture);
    await page.route('**/private-replay-photo*',route=>route.fulfill({contentType:'image/jpeg',body:sources[ids.indexOf(new URL(route.request().url()).searchParams.get('id'))]||source}));
    await page.route('**/private-replay-save',async route=>{try{const preview=normalizeHybridPreview(saved,route.request().postDataJSON());saved.hybridPreview=preview;await route.fulfill({json:{preview}});}catch(e){await route.fulfill({status:409,json:{error:e.message}});}});
    await page.route('**/hybrid-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>'}));
    await page.goto(`http://127.0.0.1:${server.port}/hybrid-fixture`);
    await page.evaluate(async data=>{
      document.body.replaceChildren();window.replayCapture=data;window.replayAbort=new AbortController();
      window.openReplay=async()=>{const {openHybridEditor}=await import('/app/js/reality-capture/hybrid-editor.js?v=1');window.editor=await openHybridEditor({capture:window.replayCapture,photos:['a','b','c','d','e','f','0'].map(c=>({id:c.repeat(32)})),signal:replayAbort.signal,loadPhoto:async(id,signal)=>(await fetch(`/private-replay-photo?id=${id}`,{signal})).blob(),save:async preview=>{const r=await fetch('/private-replay-save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(preview)});const result=await r.json();if(!r.ok)throw Error(result.error);window.replayCapture.hybridPreview=result.preview;return result;}});};
      await openReplay();window.render_game_to_text=()=>JSON.stringify(editor.getState());
    },capture);
    assert.equal(await page.locator('[data-advanced]').getAttribute('open'),null);
    await page.waitForFunction(()=>document.querySelectorAll('[data-thumbnails] img').length===6);
    if(roomTest){
      assert.equal(await page.locator('[data-side]').count(),6);
      await page.locator('[data-side="4"]').click();
      await page.locator('[data-add]').click();await page.waitForFunction(()=>editor.getState().patches===1);
      await page.locator('[data-advanced] summary').click();
      await page.locator('[data-room-edit-width]').fill('5');
      await page.locator('[data-rebuild]').click();
      await page.locator('[data-save]').click();await page.waitForFunction(()=>editor.getState().revision===1);
      assert.equal(saved.hybridPreview.room.widthMeters,5);assert.equal(saved.hybridPreview.visibility,'PRIVATE');
      assert.equal(saved.hybridPreview.patches[0].wall,4);assert.deepEqual(saved.building,building);
      await page.locator('[data-advanced] summary').click();
      await page.locator('[data-viewer]').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${width}-room.png`});
      await page.locator('[data-close]').click();await page.evaluate(()=>openReplay());
      assert.equal(await page.evaluate(()=>editor.getState().patches),1);
      await page.locator('[data-side="5"]').click();
      await page.locator('[data-add]').click();await page.waitForFunction(()=>editor.getState().patches===2);
      await page.locator('[data-save]').click();await page.waitForFunction(()=>editor.getState().revision===2);
      assert.equal(saved.hybridPreview.patches[1].wall,5);
      const sizes=await page.evaluate(()=>{const d=document.querySelector('.captureHybridEditor');return [d.scrollWidth,d.clientWidth];});assert.ok(sizes[0]<=sizes[1]+2);
      await page.evaluate(()=>replayAbort.abort());await context.close();continue;
    }
    if(privateDir)assert.notEqual(await page.locator('[data-thumbnails] img').nth(0).getAttribute('src'),await page.locator('[data-thumbnails] img').nth(1).getAttribute('src'),'Different saved photos have distinct thumbnails');
    assert.equal(await page.locator('[data-plan]').isVisible(),true,'Orientation is not hidden in Advanced');
    await page.locator('[data-side="0"]').click();
    await page.locator('[data-face-wall]').click();
    await page.locator('[data-mark-front]').click();
    assert.match(await page.locator('[data-front-reference]').innerText(),/wall 1/);
    await page.locator('[data-map-panel] summary').click();
    await page.locator('[data-map-preview] [aria-label="Select wall 2"]').click();
    assert.equal(await page.evaluate(()=>editor.getState().selectedWall),1);
    await page.locator('[data-map-preview]').scrollIntoViewIfNeeded();
    await page.screenshot({path:`${out}/${width}-map-context.png`});
    await page.locator('[data-map-panel] summary').click();
    await page.locator('[data-viewer]').scrollIntoViewIfNeeded();
    await page.screenshot({path:`${out}/${width}-orientation.png`});
    await page.locator('[data-next-photos]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-thumbnails] img').length===1);assert.equal(await page.locator('[data-next-photos]').isDisabled(),true);
    await page.locator('[data-prev-photos]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-thumbnails] img').length===6);
    await page.locator('[data-side="2"]').click();assert.equal(await page.evaluate(()=>editor.getState().selectedWall),2);
    // Select an actual rendered face through the viewer's pointer/raycast path.
    await page.locator('[data-viewer]').scrollIntoViewIfNeeded();
    const modelBox=await page.locator('[data-viewer] canvas').boundingBox();
    let picked=false;
    for(const [x,y] of [[.5,.6],[.6,.55],[.4,.55],[.5,.7]]){
      if(width<700)await page.touchscreen.tap(modelBox.x+modelBox.width*x,modelBox.y+modelBox.height*y);
      else await page.mouse.click(modelBox.x+modelBox.width*x,modelBox.y+modelBox.height*y);
      if((await page.locator('[data-status]').innerText()).includes('selected. Choose a photo')){picked=true;break;}
    }
    assert.ok(picked,'A real canvas wall tap must select a wall');
    const wallBefore=await page.evaluate(()=>editor.getState().selectedWall);
    await page.mouse.move(modelBox.x+modelBox.width*.5,modelBox.y+modelBox.height*.6);await page.mouse.down();await page.mouse.move(modelBox.x+modelBox.width*.7,modelBox.y+modelBox.height*.6,{steps:6});await page.mouse.up();
    assert.equal(await page.evaluate(()=>editor.getState().selectedWall),wallBefore,'Orbit drag must not select another wall');
    await page.locator('[data-reset]').click();
    await page.locator('[data-thumbnails] button').nth(1).click();assert.equal(await page.evaluate(()=>editor.getState().selectedPhoto),'b'.repeat(32));
    await page.locator('[data-thumbnails] button').first().click();
    await page.locator('[data-tile]').click();assert.deepEqual(await page.evaluate(()=>editor.getState().region),[0,.75,.25,1]);
    await page.locator('[data-placement]').focus();await page.keyboard.press('ArrowRight');assert.equal((await page.evaluate(()=>editor.getState().region))[0],.01);
    const place=await page.locator('[data-placement]').boundingBox();await page.mouse.move(place.x+place.width/2,place.y+place.height/2);await page.mouse.down();await page.mouse.move(place.x+place.width/2+30,place.y+place.height/2+15,{steps:5});await page.mouse.up();
    assert.ok((await page.evaluate(()=>editor.getState().region))[0]>.01,'Region drag must move patch');
    const beforeResize=await page.evaluate(()=>editor.getState().region);await page.locator('[data-resize]').scrollIntoViewIfNeeded();const handle=await page.locator('[data-resize]').boundingBox();const hx=handle.x+handle.width/2,hy=handle.y+handle.height/2;
    if(width===412){const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:hx,y:hy}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:hx+20,y:hy+10}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
    else{await page.mouse.move(hx,hy);await page.mouse.down();await page.mouse.move(hx+20,hy+10,{steps:4});await page.mouse.up();}
    assert.ok((await page.evaluate(()=>editor.getState().region))[2]>beforeResize[2],'Resize handle grows selected region, including native Android-emulated touch');
    await page.locator('[data-advanced] summary').click();
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
    assert.equal(saved.hybridPreview.patches.length,1);assert.equal(saved.hybridPreview.visibility,'PRIVATE');assert.equal(saved.hybridPreview.roofShape,'gabled');assert.equal(saved.hybridPreview.streetFacingWall,0);
    saved.hybridPreview.patches[0].quad.forEach((p,i)=>p.forEach((n,j)=>assert.ok(Math.abs(n-quad[i][j])<.001,`Corner ${i}/${j}: ${n}, expected ${quad[i][j]}`)));
    await page.locator('[data-advanced] summary').click();
    await page.locator('[data-viewer]').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${width}-preview.png`});
    await page.locator('[data-viewer]').screenshot({path:`${out}/${width}-model.png`});
    await page.locator('[data-thumbnails]').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${width}-visual-editor.png`});
    // A second crop on the same side retains the first; an overlap is rejected.
    await page.locator('[data-new]').click();await page.locator('[data-side="1"]').click();await page.locator('[data-tile]').click();
    await page.locator('[data-add]').click();await page.waitForFunction(()=>editor.getState().patches===2);
    await page.locator('[data-new]').click();await page.locator('[data-tile]').click();await page.locator('[data-add]').click();
    assert.match(await page.locator('[data-status]').innerText(),/overlaps/);assert.equal(await page.evaluate(()=>editor.getState().patches),2);
    await page.locator('[data-undo]').click();await page.waitForFunction(()=>editor.getState().patches===1);
    await page.locator('[data-patches] button',{hasText:'Remove'}).click();await page.waitForFunction(()=>window.editor.getState().patches===0);
    await page.locator('[data-undo]').click();await page.waitForFunction(()=>window.editor.getState().patches===1);
    await page.locator('[data-close]').click();assert.equal(await page.locator('.captureHybridEditor').count(),0);
    await page.evaluate(()=>openReplay());assert.equal(await page.evaluate(()=>editor.getState().patches),1);
    await page.locator('[data-recovery]').waitFor({state:'visible'});
    await page.locator('[data-recover]').click();
    await page.waitForFunction(()=>editor.getState().dirty);
    await page.locator('[data-save]:enabled').waitFor();
    await page.locator('[data-save]').click();
    await page.waitForFunction(()=>editor.getState().revision===2&&!editor.getState().dirty);
    assert.equal(saved.hybridPreview.revision,2);
    const dimensions=await page.evaluate(()=>({w:innerWidth,scroll:document.querySelector('.captureHybridEditor').scrollWidth,client:document.querySelector('.captureHybridEditor').clientWidth}));assert.ok(dimensions.scroll<=dimensions.client+2);
    await page.evaluate(()=>replayAbort.abort());assert.equal(await page.locator('.captureHybridEditor').count(),0);
    await context.close();
  }
  assert.deepEqual(errors,[]);await writeFile(`${out}/report.json`,JSON.stringify({passed:true,roomTest,actualOwnerPhoto:!!privateDir,checks:roomTest?['six room surfaces','floor and ceiling placements','dimension edit and unchanged canonical building','private account revision via actual normalizer and HTTP double','close/reopen and second saved revision','desktop and Android-width layout']:['real photo thumbnails, paging, decode and four-point rectification','3D raycast wall tapping; orbit does not select','procedural mapped-footprint shell and shared gabled roof generator','grid move, keyboard move, native touch resize','two same-wall patches and overlap rejection','private revision save via actual validator with transport double','remove/undo/reopen','1100px, Android-emulated 412px, 390px fit','abort disposal'],limitations:['Manual example alignment is not an automatically registered reconstruction.','No cloud write, physical phone, or world publication tested here.'],errors},null,2));console.log('Hybrid UI passed on desktop and mobile width; no cloud reconstruction.');
}finally{await browser.close();await server.close();}
