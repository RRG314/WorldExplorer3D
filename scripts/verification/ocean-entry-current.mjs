import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
const server = await startStaticServer({ rootDir: process.cwd(), ports: [4396] });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const dir = 'output/verification/ocean-plan';
await fs.mkdir(dir, { recursive: true });
const report = { scope: 'Mutable source, real UI and ocean renderer; controlled provider responses for entry boundary cases', cases: [], errors: [] };
try {
 const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
 let elevation = 50, delay = 0;
 await context.route('**/reverse?**', route => route.fulfill({ json: { display_name: 'Entry check fixture', lat: '39.2898', lon: '-76.6122', address: { city: 'Entry check fixture' } } }));
 await context.route('https://api-bdc.io/**', route => route.fulfill({ json: { locality: 'Entry check fixture' } }));
 await context.route('https://wms.gebco.net/**', async route => {
   const captured = elevation, wait = delay;
   if (wait) await new Promise(r => setTimeout(r, wait));
   await route.fulfill({ status: captured === null ? 503 : 200, contentType: 'text/plain', body: captured === null ? 'unavailable' : `value_list = '${captured}'` }).catch(() => {});
 });
 const page = await context.newPage();
 page.on('pageerror', error => report.errors.push(error.message));
 page.on('console', message => {if(message.text().includes('[BoatMode]')) (report.boatWarnings ||= []).push(message.text());});
 await page.goto(`http://127.0.0.1:${server.port}/`, { waitUntil: 'load' });
 await page.locator('#landingPrimaryCta').click();
 await page.waitForFunction(() => window.__WE3D_RUNTIME_READY__ === true, null, { timeout: 90000 });
 await page.waitForSelector('#globeSelectorScreen.show');
 if (await page.locator('#analyticsConsentDenyBtn').isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
 const select = async (lat, lon) => {
   await page.locator('#globeCustomLat').fill(String(lat));
   await page.locator('#globeCustomLon').fill(String(lon));
   await page.locator('#globeCustomLon').press('Tab');
 };
 const click = () => page.locator('#globeSelectorOceanBtn').click();
 const rejected = async (id, pattern) => {
   await page.waitForFunction(pattern => new RegExp(pattern).test(document.querySelector('#globeLocationSearchStatus').textContent), pattern, { timeout: 25000 });
   assert.equal(await page.locator('#globeSelectorScreen').evaluate(el => el.classList.contains('show')), true);
   assert.equal(await page.evaluate(() => !!window.getWorldExplorerRuntimeDiagnostics?.().modes?.ocean), false);
   await page.screenshot({ path: `${dir}/${id}.png` });
   report.cases.push({ id, passed: true, message: await page.locator('#globeLocationSearchStatus').textContent() });
 };
 await select(39.2898, -76.6122); await click(); await rejected('land-blocked', 'on land|too shallow');
 elevation = null;
 await select(39.2901, -76.6124); await click(); await rejected('provider-outage-blocked', 'could not be checked');
 elevation = -80; delay = 1500;
 await select(-18.2861, 147.7); await click();
 await select(39.29, -76.61);
 await rejected('stale-selection-blocked', 'location changed');
 delay = 0; elevation = -30;
 await select(-18.2862, 147.7001); await click();
 await page.waitForFunction(() => window.getWorldExplorerRuntimeDiagnostics?.().modes?.ocean === true, null, { timeout: 90000 });
 await page.waitForTimeout(2000);
 report.before = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
 await page.screenshot({ path: `${dir}/coastal-water-arrival.png` });
 await page.keyboard.down('ArrowUp'); await page.waitForTimeout(1500); await page.keyboard.up('ArrowUp');
 report.after = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
 await page.screenshot({ path: `${dir}/coastal-water-moved.png` });
 assert.notEqual(report.after.ocean.position.z, report.before.ocean.position.z);
 assert.ok(report.after.ocean.speed > 0);
 report.cases.push({ id: 'coastal-water-entry-and-controls', passed: true });
 const mapBefore = report.after.ocean.navigationMap;
 assert.ok(mapBefore.widthMeters > 0);
 assert.equal(mapBefore.headingDegrees, 180);
 await page.locator('#minimapZoomIn').click();
 await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(700); await page.keyboard.up('ArrowLeft');
 const turned = await page.evaluate(() => window.getOceanModeDebugState());
 report.turned = turned;
 assert.equal(turned.navigationMap.widthMeters, mapBefore.widthMeters / 2);
 assert.ok(Math.abs(turned.navigationMap.headingDegrees - 180) > 1);
 assert.ok(Math.abs(turned.navigationMap.gameplaySeabedWorldY - turned.seabed.presentationWorldY) < 1);
 assert.match(await page.locator('#minimap').getAttribute('aria-label'), /North-up gameplay seabed/);
 await page.screenshot({ path: `${dir}/seabed-map-zoom-heading.png` });
 await page.locator('#minimap').click();
 assert.equal(await page.evaluate(() => window.getWorldExplorerRuntimeDiagnostics().paused), false);
 assert.equal(await page.locator('#largeMap').evaluate(el => el.classList.contains('show')), false);
 report.cases.push({ id: 'sampled-map-zoom-heading-depth-labels', passed: true });
 const guard = await page.evaluate(async () => {
   const { ctx } = await import('/app/js/shared-context.js?v=55');
   const before = ctx.oceanMode.launchSite;
   const result = await ctx.startOceanMode({ launchSite: { lat: 39.2898, lon: -76.6122 } });
   return { rejected: result === false, retained: ctx.oceanMode.launchSite === before && ctx.oceanMode.active };
 });
 assert.deepEqual(guard, { rejected: true, retained: true });
 report.cases.push({ id: 'runtime-rejects-unchecked-site-preserving-session', passed: true });
 // P02: a previously admitted site must remain playable when later depth
 // requests fail. This uses the real runtime and provider request path.
 elevation = null;
 const outage = await page.evaluate(async () => {
   const { ctx } = await import('/app/js/shared-context.js?v=55');
   const site = { lat: 0, lon: -140, name: 'Provider outage fixture', region: 'Pacific' };
   const started = await ctx.startOceanMode({ launchSite: site, entry: {
     ...site, source: 'gebco-elevation-sample', kind: 'modeled-ocean', elevationMeters: -80
   } });
   await ctx.oceanMode.bathymetryPromise;
   return { started, state: window.getOceanModeDebugState() };
 });
 assert.equal(outage.started, true);
 assert.equal(outage.state.seabed.bathymetry.truthType, 'unknown');
 assert.equal(outage.state.seabed.presentationMode, 'procedural-only');
 await page.keyboard.down('ArrowUp'); await page.waitForTimeout(700); await page.keyboard.up('ArrowUp');
 report.outageAfter = await page.evaluate(() => window.getOceanModeDebugState());
 assert.notEqual(report.outageAfter.position.z, outage.state.position.z);
 assert.ok(Number.isFinite(report.outageAfter.position.y));
 assert.equal(report.outageAfter.navigationMap.geographicDepthMeters, null);
 assert.equal(report.outageAfter.navigationMap.coverageFraction, 0);
 assert.match(await page.locator('#minimap').getAttribute('aria-label'), /Depth data unknown/);
 await page.screenshot({ path: `${dir}/outage-playable.png` });
 report.cases.push({ id: 'provider-outage-preserves-playable-procedural-fallback', passed: true });
 const surfaced = await page.evaluate(async () => {
   const {ctx}=await import('/app/js/shared-context.js?v=55');
   window.expectedSurfaceOrigin={...ctx.oceanMode.launchSite};
   return ctx.transferSubmarineToBoat({source:'water-authority-verification'});
 });
 report.surfaceTransfer={surfaced,warnings:report.boatWarnings||[],snapshot:await page.evaluate(()=>window.getWorldExplorerRuntimeDiagnostics?.().modes)};
 assert.equal(surfaced,true,JSON.stringify(report.surfaceTransfer));
 await page.evaluate(async()=>{window.waterCheckContext=(await import('/app/js/shared-context.js?v=55')).ctx;});
 await page.waitForFunction(()=>{
   const ctx=window.waterCheckContext;
   const shader=ctx.boatMode?.waterPatch?.material?.userData?.weWaterWaveShader;
   if (!shader || !ctx.boatMode.active) return false;
   const uniforms=shader.uniforms;
   const sample=ctx.sampleDynamicWaterAt(ctx.boat.x,ctx.boat.z,ctx.boatMode.currentWater,{time:uniforms.weWaveTime.value});
   window.waterCheckResult={active:ctx.boatMode.active,coverage:sample.coverage,finite:Number.isFinite(sample.surfaceY),
     amplitudeDelta:Math.abs(uniforms.weWaveAmplitude.value-sample.profile.primaryAmplitude),
     scaleDelta:Math.abs(uniforms.weWaveScale.value-sample.profile.spatialScale),
     speedDelta:Math.abs(uniforms.weWaveSpeed.value-sample.profile.speed)};
   return true;
 },null,{timeout:30000});
 report.boatWater=await page.evaluate(()=>window.waterCheckResult);
 report.surfaceOrigin=await page.evaluate(()=>({actual:waterCheckContext.LOC,expected:expectedSurfaceOrigin}));
 assert.ok(Math.abs(report.surfaceOrigin.actual.lat-report.surfaceOrigin.expected.lat)<.001);
 assert.ok(Math.abs(report.surfaceOrigin.actual.lon-report.surfaceOrigin.expected.lon)<.001);
 assert.deepEqual(report.boatWater,{active:true,coverage:'known-water-body',finite:true,amplitudeDelta:0,scaleDelta:0,speedDelta:0});
 const mapOrigin=await page.evaluate(async()=>{
   const {resolveMapView}=await import('/app/js/map/tiles.js?v=5');return resolveMapView(150,150,false).centerLatLon;
 });
 assert.ok(Math.abs(mapOrigin.lat-report.surfaceOrigin.actual.lat)<.001);
 assert.ok(Math.abs(mapOrigin.lon-report.surfaceOrigin.actual.lon)<.001);
 await page.waitForTimeout(700);
 report.surfacePresentation=await page.evaluate(()=>{
   const ctx=window.waterCheckContext, mesh=ctx.boatMode.mesh;
   return {boat:{...ctx.boat},visible:mesh.visible,parent:mesh.parent?.type,position:mesh.position.toArray(),camera:ctx.camera?.position?.toArray(),projected:mesh.getWorldPosition(new THREE.Vector3()).project(ctx.camera).toArray(),rig:ctx.camera.userData.boatrig,sceneMatch:mesh.parent===ctx.scene,environment:ctx.getEnv?.(),active:ctx.boatMode.active};
 });
 await page.screenshot({path:`${dir}/surface-boat-water-authority.png`});
 await page.waitForTimeout(2500);
 report.settledPresentation=await page.evaluate(()=>{
   const ctx=waterCheckContext,mesh=ctx.boatMode.mesh;
   return {position:mesh.position.toArray(),projected:mesh.getWorldPosition(new THREE.Vector3()).project(ctx.camera).toArray(),rig:ctx.camera.userData.boatrig,visible:mesh.visible,sceneMatch:mesh.parent===ctx.scene};
 });
 await page.screenshot({path:`${dir}/surface-boat-settled.png`});
 assert.ok(report.settledPresentation.projected.every(v=>Number.isFinite(v)&&Math.abs(v)<=1),'stationary boat remains in camera view');
 const initialBoat=report.surfacePresentation.position,settledBoat=report.settledPresentation.position;
 assert.ok(Math.hypot(settledBoat[0]-initialBoat[0],settledBoat[2]-initialBoat[2])<2,'stationary boat does not jump to shoreline correction spawns');
 report.cases.push({id:'surface-boat-stationary-continuity-and-framing',passed:true});
 report.cases.push({id:'actual-surface-boat-shader-physics-profile-agreement',passed:true});
 report.roundTrip=await page.evaluate(async()=>{
   const ctx=window.waterCheckContext;
   const expected={lat:ctx.LOC.lat-ctx.boat.z/ctx.SCALE,lon:ctx.LOC.lon+ctx.boat.x/(ctx.SCALE*Math.cos(ctx.LOC.lat*Math.PI/180))};
   const returned=await ctx.transferBoatToSubmarine({source:'water-authority-roundtrip'});
   return {returned,expected,actual:ctx.oceanMode.launchSite};
 });
 assert.equal(report.roundTrip.returned,true);
 assert.ok(Math.abs(report.roundTrip.actual.lat-report.roundTrip.expected.lat)<.00001);
 assert.ok(Math.abs(report.roundTrip.actual.lon-report.roundTrip.expected.lon)<.00001);
 report.cases.push({id:'ocean-surface-dive-retains-geographic-origin',passed:true});
 assert.deepEqual(report.errors, []);
 report.passed = true;
} finally {
 await fs.writeFile(`${dir}/entry-browser.json`, JSON.stringify(report, null, 2));
 await browser.close(); await server.close();
}
console.log(JSON.stringify({ passed: report.passed, cases: report.cases, errors: report.errors }));
