import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

// Real UI, IndexedDB, canvas normalization and QR; explicit auth/storage transport doubles.
// No startup-selector wait, production requests or reconstruction acceptance claims.
const server = await startStaticServer({ rootDir: process.cwd(), ports: [4487, 4488, 4489] });
const origin = 'https://capture.test';
const out = 'output/verification/reality-capture-ui';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const errors = [], captures = new Map(), uploaded = new Map();
let serial = 0, failNextUpload = false, failNextProgress = false, releaseProgress = null;
let savedPhotoDataUrl='';
const authModule = `let user=null;const listeners=new Set();
export const getCurrentUser=()=>user;
export const observeAuth=cb=>{listeners.add(cb);queueMicrotask(()=>cb(user));return()=>listeners.delete(cb)};
export function setUser(uid){user=uid?{uid,email:uid+'@example.test',isAnonymous:false}:null;listeners.forEach(cb=>cb(user));return user;}
export const signInWithGoogle=async()=>setUser('owner');
export const signInWithEmailPassword=async(email)=>setUser(email.split('@')[0]);
export const signOutUser=async()=>setUser(null);
export const resolveRedirectSignIn=async()=>user;`;
async function makePage(viewport, mobile = false) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    const module = body => route.fulfill({ contentType: 'text/javascript', body });
    if (url.pathname.endsWith('/auth-ui.js')) return module(authModule);
    if (url.pathname.endsWith('/firebase-init.js')) return module(`import {getCurrentUser} from '/js/auth-ui.js?v=55';export const initFirebase=()=>({storage:{},auth:{get currentUser(){return getCurrentUser()}}});`);
    if (url.pathname.endsWith('/function-api.js')) return module(`import {getCurrentUser} from '/js/auth-ui.js?v=55';export async function postProtectedFunction(name,body={}){const r=await fetch('/__test'+name,{method:'POST',body:JSON.stringify({uid:getCurrentUser()?.uid,...body})});const data=await r.json();if(!r.ok){const e=new Error(data.error);e.status=r.status;throw e;}return data;}export const postAppCheckedFunction=postProtectedFunction;`);
    if (url.pathname.endsWith('firebase-storage.js')) return module(`export const ref=(_,path)=>path;
      export function uploadBytesResumable(path,blob,metadata){let cancelled=false;return {snapshot:{totalBytes:blob.size},cancel(){cancelled=true},on(_,progress,error,done){fetch('/__test/upload',{method:'POST',body:JSON.stringify({path,metadata})}).then(async r=>{if(cancelled||!r.ok)throw Error('Upload interrupted. Retry to continue.');progress({bytesTransferred:blob.size,totalBytes:blob.size});done()}).catch(error);}}}`);
    if (url.pathname.startsWith('/__test/')) {
      const input = route.request().postDataJSON(), action = url.pathname.slice(8);
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (action === 'upload') {
        if (failNextUpload) { failNextUpload = false; return json({ error: 'interrupted' }, 503); }
        const captureId = input.path.split('/')[2], photos = uploaded.get(captureId) || [];
        const id = input.path.split('/').at(-1).split('.')[0];
        if (!photos.some(p => p.id === id)) photos.push({ id, sector: Number(input.metadata.customMetadata.sector) });
        uploaded.set(captureId, photos); return json({ ok: true });
      }
      if (!input.uid) return json({ error: 'Sign in first.' }, 401);
      if (action === 'createRealityCaptureDraft') {
        const capture = { ...input, captureId: `capture-${++serial}`, ownerUid: input.uid, status: 'draft' };
        captures.set(capture.captureId, capture); return json({ capture });
      }
      if (action === 'listMyRealityCaptures') return json({ captures: [...captures.values()].filter(c => c.ownerUid === input.uid) });
      const capture = captures.get(input.captureId);
      if (!capture || capture.ownerUid !== input.uid) return json({ error: 'Capture not found' }, 404);
      if (action === 'getMyRealityCapture') {
        if (releaseProgress) await releaseProgress;
        if (failNextProgress) { failNextProgress = false; return json({ error: 'Temporary connection failure' }, 503); }
        return json({ capture, photos: uploaded.get(input.captureId) || [] });
      }
      if (action === 'retryRealityCapture') return json({error:'Reconstruction is development-only.'},403);
      if (action === 'getRealityCaptureAssetAccess') return json({url:savedPhotoDataUrl});
      if (action === 'reserveRealityCapturePhoto') return json({ reserved: true });
      if (action === 'finalizeRealityCaptureUpload') { assert.equal(input.mode,'manual'); capture.status = 'uploaded'; return json({ status: 'uploaded' }); }
      if (action === 'deleteRealityCapture') { captures.delete(input.captureId); return json({ deleted: true }); }
      return json({ error: 'Unexpected test endpoint' }, 500);
    }
    if (url.origin === origin) return route.fulfill({ response: await route.fetch({ url: `http://127.0.0.1:${server.port}${url.pathname}${url.search}` }) });
    if (['cdnjs.cloudflare.com', 'cdn.jsdelivr.net'].includes(url.hostname) && /three/.test(url.pathname)) return route.continue();
    return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(10_000);
  page.on('pageerror', error => errors.push(String(error))); return page;
}
const statusContains = (page, text) => page.waitForFunction(text => document.querySelector('[data-capture-status]')?.textContent.includes(text), text);
try {
  const desktop = await makePage({ width: 1440, height: 900 });
  await desktop.goto(`${origin}/app/capture.html`, { waitUntil: 'networkidle' });
  await desktop.click('#googleSignIn');
  await desktop.evaluate(async () => {
    globalThis.capturePauseEvents = [];
    const { openRealityCaptureForBuilding } = await import('/app/js/reality-capture/ui.js?v=2');
    await openRealityCaptureForBuilding({ LOC: { lat: 39.29, lon: -76.61 },
      setPauseReason: (reason, active) => capturePauseEvents.push([reason, active]),
      buildings: [{ sourceBuildingId: 'osm:way:424242', geometrySource: 'osm', minX: 0, maxX: 10, minZ: 0, maxZ: 10 }],
      worldToLatLon: () => ({ lat: 39.29, lon: -76.61 })
    }, { id: 'osm:way:424242', label: 'Selected test house', position: { x: 5, z: 5 } });
  });
  assert.deepEqual(await desktop.evaluate(() => capturePauseEvents), [['reality_capture', true]]);
  await desktop.locator('[data-building-details] summary').click();
  await desktop.fill('[data-building-floors]','2');
  await desktop.fill('[data-building-units]','5');
  await desktop.selectOption('[data-building-roofShape]','gabled');
  await desktop.fill('[data-building-referenceLabel]','Door frame, brick to brick');
  await desktop.fill('[data-building-referenceWidthMeters]','1.016');
  await desktop.fill('[data-building-referenceHeightMeters]','2.0828');
  await desktop.click('[data-capture-phone]');
  await desktop.locator('[data-capture-link-box]').waitFor({ state: 'visible' });
  const link = await desktop.locator('[data-capture-link]').getAttribute('href');
  assert.equal(link, `${origin}/app/capture.html#capture=capture-1`);
  assert.equal(captures.size, 1);
  assert.equal(captures.get('capture-1').buildingDetails.units,'5');
  assert.ok(await desktop.locator('[data-capture-qr]').evaluate(c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some(v => v > 0)));
  await desktop.screenshot({ path: `${out}/desktop-phone-handoff.png` });
  const phone = await makePage({ width: 390, height: 844 }, true);
  await phone.goto(link, { waitUntil: 'networkidle' });
  assert.equal(await phone.locator('#phoneSignIn').isVisible(), true);
  assert.equal(await phone.locator('#realityCapturePanel.show').count(), 0);
  await phone.fill('input[name=email]', 'other@example.test');
  await phone.fill('input[name=password]', 'test-only');
  await phone.click('#emailSignIn button');
  await phone.waitForFunction(() => document.getElementById('phoneStatus').textContent.includes('unavailable for this account'));
  assert.equal(await phone.locator('#realityCapturePanel.show').count(), 0);
  await phone.click('#switchAccount'); await phone.click('#googleSignIn');
  await phone.locator('#realityCapturePanel.show').waitFor();
  await phone.locator('[data-building-details] summary').click();
  assert.equal(await phone.locator('[data-building-referenceWidthMeters]').inputValue(),'1.016');
  assert.equal(await phone.locator('[data-building-referenceWidthMeters]').isDisabled(),true);
  await phone.screenshot({path:`${out}/mobile-building-measurements.png`});
  await phone.locator('[data-building-details] summary').click();
  await phone.locator('#realityCapturePanel.show').waitFor();
  assert.equal(await phone.locator('[data-capture-label]').innerText(), 'Selected test house');
  await phone.click('[data-capture-live-camera]');
  await phone.locator('[data-camera-shutter]:enabled').waitFor();
  await phone.click('[data-camera-shutter]');
  await phone.waitForFunction(() => document.querySelector('[data-camera-status]').textContent.includes('1 photo saved'));
  await phone.click('[data-camera-retake]');
  await phone.waitForFunction(() => document.querySelector('[data-camera-status]').textContent.includes('Last local photo removed'));
  await phone.click('[data-camera-done]');
  assert.match(await phone.locator('[data-capture-count]').textContent(), /^0 /);
  assert.match(await phone.locator('[data-capture-photo-guide]').innerText(), /70%/);
  await phone.click('[data-sector-index="2"]');
  assert.match(await phone.locator('[data-capture-photo-guide] svg').getAttribute('aria-label'), /Position 3 selected/);
  await phone.locator('.captureVisualGuide:has([data-capture-photo-guide])').scrollIntoViewIfNeeded();
  await phone.screenshot({ path: `${out}/mobile-exterior-guide.png` });
  await phone.click('[data-sector-index="0"]');
  await phone.locator('.captureVisualGuide:has([data-capture-photo-guide]) summary').click();
  const photo = await phone.evaluate(() => {
    const c=document.createElement('canvas');c.width=1600;c.height=1200;const x=c.getContext('2d');
    x.fillStyle='#c6985a';x.fillRect(0,0,1600,1200);x.fillStyle='#173e52';
    for(let i=0;i<1500;i+=120)x.fillRect(i,100,60,600);
    return c.toDataURL('image/png').split(',')[1];
  });
  const file = { name: 'capture-fixture.png', mimeType: 'image/png', buffer: Buffer.from(photo, 'base64') };
  savedPhotoDataUrl='data:image/png;base64,'+photo;
  await phone.locator('[data-capture-input]').setInputFiles([file, file, file]);
  await statusContains(phone, '3 photos are saved');
  assert.match(await phone.locator('[data-capture-sectors] button.active').innerText(), /Front/);
  assert.equal(await phone.locator('[data-capture-sectors] button.covered').count(), 1);
  await phone.getByText('View saved and new photos', { exact: true }).click();
  assert.equal(await phone.locator('[data-capture-photo-grid] img').count(), 3);
  await phone.waitForFunction(() => [...document.querySelectorAll('[data-capture-photo-grid] img')].every(image => image.naturalWidth > 0));
  await phone.locator('[data-capture-photo-grid]').scrollIntoViewIfNeeded();
  await phone.screenshot({ path: `${out}/mobile-photo-review.png` });
  await phone.locator('[data-remove-photo]').first().click();
  await phone.waitForFunction(() => document.querySelector('[data-capture-count]').textContent.startsWith('2 /'));
  await phone.locator('[data-capture-input]').setInputFiles(file);
  await phone.waitForFunction(() => document.querySelector('[data-capture-count]').textContent.startsWith('3 /'));
  await phone.getByText('View saved and new photos', { exact: true }).click();
  failNextUpload = true; await phone.click('[data-capture-save]'); await statusContains(phone, 'interrupted');
  await phone.click('[data-capture-save]'); await statusContains(phone, 'Photos saved privately to your account');
  assert.equal(uploaded.get('capture-1').length, 3);
  await desktop.click('[data-capture-refresh]');
  await desktop.waitForFunction(() => document.querySelector('[data-capture-server-status]').textContent.includes('3 photos uploaded'));
  assert.equal(captures.size, 1);
  await phone.reload({ waitUntil: 'networkidle' }); await phone.click('#googleSignIn');
  await phone.locator('#realityCapturePanel.show').waitFor();
  assert.match(await phone.locator('[data-capture-count]').innerText(), /^3 /);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await phone.screenshot({ path: `${out}/mobile-resumed-capture.png` });
  // Complete a fixture set through the visible controls; this tests submission, not reconstruction.
  await phone.locator('[data-capture-input]').setInputFiles([file, file, file]);
  await statusContains(phone, '6 photos are saved');
  assert.equal(captures.get('capture-1').exteriorScope, 'facade');
  for (let sector = 1; sector < 8; sector++) {
    // A single accessible facade must not require invented hidden-side labels.
    await phone.locator('[data-capture-input]').setInputFiles([file, file]);
    await statusContains(phone, `${6 + sector * 2} photos are saved`);
  }
  await phone.click('[data-capture-upload]');
  await statusContains(phone, 'Upload complete. Status: uploaded');
  assert.equal(uploaded.get('capture-1').length, 20);
  assert.ok(uploaded.get('capture-1').every(photo => photo.sector === 0));
  assert.equal(await phone.locator('[data-capture-upload]').isDisabled(), true);
  captures.get('capture-1').status = 'processing_failed';
  captures.get('capture-1').uploadSummary = { photoCount: 20 };
  await phone.click('[data-capture-refresh]');
  assert.equal(await phone.locator('[data-capture-retry]').isVisible(), false);
  // Old jobs may still be viewed, but the public UI cannot launch a retry.
  captures.get('capture-1').status='queued';
  await phone.click('[data-capture-refresh]');
  await desktop.click('[data-capture-refresh]');
  await desktop.waitForFunction(() => document.querySelector('[data-capture-server-status]').textContent.toLowerCase().includes('queued'));
  // Hold an actual request to observe immediate CTA feedback, not a fast-response snapshot.
  let release;
  releaseProgress = new Promise(resolve => { release = resolve; });
  await phone.click('[data-capture-refresh]');
  assert.equal(await phone.locator('[data-capture-refresh]').textContent(), 'Checking…');
  assert.equal(await phone.locator('[data-capture-refresh]').isDisabled(), true);
  assert.equal(await phone.locator('[data-capture-processing-status]').getAttribute('aria-busy'), 'true');
  await phone.screenshot({ path: `${out}/mobile-checking-progress.png` });
  releaseProgress = null; release();
  await phone.waitForFunction(() => !document.querySelector('[data-capture-refresh]').disabled);
  assert.match(await phone.locator('[data-capture-checked]').textContent(), /Last successful check:/);
  const lastChecked = await phone.locator('[data-capture-checked]').textContent();
  failNextProgress = true;
  await phone.click('[data-capture-refresh]');
  await phone.waitForFunction(() => document.querySelector('[data-capture-processing-status]').dataset.state === 'error');
  assert.match(await phone.locator('[data-capture-server-status]').textContent(), /could not be refreshed/);
  assert.equal(await phone.locator('[data-capture-checked]').textContent(), lastChecked);
  await phone.click('[data-capture-refresh]');
  await phone.waitForFunction(() => document.querySelector('[data-capture-processing-status]').dataset.state === 'queued');
  await phone.waitForFunction(() => !document.querySelector('[data-capture-refresh]').disabled);
  await phone.screenshot({ path: `${out}/mobile-checked-progress.png` });
  // A ready check reveals the actual next action, without silently downloading a model.
  captures.get('capture-1').status = 'review_required';
  captures.get('capture-1').processed = { optimizedModelPath: 'fixture/private-result.glb' };
  await phone.click('[data-capture-refresh]');
  await phone.waitForFunction(() => document.activeElement?.matches('[data-capture-preview]'));
  assert.equal(await phone.locator('[data-capture-result]').isVisible(), true);
  assert.equal(await phone.locator('[data-capture-viewer] canvas').count(), 0);
  assert.match(await phone.locator('[data-capture-registration]').textContent(), /no retained photo-matching report/);
  captures.get('capture-1').processed.registration = {status:'available',registeredCount:7,submittedCount:20};
  await phone.click('[data-capture-refresh]');
  await phone.waitForFunction(() => document.querySelector('[data-capture-registration]').textContent.includes('7 of 20'));
  assert.match(await phone.locator('[data-capture-registration]').textContent(), /may be incomplete/);
  await phone.waitForFunction(() => !document.querySelector('[data-capture-refresh]').disabled);
  await phone.screenshot({path:`${out}/mobile-partial-reconstruction-warning.png`});
  captures.get('capture-1').processed.registration.registeredCount = 20;
  await phone.click('[data-capture-refresh]');
  await phone.waitForFunction(() => document.querySelector('[data-capture-registration]').textContent.includes('20 of 20'));
  assert.match(await phone.locator('[data-capture-registration]').textContent(), /does not confirm/);
  const returning=await makePage({width:412,height:915},true);
  await returning.goto(`${origin}/app/capture.html#capture=capture-1`);await returning.click('#googleSignIn');
  await returning.locator('#realityCapturePanel.show').waitFor();
  await returning.locator('[data-capture-gallery] summary').click();
  await returning.waitForFunction(()=>document.querySelectorAll('[data-capture-photo-grid] img').length===6&&[...document.querySelectorAll('[data-capture-photo-grid] img')].every(x=>x.naturalWidth>0));
  assert.match(await returning.locator('[data-photo-page]').textContent(),/1–6 of 20/);
  await returning.click('[data-photo-next]');
  await returning.waitForFunction(()=>[...document.querySelectorAll('[data-capture-photo-grid] img')].every(x=>x.naturalWidth>0));
  assert.match(await returning.locator('[data-photo-page]').textContent(),/7–12 of 20/);
  await returning.screenshot({path:`${out}/returning-phone-saved-photos.png`});
  await returning.context().close();
  captures.get('capture-1').status = 'queued';
  delete captures.get('capture-1').processed;
  // New room editing is roadmap-only. Existing private records still reopen.
  assert.equal(await desktop.locator('[data-capture-kind="interior_room"]').isVisible(),false);
  captures.set('capture-2',{...captures.get('capture-1'),captureId:'capture-2',captureKind:'interior_room',status:'draft',permissionConfirmed:true,publicContributionRequested:false,room:{label:'Kitchen',widthMeters:5.5,lengthMeters:6,heightMeters:2.7}});
  serial=2;
  await phone.goto(`${origin}/app/capture.html#capture=capture-2`, { waitUntil: 'networkidle' });
  // A fragment-only handoff keeps the existing signed-in browser session.
  if (await phone.locator('#googleSignIn').isVisible()) await phone.click('#googleSignIn');
  await phone.locator('#realityCapturePanel.show').waitFor();
  // A fragment navigation can leave the previous panel visible while the
  // authenticated handoff resolves. Wait for this room, not any open dialog.
  await phone.waitForFunction(()=>document.querySelector('[data-room-label]')?.value==='Kitchen');
  assert.equal(await phone.locator('[data-room-label]').inputValue(), 'Kitchen');
  assert.equal(await phone.locator('[data-room-width]').inputValue(), '5.5');
  assert.equal(await phone.locator('[data-room-permission]').isChecked(), true);
  assert.equal(await phone.locator('[data-public-contribution]').isChecked(), false);
  assert.equal(await phone.locator('[data-capture-sectors] button').count(), 6);
  await desktop.keyboard.press('Escape');
  assert.equal(await desktop.locator('#realityCapturePanel.show').count(), 0);
  assert.deepEqual(await desktop.evaluate(() => capturePauseEvents.at(-1)), ['reality_capture', false]);
  assert.match(await phone.locator('[data-capture-photo-guide]').innerText(), /one room at a time/);
  if (!await phone.locator('.captureVisualGuide:has([data-capture-photo-guide])').getAttribute('open').then(value => value !== null)) await phone.locator('.captureVisualGuide:has([data-capture-photo-guide]) summary').click();
  assert.equal(await phone.locator('[data-capture-photo-guide] svg').isVisible(), true);
  await phone.locator('.captureVisualGuide:has([data-capture-photo-guide])').scrollIntoViewIfNeeded();
  await phone.screenshot({ path: `${out}/mobile-room-guide.png` });
  await phone.screenshot({ path: `${out}/mobile-private-room.png` });
  // Actual encoded MP4 → browser decode → normalization → existing local store.
  // The moving pattern is a media fixture, not building reconstruction evidence.
  await phone.evaluate(async () => {
    const canvas=document.createElement('canvas'); canvas.width=1280; canvas.height=720;
    const ctx=canvas.getContext('2d'); let frame=0;
    const draw=()=>{for(let x=0;x<1280;x+=40){ctx.fillStyle=`hsl(${(x+frame*7)%360} 85% 50%)`;ctx.fillRect(x,0,40,720);}frame++;};
    draw(); const stream=canvas.captureStream(15);
    const chunks=[]; const recorder=new MediaRecorder(stream,{mimeType:'video/mp4;codecs=avc1.42001E'});
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    const stopped=new Promise(resolve=>recorder.onstop=resolve);
    recorder.start(); const timer=setInterval(draw,70);
    await new Promise(resolve=>setTimeout(resolve,2200));recorder.stop();await stopped;
    clearInterval(timer);stream.getTracks().forEach(t=>t.stop());
    window.captureVideoFixture=new File(chunks,'local-test.mp4',{type:'video/mp4'});
    const transfer=new DataTransfer();transfer.items.add(captureVideoFixture);
    const input=document.querySelector('[data-capture-video]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await statusContains(phone,'video frames saved locally');
  const videoCount=await phone.locator('[data-capture-count]').textContent();
  assert.match(videoCount,/^[12] \/ 1 minimum/);
  const videoChecks=await phone.evaluate(async()=>{
    const {extractVideoFrames}=await import('/app/js/reality-capture/video-frames.js?v=1');
    const aborted=new AbortController();aborted.abort();let stopped=false;
    try{await extractVideoFrames(captureVideoFixture,{signal:aborted.signal,onFrame:()=>{throw Error('must not save');}});}catch(e){stopped=e.name==='AbortError';}
    let invalid=false;try{await extractVideoFrames(new File(['bad'],'bad.txt',{type:'text/plain'}),{signal:new AbortController().signal,onFrame:()=>{}});}catch{invalid=true;}
    return{stopped,invalid};
  });
  assert.deepEqual(videoChecks,{stopped:true,invalid:true});
  await phone.locator('[data-capture-video]').locator('..').scrollIntoViewIfNeeded();
  await phone.screenshot({path:`${out}/mobile-video-import.png`});
  await phone.reload();
  if(await phone.locator('#googleSignIn').isVisible())await phone.click('#googleSignIn');
  await phone.locator('#realityCapturePanel.show').waitFor();
  assert.equal(await phone.locator('[data-capture-count]').textContent(),videoCount);
  await phone.evaluate(async () => (await import('/js/auth-ui.js?v=55')).setUser('other'));
  assert.equal(await phone.locator('#realityCapturePanel.show').count(), 0);
  await phone.waitForFunction(() => document.getElementById('phoneStatus').textContent.includes('unavailable for this account'));
  // Exercise the actual shared Three.js review renderer. This deliberately
  // labelled box verifies transforms/controls, NOT reconstruction fidelity.
  await phone.evaluate(async () => {
    document.body.innerHTML = '<main style="padding:12px;color:white;background:#102b36"><h1>Placement check</h1><p>Synthetic box · viewer test only</p><div id="review"></div><button id="move">Move model 2 m</button><button id="rotate">Rotate view</button></main>';
    const { loadClassicScript } = await import('/app/js/modules/script-loader.js?v=56');
    await loadClassicScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
    const geometry = new THREE.BoxGeometry(6, 4, 8); geometry.translate(0, 2, 0);
    const positions = geometry.attributes.position.array;
    const indices = geometry.index.array;
    const bin = new Uint8Array(positions.byteLength + indices.byteLength);
    bin.set(new Uint8Array(positions.buffer)); bin.set(new Uint8Array(indices.buffer), positions.byteLength);
    const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
      materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.72, 0.48, 0.25, 1], metallicFactor: 0 } }],
      buffers: [{ byteLength: bin.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }, { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength }],
      accessors: [{ bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: [-3, 0, -4], max: [3, 4, 4] }, { bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR' }] };
    const text = new TextEncoder().encode(JSON.stringify(json)); const padded = Math.ceil(text.length / 4) * 4;
    const bytes = new ArrayBuffer(28 + padded + bin.length), view = new DataView(bytes);
    view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.byteLength, true);
    view.setUint32(12, padded, true); view.setUint32(16, 0x4e4f534a, true);
    new Uint8Array(bytes, 20, padded).fill(32); new Uint8Array(bytes, 20, text.length).set(text);
    view.setUint32(20 + padded, bin.length, true); view.setUint32(24 + padded, 0x004e4942, true); new Uint8Array(bytes, 28 + padded).set(bin);
    const { createCaptureViewer } = await import('/app/js/reality-capture/result-viewer.js?v=1');
    window.reviewAbort = new AbortController();
    window.reviewViewer = await createCaptureViewer(document.getElementById('review'), bytes, reviewAbort.signal, {
      alignment: {}, spatialContext: { footprint: [{ x: -3, z: -4 }, { x: 3, z: -4 }, { x: 3, z: 4 }, { x: -3, z: 4 }], height: { meters: 4 }, entrance: { x: 0, z: 4 } }
    });
    document.getElementById('move').onclick = () => reviewViewer.updateAlignment({ positionOffset: { x: 2 }, rotationYDegrees: 0, scale: 1 });
    document.getElementById('rotate').onclick = () => reviewViewer.rotate();
    window.render_game_to_text = () => JSON.stringify({ mode: 'capture-placement-fixture', ...reviewViewer.getPlacement() });
  });
  assert.deepEqual(await phone.evaluate(() => reviewViewer.getPlacement().position), [0, 0, 0]);
  await phone.click('#move'); await phone.click('#rotate');
  assert.deepEqual(await phone.evaluate(() => reviewViewer.getPlacement().position), [2, 0, 0]);
  assert.equal(await phone.evaluate(() => reviewViewer.getPlacement().rotationY), 0, 'view rotation must not alter published placement');
  await phone.screenshot({ path: `${out}/mobile-placement-review.png` });
  await phone.evaluate(() => reviewAbort.abort());
  assert.equal(await phone.locator('#review canvas').count(), 0);
  captures.get('capture-1').status='review_required';
  const continuation=await makePage({width:412,height:915},true);
  await continuation.goto(`${origin}/app/capture.html#capture=capture-1`);await continuation.click('#googleSignIn');
  await continuation.locator('#realityCapturePanel.show').waitFor();
  await continuation.click('[data-capture-new-set]');
  await statusContains(continuation,'New photo set ready');
  assert.equal(captures.get('capture-1').status,'review_required');
  assert.equal(uploaded.get('capture-1').length,20);
  assert.equal(await continuation.locator('[data-capture-video]').isEnabled(),true);
  await continuation.click('[data-capture-live-camera]');
  await continuation.waitForFunction(()=>document.querySelector('[data-camera-shutter]')&&!document.querySelector('[data-camera-shutter]').disabled);
  await continuation.screenshot({path:`${out}/returning-phone-new-camera.png`});
  await continuation.click('[data-camera-done]');
  await continuation.context().close();
  assert.deepEqual(errors, []);
  await writeFile(`${out}/report.json`, JSON.stringify({ ok: true, checks: [
    'desktop QR and exact capture link', 'same account required', 'wrong account denied',
    'real normalization and IndexedDB', 'no fabricated sector coverage', 'interrupted upload retry',
    'desktop sees phone uploads', 'reload deduplicates', 'account change closes private session', '390px layout fits',
    '20-photo submission and cross-device queued status', 'room permission and exact room handoff', 'decoded thumbnail review and removal before upload',
    'actual GLB viewer preserves placement while camera rotates; abort releases canvas',
    'acknowledged retry remains queued when progress connection fails',
    'exterior and room framing templates follow selected view and disclose coverage limits',
    'guided camera saves through existing normalization and local store; retake removes the exact local photo',
    'manual progress check and unavailable/partial/all-registered coverage warnings',
    'user-reported building details survive desktop-to-phone handoff',
    'real encoded MP4 decodes into normalized local photos and survives reload; cancellation and invalid input rejected'
  ], errors, limitation: 'Auth/storage transport doubles; no real GPU or physical phone reconstruction.' }, null, 2));
  console.log('Capture UI passed, including progress, coverage warnings, building details and real MP4 import/reload; transport doubles, synthetic camera and GLB, not physical-phone or reconstruction acceptance.');
} catch (error) {
  console.error('Capture UI browser errors:', errors);
  for (const [index, context] of browser.contexts().entries()) {
    const page = context.pages()[0];
    if (page) await page.screenshot({ path: `${out}/failure-${index}.png` }).catch(() => {});
  }
  throw error;
} finally { await browser.close(); await server.close(); }
