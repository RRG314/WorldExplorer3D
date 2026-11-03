import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {closeOwnedBrowser, withinDeadline} from './owned-browser.mjs';
import {createHostResourceGuard} from './host-resource-guard.mjs';

export async function createFieldworkQaSession({output, careerId, rootDir = process.cwd(), maximumDurationMs = 12 * 60 * 1000, walkLegMaximumDurationMs = 22000}) {
  await fs.mkdir(output, {recursive: true});
  let server, browser, page;
  const report = {scope: 'Actual source world; keyboard walking with controlled facing, no position teleport or time advance. Disposable browser data; production unchanged.', checks: [], errors: [], providerErrors: []};
  const guard = createHostResourceGuard({rootDir, maximumDurationMs,
    stopOwnedTask: async cause => {report.resourceStop = cause; await server?.kill();}, record: row => fs.appendFile(`${output}/host-resources.jsonl`, JSON.stringify(row) + '\n')});
  await guard.start();
  try {
    server = await chromium.launchServer({channel: 'chrome', headless: true, host: '127.0.0.1'});
    report.ownedBrowserPid = server.process().pid; browser = await chromium.connect(server.wsEndpoint());
    page = await browser.newPage({viewport: {width: 1280, height: 800}});
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => {if (message.type() === 'error') report.providerErrors.push(message.text().replace(/https?:\/\/\S+/g, '[provider]'));});
  } catch (error) {guard.dispose(); await server?.close().catch(() => {}); throw error;}
  const snapshot = () => page.evaluate(async () => {
    const {ctx} = await import('/app/js/shared-context.js?v=55'), w = ctx.Walk?.state?.walker, load = ctx.perfStats?.lastLoad;
    return {started: ctx.gameStarted, loading: ctx.worldLoading, paused: ctx.paused, worldSequence: ctx._worldLoadSequence,
      fieldwork: ctx.saveActiveGameplay?.(), registry: ctx.getGameplayRegistrySnapshot?.(),
      walker: w ? {x: w.x, y: w.y, z: w.z, onGround: w.onGround} : null, unit: ctx.METERS_PER_WORLD_UNIT || 1.11,
      focusedWorld: document.activeElement === ctx.renderer?.domElement,
      load: {success: load?.success, error: load?.error, loadMs: load?.loadMs}, overview: ctx.streetOverview?.stats};
  });
  const careerState = () => page.evaluate(async id => {const {ctx} = await import('/app/js/shared-context.js?v=55'); return (await ctx.discoveryProfileStore.getProfile()).researchCareers[id];}, careerId);
  async function record(name) {
    const state = await snapshot(); report.checks.push({name, state});
    await fs.writeFile(`${output}/progress.json`, JSON.stringify(report, null, 2) + '\n');
    const backup = await page.evaluate(async () => {const {ctx} = await import('/app/js/shared-context.js?v=55'); return ctx.discoveryProfileStore.exportData();});
    await fs.writeFile(`${output}/qa-fieldwork-backup.json`, JSON.stringify(backup) + '\n', {mode: 0o600});
    console.log(name); return state;
  }
  async function waitForCareer(variantId) {
    const deadline = Date.now() + 180000; let nextLog = Date.now() + 15000;
    while (Date.now() < deadline) {
      const state = await snapshot();
      if (state.fieldwork?.careerId === careerId && state.fieldwork.variantId === variantId) return state;
      if (!state.loading && state.load.success === false) throw Error(state.load.error || 'World load failed');
      const plugin = state.registry?.plugins?.find(row => row.id === 'research-career'); if (plugin?.lastError) throw Error(plugin.lastError);
      if (Date.now() > nextLog) {console.log('Field course loading; ' + (state.overview?.requestPhase || state.overview?.status || 'location sources')); nextLog = Date.now() + 15000;}
      await page.waitForTimeout(500);
    }
    throw Error('The course did not become ready within three minutes.');
  }
  async function walkTo(point, tolerance = .22) {
    const deadline = Date.now() + walkLegMaximumDurationMs; let previous = Infinity, stalled = 0;
    try {
      while (Date.now() < deadline) {
        const state = await snapshot(), w = state.walker, meters = Math.hypot(point.x - w.x, point.z - w.z) * state.unit;
        if (meters < tolerance) return;
        assert.equal(state.paused, false, 'Walking requires an unpaused world');
        if (Math.abs(previous - meters) < .012) stalled++; else stalled = 0;
        if (stalled > 18) throw Error(`Walking blocked ${meters.toFixed(1)} m from the approach waypoint`);
        previous = meters;
        await page.evaluate(async p => {const {ctx} = await import('/app/js/shared-context.js?v=55'), w = ctx.Walk.state.walker; w.yaw = Math.atan2(p.x - w.x, p.z - w.z); w.lookYawOffset = 0; w.pitch = -.16;}, point);
        await page.keyboard.down('w'); await page.waitForTimeout(meters < .6 ? 45 : 110);
      }
      throw Error(`The walking leg exceeded ${walkLegMaximumDurationMs/1000} seconds.`);
    } finally {await page.keyboard.up('w').catch(() => {});}
  }
  async function approach({stationId=null,open=true,perimeterSide='east',dryApproach=false,offsets={feature: 1.8, survey: 1.2, trench: 1.6, bench: 1.2}}={}) {
    const before = await snapshot(), state = await careerState(), u = before.unit;
    const byId = await page.evaluate(async site => {const {ctx} = await import('/app/js/shared-context.js?v=55'), {earthCoordinateFrame} = await import('/app/js/earth-core/coordinate-frame.js?v=1'), frame = earthCoordinateFrame(ctx.LOC, ctx.SCALE); return Object.fromEntries(Object.entries(site.points).map(([id,p]) =>[id,frame.toWorld(p.lat,p.lon)]));}, state.active.site);
    const points=Object.values(byId),p=stationId?{id:stationId,...byId[stationId]}:before.fieldwork.target;
    const minX = Math.min(...points.map(p => p.x)) - 3 / u, maxX = Math.max(...points.map(p => p.x)) + 4 / u;
    const minZ = Math.min(...points.map(p => p.z)) - 3 / u, maxZ = Math.max(...points.map(p => p.z)) + 4 / u;
    // Use the open east side of the authored layout; never walk through the
    // feature or trench. An initial spawn approaches the outside perimeter.
    if (before.walker.x < minX || before.walker.x > maxX) await walkTo({x: before.walker.x, z: maxZ});
    else if (before.walker.z > minZ && before.walker.z < maxZ) {
      // Every station is used from its southern approach; exit east at that z.
    }
    const sideX=perimeterSide==='west'?minX:maxX,now = await snapshot(); await walkTo({x: sideX, z: now.walker.z});
    let z=p.z+offsets[p.id]/u;
    if(dryApproach)z=await page.evaluate(async({p,offset,u})=>{const {ctx}=await import('/app/js/shared-context.js?v=55');for(const sign of [1,-1]){const z=p.z+sign*offset/u,sample=ctx.SurfaceQuery.driveAt(p.x,z,{preferRoad:false}),water=ctx.SurfaceQuery.waterAt(p.x,z);if(sample?.kind==='terrain'&&Number.isFinite(sample.position?.y)&&!(water?.feature&&water.position.y>sample.position.y-.1))return z;}throw Error('Neither station approach has supported dry ground.');},{p,offset:offsets[p.id],u});
    await walkTo({x:sideX,z});await walkTo({x:p.x,z});
    await page.evaluate(async p => {const {ctx} = await import('/app/js/shared-context.js?v=55'), w = ctx.Walk.state.walker; w.yaw = Math.atan2(p.x - w.x, p.z - w.z); w.lookYawOffset = 0; w.pitch = -.25;}, p);
    if(open){assert.equal(p.id,before.fieldwork.target.id);await page.waitForFunction(() => document.querySelector('[data-research-station]')?.disabled === false, {}, {timeout: 2500});
    await page.locator('[data-research-station]').click(); await page.locator('.research-station[open]').waitFor();}
    return p;
  }
  async function submit(name, action) {
    const revision = (await snapshot()).fieldwork.revision;
    if (action) await action(); else await page.getByRole('button', {name, exact: true}).click();
    await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');window.__qaFieldRevision=()=>{const current=ctx.saveActiveGameplay?.();return{careerId:current?.careerId,revision:current?.revision};};});
    await page.waitForFunction(({id, revision}) => {const current=window.__qaFieldRevision();return current.careerId===id&&current.revision>revision;}, {id: careerId, revision}, {timeout: 8000});
  }
  return {page, report, snapshot, careerState, record, waitForCareer, walkTo, approach, submit,
    async succeed() {assert.deepEqual(report.errors, []); report.ok = true; await fs.writeFile(`${output}/receipt.json`, JSON.stringify(report, null, 2) + '\n'); console.log('PASS fieldwork source check: ' + output);},
    async fail(error) {report.ok = false; report.failure = error.stack; report.host = guard.snapshot(); try {report.last = await snapshot(); const failedBackup=await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');return ctx.discoveryProfileStore?.exportData?.();});if(failedBackup){report.failureBackup=`${output}/qa-fieldwork-failed-backup.json`;await fs.writeFile(report.failureBackup,JSON.stringify(failedBackup)+'\n',{mode:0o600});} await page.screenshot({path: `${output}/failed.png`});} catch {} await fs.writeFile(`${output}/failed.json`, JSON.stringify(report, null, 2) + '\n');},
    async close() {guard.dispose(); if(server)await closeOwnedBrowser(server); if(browser)await withinDeadline(()=>browser.close(),3000,'Owned fieldwork connection close').catch(()=>{});}
  };
}
