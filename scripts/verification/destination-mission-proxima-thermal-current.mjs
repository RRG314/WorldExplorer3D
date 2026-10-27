import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
import {SHIP_STATIONS} from '../../app/js/expedition/ship-layout.js';

const server=process.env.WE3D_VERIFY_BASE_URL?null:await startStaticServer({rootDir:process.cwd(),ports:[4396]});
const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || `http://127.0.0.1:${server.port}`).replace(/\/$/, '');
const outputDir = path.resolve(process.env.WE3D_THERMAL_OUTPUT||'output/verification/destination-mission-proxima-thermal');
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: false, channel: 'chrome' });
const failures = [];
const cases=[];

async function openSpace(page) {
  await page.goto(`${baseUrl}/app/?launch=space`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  if (await page.locator('#analyticsConsentDenyBtn').isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
  await page.evaluate(() => {
    document.getElementById('spaceLaunchToggle')?.click();
    document.getElementById('startBtn')?.click();
  });
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').modes?.space === true, null, { timeout: 120_000 });
}

async function arriveAtProxima(page) {
  await page.evaluate(async () => {
    const [{ DEFAULT_CREW }, { createExpeditionPlan, withExpeditionChanges }, { startExpedition }, { createExpeditionStore }] = await Promise.all([
      import('/app/js/expedition/catalog.js?v=2'),
      import('/app/js/expedition/model.js?v=11'),
      import('/app/js/expedition/simulation.js?v=8'),
      import('/app/js/expedition/store.js?v=12')
    ]);
    const planned = createExpeditionPlan({ destinationId: 'proxima-centauri', crew: DEFAULT_CREW, id: 'thermal-mission-verification', createdAtMs: 93_000 });
    createExpeditionStore().save(withExpeditionChanges(startExpedition(planned, 93_100), {
      state: 'arrived', progress: 1, voyagePhase: 'arrival', arrivalTransferState: 'pending'
    }));
  });
  await page.locator('#sfExpeditionBtn').click();
  await page.locator('#expeditionArrive').click();
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.universeNavigation?.currentFrameId === 'proxima-centauri'
      && state.universeNavigation?.transitionDestinationId == null
      && state.interstellarExpedition?.arrivalTransferState === 'complete';
  }, null, { timeout: 30_000 });
  if (await page.locator('[data-mission-close]').isVisible()) await page.locator('[data-mission-close]').click();
}

async function setThermalAngle(page, zone) {
  return page.evaluate(async (requestedZone) => {
    const { ctx } = await import((globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix||'')+'/app/js/shared-context.js?v=55');
    const target = ctx.getUniverseHudTarget();
    const star = ctx.universeRuntime.frameGroup.userData.destinationMeshes.get('proxima-centauri');
    const starPosition = new THREE.Vector3();
    star.getWorldPosition(starPosition);
    const towardStar = starPosition.sub(target.position).normalize();
    let direction = towardStar;
    if (requestedZone === 'nightside') direction = towardStar.clone().multiplyScalar(-1);
    if (requestedZone === 'terminator') {
      direction = towardStar.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
      if (direction.lengthSq() < 0.5) direction.set(1, 0, 0);
    }
    ctx.spaceFlight.rocket.position.copy(target.position).addScaledVector(direction, target.radius + 72);
    ctx.spaceFlight.rocket.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),target.position.clone().sub(ctx.spaceFlight.rocket.position).normalize());
    ctx.spaceFlight.velocity.set(0, 0, 0);
    ctx.spaceFlight.speed = 0;
    ctx.spaceFlight._snapCameraToCraft = true;
    ctx.spaceFlight.camera.position.copy(ctx.spaceFlight.rocket.position).add(new THREE.Vector3(0, 24, 72));
    ctx.spaceFlight.camera.lookAt(target.position);
    return target.destinationId;
  }, zone);
}

