import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir, writeFile} from 'node:fs/promises';
import {chromium, webkit} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {createStagingGatewayHandler} from './staging-proxy-delivery.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
import {sourceFingerprint, sameAcceptanceSource} from './source-fingerprint.mjs';
import {collectBrowserGraphicsErrors} from './browser-graphics-errors.mjs';

// Startup regressions, or a selected-city load with an optional owned replacement.
// Cold network delay is controlled; world providers remain real staging/live
// providers. Desktop engines/touch emulation do not qualify physical phones.
const engineName = process.env.WE3D_STARTUP_ENGINE || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engineName));
const withWorld = process.env.WE3D_STARTUP_WORLD === '1';
const onlyWorld = process.env.WE3D_STARTUP_PHASE === 'world-only';
assert.ok(!onlyWorld || withWorld, 'world-only requires the selected-city journey.');
if (process.env.WE3D_STARTUP_LOAD_PLAN === '1') {
  assert.ok(withWorld && process.env.WE3D_STARTUP_SETTLE === '1', 'Load-plan acceptance requires a settled city.');
  assert.notEqual(process.env.WE3D_STARTUP_GRAPHICS_LOSS, '1', 'Run graphics recovery independently of world release.');
}
assert.ok(process.env.WE3D_STAGING_APP_CHECK_FILE, 'Run with the owned staging-attestation wrapper.');
const root = path.resolve(process.env.WE3D_VERIFY_ROOT || process.cwd());
const out = path.resolve(process.env.WE3D_STARTUP_OUTPUT || `output/research/web-release-2026-10-26/${engineName}`);
await mkdir(out, {recursive: true});
const before = sourceFingerprint();
const server = await startStaticServer({rootDir: root, ports: [4586], handleRequest: createStagingGatewayHandler()});
const base = `http://127.0.0.1:${server.port}`;
const report = {passed: false, engine: engineName, root, source: before, scope: 'Actual app startup/recovery in a desktop browser engine with a touch viewport; essential-file delay controlled. Optional single city uses real providers and registered staging debug attestation. Not physical-device performance or production-service acceptance.', checks: [], errors: [], graphicsErrors: [], expectedGraphicsErrors: [], resources: [], events: []};
let owned, page, stage;
const engine = engineName === 'webkit' ? webkit : chromium;
const safe = value => String(value).replace(/AIza[\w-]+/g, '[public SDK key]').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[private token]').slice(0, 1000);
async function newPage() {
  const context = await (await engine.connect(owned.wsEndpoint())).newContext({
    viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 1,
    userAgent: engineName === 'chromium' ? 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36' : undefined,
    serviceWorkers: 'block'
  });
  const current = await context.newPage();
  collectBrowserGraphicsErrors(current, report.graphicsErrors);
  current.on('pageerror', error => report.errors.push({stage, type: 'page', message: safe(error.message)}));
  current.on('console', message => {
    if (message.type() === 'error') report.errors.push({stage, type: 'console', message: safe(message.text())});
  });
  current.on('crash', () => report.events.push({stage, type: 'page-crash'}));
  current.on('response', response => {
    if (response.status() >= 400) {
      const url = new URL(response.url());
      if (report.resources.length < 100) report.resources.push({stage, origin: url.origin, path: url.pathname, status: response.status()});
    }
  });
  await configureStagingAppCheck(current, base, {proxyGeospatial: false});
  return current;
}
const ready = current => current.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, {timeout: 90000});
const url = `${base}/app/?loc=baltimore&launch=earth&gm=free&mode=walking`;
const bootState = current => current.evaluate(() => ({
  ready: globalThis.__WE3D_RUNTIME_READY__ === true,
  state: document.querySelector('#loading')?.dataset.state,
  title: document.querySelector('#loadTitle')?.textContent,
  note: document.querySelector('#loadNote')?.textContent,
  retry: document.querySelector('#loadRetry')?.hidden === false
}));
try {
  owned = await engine.launchServer({headless: true, ...(engineName === 'chromium' ? {channel: 'chrome', args: ['--js-flags=--max-old-space-size=1024']} : {})});
  if (!onlyWorld) {
  stage = 'failed-file-and-explicit-reload';
  page = await newPage();
  await page.route('**/app/vendor/three/build/three.min.js', route => route.abort('failed'));
  await page.goto(url, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => document.querySelector('#loading')?.dataset.state === 'error');
  assert.equal((await bootState(page)).retry, true);
  await page.evaluate(() => localStorage.setItem('we3d.qa.startup.sentinel', 'preserved'));
  await page.screenshot({path: path.join(out, 'failed-file.png')});
  report.checks.push({id: stage, failedState: await bootState(page)});
  await page.unroute('**/app/vendor/three/build/three.min.js');
  stage = 'normal-retry';
  await page.locator('#loadRetry').click();
  await ready(page);
  assert.equal(await page.evaluate(() => localStorage.getItem('we3d.qa.startup.sentinel')), 'preserved');
  report.checks.push({id: stage, state: await bootState(page), localStoragePreserved: true});
  await page.context().close();

  stage = 'slow-cold-start';
  page = await newPage();
  const delayed = '**/app/vendor/three/build/three.min.js';
  let criticalRequests = 0;
  await page.route(delayed, async route => {
    criticalRequests++;
    await new Promise(resolve => setTimeout(resolve, 35000));
    await route.continue().catch(() => {});
  });
  const started = Date.now();
  await page.goto(url, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => document.querySelector('#loadRetry')?.hidden === false, null, {timeout: 40000});
  const waiting = await bootState(page);
  assert.equal(waiting.state, 'starting'); assert.match(waiting.note, /still starting/);
  await page.screenshot({path: path.join(out, 'slow-still-loading.png')});
  await ready(page);
  assert.equal(criticalRequests, 1, 'Slow startup must retain one essential request.');
  assert.notEqual((await bootState(page)).state, 'error');
  for (const selector of ['#analyticsConsentDenyBtn', '#testerInvitationClose']) {
    if (await page.locator(selector).isVisible()) await page.locator(selector).tap();
  }
  await page.screenshot({path: path.join(out, 'slow-recovered-title.png')});
  report.checks.push({id: stage, controlledDelayMs: 35000, elapsedMs: Date.now() - started, waiting, state: await bootState(page), criticalRequests});
  } else {
    stage = 'world-only-startup'; page = await newPage();
    await page.goto(url, {waitUntil: 'domcontentloaded'}); await ready(page);
    for (const selector of ['#analyticsConsentDenyBtn', '#testerInvitationClose']) {
      if (await page.locator(selector).isVisible()) await page.locator(selector).tap();
    }
  }
  if (withWorld) {
    stage = 'mobile-selected-city-entry';
    let profiler;
    if (engineName === 'chromium' && process.env.WE3D_STARTUP_PROFILE === '1') {
      profiler = await page.context().newCDPSession(page);
      await profiler.send('HeapProfiler.startSampling', {samplingInterval: 65536});
    }
    await page.evaluate(() => {
      globalThis.__startupLongTasks = [];
      if (typeof PerformanceObserver === 'function' && PerformanceObserver.supportedEntryTypes.includes('longtask')) {
        const observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) if (__startupLongTasks.length < 200) __startupLongTasks.push({start: entry.startTime, duration: entry.duration});
        });
        observer.observe({type: 'longtask'});
      }
    });
    await page.evaluate(async () => {
      globalThis.startupQa = (await import((globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix||'')+'/app/js/shared-context.js?v=55')).ctx;
      startupQa.renderer.domElement.setAttribute('data-startup-world', 'true');
    });
    const start = Date.now();
    await page.locator('#globeSelectorStartBtn').tap();
    const loadingSamples = [];
    while (true) {
      const sample = await page.evaluate(() => ({ready: startupQa.gameStarted && !startupQa.worldLoading && !startupQa.titleLaunchPending && startupQa.worldLoadRuntimeState?.gameplayRuntimesReady,
        phases: startupQa.worldLoadRuntimeState?.activePhases,
        usedJSHeapSize: performance.memory?.usedJSHeapSize}));
      loadingSamples.push({elapsedMs: Date.now() - start, ...sample});
      if (sample.ready) break;
      assert.ok(Date.now() - start < 180000, 'Selected-city loading did not finish.');
      if (loadingSamples.length % 15 === 0) console.log(JSON.stringify({stage, sample: loadingSamples.at(-1)}));
      await page.waitForTimeout(1000);
    }
    const world = await page.evaluate(() => ({
      diagnostics: globalThis.getWorldExplorerRuntimeDiagnostics?.(),
      longTasks: globalThis.__startupLongTasks,
      memory: performance.memory ? {usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize, jsHeapSizeLimit: performance.memory.jsHeapSizeLimit} : null,
      mode: startupQa.getCurrentTravelMode?.(),
      position: {...startupQa.activeTransportActor?.()?.position},
      resources: globalThis.getWorldExplorerSceneResources?.(),
      regionalScenery: startupQa.getRegionalSceneryState?.()
    }));
    assert.ok(world.diagnostics.worldCounts.roads > 0 && world.diagnostics.worldCounts.buildings > 0);
    report.checks.push({id: stage, elapsedMs: Date.now() - start, loadingSamples, ...world});
    await page.screenshot({path: path.join(out, 'selected-city.png')});
    for (const selector of ['#tutorialSkipBtn']) if (await page.locator(selector).isVisible()) await page.locator(selector).tap();
    const later = page.getByRole('button', {name: 'Show this tutorial step later'});
    if (await later.isVisible()) await later.tap();
    await page.locator('canvas[data-startup-world="true"]').click({position: {x: 250, y: 430}});
    await runPrescribedGameActions(page, out, [{buttons: ['up'], frames: 30}, {buttons: [], frames: 3}], 'canvas[data-startup-world="true"]');
    const afterInput = await page.evaluate(() => ({position: {...startupQa.activeTransportActor?.()?.position}, mode: startupQa.getCurrentTravelMode?.(), paused: startupQa.paused}));
    const distance = Math.hypot(afterInput.position.x - world.position.x, afterInput.position.z - world.position.z);
    assert.ok(distance > 0.1, 'Ordinary input did not move the admitted actor: ' + JSON.stringify(afterInput));
    report.checks.push({id: 'ordinary-input-after-load', distance, ...afterInput});
    await page.screenshot({path: path.join(out, 'selected-city-after-input.png')});
    if (process.env.WE3D_STARTUP_SETTLE === '1') {
      stage = 'regional-publication-settle';
      const started = Date.now(), samples = [];
      while (true) {
        const sample = await page.evaluate(() => ({
          regional: startupQa.farTerrainClipmapState,
          loadProfile: startupQa.worldLoadRuntimeState?.loadProfile,
          publication: startupQa.worldPublication,
          scenery: startupQa.getRegionalSceneryState?.(),
          memory: performance.memory ? {usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize} : null,
          contextLost: startupQa.renderer.getContext().isContextLost(),
          paused: startupQa.paused
        }));
        samples.push({elapsedMs: Date.now() - started, ...sample});
        if (sample.regional?.status === 'ready' || sample.regional?.status === 'failed' || Date.now() - started >= 90000) break;
        if (samples.length % 8 === 0) console.log(JSON.stringify({stage, elapsedMs: Date.now() - started, status: sample.regional?.status, memory: sample.memory}));
        await page.waitForTimeout(2000);
      }
      await page.waitForTimeout(5000);
      const settled = await page.evaluate(() => ({diagnostics: globalThis.getWorldExplorerRuntimeDiagnostics?.(), resources: globalThis.getWorldExplorerSceneResources?.(), longTasks: globalThis.__startupLongTasks}));
      report.checks.push({id: stage, samples, ...settled});
      await page.screenshot({path: path.join(out, 'regional-settled.png')});
      assert.equal(samples.at(-1).regional?.status, 'ready', 'Background regional publication did not finish.');
      assert.equal(settled.diagnostics.renderer.contextLost, false);
    }
    if (process.env.WE3D_STARTUP_LOAD_PLAN === '1') {
      stage = 'admitted-mobile-context-plan';
      const first = await page.evaluate(() => ({
        publication: startupQa.worldPublication,
        profile: startupQa.worldLoadRuntimeState.loadProfile,
        regional: startupQa.farTerrainClipmapState,
        unitsPerMeter: startupQa.WORLD_UNITS_PER_METER,
        extended: startupQa.getRegionalSceneryState(),
        diagnostics: getWorldExplorerRuntimeDiagnostics()
      }));
      assert.equal(first.profile.regionalContextRadiusMeters, 6000);
      assert.equal(first.regional.regionalContextRadiusMeters, 6000);
      assert.equal(first.regional.contextHalfExtentWorld, 6000 * first.unitsPerMeter);
      assert.equal(first.regional.contextTilesLoaded, first.regional.contextTilesRequested);
      assert.equal(first.regional.farBuildingSourceCoverageComplete, true);
      assert.equal(first.extended.enabled, false);
      report.checks.push({id: stage, ...first});
      // A nearby accepted location exercises real replacement and ownership
      // without introducing another city's unrelated provider requirements.
      stage = 'location-replacement-with-admitted-plan';
      await page.evaluate(() => {
        startupQa.setCustomLocation({lat: 39.2914, lon: -76.6122, name: 'Baltimore north'}, {syncInputs: false});
        void startupQa.loadRoads();
      });
      await page.waitForFunction(id => startupQa.worldPublication?.requestId !== id &&
        startupQa.worldPublication && !startupQa.worldLoading &&
        startupQa.worldLoadRuntimeState?.gameplayRuntimesReady && startupQa.farTerrainClipmapState?.status === 'ready',
        first.publication.requestId, {timeout: 120000});
      const replacement = await page.evaluate(() => ({publication: startupQa.worldPublication,
        profile: startupQa.worldLoadRuntimeState.loadProfile,regional: startupQa.farTerrainClipmapState,
        diagnostics: getWorldExplorerRuntimeDiagnostics(),resources: getWorldExplorerSceneResources()}));
      assert.notEqual(replacement.publication.requestId, first.publication.requestId);
      assert.equal(replacement.profile.regionalContextRadiusMeters, 6000);
      assert.equal(replacement.regional.regionalContextRadiusMeters, 6000);
      assert.equal(replacement.regional.contextHalfExtentWorld, first.regional.contextHalfExtentWorld);
      assert.equal(replacement.regional.contextTilesLoaded, replacement.regional.contextTilesRequested);
      assert.equal(replacement.regional.farBuildingSourceCoverageComplete, true);
      assert.equal(replacement.diagnostics.renderer.contextLost, false);
      report.checks.push({id: stage, ...replacement});
      await page.screenshot({path: path.join(out, 'replacement-settled.png')});
      stage = 'owned-world-release';
      await page.evaluate(() => startupQa.releaseEarthWorldForTitle({reason: 'startup-verification-complete'}));
      await page.waitForTimeout(1500);
      const released = await page.evaluate(() => ({publication: startupQa.worldPublication,
        regional: startupQa.farTerrainClipmapState,diagnostics: getWorldExplorerRuntimeDiagnostics()}));
      assert.equal(released.publication, null);
      assert.equal(released.regional, null);
      assert.equal(released.diagnostics.worldCounts.roads, 0);
      assert.equal(released.diagnostics.worldCounts.buildings, 0);
      report.checks.push({id: stage, ...released});
    }
    if (process.env.WE3D_STARTUP_GRAPHICS_LOSS === '1') {
      stage = 'controlled-graphics-loss';
      const errorsBeforeLoss = report.graphicsErrors.length;
      const publication = await page.evaluate(() => startupQa.worldPublication.requestId);
      await page.evaluate(() => new Promise((resolve, reject) => {
        const gl = startupQa.renderer.getContext(), extension = gl.getExtension('WEBGL_lose_context');
        if (!extension) { reject(Error('Controlled context-loss extension unavailable.')); return; }
        globalThis.__startupLossExtension = extension;
        startupQa.renderer.domElement.addEventListener('webglcontextlost', () => resolve(), {once: true});
        extension.loseContext();
      }));
      const lost = await page.evaluate(() => {
        let readinessError;
        try {startupQa.prepareFirstWorldRender();} catch (error) {readinessError = error.message;}
        return {contextLost: startupQa.renderer.getContext().isContextLost(), readinessError};
      });
      assert.equal(lost.contextLost, true); assert.match(lost.readinessError, /3D view.*unavailable/);
      await page.waitForTimeout(100);
      await page.evaluate(() => {__startupLossExtension.restoreContext(); delete globalThis.__startupLossExtension;});
      await page.waitForFunction(() => !startupQa.renderer.getContext().isContextLost(), null, {timeout: 15000});
      const frame = await page.evaluate(() => startupQa.renderer.info.render.frame);
      await page.waitForFunction(before => startupQa.renderer.info.render.frame > before, frame, {timeout: 15000});
      assert.equal(await page.evaluate(() => startupQa.worldPublication.requestId), publication);
      for (let index = errorsBeforeLoss; index < report.graphicsErrors.length; index++) {
        assert.match(report.graphicsErrors[index], /context (?:was )?lost|CONTEXT_LOST_WEBGL/i);
        report.expectedGraphicsErrors.push(index);
      }
      report.checks.push({id: stage, deliberatelyLost: true, ...lost, restoredWithoutReload: true, publicationPreserved: true});
      await page.screenshot({path: path.join(out, 'graphics-restored.png')});
    }
    if (profiler) {
      const {profile} = await profiler.send('HeapProfiler.stopSampling');
      const allocations = new Map();
      const visit = node => {
        const {functionName, url, lineNumber} = node.callFrame;
        const id = `${url}:${lineNumber}:${functionName}`;
        const item = allocations.get(id) || {functionName, url, lineNumber, sampledBytes: 0};
        item.sampledBytes += node.selfSize; allocations.set(id, item);
        for (const child of node.children) visit(child);
      };
      visit(profile.head);
      report.sampledAllocations = [...allocations.values()].filter(item => item.sampledBytes > 0).sort((a, b) => b.sampledBytes - a.sampledBytes).slice(0, 50);
      report.heapUsage = await profiler.send('Runtime.getHeapUsage');
      report.allocationScope = 'Sampled allocation sites during the selected-city load and input; no forced collection. Not a retained-object graph or physical phone memory measurement.';
    }
  }
  const unexpected = report.errors.filter(error => error.stage !== 'failed-file-and-explicit-reload');
  assert.equal(unexpected.length, 0, 'Unexpected browser errors: ' + JSON.stringify(unexpected));
  assert.equal(report.events.length, 0);
  assert.equal(report.graphicsErrors.filter((_, index) => !report.expectedGraphicsErrors.includes(index)).length, 0, 'Unexpected graphics errors.');
  assert.ok(sameAcceptanceSource(before, sourceFingerprint()), 'Source changed while measuring it.');
  report.passed = true;
} catch (error) {
  report.failure = {stage, message: safe(error.message)};
  if (page && !page.isClosed()) {
    await page.screenshot({path: path.join(out, 'failure.png')}).catch(() => {});
    report.lastState = await page.evaluate(() => ({boot: document.querySelector('#loading')?.textContent, diagnostics: globalThis.getWorldExplorerRuntimeDiagnostics?.()})).catch(() => null);
  }
  process.exitCode = 1;
} finally {
  try {if (owned) await closeOwnedBrowser(owned); report.ownedBrowserClosed = true;}
  finally {await server.close(); await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');}
}
console.log(JSON.stringify({passed: report.passed, engine: engineName, checks: report.checks.map(({id, elapsedMs}) => ({id, elapsedMs})), failure: report.failure, errors: report.errors.length, output: out}));
