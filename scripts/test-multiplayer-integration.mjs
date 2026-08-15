#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, doc, setDoc } from 'firebase/firestore';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const projectId = 'we3d-multiplayer-integration';
const host = '127.0.0.1';
const outputDir = path.join(rootDir, 'output', 'playwright', 'multiplayer-integration');
const childFlag = '--inside-emulators';

function runCommand(command, args, env = process.env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: rootDir, env, stdio: 'inherit', shell: false });
    child.once('error', (error) => resolve({ code: 1, error }));
    child.once('exit', (code) => resolve({ code: Number.isInteger(code) ? code : 1, error: null }));
  });
}

async function runInsideEmulators() {
  const env = { ...process.env };
  if (!String(env.JAVA_HOME || '').trim() && process.platform === 'darwin') {
    for (const javaHome of ['/opt/homebrew/opt/openjdk@21', '/usr/local/opt/openjdk@21']) {
      try {
        await fs.access(path.join(javaHome, 'bin', 'java'));
        env.JAVA_HOME = javaHome;
        env.PATH = `${path.join(javaHome, 'bin')}:${env.PATH || ''}`;
        break;
      } catch (_) {
        // Try the next standard Homebrew location.
      }
    }
  }
  const command = `node scripts/test-multiplayer-integration.mjs ${childFlag}`;
  const args = ['emulators:exec', '--project', projectId, '--only', 'auth,firestore', command];
  const direct = await runCommand('firebase', args, env);
  if (!direct.error || direct.error.code !== 'ENOENT') return direct.code;
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return (await runCommand(npx, ['--yes', 'firebase-tools', ...args], env)).code;
}

function integrationHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WorldExplorer3D Multiplayer Integration</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #07131b; color: #e7f6ff; }
    main { width: min(760px, calc(100vw - 48px)); padding: 32px; border: 1px solid #2f6075; border-radius: 18px; background: #0b202b; box-shadow: 0 24px 80px #0009; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    p { color: #a8c7d4; }
    ul { display: grid; gap: 10px; padding: 0; list-style: none; }
    li { padding: 12px 14px; border-radius: 10px; background: #102f3e; border-left: 4px solid #40d68a; }
    code { color: #7de0ff; }
  </style>
</head>
<body><main><h1>Two-player room verification</h1><p id="summary">Running…</p><ul id="results"></ul></main></body>
</html>`;
}

async function serveRoot() {
  const sockets = new Set();
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${host}`);
      if (url.pathname === '/__multiplayer_integration__') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(integrationHtml());
        return;
      }
      if (url.pathname === '/favicon.ico') {
        res.writeHead(204).end();
        return;
      }
      const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      let filePath = path.resolve(path.join(rootDir, relative));
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403).end('forbidden');
        return;
      }
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
      const body = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = ext === '.js' ? 'text/javascript; charset=utf-8'
        : ext === '.css' ? 'text/css; charset=utf-8'
          : ext === '.json' ? 'application/json; charset=utf-8'
            : ext === '.html' ? 'text/html; charset=utf-8'
              : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
      res.end(body);
    } catch (_) {
      res.writeHead(404).end('not found');
    }
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, resolve);
  });
  return {
    port: server.address().port,
    close: () => new Promise((resolve) => {
      for (const socket of sockets) {
        if (socket instanceof net.Socket) socket.destroy();
      }
      server.close(resolve);
    })
  };
}

