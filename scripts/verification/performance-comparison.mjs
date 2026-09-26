import {publicProviderFixtureRequest} from './provider-fixture-key.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import { configureStagingAppCheck } from './staging-app-check.mjs';
import { sampleFrameWindow } from './frame-window.mjs';

// Replays public provider bytes, never credentials or authenticated service data.
// Playwright routing disables HTTP cache: "warm" means persisted world-data cache,
// not an HTTP/CDN warm load. Hosted transfer latency is a separate acceptance test.
const record = process.env.WE3D_COMPARISON_MODE === 'record';
const output = path.resolve(process.env.WE3D_COMPARISON_OUTPUT || 'output/verification/performance-comparison');
const cacheRoot = path.join(output, 'public-provider-cache');
const roots = {
  live: path.resolve(process.env.WE3D_COMPARISON_BASELINE || '.local-candidates/5.2.0+db62593ba377.6342cddaba06fc68.production'),
  candidate: path.resolve(process.env.WE3D_COMPARISON_CANDIDATE || 'dist')
};
const rounds = record ? 1 : Math.max(3, Number(process.env.WE3D_COMPARISON_ROUNDS) || 3);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(cacheRoot, { recursive: true });
const indexFile = path.join(cacheRoot, 'index.json');
const cache = JSON.parse(await readFile(indexFile, 'utf8').catch(() => '{}'));
const publicHosts = new Set(['vector.openstreetmap.org','server.arcgisonline.com','tile.openstreetmap.org','s3.amazonaws.com',
  'overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com','planetarycomputer.microsoft.com','cdn.jsdelivr.net',
  'fonts.gstatic.com','fonts.googleapis.com','cdnjs.cloudflare.com','api.tidesandcurrents.noaa.gov',
  'lz4.overpass-api.de','overpass-api.de','overpass.private.coffee','marine-api.open-meteo.com','api.open-meteo.com',
  'nominatim.openstreetmap.org']);
const manifests = {};
for (const [label, root] of Object.entries(roots)) {
  const manifest = JSON.parse(await readFile(path.join(root, 'build-manifest.json')));
  const bytes = await readFile(path.join(root, 'asset-manifest.json'));
  assert.equal(digest(bytes), manifest.assetManifestSha256, `${label}: manifest hash`);
  for (const [name, hash] of Object.entries(JSON.parse(bytes).files)) {
    const file = path.resolve(root, name);
    assert.ok(file.startsWith(root + path.sep));
    assert.equal(digest(await readFile(file)), hash, `${label}: ${name}`);
  }
  assert.equal(manifest.sourceDirty, false);
  manifests[label] = { buildId: manifest.buildId, contentHash: manifest.contentHash, root };
}
const report = { mode: record ? 'record-public-fixtures' : 'controlled-replay', startedAt: new Date().toISOString(), manifests,
  scope: { hardware: 'current physical desktop', viewport: '1440x900 at DPR 1', renderQuality: 'med', dynamicQuality: 'locked balanced',
    daylight: 'day', controls: 'real W key along fixed starts/headings for 12 m walk and 75 m drive; 20 second timeout', cache: 'cold context followed by same-context persisted-data reload; HTTP cache disabled by routing',
    network: 'public providers replayed locally; Overpass mirrors/timeouts share one complete response per identical data query; authenticated staging attestation remains live',
    exclusions: ['hosted CDN latency', 'physical-phone performance', 'all possible places and routes'] }, trials: [] };
