import { configureStagingAppCheck } from './staging-app-check.mjs';
import assert from 'node:assert/strict';
import { sampleFrameWindow } from './frame-window.mjs';
import { frameHitches } from './frame-hitches.mjs';
import {planRoadRoute,followRoadRoute} from './travel-road-route.mjs';
import {followFlightOrbit} from './travel-flight-orbit.mjs';
import { mkdir, readFile, writeFile, mkdtemp } from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {finished} from 'node:stream/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import { chromium, devices } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import { requirePerformanceHost, requireHardwareGraphics } from './performance-host.mjs';
import { collectBrowserGraphicsErrors } from './browser-graphics-errors.mjs';

// Reject cloud/other hardware before opening a browser or loading a world.
const hostAuthority = requirePerformanceHost();
const root = process.cwd();
const evidenceDirectory=process.env.WE3D_PERF_OUTPUT || 'output/verification/performance-retention';
const verifyRoot = process.env.WE3D_VERIFY_ROOT || root;
const budgets = JSON.parse(await readFile(`${root}/config/performance-budgets.json`, 'utf8'));
const server = await startStaticServer({ rootDir: verifyRoot, ports: [4421, 4422, 4423] });
const baseUrl = `http://127.0.0.1:${server.port}`;
// Match ordinary browser allocation behavior. A test-only heap cap changes GC
// frequency and can disguise the allocation footprint users experience.
const browserOptions = { headless: true, channel: 'chrome', args: [] };
let browser = await chromium.launch(browserOptions);
let graphicsAuthority = null;
const requestedProfile = String(process.env.WE3D_VERIFY_PROFILE || 'all').trim().toLowerCase();
const auditOnly = process.env.WE3D_VERIFY_AUDIT_ONLY === '1';
const sustained=process.env.WE3D_PERF_SUSTAINED==='1';
const retainedHeapCycles=new Set(String(process.env.WE3D_PERF_RETAINED_HEAPS||'').split(',').filter(Boolean).map(Number));
assert.ok(['all', 'desktop', 'mobile'].includes(requestedProfile), `Unsupported WE3D_VERIFY_PROFILE: ${requestedProfile}`);

const percentile = (values, portion) => {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * portion) - 1))] || 0;
};

function metricValue(metrics, name) {
  return Number(metrics.find((entry) => entry.name === name)?.value || 0);
}

async function createMeasuredClient(contextOptions) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await configureStagingAppCheck(page, baseUrl);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Performance.enable');
  const requests = new Map();
  const transfers = new Map();
  const browserErrors = [];
  const localFailures = [];
  const providerDegradations=[];
  collectBrowserGraphicsErrors(page, browserErrors);
  page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      const pathname=new URL(response.url()).pathname;
      const localNamingUnavailable=!process.env.WE3D_PLACE_LOOKUP_EMULATOR_ORIGIN&&response.status()===503&&
        ['/api/geospatial/search','/api/geospatial/reverse'].includes(pathname);
      (localNamingUnavailable?providerDegradations:localFailures).push({ url: response.url(), status: response.status() });
    }
  });
  cdp.on('Network.requestWillBeSent', (event) => requests.set(event.requestId, event.request.url));
  cdp.on('Network.loadingFinished', (event) => transfers.set(event.requestId, Number(event.encodedDataLength || 0)));
  return { context, page, cdp, requests, transfers, browserErrors, localFailures, providerDegradations };
}

async function heapUsedBytes(cdp, collect = false) {
  if (collect) await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  const result = await cdp.send('Performance.getMetrics');
  return metricValue(result.metrics || [], 'JSHeapUsedSize');
}

async function privateHeapSnapshot(client,label){
  assert.ok(auditOnly,'Raw heap capture is diagnostic only');
  const directory=await mkdtemp(path.join(tmpdir(),'we3d-private-heap-'));
  const target=path.join(directory,`${label}.heapsnapshot`);
  const output=createWriteStream(target,{mode:0o600});let bytes=0;
  const streamed=finished(output);streamed.catch(()=>{});
  const chunk=event=>{bytes+=Buffer.byteLength(event.chunk);output.write(event.chunk);};
  await client.page.evaluate(()=>{globalThis.__WE3D_HEAP_CONTEXT__=globalThis.__WE3D_PERF_CONTEXT__;});
  client.cdp.on('HeapProfiler.addHeapSnapshotChunk',chunk);
  try {await client.cdp.send('HeapProfiler.takeHeapSnapshot');}
  finally {client.cdp.off('HeapProfiler.addHeapSnapshotChunk',chunk);output.end();await streamed;}
  const result={path:target,bytes,scope:'Private raw heap; publish only aggregate counts or reviewed code property names'};
  console.log('[performance-retention] private heap saved',JSON.stringify(result));
  return result;
}

async function storageSnapshot(page) {
  return page.evaluate(async () => {
    let estimate = null;
    try { estimate = await navigator.storage?.estimate?.(); } catch {}
    let localStorageBytes = 0;
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || '';
      localStorageBytes += (key.length + String(localStorage.getItem(key) || '').length) * 2;
    }
    let cacheNames = [];
    try { cacheNames = await caches?.keys?.() || []; } catch {}
    return {
      usageBytes: Number(estimate?.usage || 0),
      quotaBytes: Number(estimate?.quota || 0),
      localStorageBytes,
      cacheStorageNames: cacheNames.length
    };
  });
}