async function runThermalPass(page, zone, capture = false) {
  assert.equal(await setThermalAngle(page, zone), 'proxima-centauri-d');
  await page.evaluate(async () => {
    const { ctx } = await import((globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix||'')+'/app/js/shared-context.js?v=55');
    ctx.openDestinationMission('proxima-centauri-d');
  });
  const action = page.locator('[data-mission-field]');
  await action.waitFor({ state: 'visible' });
  assert.equal(await action.isEnabled(), true);
  assert.match(await action.textContent(), new RegExp(zone, 'i'));
  await action.click();
  await page.locator('[data-mission-close]').click();
  await page.waitForTimeout(240);
  if (capture) {
    const visual=await page.evaluate(()=>{
      const target=scanCtx.getUniverseHudTarget(),effect=target.mesh.getObjectByName('destination-mission-scan:proxima-centauri-d'),shell=effect?.children[0];
      return {count:effect?.children.length,scale:effect?.scale.toArray(),ratio:shell?.geometry.parameters.radius/target.radius,
        depthTest:shell?.material.depthTest,wireframe:shell?.material.wireframe,progress:shell?.material.uniforms?.scanProgress.value,
        badPrograms:scanCtx.spaceFlight.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length};
    });
    assert.equal(visual.count,1);assert.deepEqual(visual.scale,[1,1,1]);assert.ok(visual.ratio<1.01);assert.equal(visual.depthTest,true);assert.equal(visual.wireframe,false);assert.equal(visual.badPrograms,0);assert.ok(visual.progress>0&&visual.progress<1);
    cases.push('actual-webgl-surface-sweep-stays-on-planet-with-valid-shader');
    await page.screenshot({ path: path.join(outputDir, `desktop-proxima-d-${zone}-scan.png`), fullPage: true });
  }
  await page.waitForFunction((evidenceId) => JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission?.evidence?.includes(evidenceId), zone, { timeout: 5_000 });
}