const save = () => writeFile(path.join(output, record ? 'record-report.json' : 'report.json'), JSON.stringify(report, null, 2));
const percentile = (values, p) => [...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
async function measure(page, mode) {
  await page.locator('#travelBtn').click();
  await page.locator(mode === 'walk' ? '#fWalk' : '#fDriving').click();
  await page.waitForFunction(mode => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.mode === mode, mode);
  await page.mouse.click(720,400);
  await page.evaluate(async mode=>{
    const {ctx}=await import('/app/js/shared-context.js?v=55');
    const actor=mode==='walk'?ctx.Walk.state.walker:ctx.car;
    const x=mode==='walk'?-10:-3, z=mode==='walk'?-4:-2;
    Object.assign(actor,{x,z,angle:Math.atan2(1,.25),yaw:Math.atan2(1,.25),speed:0,vFwd:0,vLat:0,vx:0,vy:0,vz:0,yawRate:0,lookYawOffset:0,pitch:0});
    actor.y=mode==='walk'?ctx.GroundHeight.walkSurfaceY(x,z)+1.7:ctx.GroundHeight.carCenterY(x,z);
    actor.onGround=true;actor.isAirborne=false;
    globalThis.__WE3D_COMPARISON_ACTOR__=actor;
  },mode);
  await page.waitForTimeout(1500);
  await page.keyboard.down('w');
  let raw;
  try { raw = await page.evaluate(sampleFrameWindow, {durationMs:20000,targetDistance:mode==='walk'?12:75,actorKey:'__WE3D_COMPARISON_ACTOR__'}); }
  finally { await page.keyboard.up('w'); }
  const distance = Math.hypot(raw.endPosition.x-raw.startPosition.x, raw.endPosition.z-raw.startPosition.z);
  assert.equal(raw.routeComplete,true, `${mode}: input did not complete the fixed route`);
  assert.ok(Math.abs(raw.deltas.reduce((a,b)=>a+b,0)-raw.elapsedMs)<.001);
  return { mode, elapsedMs: raw.elapsedMs, startPosition: raw.startPosition, endPosition: raw.endPosition, distance,
    fps: raw.deltas.length/raw.elapsedMs*1000, p95FrameMs: percentile(raw.deltas,.95), p99FrameMs: percentile(raw.deltas,.99),
    renderer: raw.diagnostics.renderer, worldCounts: raw.diagnostics.worldCounts };
}
async function trial(label, round) {
  const server = await startStaticServer({ rootDir: roots[label], ports: [4488] });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  const browser = await chromium.launch({ headless:true, channel:'chrome', args:['--js-flags=--max-old-space-size=1280'] });
  const context = await browser.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const misses = [], providerErrors = [], browserErrors = [], pending = new Set();
  await context.route('https://**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const isPublic = publicHosts.has(url.hostname) || (url.hostname==='www.gstatic.com' && url.pathname.startsWith('/firebasejs/'));
    if (!isPublic) {
      const service=/^(content-firebaseappcheck|firebaseappcheck|firebaseinstallations|identitytoolkit|securetoken|firestore|firebasestorage)\.googleapis\.com$/.test(url.hostname) ||
        url.hostname==='us-central1-we3d-staging-20260712.cloudfunctions.net' ||
        (['www.google.com','www.gstatic.com','recaptcha.google.com'].includes(url.hostname)&&url.pathname.includes('recaptcha'));
      if(service)return route.continue();
      misses.push({url:url.origin+url.pathname,reason:'Uncontrolled external origin'});
      return route.abort('failed');
    }
    const requestShape={method:request.method(),url:url.href,range:request.headers().range||'',body:request.postData()||''};
    const fixture=publicProviderFixtureRequest(requestShape);
    const key=digest(JSON.stringify(fixture.key));
    const legacyKey=digest(JSON.stringify([requestShape.method,requestShape.url,requestShape.range,requestShape.body]));
    const work = (async () => {
      const legacy=record&&fixture.semanticOverpass&&cache[legacyKey]?.status===200?cache[legacyKey]:null;
      const entry=cache[key]||legacy;
      if (entry) {
        if (entry.aborted) return route.abort('failed');
        const body = await readFile(path.join(cacheRoot, entry.sha256));
        assert.equal(digest(body), entry.sha256, 'Provider fixture changed');
        if(fixture.semanticOverpass)assert.ok(!JSON.parse(body).remark,'Incomplete Overpass fixture');
        if(legacy)cache[key]={...entry,query:fixture.key[1],semanticOverpass:true};
        return route.fulfill({ status:entry.status, headers:entry.headers, body });
      }
      if (!record) { misses.push({url:url.href,range:request.headers().range || ''}); return route.abort('failed'); }
      try {
        const response = await route.fetch({ timeout:30000, maxRetries:0 });
        const body = await response.body(), sha256 = digest(body);
        const headers = Object.fromEntries(Object.entries(response.headers()).filter(([key])=>
          ['content-type','content-range','accept-ranges','access-control-allow-origin','cache-control','etag','last-modified'].includes(key)));
        await writeFile(path.join(cacheRoot,sha256),body,{mode:0o600});
        const complete=!fixture.semanticOverpass||(response.status()===200&&!JSON.parse(body).remark);
        if(complete)cache[key] = { url:url.href, range:request.headers().range || '', status:response.status(), headers, sha256, bytes:body.length,...(fixture.semanticOverpass?{query:fixture.key[1],semanticOverpass:true}:{}) };
        else providerErrors.push({url:url.href,status:response.status(),error:'Incomplete Overpass response excluded from normal replay fixtures'});
        await route.fulfill({status:response.status(),headers,body}).catch(()=>{});
      } catch (error) {
        // Preserve unavailable upstream data as unavailable in both builds.
        if(!fixture.semanticOverpass)cache[key] = {url:url.href,aborted:true};
        providerErrors.push({url:url.href,error:String(error).split('\n')[0]});
        await route.abort('failed').catch(()=>{});
      }
    })();
    pending.add(work);
    try { await work; } finally { pending.delete(work); }
  });
  const page = await context.newPage();
  page.on('pageerror',error=>browserErrors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error'&&/THREE|WebGL|shader/i.test(message.text()))browserErrors.push(message.text());});
  await configureStagingAppCheck(page,baseUrl);
  await page.addInitScript(() => {
    localStorage.setItem('worldExplorerPerfAutoQuality','0');
    localStorage.setItem('worldExplorerRenderQualityLevel','med');
    let seed=314159265;
    Math.random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
  });
  try {
    for (const state of ['cold','warm-data']) {
      const started = Date.now();
      const errorsBefore = browserErrors.length, missesBefore = misses.length;
      await page.goto(`${baseUrl}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=walk`,{waitUntil:'domcontentloaded',timeout:120000});
      await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__===true,null,{timeout:120000,polling:500});
      if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
      await page.locator('#globeSelectorStartBtn').click();
      await page.waitForFunction(()=>{const d=globalThis.getWorldExplorerRuntimeDiagnostics?.();return d?.gameStarted&&d.worldLoading===false&&d.worldCounts?.buildings>0&&!document.getElementById('loading')?.classList.contains('show');},null,{timeout:300000,polling:500});
      const playableMs = Date.now()-started;
      const scene = await page.evaluate(async()=>{
        const {ctx}=await import('/app/js/shared-context.js?v=55');
        ctx.setTimeOfDay?.('day');
        const d=globalThis.getWorldExplorerRuntimeDiagnostics();
        const ids=(ctx.buildings||[]).map(b=>b.sourceBuildingId||b.id||'').sort();
        const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(ids))))].map(n=>n.toString(16).padStart(2,'0')).join('');
        return {quality:ctx.getDynamicBudgetState?.(),renderQuality:ctx.renderQualityLevel,pixelRatio:ctx.renderer.getPixelRatio(),buildingIdentitiesSha256:hash,buildingCount:ids.length,buildingIds:ids,worldCounts:d.worldCounts};
      });
      await writeFile(path.join(output,`${label}-${round}-${state}-building-ids.json`),JSON.stringify(scene.buildingIds));
      delete scene.buildingIds;
      assert.equal(scene.quality.auto,false);assert.equal(scene.quality.tier,'balanced');assert.equal(scene.renderQuality,'med');assert.equal(scene.pixelRatio,1);
      await page.waitForTimeout(5000);
      const modes = [await measure(page,'walk'),await measure(page,'drive')];
      await page.screenshot({path:path.join(output,`${label}-${round}-${state}.png`)});
      report.trials.push({label,round,state,playableMs,scene,modes,providerMisses:misses.slice(missesBefore),browserErrors:browserErrors.slice(errorsBefore)});
      await save();
      if(!record)assert.equal(misses.length,missesBefore,'Unrecorded public provider request; stop rather than measure fallback data.');
      assert.equal(browserErrors.length,errorsBefore,'Runtime error invalidates the comparison.');
      console.log(JSON.stringify({label,round,state,playableMs,modes:modes.map(m=>({mode:m.mode,fps:m.fps,distance:m.distance})),misses:misses.length}));
    }
  } finally {
    await context.close();
    await Promise.allSettled([...pending]);
    if(record)await writeFile(indexFile,JSON.stringify(cache,null,2),{mode:0o600});
    await browser.close();await server.close();
    report.providerErrors ||= [];report.providerErrors.push(...providerErrors);await save();
  }
}
try {
  for(let round=0;round<rounds;round++)for(const label of round%2?['candidate','live']:['live','candidate'])await trial(label,round);
  report.completed=true;
  report.providerFixtureIndexSha256=digest(await readFile(indexFile));
  report.validReplay=!record&&report.trials.every(t=>!t.providerMisses.length&&!t.browserErrors.length);
  report.pairs=[];
  if(!record)for(let round=0;round<rounds;round++)for(const state of ['cold','warm-data']){
    const live=report.trials.find(t=>t.label==='live'&&t.round===round&&t.state===state);
    const candidate=report.trials.find(t=>t.label==='candidate'&&t.round===round&&t.state===state);
    report.pairs.push({round,state,matchingBuildingIdentities:live.scene.buildingIdentitiesSha256===candidate.scene.buildingIdentitiesSha256,
      loadRatio:candidate.playableMs/live.playableMs,modes:candidate.modes.map((m,i)=>({mode:m.mode,fpsRatio:m.fps/live.modes[i].fps,p95Ratio:m.p95FrameMs/live.modes[i].p95FrameMs,distanceRatio:m.distance/live.modes[i].distance,startDelta:Math.hypot(m.startPosition.x-live.modes[i].startPosition.x,m.startPosition.z-live.modes[i].startPosition.z),endDelta:Math.hypot(m.endPosition.x-live.modes[i].endPosition.x,m.endPosition.z-live.modes[i].endPosition.z)}))});
  }
  report.improvementEstablished=report.validReplay&&report.pairs.every(p=>p.matchingBuildingIdentities&&p.loadRatio<.95&&p.modes.every(m=>m.fpsRatio>1.05&&m.p95Ratio<=1.03&&m.distanceRatio>.95&&m.distanceRatio<1.05&&m.startDelta<.5&&m.endDelta<3));
  await save();
  if(!record)assert.equal(report.validReplay,true,'Replay had new/missing provider data or browser errors; comparison invalid.');
} catch(error){report.failure=String(error.stack||error);await save();throw error;}