function transferSnapshot(client) {
  let localTransferBytes = 0;
  let externalTransferBytes = 0;
  let localRequests = 0;
  let externalRequests = 0;
  const externalOrigins = new Set();
  const byOrigin = new Map();
  for (const [requestId, url] of client.requests) {
    if (!/^https?:/i.test(url)) continue;
    const bytes = client.transfers.get(requestId) || 0;
    if (url.startsWith(baseUrl)) {
      localRequests += 1;
      localTransferBytes += bytes;
    } else {
      externalRequests += 1;
      externalTransferBytes += bytes;
      try {
        const origin = new URL(url).origin;
        externalOrigins.add(origin);
        const current = byOrigin.get(origin) || { requests: 0, transferBytes: 0 };
        current.requests += 1;
        current.transferBytes += bytes;
        byOrigin.set(origin, current);
      } catch {}
    }
  }
  return {
    localRequests,
    localTransferBytes,
    externalRequests,
    externalTransferBytes,
    externalOriginCount: externalOrigins.size,
    externalByOrigin: Object.fromEntries([...byOrigin.entries()].sort((a, b) => b[1].requests - a[1].requests))
  };
}

async function waitForPlayable(page) {
  await page.waitForSelector('#loading.show', { timeout: 30_000 });
  await page.waitForFunction(() => !document.getElementById('loading')?.classList.contains('show'), null, { timeout: 300_000 });
  await page.waitForFunction(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return state?.gameStarted === true && state.worldLoading === false &&
      Number(state.worldCounts?.buildings || 0) > 0 && Number(state.worldCounts?.roads || 0) > 0;
  }, null, { timeout: 300_000, polling: 500 });
  await page.waitForTimeout(2_500);
}

async function launchWorld(client) {
  const startedAt = Date.now();
  const milestones = {};
  await client.page.goto(`${baseUrl}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=walk`, {
    waitUntil: 'load', timeout: 120_000
  });
  milestones.documentLoadedMs = Date.now() - startedAt;
  await client.page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  milestones.runtimeReadyMs = Date.now() - startedAt;
  const titleHeapBytes = await heapUsedBytes(client.cdp);
  await client.page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  if (await client.page.locator('#analyticsConsentDenyBtn').isVisible().catch(() => false)) {
    await client.page.locator('#analyticsConsentDenyBtn').click();
  }
  await client.page.locator('#globeSelectorStartBtn').click();
  milestones.worldRequestedMs = Date.now() - startedAt;
  await waitForPlayable(client.page);
  milestones.playableMs = Date.now() - startedAt;
  await client.page.evaluate(async()=>{globalThis.__WE3D_PERF_CONTEXT__=(await import('/app/js/shared-context.js?v=55')).ctx;});
  const diagnostics = await client.page.evaluate(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return {
      worldLoad: state.worldLoad || null,
      performance: state.performance || null,
      transportCompilation: state.transportCompilation || null
    };
  });
  return { firstPlayableMs: milestones.playableMs, titleHeapBytes, milestones, diagnostics };
}

async function selectMode(page, expected, selector) {
  await page.locator('#travelBtn').click();
  await page.waitForSelector('#travelMenu.open', { timeout: 10_000 });
  assert.equal(await page.locator(selector).isVisible(), true, `${selector} is not a visible Travel action.`);
  const startedAt = performance.now();
  await page.locator(selector).click();
  await page.waitForFunction((mode) => globalThis.__WE3D_PERF_CONTEXT__?.activeTransportActor?.()?.mode === mode, expected, { timeout: 20_000, polling: 500 });
  const activationMs = Math.round(performance.now() - startedAt);
  await page.waitForTimeout(1_200);
  return activationMs;
}

