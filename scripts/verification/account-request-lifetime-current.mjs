// Native-browser ESM integration with controlled Auth/Firestore/HTTP boundaries.
// Uses disposable state; this is not production sign-in or server acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import { closeOwnedBrowser } from './owned-browser.mjs';
const out = 'output/architecture-consolidation/2026-10-13/account-browser';
await fs.mkdir(out, { recursive: true });
const server = await startStaticServer({ rootDir: process.cwd(), ports: [4591, 4592] });
let owned, browser;
const errors = [], checks = [];
try {
  owned = await chromium.launchServer({ headless: true, channel: 'chrome' });
  browser = await chromium.connect(owned.wsEndpoint());
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const module = body => ({ status: 200, contentType: 'application/javascript', body });
  await page.route('**/js/auth-ui.js*', route => route.fulfill(module(`
    export const getCurrentUser = () => window.accountFixture.user;
    export const getCurrentUserToken = async () => { if(window.accountFixture.tokenGate) await window.accountFixture.tokenGate; return 'fixture-token'; };
  `)));
  await page.route('**/js/firebase-init.js*', route => route.fulfill(module(`
    export const initFirebase=()=>({db:{}});
    export const readFirebaseConfig=()=>({projectId:'fixture-project'});
    export const getFirebaseAppCheckToken=async()=> 'fixture-attestation';
  `)));
  await page.route('https://www.gstatic.com/firebasejs/**/firebase-firestore.js', route => route.fulfill(module(`
    export const doc=(_db,...parts)=>parts.join('/');
    export function onSnapshot(ref,next,error){const row={ref,next,error,stopped:false};window.accountFixture.subscriptions.push(row);return ()=>{row.stopped=true;};}
  `)));
  await page.route('**/__account-lifetime', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Account lifecycle integration fixture</title><main><h1>Account lifecycle integration fixture</h1><p>Actual wallet and request modules; controlled services and disposable data.</p><button id="buy">Buy supplies</button><button id="switch">Switch account</button><output id="result"></output></main>' }));
  await page.goto(`http://127.0.0.1:${server.port}/__account-lifetime`);
  await page.evaluate(async () => {
    const f = window.accountFixture = { user: { uid: 'account-a' }, subscriptions: [], calls: 0, changes: 0, errors: 0 };
    f.tokenGate = new Promise(resolve => { f.releaseToken = resolve; });
    const { createConnectedExplorerWallet } = await import('/app/js/economy/connected-wallet-authority.js?v=2');
    f.create = createConnectedExplorerWallet;
    f.wallet = f.create({ onChange: () => f.changes++, onError: () => f.errors++ });
    window.fetch = async () => { f.calls++; if (f.responseGate) await f.responseGate; return Response.json({ accepted: true, credits: 42 }); };
    document.querySelector('#buy').onclick = async () => {
      try { f.result = await f.wallet.transact('buy', { id: 'store' }, 'water'); }
      catch (error) { f.result = { code: error.code, outcomeUnknown: error.outcomeUnknown }; }
      document.querySelector('#result').textContent = JSON.stringify(f.result);
    };
    document.querySelector('#switch').onclick = () => { f.user = { uid: 'account-b' }; f.releaseToken(); };
  });
  await page.locator('#buy').click(); await page.locator('#switch').click();
  await page.waitForFunction(() => window.accountFixture.result);
  let result = await page.evaluate(() => ({ result: accountFixture.result, calls: accountFixture.calls }));
  assert.equal(result.result.code, 'account-changed'); assert.equal(result.result.outcomeUnknown, false); assert.equal(result.calls, 0);
  checks.push('Account switch during a real button-initiated purchase sends no request');
  result = await page.evaluate(async () => {
    const f = accountFixture;
    for (const sub of f.subscriptions) { sub.next({ exists: () => true, data: () => ({ credits: 7, currencyVersion: 2 }) }); sub.error(new Error('old listener')); }
    const unchanged = f.wallet.snapshot().pending && f.changes === 0 && f.errors === 0;
    const oldResult = await f.wallet.transact('buy', { id: 'store' }, 'water');
    f.wallet.dispose(); const released = f.subscriptions.every(s => s.stopped);
    f.wallet = f.create(); f.result = null; f.tokenGate = null;
    const newResult = await f.wallet.transact('buy', { id: 'store' }, 'water');
    return { unchanged, oldAccepted: oldResult.accepted, released, newAccepted: newResult.accepted, calls: f.calls };
  });
  assert.deepEqual(result, { unchanged: true, oldAccepted: false, released: true, newAccepted: true, calls: 1 });
  checks.push('Stale snapshots/errors ignored; old commands rejected; fresh account reconnect succeeds');
  await page.evaluate(() => { const f = accountFixture; f.result = null; f.responseGate = new Promise(resolve => { f.releaseResponse = resolve; }); });
  await page.locator('#buy').click();
  await page.waitForFunction(() => accountFixture.calls === 2);
  await page.evaluate(() => { accountFixture.user = null; accountFixture.releaseResponse(); });
  await page.waitForFunction(() => accountFixture.result);
  result = await page.evaluate(() => accountFixture.result);
  assert.equal(result.code, 'account-changed'); assert.equal(result.outcomeUnknown, true);
  checks.push('Logout after dispatch suppresses stale success and preserves uncertain outcome without replay');
  await page.screenshot({ path: path.join(out, 'account-lifetime.png') });
  await page.evaluate(() => accountFixture.wallet.dispose());
  assert.deepEqual(errors, []);
  const report = { ok: true, scope: 'Native Chrome ESM, actual modules, controlled service boundaries; not live account acceptance', checks, pageErrors: errors };
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} catch (error) {
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify({ ok: false, checks, pageErrors: errors, error: error.message }, null, 2) + '\n');
  throw error;
} finally { if (owned) await closeOwnedBrowser(owned); await server.close(); }
