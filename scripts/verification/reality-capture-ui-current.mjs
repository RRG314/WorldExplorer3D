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
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const errors = [], captures = new Map(), uploaded = new Map();
let serial = 0, failNextUpload = false;
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
      if (action === 'getMyRealityCapture') return json({ capture, photos: uploaded.get(input.captureId) || [] });
      if (action === 'reserveRealityCapturePhoto') return json({ reserved: true });
      if (action === 'finalizeRealityCaptureUpload') { capture.status = 'queued'; return json({ status: 'queued' }); }
      if (action === 'deleteRealityCapture') { captures.delete(input.captureId); return json({ deleted: true }); }
      return json({ error: 'Unexpected test endpoint' }, 500);
    }
    if (url.origin === origin) return route.fulfill({ response: await route.fetch({ url: `http://127.0.0.1:${server.port}${url.pathname}${url.search}` }) });
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
    const { openRealityCaptureForBuilding } = await import('/app/js/reality-capture/ui.js?v=2');
    await openRealityCaptureForBuilding({ LOC: { lat: 39.29, lon: -76.61 },
      buildings: [{ sourceBuildingId: 'osm:way:424242', geometrySource: 'osm', minX: 0, maxX: 10, minZ: 0, maxZ: 10 }],
      worldToLatLon: () => ({ lat: 39.29, lon: -76.61 })
    }, { id: 'osm:way:424242', label: 'Selected test house', position: { x: 5, z: 5 } });
  });
  await desktop.click('[data-capture-phone]');
  await desktop.locator('[data-capture-link-box]').waitFor({ state: 'visible' });
  const link = await desktop.locator('[data-capture-link]').getAttribute('href');
  assert.equal(link, `${origin}/app/capture.html#capture=capture-1`);
  assert.equal(captures.size, 1);
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
  assert.equal(await phone.locator('[data-capture-label]').innerText(), 'Selected test house');
  const photo = await phone.evaluate(() => {
    const c=document.createElement('canvas');c.width=1600;c.height=1200;const x=c.getContext('2d');
    x.fillStyle='#c6985a';x.fillRect(0,0,1600,1200);x.fillStyle='#173e52';
    for(let i=0;i<1500;i+=120)x.fillRect(i,100,60,600);
    return c.toDataURL('image/png').split(',')[1];
  });
  const file = { name: 'capture-fixture.png', mimeType: 'image/png', buffer: Buffer.from(photo, 'base64') };
  await phone.locator('[data-capture-input]').setInputFiles([file, file, file]);
  await statusContains(phone, '3 photos are saved');
  assert.match(await phone.locator('[data-capture-sectors] button.active').innerText(), /Front/);
  assert.equal(await phone.locator('[data-capture-sectors] button.covered').count(), 1);
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
  for (let sector = 1; sector < 8; sector++) {
    await phone.click(`[data-sector-index="${sector}"]`);
    await phone.locator('[data-capture-input]').setInputFiles([file, file]);
    await statusContains(phone, `${6 + sector * 2} photos are saved`);
  }
  await phone.click('[data-capture-upload]');
  await statusContains(phone, 'Upload complete. Status: queued');
  assert.equal(uploaded.get('capture-1').length, 20);
  assert.equal(await phone.locator('[data-capture-upload]').isDisabled(), true);
  await desktop.click('[data-capture-refresh]');
  await desktop.waitForFunction(() => document.querySelector('[data-capture-server-status]').textContent.toLowerCase().includes('queued'));
  // An exterior handoff must not strand the desktop user: a separate room can still be started.
  await desktop.click('[data-capture-kind="interior_room"]');
  await desktop.locator('.realityCaptureRoom').waitFor({ state: 'visible' });
  await desktop.fill('[data-room-label]', 'Kitchen');
  await desktop.fill('[data-room-width]', '5.5');
  await desktop.click('[data-capture-phone]');
  await statusContains(desktop, 'Confirm permission');
  assert.equal(captures.size, 1);
  await desktop.check('[data-room-permission]');
  await desktop.click('[data-capture-phone]');
  await desktop.locator('[data-capture-link-box]').waitFor({ state: 'visible' });
  assert.equal(captures.size, 2);
  await phone.goto(await desktop.locator('[data-capture-link]').getAttribute('href'), { waitUntil: 'networkidle' });
  // A fragment-only handoff keeps the existing signed-in browser session.
  if (await phone.locator('#googleSignIn').isVisible()) await phone.click('#googleSignIn');
  await phone.locator('#realityCapturePanel.show').waitFor();
  assert.equal(await phone.locator('[data-room-label]').inputValue(), 'Kitchen');
  assert.equal(await phone.locator('[data-room-width]').inputValue(), '5.5');
  assert.equal(await phone.locator('[data-public-contribution]').isChecked(), false);
  assert.equal(await phone.locator('[data-capture-sectors] button').count(), 6);
  await phone.screenshot({ path: `${out}/mobile-private-room.png` });
  await phone.evaluate(async () => (await import('/js/auth-ui.js?v=55')).setUser('other'));
  assert.equal(await phone.locator('#realityCapturePanel.show').count(), 0);
  await phone.waitForFunction(() => document.getElementById('phoneStatus').textContent.includes('unavailable for this account'));
  assert.deepEqual(errors, []);
  await writeFile(`${out}/report.json`, JSON.stringify({ ok: true, checks: [
    'desktop QR and exact capture link', 'same account required', 'wrong account denied',
    'real normalization and IndexedDB', 'no fabricated sector coverage', 'interrupted upload retry',
    'desktop sees phone uploads', 'reload deduplicates', 'account change closes private session', '390px layout fits',
    '20-photo submission and cross-device queued status', 'room permission and exact room handoff'
  ], errors, limitation: 'Auth/storage transport doubles; no real GPU or physical phone reconstruction.' }, null, 2));
  console.log('Capture UI: 12 focused checks passed; transport doubles, not reconstruction acceptance.');
} catch (error) {
  console.error('Capture UI browser errors:', errors);
  for (const [index, context] of browser.contexts().entries()) {
    const page = context.pages()[0];
    if (page) await page.screenshot({ path: `${out}/failure-${index}.png` }).catch(() => {});
  }
  throw error;
} finally { await browser.close(); await server.close(); }
