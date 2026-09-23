import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import { collectBrowserGraphicsErrors } from './browser-graphics-errors.mjs';
import { pauseWaitingPlayer } from './pause-waiting-player.mjs';
import { selectLowRenderQuality } from './render-quality-ui.mjs';
import { advanceGameplay } from './gameplay-simulation.mjs';

for (const key of ['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST']) {
  assert.ok(process.env[key], `Refusing non-emulator account creation: ${key}`);
}
const root = path.resolve(process.env.WE3D_VERIFY_ROOT || 'dist');
const config = JSON.parse(await fs.readFile('config/firebase.staging.json'));
const out = 'output/verification/room-chat-gameplay';
await fs.mkdir(out, { recursive: true });
const report = { ok: false, checks: [], errors: [], buildId: JSON.parse(await fs.readFile(path.join(root, 'build-manifest.json'))).buildId,
  browserBudget: { renderQuality: process.env.CI ? 'low (normal Settings UI)' : 'default', deviceScaleFactor: process.env.CI ? .5 : 1, foregroundGameplayWorlds: 1, browserProcesses: 2, waitingClient: 'normal manual pause; network remains active', evidenceScope: 'two full clients; one rendering at a time; functional chat/movement, not simultaneous-rendering, performance or default-quality graphics acceptance' } };
const server = await startStaticServer({ rootDir: root, ports: [4491, 4492] });
const browsers = [];
const pages = [];
async function boot(label, mobile) {
  // Separate devices do not share one Chrome GPU process or its allocation
  // quota. Keep client identities and render resources independently owned.
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--js-flags=--max-old-space-size=1024'] });
  browsers.push(browser);
  const context = await browser.newContext({ viewport: mobile ? { width: 412, height: 915 } : { width: 1100, height: 760 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: report.browserBudget.deviceScaleFactor });
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
  if (process.env.CI) await selectLowRenderQuality(page);
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
  report.ownerPause = await pauseWaitingPlayer(owner.page);
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
  const readLocalPose = () => member.page.evaluate(async () => {
    const { readPoseSnapshot } = await import('/app/js/multiplayer/ui-room-pose.js?v=4');
    return readPoseSnapshot().pose;
  });
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const localBefore = await readLocalPose();
  let before;
  const spawnDeadline = Date.now() + 20000;
  do {
    before = await readPose();
    if (before && distance(before, localBefore) < .25) break;
    await member.page.waitForTimeout(250);
  } while (Date.now() < spawnDeadline);
  assert.ok(before && distance(before, localBefore) < .25,
    `Remote baseline must match the loaded spawn, not the room's initial placeholder: ${JSON.stringify({ before, localBefore })}`);
  report.spawnBaseline = { local: localBefore, committed: before };
  await member.page.locator('#roomChatCloseBtn').click();
  const hidden = await member.page.locator('#roomChatDrawer').evaluate(e => e.inert && e.getAttribute('aria-hidden') === 'true' && !e.contains(document.activeElement));
  assert.equal(hidden, true);
  // No canvas click or focus manipulation between closing chat and movement.
  await member.page.keyboard.down('KeyW');
  try { report.inputSimulation = await advanceGameplay(member.page, 2000); }
  finally { await member.page.keyboard.up('KeyW'); }
  const localAfter = await readLocalPose();
  assert.ok(distance(localBefore, localAfter) > 1, 'Closing chat must restore actual local driving input');
  let after;
  const movementDeadline = Date.now() + 20000;
  do {
    after = await readPose();
    if (after && distance(before, after) > 1) break;
    await member.page.waitForTimeout(250);
  } while (Date.now() < movementDeadline);
  report.movement = { before, after, localBefore, localAfter,
    displacement: after ? distance(before, after) : 0,
    timing: 'real DOM keyboard plus two seconds of runtime fixed-step simulation; not a performance measurement' };
  assert.ok(report.movement.displacement > 1 && report.movement.displacement < 100,
    'Movement after chat close must reach the other client from the loaded spawn without a world-sized jump');
  report.checks.push('Closing chat restores normal driving with no extra pointer action; the other client reads changed committed position');
  await member.page.screenshot({ path: `${out}/chat-closed-driving.png` });
  assert.deepEqual(report.errors, []);
  report.ok = true;
} catch (error) {
  report.error = String(error.stack || error);
  for (const [i, page] of pages.entries()) await page.screenshot({ path: `${out}/failure-${i}.png`, timeout: 10000 }).catch(() => {});
} finally {
  await Promise.allSettled(browsers.map(browser => browser.close()));
  await server.close();
  await fs.writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report));
if (!report.ok) process.exitCode = 1;
