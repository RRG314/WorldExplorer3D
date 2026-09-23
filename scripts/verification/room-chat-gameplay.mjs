import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import { collectBrowserGraphicsErrors } from './browser-graphics-errors.mjs';

for (const key of ['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST']) {
  assert.ok(process.env[key], `Refusing non-emulator account creation: ${key}`);
}
const root = path.resolve(process.env.WE3D_VERIFY_ROOT || 'dist');
const config = JSON.parse(await fs.readFile('config/firebase.staging.json'));
const out = 'output/verification/room-chat-gameplay';
await fs.mkdir(out, { recursive: true });
const report = { ok: false, checks: [], errors: [], buildId: JSON.parse(await fs.readFile(path.join(root, 'build-manifest.json'))).buildId };
const server = await startStaticServer({ rootDir: root, ports: [4491, 4492] });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const pages = [];
async function boot(label, mobile) {
  const context = await browser.newContext({ viewport: mobile ? { width: 412, height: 915 } : { width: 1100, height: 760 }, isMobile: mobile, hasTouch: mobile });
  await context.addInitScript(config => {
    globalThis.WORLD_EXPLORER_FIREBASE = config;
    globalThis.WORLD_EXPLORER_FIREBASE_ENV = 'staging';
    globalThis.WORLD_EXPLORER_FIREBASE_EMULATORS = { enabled: true, host: '127.0.0.1', authPort: 9099, firestorePort: 8080 };
    globalThis.WORLD_EXPLORER_FUNCTIONS_ORIGIN = `http://127.0.0.1:5001/${config.projectId}/us-central1`;
  }, config);
  const page = await context.newPage(); pages.push(page);
  page.on('pageerror', error => report.errors.push(String(error)));
  collectBrowserGraphicsErrors(page, report.errors);
  await page.goto(`http://127.0.0.1:${server.port}/app/?launch=moon&gm=free`);
  await page.waitForFunction(() => window.__WE3D_RUNTIME_READY__, null, { timeout: 60000 });
  if (await page.locator('#analyticsConsentDenyBtn').isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
  assert.equal(await page.locator('#roomChatDrawer').evaluate(e => e.inert && e.getAttribute('aria-hidden') === 'true'), true);
  const uid = await page.evaluate(async label => {
    const { auth } = WorldExplorerFirebase.initFirebase();
    const sdk = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
    return (await sdk.createUserWithEmailAndPassword(auth, `${label}-${Date.now()}@example.test`, 'Emulator-Only-Test-93!')).user.uid;
  }, label);
  await page.locator('[data-globe-destination="multiplayer"]:visible').click();
  await page.waitForFunction(() => /Multiplayer ready/.test(document.getElementById('mpTitleStatus')?.textContent || ''), null, { timeout: 20000 });
  return { page, uid };
}
async function ready(page) {
  await page.waitForFunction(() => { const s = window.getWorldExplorerRuntimeDiagnostics?.(); return s?.gameStarted && !s.worldLoading && s.environment === 'MOON' && !s.planetary?.traveling; }, null, { timeout: 90000 });
}
try {
  const owner = await boot('owner', false);
  await owner.page.locator('#mpCreateRoomDetails summary').click();
  await owner.page.locator('#mpTitleRoomNameInput').fill('Room chat gameplay check');
  await owner.page.locator('#mpTitleCreateBtn').click();
  await ready(owner.page);
  const code = (await owner.page.locator('#roomPanelRoomCode').textContent()).match(/\b[A-Z2-9]{6}\b/)?.[0];
  assert.ok(code);
  const member = await boot('member', true);
  await member.page.locator('#mpTitleCodeInput').fill(code);
  await member.page.locator('#mpTitleJoinBtn').click();
  await ready(member.page);
  report.checks.push('Two independent authenticated clients create and join through normal UI and load full Moon worlds');
  await member.page.locator('#communityBtn').click();
  await member.page.locator('#fMpChat').click();
  await member.page.locator('#roomChatInput').fill('Room focus delivery check');
  await member.page.locator('#roomChatSendBtn').click();
  await owner.page.waitForFunction(() => document.getElementById('roomChatMessages')?.textContent.includes('Room focus delivery check'), null, { timeout: 15000 });
  await member.page.screenshot({ path: `${out}/chat-open.png` });
  report.checks.push('Message sent through mobile chat is received by the independent desktop client');
  const readPose = () => owner.page.evaluate(async ({ code, uid }) => {
    const sdk = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    return (await sdk.getDocFromServer(sdk.doc(WorldExplorerFirebase.initFirebase().db, 'rooms', code, 'players', uid))).data().pose;
  }, { code, uid: member.uid });
  const before = await readPose();
  await member.page.locator('#roomChatCloseBtn').click();
  const hidden = await member.page.locator('#roomChatDrawer').evaluate(e => e.inert && e.getAttribute('aria-hidden') === 'true' && !e.contains(document.activeElement));
  assert.equal(hidden, true);
  // No canvas click or focus manipulation between closing chat and movement.
  await member.page.keyboard.down('KeyW');
  await member.page.waitForTimeout(1800);
  await member.page.keyboard.up('KeyW');
  await owner.page.waitForTimeout(5000);
  const after = await readPose();
  report.movement = { before, after, displacement: Math.hypot(after.x - before.x, after.z - before.z) };
  assert.ok(report.movement.displacement > 1, 'Movement after chat close must reach the other client');
  report.checks.push('Closing chat restores normal driving with no extra pointer action; the other client reads changed committed position');
  await member.page.screenshot({ path: `${out}/chat-closed-driving.png` });
  assert.deepEqual(report.errors, []);
  report.ok = true;
} catch (error) {
  report.error = String(error.stack || error);
  for (const [i, page] of pages.entries()) await page.screenshot({ path: `${out}/failure-${i}.png`, timeout: 10000 }).catch(() => {});
} finally {
  await browser.close();
  await server.close();
  await fs.writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report));
if (!report.ok) process.exitCode = 1;