async function measureMode(client, id, sampleMs = 5_000, movementKey = null) {
  if (movementKey) {
    // Release menu focus without clicking a building and starting an unrelated
    // selection/network journey inside the performance sample.
    await client.page.locator('#travelBtn').blur();
    await client.page.keyboard.down(movementKey);
  }
  await client.page.evaluate(id=>{
    const ctx=globalThis.__WE3D_PERF_CONTEXT__;
    globalThis.__WE3D_PERF_ACTOR__=id.startsWith('walk')?ctx.Walk.state.walker:id.startsWith('plane')?ctx.planeMode:ctx.car;
  },id);
  const trace = process.env.WE3D_PERF_TRACE_MODE === id;
  let traceClock;
  const gcEvents=[];
  const gcTrace=trace&&process.env.WE3D_PERF_GC_TRACE==='1';
  let gcTruncated=false;
  const collectGc=({value})=>{
    for(const event of value){
      if(!/GC|Scavenge|MarkCompact|Major|Minor|Sweeper/i.test(event.name))continue;
      if(gcEvents.length>=100000){gcTruncated=true;continue;}
      // Trace arguments may include runtime strings. Retain numeric collector
      // counters only; no account, location, URL or source values.
      gcEvents.push({name:event.name,cat:event.cat,ph:event.ph,ts:event.ts,dur:event.dur,pid:event.pid,tid:event.tid,
        args:Object.fromEntries(Object.entries(event.args||{}).filter(([key,value])=>/^[a-zA-Z0-9_ .-]{1,80}$/.test(key)&&typeof value==='number'))});
    }
  };
  if (trace) {
    traceClock=await client.cdp.send('Performance.getMetrics');
    if(gcTrace){
      client.cdp.on('Tracing.dataCollected',collectGc);
      await client.cdp.send('Tracing.start',{categories:'v8,disabled-by-default-v8.gc',transferMode:'ReportEvents'});
    }
    await client.cdp.send('Profiler.enable'); await client.cdp.send('Profiler.start');
    if(process.env.WE3D_PERF_ALLOCATIONS==='1')await client.cdp.send('HeapProfiler.startSampling',{samplingInterval:65536,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
  }
  let raw;
  try { raw = await client.page.evaluate(sampleFrameWindow, {durationMs:sampleMs,actorKey:'__WE3D_PERF_ACTOR__',backgroundContextKey:'__WE3D_PERF_CONTEXT__',collectDiagnostics:false}); }
  finally { if (movementKey) await client.page.keyboard.up(movementKey); }
  if (trace) {
    if(gcTrace){
      const completed=new Promise(resolve=>client.cdp.once('Tracing.tracingComplete',resolve));
      await client.cdp.send('Tracing.end');await completed;
      client.cdp.off('Tracing.dataCollected',collectGc);
      await writeFile(`${evidenceDirectory}/${id}-gc.json`,JSON.stringify({scope:'Instrumented collector events with numeric arguments only; not acceptance',truncated:gcTruncated,clock:traceClock,raw,events:gcEvents}));
    }
    const {profile} = await client.cdp.send('Profiler.stop');
    await writeFile(`${evidenceDirectory}/${id}-cpu.json`,JSON.stringify({profile,raw,clock:traceClock,scope:'Instrumented diagnostic, not release performance acceptance'}));
    if(process.env.WE3D_PERF_ALLOCATIONS==='1')await writeFile(`${evidenceDirectory}/${id}-allocation.json`,JSON.stringify(await client.cdp.send('HeapProfiler.stopSampling')));
  }
  // Full diagnostics enumerate the world and actor catalogs. They belong in
  // functional checks, not between timed windows where their garbage can cause
  // pauses in the following sample. Read the same authoritative counters here.
  raw.diagnostics=await client.page.evaluate(()=>{
    const ctx=globalThis.__WE3D_PERF_CONTEXT__,info=ctx.renderer.info;
    return {renderer:{...info.render,programs:info.programs.length,geometries:info.memory.geometries,textures:info.memory.textures},
      worldCounts:{buildings:ctx.buildings.length,roads:ctx.roads.length,terrainTiles:ctx.terrainTileCache.size,
        buildingMeshes:ctx.buildingMeshes.length,roadMeshes:ctx.roadMeshes.length,landuseMeshes:ctx.landuseMeshes.length}};
  });
  assert.ok(raw.deltas.length > 0, 'Frame sample must contain intervals');
  assert.ok(raw.elapsedMs >= sampleMs, 'Frame sample must cover the requested duration');
  assert.ok(raw.deltas.every((value) => Number.isFinite(value) && value > 0), 'Frame intervals must be positive');
  assert.ok(Math.abs(raw.deltas.reduce((sum, value) => sum + value, 0) - raw.elapsedMs) < 0.001,
    'Frame intervals must sum to the measured window');
  const deltas = raw.deltas.filter((value) => Number.isFinite(value) && value > 0);
  const averageFrameMs = deltas.reduce((sum, value) => sum + value, 0) / Math.max(1, deltas.length);
  const hitches=frameHitches(deltas,budgets.desktopTier.hitches);
  await writeFile(`${evidenceDirectory}/${id}-frames.json`,JSON.stringify({deltas,background:raw.background,elapsedMs:raw.elapsedMs,firstFrameDelayMs:raw.firstFrameDelayMs,startPosition:raw.startPosition,endPosition:raw.endPosition,distanceTraveled:raw.distanceTraveled,movingMs:raw.movingMs,hitches}));
  const rawJsHeapUsedBytes = await heapUsedBytes(client.cdp);
  const jsHeapUsedBytes = rawJsHeapUsedBytes;
  return {
    id,
    scenario: movementKey ? 'controlled-moving-route' : id === 'plane' ? 'autonomous-flight' : 'stationary-mode',
    inputDuringSample: movementKey ? { key: movementKey, heldForMs: sampleMs } : 'none',
    sampleMs,
    elapsedMs: raw.elapsedMs,
    distanceTraveled:raw.distanceTraveled,
    movingMs:raw.movingMs,
    distanceWorldUnits: raw.startPosition && raw.endPosition
      ? Math.hypot(raw.endPosition.x-raw.startPosition.x,raw.endPosition.z-raw.startPosition.z) : null,
    frames: deltas.length,
    firstFrameDelayMs: raw.firstFrameDelayMs,
    measurementScope: 'Live actor coordinates and renderer counters; no full-world snapshots between timed modes',
    averageFps: 1000 / averageFrameMs,
    averageFrameMs,
    p95FrameMs: percentile(deltas, 0.95),
    p99FrameMs: percentile(deltas, 0.99),
    worstFrameMs: Math.max(...deltas),
    hitches,
    calls: Number(raw.diagnostics.renderer?.calls || 0),
    triangles: Number(raw.diagnostics.renderer?.triangles || 0),
    programs: Number(raw.diagnostics.renderer?.programs || 0),
    geometries: Number(raw.diagnostics.renderer?.geometries || 0),
    textures: Number(raw.diagnostics.renderer?.textures || 0),
    rawJsHeapUsedBytes,
    jsHeapUsedBytes,
    worldCounts: raw.diagnostics.worldCounts || null,
    drawCallBreakdown: raw.diagnostics.drawCallBreakdown || []
  };
}

function modesWithinBudgets(modes, tier) {
  const limit = tier.budgets;
  return modes.every((mode) =>
    mode.averageFps >= limit.minimumAverageFps &&
    mode.p95FrameMs <= limit.maximumP95FrameMs &&
    mode.p99FrameMs <= limit.maximumP99FrameMs &&
    mode.calls <= limit.maximumDrawCalls &&
    mode.triangles <= limit.maximumTriangles &&
    mode.programs <= limit.maximumPrograms &&
    mode.geometries <= limit.maximumGeometries &&
    mode.textures <= limit.maximumTextures &&
    mode.jsHeapUsedBytes <= limit.maximumJsHeapUsedBytes
  );
}

function reloadPreservesCoverage(counts, baseline, retention) {
  const ratio = (current, original) => original > 0 ? current / original : current === 0 ? 1 : 0;
  return ratio(Number(counts?.buildings || 0), Number(baseline?.buildings || 0)) >= retention.minimumReloadBuildingRatio &&
    ratio(Number(counts?.roads || 0), Number(baseline?.roads || 0)) >= retention.minimumReloadRoadRatio &&
    ratio(Number(counts?.terrainTiles || 0), Number(baseline?.terrainTiles || 0)) >= retention.minimumReloadTerrainRatio;
}

function transferWithinBudget(transfer, limit) {
  return transfer.localTransferBytes <= limit.maximumLocalTransferBytes &&
    transfer.externalRequests <= limit.maximumExternalRequests &&
    transfer.externalTransferBytes <= limit.maximumExternalTransferBytes;
}

async function sustainedTravel(client){
  const page=client.page;
  const route=await page.evaluate(`(${planRoadRoute.toString()})(globalThis.__WE3D_PERF_CONTEXT__.roads)`);
  await writeFile(`${evidenceDirectory}/sustained-road-route.json`,JSON.stringify(route));
  const samples=[];
  // 630 seconds of active traversal. Initial placement is explicit test setup;
  // after that each driver only observes actors and sends real keyboard input.
  for(const [index,mode] of ['walk','drive','plane','walk','drive','plane','plane'].entries()){
    await selectMode(page,mode,{walk:'#fWalk',drive:'#fDriving',plane:'#fPlane'}[mode]);
    await page.locator('#travelBtn').blur();
    await page.evaluate(({mode,route})=>{
      const c=globalThis.__WE3D_PERF_CONTEXT__,actor=mode==='walk'?c.Walk.state.walker:mode==='drive'?c.car:c.planeMode;
      const p=mode==='plane'?{x:750,z:0}:route.points[0],next=route.points[1];
      const yaw=mode==='plane'?0:Math.atan2(next.x-p.x,next.z-p.z);
      Object.assign(actor,{x:p.x,z:p.z,yaw,angle:yaw,pitch:0,roll:0,pitchRate:0,rollRate:0,yawRate:0,lookYawOffset:0,cameraYaw:0,cameraPitch:0,cameraLookTimer:0});
      if(mode==='plane')Object.assign(actor,{y:220,speed:80,horizontalSpeed:80,vx:0,vy:0,vz:80,throttle:1,airborne:true,stalled:false,flightPathAngle:0,climbRate:0,turnRate:0,angleOfAttack:0,barrelRollActive:false});
      else Object.assign(actor,{y:mode==='walk'?c.GroundHeight.walkSurfaceY(p.x,p.z)+1.7:c.GroundHeight.carCenterY(p.x,p.z),speed:0,vFwd:0,vLat:0,vx:0,vy:0,vz:0,onGround:true,isAirborne:false});
      globalThis.__WE3D_TRAVEL_ACTOR__=actor;
    },{mode,route});
    await page.waitForTimeout(1200);
    const signal={stopped:false};let driverFailure=null;
    const driver=(mode==='plane'?followFlightOrbit(page,signal):followRoadRoute(page,route,signal,{mode})).catch(error=>{driverFailure=error;return {failure:error.message};});
    let sample,progress;
    try{sample=await measureMode(client,`${mode}-sustained-${index}`,90000);}
    finally{signal.stopped=true;progress=await driver;await writeFile(`${evidenceDirectory}/${mode}-sustained-${index}-input.json`,JSON.stringify(progress));}
    if(driverFailure)throw driverFailure;
    assert.ok(sample.distanceTraveled>=(mode==='walk'?100:mode==='drive'?300:1000),`${mode} sustained sample did not traverse the world`);
    assert.ok(sample.movingMs>=60000,`${mode} sustained sample spent too long stationary`);
    sample.scenario='sustained-keyboard-route';sample.initialPlacement='Test setup only; no physics/pose writes during the window';
    samples.push(sample);console.log('[performance-retention] sustained',JSON.stringify({id:sample.id,fps:sample.averageFps,p99:sample.p99FrameMs,hitches:sample.hitches,distance:sample.distanceTraveled}));
  }
  return samples;
}

async function runDesktop() {
  const client = await createMeasuredClient({ viewport: { width: 1440, height: 900 } });
  try {
    if(retainedHeapCycles.size){
      assert.ok(auditOnly&&path.resolve(verifyRoot)===root,'Retained heap investigation requires diagnostic source mode');
      assert.ok([...retainedHeapCycles].every(cycle=>Number.isInteger(cycle)&&cycle>=1&&cycle<=24),'Retained heap cycles must be integers 1–24');
    }
    const launch = await launchWorld(client);
    if(process.env.WE3D_PERF_PRIVATE_HEAP==='1'){
      assert.ok(auditOnly,'Heap snapshots are private diagnostics, never frame-time acceptance');
      // Snapshots can contain disposable auth material. Keep raw bytes outside
      // the repository/evidence tree with owner-only permissions.
      launch.privateHeap=await privateHeapSnapshot(client,'active-world');
    }
    if(process.env.WE3D_PERF_TREE_NODE_DIAGNOSTIC==='1'){
      assert.ok(auditOnly,'Tree-node lifetime experiment is diagnostic only');
      const counts=await client.page.evaluate(()=>{
        const c=globalThis.__WE3D_PERF_CONTEXT__;
        return {nodes:Object.keys(c._worldLoadNodes||{}).length,rows:c.osmTreeRows.length,
          trees:c.vegetationFeatures.length,roads:c.roads.length,buildings:c.buildings.length};
      });
      const beforeHeap=await heapUsedBytes(client.cdp,true);
      const selected=await client.page.evaluate(()=>{
        const c=globalThis.__WE3D_PERF_CONTEXT__,nodes=c._worldLoadNodes,keep=Object.create(null);
        globalThis.__WE3D_OLD_NODE_INDEX__=new WeakRef(nodes);
        for(const row of c.osmTreeRows)for(const id of row.nodes||[])if(nodes[id])keep[id]=nodes[id];
        const sameRows=c.osmTreeRows.every(row=>(row.nodes||[]).every(id=>nodes[id]===keep[id]));
        c._worldLoadNodes=keep;return {nodes:Object.keys(keep).length,sameRows};
      });
      await client.page.waitForTimeout(1000);
      const afterHeap=await heapUsedBytes(client.cdp,true);
      const oldIndexCollected=await client.page.evaluate(()=>!globalThis.__WE3D_OLD_NODE_INDEX__.deref());
      launch.treeNodeExperiment={counts,selected,beforeHeap,afterHeap,oldIndexCollected,
        scope:'Controlled source mutation plus GC for retained-owner diagnosis; not performance acceptance'};
      console.log('[performance-retention] tree-node experiment',JSON.stringify(launch.treeNodeExperiment));
    }
    const walkActivationMs = await selectMode(client.page, 'walk', '#fWalk');
    const walk = { ...(await measureMode(client, 'walk', auditOnly ? 1_500 : 5_000)), activationMs: walkActivationMs };
    console.log('[performance-retention] desktop walk', JSON.stringify({ fps: walk.averageFps, withinBudgets: modesWithinBudgets([walk], budgets.desktopTier) }));
    const walkMoving = await measureMode(client, 'walk-moving', 5_000, 'w');
    const driveActivationMs = await selectMode(client.page, 'drive', '#fDriving');
    const drive = { ...(await measureMode(client, 'drive', auditOnly ? 1_500 : 5_000)), activationMs: driveActivationMs };
    console.log('[performance-retention] desktop drive', JSON.stringify({ fps: drive.averageFps, withinBudgets: modesWithinBudgets([drive], budgets.desktopTier) }));
    const driveMoving = await measureMode(client, 'drive-moving', 5_000, 'w');
    const planeActivationMs = await selectMode(client.page, 'plane', '#fPlane');
    // Exercise the actual throttle and climb controls. An idle aircraft spawned
    // from a city street can hit the next block; that is not sustained-flight
    // performance evidence. Do not teleport, disable collisions, or inject speed.
    await client.page.mouse.click(720, 400);
    const flightBefore = await client.page.evaluate(async () => (await import('/app/js/shared-context.js?v=55')).ctx.getPlaneSnapshot());
    await client.page.keyboard.down('Space');
    await client.page.keyboard.down('s');
    try { await client.page.waitForTimeout(2_000); }
    finally { await client.page.keyboard.up('s'); await client.page.keyboard.up('Space'); }
    const flightAfter = await client.page.evaluate(async () => (await import('/app/js/shared-context.js?v=55')).ctx.getPlaneSnapshot());
    assert.ok(flightAfter.pitch > .05 && flightAfter.y > flightBefore.y && flightAfter.throttle > flightBefore.throttle,
      'Real pitch/throttle input must establish a climb before sustained flight');
    const plane = { ...(await measureMode(client, 'plane', auditOnly && !process.env.WE3D_PERF_TRACE_MODE ? 1_500 : 90_000, 'Space')), activationMs: planeActivationMs,
      preparation: { keys: ['s', 'Space'], heldForMs: 2_000, before: flightBefore, after: flightAfter } };
    console.log('[performance-retention] desktop plane', JSON.stringify({ fps: plane.averageFps, withinBudgets: modesWithinBudgets([plane], budgets.desktopTier) }));
    const sustainedModes=sustained?await sustainedTravel(client):[];
    const modes = [walk, walkMoving, drive, driveMoving, plane,...sustainedModes];
    const baselineCounts = walk.worldCounts;
    const releases = [];
    const reloadCounts = [];
    const reloadTransfers=[];
    let shortRunTransfer=null,previousTransfer=transferSnapshot(client);
    const requestedRetentionCycles = Number(process.env.WE3D_VERIFY_RETENTION_CYCLES);
    const environmentCycles = auditOnly&&!retainedHeapCycles.size
      ? 0
      : Math.max(
          sustained?12:budgets.retention.minimumEnvironmentCycles,
          ...retainedHeapCycles,
          Number.isFinite(requestedRetentionCycles) ? Math.floor(requestedRetentionCycles) : 0
        );
    for (let cycle = 0; cycle < environmentCycles; cycle += 1) {
      await client.page.evaluate(()=>{
        const c=globalThis.__WE3D_PERF_CONTEXT__;
        globalThis.__WE3D_RETIRED_RUNTIME_REFS__={
          living:c.livingWorldRuntime?new WeakRef(c.livingWorldRuntime):null,
          urban:c.urbanSandboxRuntime?new WeakRef(c.urbanSandboxRuntime):null
        };
      });
      await client.page.locator('#mainMenuBtn').click();
      await client.page.waitForFunction(() => {
        const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
        return state.gameStarted === false && state.titleVisible === true && state.lastEarthWorldRelease?.released === true;
      }, null, { timeout: 30_000 });
      const release = await client.page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().lastEarthWorldRelease || null);
      // Record natural behavior before collecting solely to diagnose retained
      // ownership. Never use the collected value as an active-play budget.
      release.naturalJsHeapUsedBytes = await heapUsedBytes(client.cdp);
      release.immediateJsHeapUsedBytes = await heapUsedBytes(client.cdp, true);
      // Disposal cancels async producers; their rejection/finally jobs can
      // still hold staging data until subsequent event-loop turns. Preserve
      // the immediate reading and independently measure the settled owner.
      await client.page.waitForTimeout(2000);
      release.settledOwnerCounts=await client.page.evaluate(()=>{
        const c=globalThis.__WE3D_PERF_CONTEXT__;
        return {roads:c.roads.length,buildings:c.buildings.length,terrainTiles:c.terrainTileCache.size,
          worldLoading:c.worldLoading,providerRelease:c.worldProviderStagingRelease,
          lifecycle:c.getLifecycleRegistrySnapshot?.()};
      });
      release.jsHeapUsedBytes = await heapUsedBytes(client.cdp, true);
      release.retiredPopulationOwnership=await client.page.evaluate(()=>{
        const refs=globalThis.__WE3D_RETIRED_RUNTIME_REFS__,living=refs?.living?.deref(),urban=refs?.urban?.deref();
        return {livingRetained:!!living,urbanRetained:!!urban,
          trafficFeatureRefs:living?.trafficCompilation?.runtimeFeatureByEdge?.size||0,
          pedestrianFeatureRefs:living?.pedestrianCompilation?.runtimeFeatureByEdge?.size||0,
          urbanPopulationRetained:!!urban?.population};
      });
      if(retainedHeapCycles.size){
        // This is the exact module identity used by source model consumers.
        // Never create a second empty cache or import source into an artifact.
        release.modelCache=await client.page.evaluate(async()=>
          (await import('/app/js/assets/model-asset-runtime.js?v=16')).modelAssetCacheSnapshot());
        if(retainedHeapCycles.has(cycle+1)){
          release.privateHeap=await privateHeapSnapshot(client,`released-world-${cycle+1}`);
          release.afterSnapshotHeapBytes=await heapUsedBytes(client.cdp);
        }
      }
      release.settledAfterMs=2000;
      release.heapEvidenceScope = 'Immediate and settled post-GC retained objects; not process memory or active-play budget';
      releases.push(release);
      await client.page.locator('#globeSelectorStartBtn').click();
      await waitForPlayable(client.page);
      reloadCounts.push(await client.page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().worldCounts || null));
      const currentTransfer=transferSnapshot(client);
      reloadTransfers.push(Object.fromEntries(['localTransferBytes','externalTransferBytes','externalRequests'].map(key=>[key,currentTransfer[key]-previousTransfer[key]])));
      previousTransfer=currentTransfer;
      if(cycle+1===budgets.retention.minimumEnvironmentCycles)shortRunTransfer=currentTransfer;
      console.log('[performance-retention] world cycle',JSON.stringify({cycle:cycle+1,immediateMiB:release.immediateJsHeapUsedBytes/1048576,settledMiB:release.jsHeapUsedBytes/1048576}));
    }
    await client.page.screenshot({ path: `${evidenceDirectory}/performance-desktop.png`, fullPage: false });
    const storage = await storageSnapshot(client.page);
    const transfer = transferSnapshot(client);
    const limit = budgets.desktopTier.budgets;
    const releaseGeometries = releases.map((entry) => Number(entry?.after?.rendererGeometries || 0));
    const releaseTextures = releases.map((entry) => Number(entry?.after?.rendererTextures || 0));
    const checks = {
      firstPlayableWithinBudget: launch.firstPlayableMs <= limit.firstPlayableMs,
      modeActivationResponsive: modes.filter((mode) => mode.activationMs !== undefined).every((mode) => mode.activationMs <= limit.maximumModeActivationMs),
      completeWorld: modes.every((mode) => Number(mode.worldCounts?.buildings) > 0 && Number(mode.worldCounts?.roads) > 0 && Number(mode.worldCounts?.terrainTiles) > 0),
      modesWithinBudgets: modesWithinBudgets(modes, budgets.desktopTier),
      activePlayHitchesWithinBudget:modes.every(mode=>mode.hitches.passed),
      sustainedMixedTraversal:!sustained||sustainedModes.reduce((sum,mode)=>sum+mode.elapsedMs,0)>=600000,
      settledRetentionPlateau:!sustained||releases.length>=12&&releases.slice(2).every(entry=>{
        const baseline=releases[2];return Math.abs(entry.after.rendererGeometries-baseline.after.rendererGeometries)<=16&&
          Math.abs(entry.after.rendererTextures-baseline.after.rendererTextures)<=8&&entry.jsHeapUsedBytes-baseline.jsHeapUsedBytes<=50*1024*1024&&
          entry.settledOwnerCounts.roads===0&&entry.settledOwnerCounts.buildings===0&&entry.settledOwnerCounts.terrainTiles===0&&!entry.settledOwnerCounts.worldLoading;
      }),
      movingGroundRoutesObserved: walkMoving.distanceWorldUnits >= 2 && driveMoving.distanceWorldUnits >= 5,
      sustainedFlightObserved: !auditOnly && plane.elapsedMs >= 90_000 && plane.distanceWorldUnits >= 1_000,
      retiredPopulationReleasesFeatures:releases.every(entry=>entry.retiredPopulationOwnership?.trafficFeatureRefs===0&&
        entry.retiredPopulationOwnership?.pedestrianFeatureRefs===0&&!entry.retiredPopulationOwnership?.urbanPopulationRetained),
      teardownClearsWorldOwners: releases.every((entry) =>
        Number(entry?.after?.roads || 0) <= budgets.retention.maximumRetainedRoads &&
        Number(entry?.after?.buildings || 0) <= budgets.retention.maximumRetainedBuildings &&
        Number(entry?.after?.terrainTiles || 0) <= budgets.retention.maximumRetainedTerrainTiles),
      rendererRetentionBounded: Math.max(...releaseGeometries) - Math.min(...releaseGeometries) <= budgets.retention.maximumGeometryGrowthPerCycle &&
        Math.max(...releaseTextures) - Math.min(...releaseTextures) <= budgets.retention.maximumTextureGrowthPerCycle,
      heapRetentionBounded: releases.every((entry) => Number(entry.jsHeapUsedBytes || 0) <= launch.titleHeapBytes + budgets.retention.maximumHeapGrowthBytes),
      worldCoveragePreserved: reloadCounts.every((counts) => reloadPreservesCoverage(counts, baselineCounts, budgets.retention)),
      // Preserve the existing short-run total limit. Additional reloads have
      // separate receipts instead of being charged to a two-cycle total.
      transferWithinBudget: transferWithinBudget(shortRunTransfer || transfer, limit),
      extendedReloadTransfersWithinBudget:reloadTransfers.slice(budgets.retention.minimumEnvironmentCycles).every(sample=>transferWithinBudget(sample,limit)),
      storageWithinBudget: storage.usageBytes <= limit.maximumPersistentStorageBytes,
      noBrowserErrors: client.browserErrors.length === 0,
      noFailedLocalResources: client.localFailures.length === 0
    };
    return { ok: Object.values(checks).every(Boolean), tier: budgets.desktopTier, launch, modes, releases, reloadCounts,
      transfer,shortRunTransfer,reloadTransfers,transferScope:'Original total budget through two reloads; same limits checked separately on every additional reload; cumulative transfers retained.',
      storage, checks, browserErrors: client.browserErrors, localFailures: client.localFailures, providerDegradations:client.providerDegradations };
  } finally {
    await client.context.close();
  }
}