function parseHostPort(raw, fallbackPort) {
  const [hostname, portText] = String(raw || `${host}:${fallbackPort}`).replace(/^https?:\/\//, '').split(':');
  return { host: hostname || host, port: Number.parseInt(portText || String(fallbackPort), 10) };
}

function profile(uid, name) {
  const now = Timestamp.fromMillis(Date.now() - 5_000);
  return {
    uid,
    email: '',
    displayName: name,
    createdAt: now,
    updatedAt: now,
    plan: 'support',
    subscriptionStatus: 'active',
    trialStartsAt: null,
    trialEndsAt: null,
    trialConsumedAt: null,
    entitlements: { multiplayer: true, earlyAccess: false },
    roomCreateCount: 0,
    roomCreateLimit: 3,
    stripeCustomerId: '',
    stripeSubscriptionId: '',
    billingCycleAnchorAt: null,
    cancelAtPeriodEnd: false
  };
}

async function authenticate(page, name) {
  return page.evaluate(async (displayName) => {
    localStorage.setItem('worldExplorer3D.flowerChallenge.playerName', displayName);
    const auth = await import('/js/auth-ui.js?v=multiplayer-integration');
    const user = await auth.ensureGuestSession();
    return { uid: user.uid, anonymous: user.isAnonymous === true };
  }, name);
}

async function installClientConfig(page, firestore, auth) {
  await page.addInitScript(({ project, firestoreHost, firestorePort, authHost, authPort }) => {
    globalThis.WORLD_EXPLORER_FIREBASE = {
      apiKey: 'demo-key',
      authDomain: `${project}.firebaseapp.com`,
      projectId: project,
      appId: '1:123:web:multiplayer-integration'
    };
    globalThis.WORLD_EXPLORER_FIREBASE_EMULATORS = {
      enabled: true,
      host: firestoreHost,
      firestorePort,
      authPort
    };
    if (firestoreHost !== authHost) {
      throw new Error('Auth and Firestore emulator hosts must match for this test.');
    }
  }, {
    project: projectId,
    firestoreHost: firestore.host,
    firestorePort: firestore.port,
    authHost: auth.host,
    authPort: auth.port
  });
}

async function runBrowserIntegration() {
  const firestore = parseHostPort(process.env.FIRESTORE_EMULATOR_HOST, 8080);
  const auth = parseHostPort(process.env.FIREBASE_AUTH_EMULATOR_HOST, 9099);
  const rules = await fs.readFile(path.join(rootDir, 'firestore.rules'), 'utf8');
  const testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { host: firestore.host, port: firestore.port, rules }
  });
  const server = await serveRoot();
  const browser = await chromium.launch({ channel: process.env.WE3D_BROWSER_CHANNEL || 'chrome', headless: true });
  const ownerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const memberContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  const browserErrors = [];
  for (const [label, page] of [['owner', ownerPage], ['member', memberPage]]) {
    page.on('pageerror', (error) => browserErrors.push(`${label}: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(`${label}: ${message.text()}`);
    });
    await installClientConfig(page, firestore, auth);
  }

  const baseUrl = `http://${host}:${server.port}`;
  const report = { browser: process.env.WE3D_BROWSER_CHANNEL || 'chrome', checks: [] };
  try {
    await Promise.all([
      ownerPage.goto(`${baseUrl}/__multiplayer_integration__`, { waitUntil: 'domcontentloaded' }),
      memberPage.goto(`${baseUrl}/__multiplayer_integration__`, { waitUntil: 'domcontentloaded' })
    ]);

    const [owner, member] = await Promise.all([
      authenticate(ownerPage, 'Owner Explorer'),
      authenticate(memberPage, 'Member Explorer')
    ]);
    if (!owner.anonymous || !member.anonymous || owner.uid === member.uid) {
      throw new Error('Two independent anonymous auth sessions were not created.');
    }
    report.checks.push('two independent authenticated browser sessions');

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users', owner.uid), profile(owner.uid, 'Owner Explorer'));
      await setDoc(doc(db, 'users', member.uid), profile(member.uid, 'Member Explorer'));
    });

    const roomCode = `M${Date.now().toString(36).toUpperCase().slice(-5)}`;
    const created = await ownerPage.evaluate(async (code) => {
      const rooms = await import('/app/js/multiplayer/rooms.js?v=multiplayer-integration');
      return rooms.createRoom({
        code,
        name: 'Two Player Integration',
        displayName: 'Owner Explorer',
        visibility: 'private',
        maxPlayers: 8,
        world: { kind: 'earth', seed: 'new-york', lat: 40.7128, lon: -74.006 }
      });
    }, roomCode);
    if (created.code !== roomCode || created.world.kind !== 'earth') throw new Error('Room creation returned the wrong identity.');
    report.checks.push('owner creates a bounded private Earth room');

    const joined = await memberPage.evaluate(async ({ code }) => {
      const rooms = await import('/app/js/multiplayer/rooms.js?v=multiplayer-integration');
      return rooms.joinRoomByCode(code, { displayName: 'Member Explorer' });
    }, { code: roomCode });
    if (joined.code !== roomCode || joined.world.lat !== 40.7128) throw new Error('Private code join lost room world metadata.');
    report.checks.push('second player joins private room by code');

    await ownerPage.evaluate(async (code) => {
      const presence = await import('/app/js/multiplayer/presence.js?v=multiplayer-integration');
      window.__integrationPlayers = [];
      window.__stopPlayers = presence.listenPlayers(code, (players) => {
        window.__integrationPlayers = players;
      });
    }, roomCode);
    await ownerPage.waitForFunction(() => window.__integrationPlayers?.length === 2, undefined, { timeout: 15_000 });
    report.checks.push('both players are visible through live presence');

    await memberPage.evaluate(async (code) => {
      const presence = await import('/app/js/multiplayer/presence.js?v=multiplayer-integration');
      window.__integrationPose = {
        mode: 'walk',
        frame: { kind: 'earth', locLat: 40.7128, locLon: -74.006 },
        pose: { x: 42, y: 8, z: -17, yaw: 0.5, pitch: 0, vx: 0, vy: 0, vz: 0 }
      };
      presence.startPresence(code, () => window.__integrationPose);
    }, roomCode);
    await ownerPage.waitForFunction(
      (uid) => window.__integrationPlayers?.some((player) => player.uid === uid && player.pose.x === 42),
      member.uid,
      { timeout: 12_000 }
    );
    report.checks.push('movement frame propagates to the other browser');

    await ownerPage.evaluate(async (code) => {
      const chat = await import('/app/js/multiplayer/chat.js?v=multiplayer-integration');
      window.__integrationMessages = [];
      window.__stopChat = chat.listenChat(code, (messages) => {
        window.__integrationMessages = messages;
      });
    }, roomCode);
    await memberPage.evaluate(async (code) => {
      const chat = await import('/app/js/multiplayer/chat.js?v=multiplayer-integration');
      await chat.sendMessage(code, 'Hello from the second explorer');
    }, roomCode);
    await ownerPage.waitForFunction(
      () => window.__integrationMessages?.some((message) => message.text === 'Hello from the second explorer'),
      undefined,
      { timeout: 10_000 }
    );
    report.checks.push('room chat reaches the other browser');

    await ownerPage.evaluate(async (code) => {
      const blocks = await import('/app/js/multiplayer/blocks.js?v=multiplayer-integration');
      window.__integrationBlocks = [];
      window.__stopBlocks = blocks.listenSharedBlocks(code, (entries) => {
        window.__integrationBlocks = entries;
      });
    }, roomCode);
    await memberPage.evaluate(async (code) => {
      const blocks = await import('/app/js/multiplayer/blocks.js?v=multiplayer-integration');
      await blocks.upsertSharedBlock(code, { gx: 7, gy: 2.5, gz: -3, materialIndex: 2, shape: 'slab', rotation: 1 });
      await blocks.upsertSharedBlock(code, { gx: 7, gy: 3, gz: -3, materialIndex: 4, shape: 'column', rotation: 0 });
    }, roomCode);
    await ownerPage.waitForFunction(() => window.__integrationBlocks?.length === 2, undefined, { timeout: 10_000 });
    const blocks = await ownerPage.evaluate(() => window.__integrationBlocks);
    const halfBlock = blocks.find((block) => block.id === '7_2.5_-3');
    const upperBlock = blocks.find((block) => block.id === '7_3_-3');
    if (halfBlock?.gy !== 2.5 || halfBlock?.shape !== 'slab' || upperBlock?.shape !== 'column') {
      throw new Error(`Shared shape stack was corrupted: ${JSON.stringify(blocks)}`);
    }
    report.checks.push('half-grid slab and stacked column synchronize without overwrite');

    if (browserErrors.length > 0) throw new Error(`Browser errors: ${browserErrors.join(' | ')}`);
    await fs.mkdir(outputDir, { recursive: true });
    await ownerPage.evaluate((result) => {
      document.getElementById('summary').textContent = `${result.checks.length} multiplayer checks passed in Chrome.`;
      document.getElementById('results').innerHTML = result.checks.map((check) => `<li>${check}</li>`).join('');
    }, report);
    await ownerPage.screenshot({ path: path.join(outputDir, 'two-player-proof.png'), fullPage: true });

    await ownerPage.goto(`${baseUrl}/app/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await ownerPage.waitForFunction(() => {
      const hub = document.getElementById('globeSelectorScreen');
      return document.body.classList.contains('start-hub-open') && hub?.classList.contains('show');
    }, undefined, { timeout: 20_000 });
    await ownerPage.locator('.globe-app-rail [data-globe-destination="multiplayer"]').click();
    await ownerPage.waitForFunction(() => {
      const overlay = document.getElementById('globeHubOverlay');
      const panel = document.getElementById('tab-multiplayer');
      return overlay?.hidden === false && panel?.classList.contains('active');
    }, undefined, { timeout: 15_000 });
    const multiplayerUi = await ownerPage.evaluate(() => {
      const panel = document.getElementById('tab-multiplayer');
      const overlay = document.getElementById('globeHubOverlay');
      const details = panel?.querySelector('.mp-secondary-tools');
      const joinButton = document.getElementById('mpTitleJoinBtn');
      const createButton = document.getElementById('mpTitleCreateBtn');
      return {
        title: panel?.querySelector('.mp-title')?.textContent?.trim() || '',
        subtitles: Array.from(panel?.querySelectorAll('.mp-subtitle') || []).map((node) => node.textContent.trim()),
        detailsCollapsed: details instanceof HTMLDetailsElement && !details.open,
        joinAndCreateSeparated: joinButton?.parentElement !== createButton?.parentElement,
        visible: !!panel && panel.classList.contains('active') && overlay?.hidden === false && getComputedStyle(panel).display !== 'none'
      };
    });
    if (!multiplayerUi.visible || multiplayerUi.title !== '🌐 Explore Together') {
      throw new Error(`Multiplayer title panel is not visible: ${JSON.stringify(multiplayerUi)}`);
    }
    if (!multiplayerUi.joinAndCreateSeparated || !multiplayerUi.detailsCollapsed) {
      throw new Error(`Multiplayer primary actions are still ambiguous: ${JSON.stringify(multiplayerUi)}`);
    }
    report.multiplayerUi = multiplayerUi;
    report.checks.push('join, create, discovery, and secondary tools render as distinct workflows');

    report.roomCode = roomCode;
    report.ownerUid = owner.uid;
    report.memberUid = member.uid;
    await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    await ownerPage.screenshot({ path: path.join(outputDir, 'multiplayer-title-ui.png'), fullPage: true });
    console.log(`PASS multiplayer integration: ${report.checks.length}/${report.checks.length}`);
    for (const check of report.checks) console.log(`PASS ${check}`);
  } finally {
    await Promise.allSettled([
      ownerPage.evaluate(() => {
        window.__stopPlayers?.();
        window.__stopChat?.();
        window.__stopBlocks?.();
      }),
      memberPage.evaluate(async () => {
        const presence = await import('/app/js/multiplayer/presence.js?v=multiplayer-integration');
        await presence.stopPresence();
      })
    ]);
    await ownerContext.close();
    await memberContext.close();
    await browser.close();
    await server.close();
    await testEnv.cleanup();
  }
}

if (!process.argv.includes(childFlag)) {
  process.exit(await runInsideEmulators());
}

await runBrowserIntegration();
