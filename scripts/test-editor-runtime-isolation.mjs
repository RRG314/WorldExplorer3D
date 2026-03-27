import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { mkdirp, rootDir, startServer, bootstrapEarthRuntime } from './lib/runtime-browser-harness.mjs';

const outputDir = path.join(rootDir, 'output', 'playwright', 'editor-runtime-isolation');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isIgnorableConsoleError(text = '') {
  return /(429 \(Too Many Requests\)|504 \(Gateway Timeout\)|Could not reach Cloud Firestore backend|Failed to load resource.*favicon\.ico|net::ERR_CONNECTION_CLOSED|net::ERR_SOCKET_NOT_CONNECTED)/i.test(String(text));
}

async function readSnapshots(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      editorBoot: typeof ctx.getEditorRuntimeBootSnapshot === 'function' ? ctx.getEditorRuntimeBootSnapshot() : null,
      editor: typeof ctx.getEditorSnapshot === 'function' ? ctx.getEditorSnapshot() : null,
      creatorBoot: typeof ctx.getActivityCreatorRuntimeBootSnapshot === 'function' ? ctx.getActivityCreatorRuntimeBootSnapshot() : null,
      creator: typeof ctx.getActivityCreatorSnapshot === 'function' ? ctx.getActivityCreatorSnapshot() : null,
      editorEntryInGameMenu: !!document.querySelector('#gameMenu #fEditorMode'),
      editorEntryInRealEstateMenu: !!document.querySelector('#realEstateMenu #fEditorMode'),
      creatorEntryInGameMenu: !!document.querySelector('#gameMenu #fActivityCreator'),
      roomGamesEntryInGameMenu: !!document.querySelector('#gameMenu #fRoomGames'),
      policeEntryInGameMenu: !!document.querySelector('#gameMenu #fPolice')
    };
  });
}

async function waitForActivityBrowserOpen(page) {
  return page.evaluate(async () => {
    const deadline = performance.now() + 15000;
    while (performance.now() < deadline) {
      const panel = document.getElementById('activityDiscoveryPanel');
      const creatorBtn = document.getElementById('activityDiscoveryOpenCreatorBtn');
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const titles = Array.isArray(ctx.activityDiscoveryCatalog)
        ? ctx.activityDiscoveryCatalog.map((entry) => String(entry?.title || ''))
        : [];
      if (panel?.classList.contains('show') && creatorBtn && titles.length > 0) {
        return {
          ok: true,
          titles,
          creatorButtonVisible: !creatorBtn.hidden
        };
      }
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }
    return { ok: false, reason: 'activity browser did not open with catalog' };
  });
}

async function waitForEditorOpen(page) {
  return page.evaluate(async () => {
    const deadline = performance.now() + 15000;
    while (performance.now() < deadline) {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const editor = typeof ctx.getEditorSnapshot === 'function' ? ctx.getEditorSnapshot() : null;
      const boot = typeof ctx.getEditorRuntimeBootSnapshot === 'function' ? ctx.getEditorRuntimeBootSnapshot() : null;
      if (
        editor?.active &&
        editor?.workspaceSnapshotCaptured &&
        Number(editor?.workspaceSnapshotWidthWorld || 0) >= 1800 &&
        boot?.editorModuleLoaded
      ) {
        return { ok: true, editor, boot };
      }
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }
    return { ok: false, reason: 'editor did not become active with workspace snapshot' };
  });
}

async function waitForCreatorOpen(page) {
  return page.evaluate(async () => {
    const deadline = performance.now() + 15000;
    while (performance.now() < deadline) {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const creator = typeof ctx.getActivityCreatorSnapshot === 'function' ? ctx.getActivityCreatorSnapshot() : null;
      const boot = typeof ctx.getActivityCreatorRuntimeBootSnapshot === 'function' ? ctx.getActivityCreatorRuntimeBootSnapshot() : null;
      if (creator?.active && boot?.activityCreatorModuleLoaded) {
        return { ok: true, creator, boot };
      }
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }
    return { ok: false, reason: 'activity creator did not become active' };
  });
}