async function runMobileRegression() {
  const viewport = budgets.mobileRegressionTier.viewport;
  const client = await createMeasuredClient({ ...devices['iPhone 13'], viewport });
  try {
    const launch = await launchWorld(client);
    const walkActivationMs = await selectMode(client.page, 'walk', '#fWalk');
    const modes = [{ ...(await measureMode(client, 'walk-touch-regression')), activationMs: walkActivationMs }];
    await client.page.screenshot({ path: 'output/release-evidence/current/performance-mobile-390x844.png', fullPage: false });
    const storage = await storageSnapshot(client.page);
    const transfer = transferSnapshot(client);
    const limit = budgets.mobileRegressionTier.budgets;
    const checks = {
      viewportIs390x844: await client.page.evaluate(() => innerWidth === 390 && innerHeight === 844),
      firstPlayableWithinBudget: launch.firstPlayableMs <= limit.firstPlayableMs,
      modeActivationResponsive: modes.filter((mode) => mode.activationMs !== undefined).every((mode) => mode.activationMs <= limit.maximumModeActivationMs),
      completeWorld: modes.every((mode) => Number(mode.worldCounts?.buildings) > 0 && Number(mode.worldCounts?.roads) > 0 && Number(mode.worldCounts?.terrainTiles) > 0),
      modesWithinBudgets: modesWithinBudgets(modes, budgets.mobileRegressionTier),
      transferWithinBudget: transferWithinBudget(transfer, limit),
      storageWithinBudget: storage.usageBytes <= limit.maximumPersistentStorageBytes,
      noBrowserErrors: client.browserErrors.length === 0,
      noFailedLocalResources: client.localFailures.length === 0
    };
    return { ok: Object.values(checks).every(Boolean), tier: budgets.mobileRegressionTier, launch, modes, transfer, storage, checks, browserErrors: client.browserErrors, localFailures: client.localFailures };
  } finally {
    await client.context.close();
  }
}

