import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { chromium } from 'playwright';
import { listenMmoServer } from '../server/src/server.js';

const outputDir = path.resolve('output/playwright/mmo-phase7');

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function startOwnedPreview() {
  if (process.env.WE3D_APP_URL) {
    return { appUrl: process.env.WE3D_APP_URL, process: null };
  }
  const port = await availablePort();
  const child = spawn(process.execPath, ['scripts/serve-local-preview.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  const appUrl = `http://127.0.0.1:${port}/app/`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Preview server exited before startup: ${stderr.trim()}`);
    }
    try {
      const response = await fetch(appUrl);
      if (response.ok) return { appUrl, process: child };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill('SIGTERM');
  throw new Error(`Preview server did not become ready at ${appUrl}. ${stderr.trim()}`);
}

async function installHarness(page, endpoint) {
  return page.evaluate(async ({ endpoint }) => {
    const [{ createAuthoritativeRoomClient }, { createMmoRoomPanel }, { ctx: appCtx }] = await Promise.all([
      import('./js/multiplayer/authoritative-client.js?v=7'),
      import('./js/multiplayer/ui-room-mmo.js?v=4'),
      import('./js/shared-context.js?v=55')
    ]);
    const client = createAuthoritativeRoomClient({ endpoint });
    const connected = await client.connect({
      id: 'LOCAL-EARTH',
      code: 'LOCAL-EARTH',
      world: { kind: 'earth', bodyId: 'earth', lat: 39.2904, lon: -76.6122 }
    });
    if (!connected) throw new Error('Authoritative client did not connect.');

    const ids = [
      'mmoProgressSummary', 'mmoMissionSelect', 'mmoMissionAcceptBtn', 'mmoMissionStatus',
      'mmoWeaponSelect', 'mmoWeaponEquipBtn', 'mmoTargetSelect', 'mmoAttackBtn',
      'mmoInteractBtn', 'mmoLeaderboardList', 'mmoWorldEditSummary', 'mmoDemolishBtn',
      'mmoRestoreSelect', 'mmoRestoreBtn'
    ];
    const refs = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
    const state = {
      authUser: { uid: 'local-owner' },
      players: [],
      mmoSelfUid: 'local-owner',
      mmoProgression: null,
      mmoCatalog: null,
      mmoLeaderboard: [],
      authoritativeSession: { client, getSnapshot: () => client.snapshot() }
    };
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
    const setStatus = (message, isError = false) => {
      const node = document.getElementById('roomPanelStatus');
      if (!node) return;
      node.textContent = String(message || '');
      node.dataset.error = isError ? 'true' : 'false';
    };
    const panelAppCtx = {
      ...appCtx,
      inspectNearestRoomBuilding: () => ({
      sourceId: 'osm:way/424242',
      label: 'Acceptance Building',
      distance: 3.2
      })
    };
    const panel = createMmoRoomPanel({ appCtx: panelAppCtx, refs, state, escapeHtml, setStatus });
    panel.wire();
    const apply = (snapshot) => {
      state.players = snapshot.players || [];
      state.mmoSelfUid = snapshot.selfUid || 'local-owner';
      state.mmoProgression = snapshot.progression || null;
      state.mmoCatalog = snapshot.catalog || null;
      state.mmoLeaderboard = snapshot.leaderboard || [];
      panel.render();
      document.getElementById('roomPanelPlayerCount').textContent = String(state.players.length);
      document.getElementById('roomPanelPlayerList').innerHTML = state.players.map((player) => (
        `<li class="mpPlayerItem"><span class="mpPlayerName">${escapeHtml(player.displayName)}</span><span class="mpPlayerMeta">${escapeHtml(player.role)} | ${escapeHtml(player.mode)}</span></li>`
      )).join('');
    };
    const release = client.subscribe(apply);
    apply(client.snapshot());

    const modal = document.getElementById('roomPanelModal');
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    document.getElementById('roomPanelRoomCode').textContent = 'LOCAL-EARTH';
    document.getElementById('roomPanelRoomName').textContent = 'Authoritative Earth acceptance room';
    globalThis.__mmoAcceptance = { client, state, panel, release, secondRoom: null };
    return true;
  }, { endpoint });
}

async function waitForPlatform(page) {
  await page.waitForFunction(() => {
    const acceptance = globalThis.__mmoAcceptance;
    return acceptance?.state?.mmoProgression && acceptance?.state?.mmoCatalog?.missions?.length >= 4;
  }, null, { timeout: 10000 });
}

await fs.mkdir(outputDir, { recursive: true });
const preview = await startOwnedPreview();
const appUrl = preview.appUrl;
const runtime = await listenMmoServer({ port: 0, allowTestAuth: true });
runtime.store.seedRoom({
  id: 'LOCAL-EARTH',
  ownerUid: 'local-owner',
  members: { 'local-player': 'player' },
  world: { kind: 'earth', bodyId: 'earth', lat: 39.2904, lon: -76.6122 },
  rules: { allowBuilding: true, allowDemolition: true, allowCombat: true }
});

const browser = await chromium.launch({
  headless: process.env.HEADED !== '1',
  args: ['--use-gl=angle', '--use-angle=swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const browserErrors = [];
const externalResourceErrors = [];
const productionServiceRequests = [];
const appOrigin = new URL(appUrl).origin;
await page.addInitScript(() => {
  globalThis.WORLD_EXPLORER_FIREBASE = {};
  globalThis.WORLD_EXPLORER_FIREBASE_ENV = 'test';
  try {
    localStorage.removeItem('worldExplorer3D.firebaseConfig');
  } catch {}
});
page.on('request', (request) => {
  const hostname = new URL(request.url()).hostname;
  if (hostname === 'firestore.googleapis.com' || hostname === 'www.google-analytics.com') {
    productionServiceRequests.push(request.url());
  }
});
page.on('pageerror', (error) => browserErrors.push(String(error)));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const text = message.text();
  const locationUrl = String(message.location()?.url || '');
  if (text.startsWith('Failed to load resource') && locationUrl && !locationUrl.startsWith(appOrigin)) {
    externalResourceErrors.push(`${locationUrl}: ${text}`);
    return;
  }
  browserErrors.push(locationUrl ? `${locationUrl}: ${text}` : text);
});
page.on('requestfailed', (request) => {
  const url = request.url();
  const detail = `${url}: ${request.failure()?.errorText || 'request failed'}`;
  if (url.startsWith(appOrigin)) browserErrors.push(detail);
  else externalResourceErrors.push(detail);
});

try {
  const url = new URL(appUrl);
  url.searchParams.set('candidate', 'mmo-browser-acceptance');
  url.searchParams.set('mmoEndpoint', runtime.url);
  url.searchParams.set('mmoTestToken', 'test:local-owner:Local Owner');
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#roomPanelModal', { state: 'attached', timeout: 60000 });
  await page.waitForFunction(() => Boolean(globalThis.Colyseus?.Client), null, { timeout: 10000 });
  await installHarness(page, runtime.url);
  await waitForPlatform(page);

  await page.selectOption('#mmoMissionSelect', 'mission.build.foundation');
  await page.click('#mmoMissionAcceptBtn');
  await page.waitForFunction(() => (
    globalThis.__mmoAcceptance?.state?.mmoProgression?.activeMission?.id === 'mission.build.foundation'
  ));
  await page.evaluate(async () => {
    const client = globalThis.__mmoAcceptance.client;
    for (let index = 0; index < 5; index += 1) {
      await client.send('world.object.place', {
        assetId: 'block.cube',
        position: { x: 5 + index * 2, y: 0, z: 6 },
        rotation: { x: 0, y: 0, z: 0 },
        payload: { metadata: { color: 'blue', shape: 'cube' } }
      });
    }
  });
  await page.waitForFunction(() => {
    const acceptance = globalThis.__mmoAcceptance;
    const completed = acceptance?.state?.mmoProgression?.missionCompletions?.['mission.build.foundation'];
    const option = document.querySelector('#mmoMissionSelect option[value="mission.build.foundation"]');
    return completed?.count === 1 && option?.disabled === true;
  });

  await page.evaluate(async ({ endpoint }) => {
    const sdk = new globalThis.Colyseus.Client(endpoint);
    sdk.auth.token = 'test:local-player:Local Player';
    const room = await sdk.joinOrCreate('world', { roomKey: 'LOCAL-EARTH' });
    room.onMessage('progression.snapshot', () => {});
    globalThis.__mmoAcceptance.secondRoom = room;
  }, { endpoint: runtime.url });
  await page.waitForFunction(() => document.querySelectorAll('#mmoTargetSelect option:not([value=""])').length === 1);

  await page.selectOption('#mmoMissionSelect', 'mission.combat.first');
  await page.click('#mmoMissionAcceptBtn');
  await page.selectOption('#mmoTargetSelect', 'local-player');
  for (let hit = 0; hit < 3; hit += 1) {
    await page.click('#mmoAttackBtn');
    await page.waitForTimeout(700);
  }
  await page.waitForFunction(() => {
    const profile = globalThis.__mmoAcceptance?.state?.mmoProgression;
    return profile?.stats?.eliminations === 1 &&
      profile?.missionCompletions?.['mission.combat.first']?.count === 1;
  });

  await page.evaluate(async () => {
    const acceptance = globalThis.__mmoAcceptance;
    const result = await acceptance.client.send('vehicle.spawn', {
      assetId: 'vehicle.compact',
      position: { x: 0, y: 0, z: 2 },
      rotation: { x: 0, y: 0, z: 0 }
    });
    acceptance.vehicleId = result.patch.id;
  });
  await page.waitForFunction(() => !document.getElementById('mmoInteractBtn').disabled);
  await page.click('#mmoInteractBtn');
  await page.waitForFunction(() => Boolean(
    globalThis.__mmoAcceptance?.state?.players?.find((player) => player.uid === 'local-owner')?.vehicleId
  ));
  await page.click('#mmoInteractBtn');
  await page.waitForFunction(() => !globalThis.__mmoAcceptance?.state?.players
    ?.find((player) => player.uid === 'local-owner')?.vehicleId);

  await page.click('#mmoDemolishBtn');
  await page.waitForFunction(() => (
    Array.from(document.querySelectorAll('#mmoRestoreSelect option')).some((option) => option.value === 'osm:way/424242')
  ));
  await page.selectOption('#mmoRestoreSelect', 'osm:way/424242');
  await page.click('#mmoRestoreBtn');
  await page.waitForFunction(() => (
    !Array.from(document.querySelectorAll('#mmoRestoreSelect option')).some((option) => option.value === 'osm:way/424242')
  ));

  await page.locator('#mmoProgressSummary').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outputDir, 'mmo-acceptance-desktop.png'), fullPage: true });
  await page.locator('#mmoLeaderboardList').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outputDir, 'mmo-leaderboard-desktop.png'), fullPage: true });
  const desktop = await page.evaluate(() => ({
    profile: structuredClone(globalThis.__mmoAcceptance.state.mmoProgression),
    leaderboard: structuredClone(globalThis.__mmoAcceptance.state.mmoLeaderboard),
    buildMissionDisabled: document.querySelector('#mmoMissionSelect option[value="mission.build.foundation"]')?.disabled,
    combatMissionDisabled: document.querySelector('#mmoMissionSelect option[value="mission.combat.first"]')?.disabled,
    roomWorldEditing: {
      summary: document.getElementById('mmoWorldEditSummary')?.textContent || '',
      demolitionRestored: !Array.from(document.querySelectorAll('#mmoRestoreSelect option')).some((option) => option.value === 'osm:way/424242')
    },
    leaderboardDom: {
      rowCount: document.querySelectorAll('#mmoLeaderboardList .mpPlayerItem').length,
      text: document.getElementById('mmoLeaderboardList')?.textContent?.trim() || '',
      height: Math.round(document.getElementById('mmoLeaderboardList')?.getBoundingClientRect().height || 0)
    },
    status: document.getElementById('roomPanelStatus')?.textContent || ''
  }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#mmoProgressSummary').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outputDir, 'mmo-acceptance-mobile.png'), fullPage: true });
  await page.locator('#mmoLeaderboardList').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outputDir, 'mmo-leaderboard-mobile.png'), fullPage: true });
  const mobile = await page.evaluate(() => ({
    viewportWidth: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    panelWidth: Math.round(document.querySelector('.room-panel').getBoundingClientRect().width)
  }));

  const report = { desktop, mobile, browserErrors, externalResourceErrors, productionServiceRequests };
  console.log(JSON.stringify(report, null, 2));

  assert.equal(desktop.profile.stats.objectsPlaced, 5);
  assert.equal(desktop.profile.stats.eliminations, 1);
  assert.equal(desktop.profile.stats.missionsCompleted, 2);
  assert.equal(desktop.buildMissionDisabled, true);
  assert.equal(desktop.combatMissionDisabled, true);
  assert.equal(desktop.roomWorldEditing.demolitionRestored, true);
  assert.ok(desktop.leaderboard.some((row) => row.uid === 'local-owner' && row.xp >= 375));
  assert.equal(desktop.leaderboardDom.rowCount, 2);
  assert.ok(desktop.leaderboardDom.height >= 60, 'The authoritative leaderboard is not visibly laid out.');
  assert.ok(mobile.documentWidth <= mobile.viewportWidth, 'The phone room panel has horizontal overflow.');
  assert.deepEqual(browserErrors, []);
  assert.deepEqual(productionServiceRequests, [], 'Local MMO acceptance contacted a production data or analytics service.');

  console.log(JSON.stringify({ ok: true }, null, 2));
} finally {
  await page.evaluate(async () => {
    const acceptance = globalThis.__mmoAcceptance;
    await acceptance?.secondRoom?.leave?.().catch(() => {});
    acceptance?.release?.();
    await acceptance?.client?.disconnect?.().catch(() => {});
  }).catch(() => {});
  await browser.close();
  await runtime.gameServer.gracefullyShutdown(false);
  preview.process?.kill('SIGTERM');
}