async function closePanels(page) {
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (typeof ctx.closeEditorSession === 'function') await ctx.closeEditorSession();
    if (typeof ctx.closeActivityCreator === 'function') await ctx.closeActivityCreator();
  });
}

const report = {
  ok: false,
  bootstrap: null,
  initial: null,
  browserAfterOpen: null,
  creatorAfterOpen: null,
  editorAfterOpen: null,
  consoleErrors: []
};

let server;
let browser;

try {
  await mkdirp(outputDir);
  server = await startServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (!isIgnorableConsoleError(text)) report.consoleErrors.push(text);
  });
  page.on('pageerror', (error) => {
    const text = String(error?.message || error);
    if (!isIgnorableConsoleError(text)) report.consoleErrors.push(text);
  });

  await page.goto(`${server.baseUrl}/app/`, { waitUntil: 'domcontentloaded' });
  report.bootstrap = await bootstrapEarthRuntime(page, 'baltimore');
  assert(report.bootstrap?.ok, `Earth bootstrap failed: ${report.bootstrap?.reason || 'unknown'}`);

  report.initial = await readSnapshots(page);
  assert(!report.initial.editorEntryInGameMenu, 'Editor entry is still in the Game menu');
  assert(report.initial.editorEntryInRealEstateMenu, 'Editor entry is not in the Land & Property menu');
  assert(!report.initial.creatorEntryInGameMenu, 'Create Game is still present in the Game menu float list');
  assert(!report.initial.roomGamesEntryInGameMenu, 'Room Games is still present in the Game menu float list');
  assert(!report.initial.policeEntryInGameMenu, 'Police is still present in the Game menu float list');
  assert(report.initial.editorBoot && !report.initial.editorBoot.editorModuleLoaded, 'Editor module loaded before explicit open');
  assert(report.initial.editorBoot && !report.initial.editorBoot.overlayRuntimeRequested, 'Overlay runtime requested before explicit editor open');
  assert(report.initial.creatorBoot && !report.initial.creatorBoot.activityCreatorModuleLoaded, 'Activity creator loaded before explicit open');

  await page.click('#gameBtn');
  await page.click('#fActivities');
  const browserState = await waitForActivityBrowserOpen(page);
  assert(browserState?.ok, browserState?.reason || 'Activity browser open failed');
  report.browserAfterOpen = browserState;
  assert(browserState.creatorButtonVisible, 'Create Game button is not visible inside the Games browser');
  const titleSet = new Set(browserState.titles);
  assert(titleSet.has('Police Chase'), 'Browse Games is missing Police Chase');
  assert(titleSet.has('Find the Flower'), 'Browse Games is missing Find the Flower');
  assert(titleSet.has('Time Trial'), 'Browse Games is missing Time Trial');
  assert(titleSet.has('Checkpoints'), 'Browse Games is missing Checkpoints');
  assert(titleSet.has('Paint the Town Red'), 'Browse Games is missing Paint the Town Red');

  await page.click('#activityDiscoveryOpenCreatorBtn');
  const creatorState = await waitForCreatorOpen(page);
  assert(creatorState?.ok, creatorState?.reason || 'Activity creator open failed');
  report.creatorAfterOpen = creatorState;
  assert(!report.initial.editorBoot.editorModuleLoaded, 'Initial editor state mutated unexpectedly');

  await closePanels(page);
  await page.click('#realEstateFloatBtn');
  await page.click('#fEditorMode');
  const editorState = await waitForEditorOpen(page);
  assert(editorState?.ok, editorState?.reason || 'Editor open failed');
  report.editorAfterOpen = editorState;

  await page.screenshot({ path: path.join(outputDir, 'editor-open.png'), fullPage: true });

  report.ok = report.consoleErrors.length === 0;
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  if (!report.ok) {
    throw new Error(`Console errors detected:\n${report.consoleErrors.join('\n')}`);
  }
} catch (error) {
  report.ok = false;
  report.error = String(error?.message || error);
  await mkdirp(outputDir);
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  console.error(report.error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
}