try {
  await mkdir(evidenceDirectory, { recursive: true });
  const graphicsPage = await browser.newPage();
  try {
    graphicsAuthority = await graphicsPage.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return null;
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return { renderer };
    });
    requireHardwareGraphics(graphicsAuthority?.renderer);
  } finally { await graphicsPage.close(); }
  let desktop = null;
  let mobileRegression = null;
  if (requestedProfile !== 'mobile') {
    console.log('[performance-retention] starting desktop');
    desktop = await runDesktop();
    await writeFile(`${evidenceDirectory}/report-desktop.json`, `${JSON.stringify(desktop, null, 2)}\n`);
    console.log('[performance-retention] desktop complete');
  }
  if (requestedProfile !== 'desktop') {
    // Retention is measured within the desktop journey. Use a fresh process
    // for the independent mobile profile so desktop GPU/native caches cannot
    // inflate its cold-start memory or affect its measurement.
    if (desktop) {
      await browser.close();
      browser = await chromium.launch(browserOptions);
    }
    console.log('[performance-retention] starting mobile');
    mobileRegression = await runMobileRegression();
    await writeFile(`${evidenceDirectory}/report-mobile.json`, `${JSON.stringify(mobileRegression, null, 2)}\n`);
    console.log('[performance-retention] mobile complete');
  }
  const selectedReports = [desktop, mobileRegression].filter(Boolean);
  const report = {
    ok: !auditOnly&&!process.env.WE3D_PERF_TRACE_MODE&&selectedReports.every((entry) => entry.ok),
    contract: 'world-explorer-minimum-5-performance-retention-v1',
    generatedAt: new Date().toISOString(),
    baseUrl,
    writesProduction: false,
    evidenceScope: {
      kind: auditOnly||process.env.WE3D_PERF_TRACE_MODE?'instrumented-or-short-diagnostic':'single-artifact-budget-and-retention',
      comparativeImprovementEstablished: false,
      movingWalkAndDriveMeasured: desktop?.checks?.movingGroundRoutesObserved === true,
      reason: 'Stationary and controlled moving samples are separate. A live-versus-candidate comparison with matched data, routes, quality, hardware, and repeated cold/warm trials is required to establish improvement.'
    },
    budgets,
    hostAuthority,
    graphicsAuthority,
    browserVersion: browser.version(),
    desktop,
    mobileRegression,
    physicalPhoneEvidence: {
      measured: false,
      battery: null,
      thermal: null,
      sustainedFps: null,
      reason: 'No physical phone is connected; touch emulation is not presented as device evidence.'
    }
  };
  await writeFile(`${evidenceDirectory}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if(!auditOnly)assert.equal(report.ok, true, 'Desktop/mobile-regression performance or retention budget failed.');
} finally {
  // Always close the loopback listener even if a profiled browser's transport
  // fails to finish its close handshake after the Chrome process has exited.
  await server.close();
  let closeTimer;
  try{await Promise.race([browser.close(),new Promise((_,reject)=>{closeTimer=setTimeout(()=>reject(Error('Owned browser cleanup exceeded 20 seconds')),20000);})]);}
  finally{clearTimeout(closeTimer);}
}