async function run() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await configureStagingAppCheck(page,baseUrl);
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.stack || error}`));
  page.on('console',message=>{if(message.type()==='error'&&/WebGLProgram|shader error/i.test(message.text()))failures.push(message.text());});
  page.on('requestfailed', (request) => { if (request.url().startsWith(baseUrl)) failures.push(`request failed: ${request.url()}`); });
  page.on('response', (response) => { if (response.url().startsWith(baseUrl) && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  try {
    await openSpace(page);
    await arriveAtProxima(page);
    await page.locator('#universeToggle').click();
    await page.locator('#universeDestinationSelect').selectOption('proxima-centauri-d');
    await page.locator('#universeMissionBtn').click();
    assert.equal(await page.locator('#destinationMissionTitle').textContent(), 'The Inner Furnace');
    await page.locator('[data-mission-begin]').click();
    const courseAction = page.locator('[data-mission-course]');
    if (await courseAction.isVisible()) await courseAction.click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').universeNavigation?.courseDestinationId === 'proxima-centauri-d');
    assert.equal(await page.evaluate(async () => {
      const { ctx } = await import((globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix||'')+'/app/js/shared-context.js?v=55');
      const target = ctx.getUniverseHudTarget?.();
      if (!target?.position || !ctx.spaceFlight?.rocket) return false;
      ctx.spaceFlight.rocket.position.set(target.position.x, target.position.y, target.position.z + Math.max(90, Number(target.radius || 6) * 12));
      ctx.spaceFlight.velocity?.set?.(0, 0, 0);
      ctx.spaceFlight.gravityVelocity?.set?.(0, 0, 0);
      ctx.spaceFlight.speed = 0;
      return true;
    }), true);
    await page.waitForFunction(() => {
      const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return state.universeNavigation?.courseDestinationId === 'proxima-centauri-d' && state.destinationMission?.phase === 'fieldwork';
    }, null, { timeout: 30_000 });
    await setThermalAngle(page,'dayside');
    await page.evaluate(async()=>{window.scanCtx=(await import((globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix||'')+'/app/js/shared-context.js?v=55')).ctx;scanCtx.openDestinationMission('proxima-centauri-d');});
    await page.locator('[data-mission-field]').click();
    await page.evaluate(()=>scanCtx.setPauseReason('scan-verification',true));
    await page.waitForTimeout(1650);
    assert.deepEqual(await page.evaluate(()=>scanCtx.getDestinationMissionSnapshot().evidence),[]);
    assert.equal(await page.evaluate(()=>scanCtx.getDestinationMissionSnapshot().phase),'fieldwork');
    assert.equal(await page.evaluate(()=>!!scanCtx.spaceFlight.scene.getObjectByName('destination-mission-scan:proxima-centauri-d')),false);
    await page.evaluate(()=>scanCtx.setPauseReason('scan-verification',false));
    cases.push('paused-real-scan-does-not-award');
    await page.evaluate(()=>scanCtx.openDestinationMission('proxima-centauri-d'));
    await page.locator('[data-mission-field]').click();
    await page.evaluate(()=>scanCtx.openDestinationMission('proxima-centauri-b'));
    await page.locator('[data-mission-begin]').click();
    await page.waitForTimeout(1650);
    assert.equal(await page.evaluate(()=>scanCtx.getDestinationMissionSnapshot().destinationId),'proxima-centauri-b');
    assert.equal(await page.evaluate(()=>scanCtx.performDestinationMissionFieldwork()),false);
    await page.evaluate(()=>scanCtx.openDestinationMission('proxima-centauri-d'));
    await page.locator('[data-mission-resume]').click();
    assert.equal(await page.evaluate(()=>scanCtx.getDestinationMissionSnapshot().phase),'fieldwork');
    assert.deepEqual(await page.evaluate(()=>scanCtx.getDestinationMissionSnapshot().evidence),[]);
    cases.push('switching-mission-cancels-scan-explicit-resume-retains-evidence');
    await page.locator('[data-mission-close]').click();
    await page.evaluate(()=>{window.scanPriorText=render_game_to_text;window.scanPriorTime=advanceTime;});
    try{await runPrescribedGameActions(page,outputDir,[{buttons:['left'],frames:8},{buttons:[],frames:10}],'#spaceFlightCanvas');}
    finally{await page.evaluate(()=>{window.render_game_to_text=scanPriorText;window.advanceTime=scanPriorTime;delete window.scanPriorText;delete window.scanPriorTime;});}
    await runThermalPass(page, 'dayside');
    await runThermalPass(page, 'terminator', true);
    await runThermalPass(page, 'nightside');
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission?.phase === 'analysis');
    cases.push('three-physical-thermal-angles-complete-in-order');
    await page.locator('#sfExpeditionBtn').click();
    await page.locator('#expeditionEnterShip').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true);
    await page.evaluate(async station => {
      const { ctx } = await import((globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix||'')+'/app/js/shared-context.js?v=55');
      ctx.switchSolisReachDeck(station.deckId);
      Object.assign(ctx.Walk.state.walker, { x: station.x, z: station.z,y:1.74, angle: Math.PI / 2, yaw: Math.PI / 2, lookYawOffset: 0, pitch: 0, vy: 0, onGround: true });
    },SHIP_STATIONS.find(station=>station.id==='analysis-review'));
    await page.waitForTimeout(220);
    await page.keyboard.press('KeyE');
    await page.locator('[data-complete-destination-analysis="cautious-baseline"]').waitFor({ state: 'visible' });
    await page.screenshot({path:path.join(outputDir,'analysis-lab-report.png')});
    await page.locator('[data-complete-destination-analysis="cautious-baseline"]').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission?.phase === 'complete');
    cases.push('physical-analysis-lab-commits-report');
    const final = await page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission);
    return { phase: final.phase, evidence: final.evidence, destinationId: final.destinationId };
  } catch(error){
    await page.screenshot({path:path.join(outputDir,'failure.png')}).catch(()=>{});
    const failureState=await page.evaluate(()=>({mission:window.scanCtx?.getDestinationMissionSnapshot?.(),ship:window.scanCtx?.getShipInteriorSnapshot?.(),panel:document.getElementById('shipStationPanel')?.textContent})).catch(()=>({}));
    await fs.writeFile(path.join(outputDir,'failure-state.json'),JSON.stringify(failureState,null,2));
    throw error;
  } finally {
    await context.close();
  }
}

let result = null;
try {
  result = await run();
} catch (error) {
  failures.push(error.stack || String(error));
} finally {
  await browser.close();
  await server?.close();
}
const report = { ok: failures.length === 0, scope:'Actual source game; seeded arrived expedition and controlled rocket positions; real scan controls/timers and physical lab action',baseUrl, result, cases,failures };
await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(failures, []);
