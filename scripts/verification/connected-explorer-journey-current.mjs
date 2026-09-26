import { softwareCompositorArgs } from './software-compositor.mjs';
import { installBrowserGraphicsProbe } from './browser-graphics-probe.mjs';
import { selectLowRenderQuality } from './render-quality-ui.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import { advanceGameplay, stepGameplayKeys } from './gameplay-simulation.mjs';
import { configureStagingAppCheck } from './staging-app-check.mjs';
import { collectBrowserGraphicsErrors } from './browser-graphics-errors.mjs';

const servedRoot = path.resolve(process.cwd(), String(process.env.WE3D_VERIFY_ROOT || '.'));
const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: servedRoot, ports: [4437, 4438, 4439] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const evidenceDir = 'output/verification/connected-explorer-journey';
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: softwareCompositorArgs() });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const browserErrors = [];
const failedLocalResources = [];
collectBrowserGraphicsErrors(page, browserErrors);
await installBrowserGraphicsProbe(page, 'output/verification/connected-explorer-journey/graphics-failure.json');

page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    failedLocalResources.push({ status: response.status(), url: response.url() });
  }
});

await context.addInitScript(() => {
  localStorage.removeItem('worldExplorer3D.tutorialState.v5');
  localStorage.removeItem('worldExplorer3D.tutorialState.v4');
  localStorage.removeItem('worldExplorer3D.keyboardBindings.v1');
});

function tutorialState() {
  return page.evaluate(() => JSON.parse(localStorage.getItem('worldExplorer3D.tutorialState.v5') || 'null'));
}

async function hold(code, durationMs, modifiers = []) {
  for (const modifier of modifiers) await page.keyboard.down(modifier);
  await page.keyboard.down(code);
  await advanceGameplay(page, durationMs);
  await page.keyboard.up(code);
  for (const modifier of [...modifiers].reverse()) await page.keyboard.up(modifier);
}

async function moveWithRemappedForwardKey() {
  const before = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor || null);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await hold('KeyZ', 900, ['Shift']);
    const state = await tutorialState();
    if (state?.stage === 'interact') {
      const after = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor || null);
      return { before, after };
    }
    await hold(attempt % 2 === 0 ? 'KeyA' : 'KeyD', 160);
  }
  const after = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor || null);
  throw new Error(`Remapped forward key did not advance the live tutorial: ${JSON.stringify({before,after,tutorial:await tutorialState()})}`);
}

async function approachNearbyAction() {
  const deadline = Date.now() + (process.env.CI ? 180_000 : 90_000);
  let last, route = [], targetId = null;
  const trace = [];
  while (Date.now() < deadline) {
    last = await page.evaluate(async ({ route, targetId }) => {
      const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      const actor = state.activeActor;
      const targets = [
        ...(state.urbanSandbox?.vehicles || []).filter(v => !v.occupied && !v.ambientTraffic && v.driverDoor)
          .map(v => ({ id: v.id, kind: 'parked-vehicle', ...v.driverDoor })),
        ...(state.urbanSandbox?.interactiveNpcs || []).filter(npc => !npc.knockedDown)
          .map(npc => ({ id: npc.id, kind: 'person', x: npc.x, z: npc.z }))
      ];
      const distance = target => Math.hypot(target.x - actor.position.x, target.z - actor.position.z);
      let target = targets.find(candidate => candidate.id === targetId) || targets.sort((a,b) => distance(a)-distance(b))[0];
      const prompt = document.getElementById('urbanVehiclePrompt');
      const visible = !!prompt?.classList.contains('show') && getComputedStyle(prompt).display !== 'none';
      if (visible && state.urbanSandbox?.interaction) return { actor, target, route, visible, action: state.urbanSandbox.interaction };
      while (route.length && distance(route[0]) < .6) route.shift();
      if (!route.length && actor && target) {
        // Read-only navigation over real building footprints. Keep this route
        // until its waypoints are reached; replanning a differently aligned
        // grid every step can reverse direction on opposite sides of a wall.
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        const origin = actor.position;
        const spacing = 2;
        const nearby = targetId ? [target] : targets.filter(candidate => distance(candidate) < 90);
        const point = node => ({ x: origin.x + node.x * spacing, z: origin.z + node.z * spacing });
        // Conservative 2D footprints avoid using the actor's current elevation
        // to classify walls dozens of meters away on sloping terrain.
        const clear = (x,z) => !ctx.checkBuildingCollision(x,z,.4)?.collision;
        const heuristic = node => Math.min(...nearby.map(candidate => Math.hypot(candidate.x-point(node).x,candidate.z-point(node).z))) / spacing;
        const queue = [{ x:0, z:0, cost:0, parent:null }];
        const seen = new Set(['0,0']);
        let reached;
        for (let visited=0; queue.length && visited<6400; visited++) {
          queue.sort((a,b) => a.cost+heuristic(a)-b.cost-heuristic(b));
          const node = queue.shift(), at = point(node);
          const goal = nearby.find(candidate => Math.hypot(candidate.x-at.x,candidate.z-at.z)<2);
          if (goal) { reached=node; target=goal; break; }
          for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const next = { x:node.x+dx, z:node.z+dz, cost:node.cost+1, parent:node };
            const key = `${next.x},${next.z}`;
            if (Math.abs(next.x)>45 || Math.abs(next.z)>45 || seen.has(key)) continue;
            seen.add(key);
            const to=point(next);
            if (clear(to.x,to.z) && clear((at.x+to.x)/2,(at.z+to.z)/2)) queue.push(next);
          }
        }
        if (reached) {
          const nodes=[];
          for (let node=reached; node.parent; node=node.parent) nodes.unshift(node);
          // Keep corners, merge straight sections, and approach the final
          // interaction without assigning actor, ownership, or tutorial state.
          route=nodes.filter((node,index) => !nodes[index+1] ||
            node.x-node.parent.x !== nodes[index+1].x-node.x ||
            node.z-node.parent.z !== nodes[index+1].z-node.z).map(point);
          if (!route.length) route=[{x:target.x,z:target.z}];
        }
      }
      return { actor, target, route, visible, action:state.urbanSandbox?.interaction };
    }, { route, targetId });
    if (last.visible && last.action) return {...last, navigationTrace:trace};
    route=last.route; targetId=last.target?.id;
    assert.ok(route.length && last.actor?.mode==='walk', `No collision-free walking approach: ${JSON.stringify(last)}`);
    const waypoint=route[0], position=last.actor.position;
    trace.push({position,waypoint,targetId,remainingWaypoints:route.length});
    if (trace.length>24) trace.shift();
    const dx=waypoint.x-position.x, dz=waypoint.z-position.z;
    const angle=Math.atan2(dx,dz)-last.actor.orientation.yaw;
    const delta=Math.atan2(Math.sin(angle),Math.cos(angle));
    if (Math.abs(delta)>.08) {
      await stepGameplayKeys(page,[delta>0?'ArrowLeft':'ArrowRight'],Math.min(500,Math.max(20,Math.abs(delta)/2.6*1000)));
    } else {
      await stepGameplayKeys(page,['ArrowUp'],Math.min(2000,Math.max(75,(Math.hypot(dx,dz)-.2)/2.8*1000)));
    }
  }
  throw new Error(`Could not reach a nearby action using normal input: ${JSON.stringify({last,trace})}`);
}

try {
  await configureStagingAppCheck(page, baseUrl);
  await mkdir(evidenceDir, { recursive: true });
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  if (process.env.CI) await selectLowRenderQuality(page);

  // Configure an actual action before entering the world. This verifies the
  // player-facing settings, saved authority, and runtime consumer together.
  await page.locator('[data-globe-destination="controls"]').first().click();
  await page.waitForSelector('#keyboardBindingSettings');
  await page.locator('#keyboardBindingSettings summary').click();
  await page.locator('[data-binding-action="move_forward"]').click();
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('worldExplorer3D.keyboardBindings.v1') || '{}').move_forward === 'KeyZ');
  assert.match(await page.locator('#keyboardBindingSettings').textContent(), /Move \/ accelerate\s*Z\s*Change/is);
  // Use the shipped accessibility preference so an 8-second optional hint
  // cannot expire while a software-rendered CI frame is finishing.
  await page.locator('#accessibilityNoticeDuration').selectOption('persistent');
  assert.equal(await page.evaluate(() => globalThis.getWorldExplorerAccessibilityNoticeMs(8000) === Infinity), true);
  await page.screenshot({ path: `${evidenceDir}/01-configurable-controls-desktop.png` });
  await page.locator('[data-globe-destination="location"]').first().click();

  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(() => {
    if (document.getElementById('loading')?.classList.contains('show')) return false;
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.gameStarted === true && diagnostics.worldLoading === false;
  }, null, { timeout: 360_000, polling: 500 });
  await page.waitForFunction(() => !document.getElementById('loading')?.classList.contains('show'), null, { timeout: 120_000 });

  await page.waitForSelector('#tutorialHintCard:not([hidden])', { timeout: 20_000 });
  assert.equal(await page.locator('#tutorialHintCard').getAttribute('data-tutorial-stage'), 'move');
  const firstStepText = await page.locator('#tutorialHintCard').textContent();
  assert.match(firstStepText, /First Journey.*ZASD to move.*Mouse to look/is);
  assert.equal(await page.locator('#tutorialHintCard').evaluate((element) => element.classList.contains('compact')), true);
  await page.locator('#tutorialHintCard .tutorial-details-btn').click();
  assert.match(await page.locator('#tutorialHintCard').textContent(), /(?:right|either) mouse button.*look/i);
  await page.screenshot({ path: `${evidenceDir}/02-first-journey-details-desktop.png` });
  await page.locator('#tutorialHintCard .tutorial-details-btn').click();

  // Return focus from Details to the world, as a player does before moving.
  // Gameplay deliberately ignores key presses aimed at a focused UI button.
  await page.locator('canvas').first().click({position:{x:400,y:350}});
  const moved = await moveWithRemappedForwardKey();
  assert.equal((await tutorialState())?.stage, 'interact');
  const beforePosition = moved.before?.position || moved.before;
  const afterPosition = moved.after?.position || moved.after;
  assert.notDeepEqual(afterPosition, beforePosition, 'The remapped key must move the active actor in the live world.');
  // The interaction stage yields its optional lesson to the actual nearby
  // action. Assert that visible action below, not unpresented hidden card copy.
  const approachedAction = await approachNearbyAction();
  await page.waitForSelector('#urbanVehiclePrompt.show', { timeout: 20_000 });
  const promptPriority = await page.evaluate(() => {
    const prompt = document.getElementById('urbanVehiclePrompt');
    const tutorial = document.getElementById('tutorialHintCard');
    const journey = document.getElementById('currentJourneyCard');
    const rect = prompt?.getBoundingClientRect();
    return {
      promptRightAligned: !!rect && rect.left > innerWidth / 2,
      tutorialSuppressed: !!tutorial && getComputedStyle(tutorial).display === 'none',
      currentJourneySuppressed: !!journey && (journey.hidden || getComputedStyle(journey).display === 'none')
    };
  });
  assert.deepEqual(promptPriority, { promptRightAligned: true, tutorialSuppressed: true, currentJourneySuppressed: true });
  await page.screenshot({ path: `${evidenceDir}/03-context-action-priority-desktop.png` });

  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('worldExplorer3D.tutorialState.v5') || '{}').stage === 'explore', null, { timeout: 20_000 });
  await page.evaluate(() => document.getElementById('fWorldDiscovery')?.click());
  await page.waitForSelector('#discoveryPanel.show', { timeout: 20_000 });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('worldExplorer3D.tutorialState.v5') || '{}').completed === true, null, { timeout: 20_000 });
  await page.locator('#discoveryCloseBtn').click();

  const statusSemantics = await page.evaluate(() => ({
    tutorialRole: document.getElementById('tutorialHintCard')?.getAttribute('role'),
    tutorialLive: document.getElementById('tutorialHintCard')?.getAttribute('aria-live'),
    journeyRole: document.getElementById('currentJourneyCard')?.getAttribute('role'),
    journeyLive: document.getElementById('currentJourneyCard')?.getAttribute('aria-live')
  }));
  assert.deepEqual(statusSemantics, {
    tutorialRole: 'status', tutorialLive: 'polite', journeyRole: 'status', journeyLive: 'polite'
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const touchLayout = await page.evaluate(() => {
    const tutorial = document.getElementById('tutorialHintCard');
    const touch = document.getElementById('mobileControls') || document.getElementById('touchControls');
    const card = tutorial && !tutorial.hidden ? tutorial.getBoundingClientRect() : null;
    const controls = touch && getComputedStyle(touch).display !== 'none' ? touch.getBoundingClientRect() : null;
    const overlap = !!card && !!controls && card.left < controls.right && card.right > controls.left && card.top < controls.bottom && card.bottom > controls.top;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      tutorialWithinViewport: !card || (card.left >= 0 && card.right <= innerWidth && card.top >= 0 && card.bottom <= innerHeight),
      tutorialClearsTouchControls: !overlap,
      touchSnapshot: globalThis.getWorldExplorerRuntimeDiagnostics?.().input?.touch || null
    };
  });
  assert.equal(touchLayout.tutorialWithinViewport, true);
  assert.equal(touchLayout.tutorialClearsTouchControls, true);
  await page.screenshot({ path: `${evidenceDir}/04-mobile-world-layout.png` });

  const finalState = await tutorialState();
  const report = {
    inputTiming: 'runtime-fixed-step; not rendering performance',
    renderQuality: process.env.CI ? 'low (normal Settings UI); functional tutorial only' : 'default',
    ok: browserErrors.length === 0 && failedLocalResources.length === 0,
    journey: 'optional-first-journey-v5',
    checks: {
      controlsUiVisibleAndSaved: true,
      remappedKeyMovedLiveActor: true,
      tutorialUsesCurrentBindingLabel: /ZASD/.test(firstStepText || ''),
      tutorialStartsCompact: true,
      tutorialHasThreeCoreSteps: finalState?.completed === true && finalState?.stage === 'complete',
      nearbyInteractionExplainedOnDemand: true,
      immediateActionHasVisualPriority: Object.values(promptPriority).every(Boolean),
      notificationsUsePoliteStatusSemantics: true,
      mobileTutorialWithinViewport: touchLayout.tutorialWithinViewport,
      mobileTutorialClearsTouchControls: touchLayout.tutorialClearsTouchControls,
      noBrowserErrors: browserErrors.length === 0,
      noFailedLocalResources: failedLocalResources.length === 0
    },
    statusSemantics,
    approachedAction,
    touchLayout,
    browserErrors,
    failedLocalResources
  };
  report.ok = report.ok && Object.values(report.checks).every(Boolean);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true);
} catch (error) {
  const state = await page.evaluate(async () => {
    let tutorialRuntime;
    try {
      const {ctx} = await import('/app/js/shared-context.js?v=55');
      tutorialRuntime = {snapshot:ctx.getTutorialSnapshot?.(), updateType:typeof ctx.tutorialUpdate, gameStarted:ctx.gameStarted, walkMode:ctx.Walk?.state?.mode, walker:ctx.Walk?.state?.walker ? {x:ctx.Walk.state.walker.x,y:ctx.Walk.state.walker.y,z:ctx.Walk.state.walker.z} : null};
    } catch (error) {tutorialRuntime={error:String(error?.stack||error)};}
    return ({
    tutorialRuntime,
    tutorial: JSON.parse(localStorage.getItem('worldExplorer3D.tutorialState.v5') || 'null'),
    elements: ['tutorialHintCard','urbanVehiclePrompt','interiorPrompt','boatPrompt','discoveryContextPrompt','controlsTab','ctrlContent','worldSelectionNotice','urbanEquipment'].map(id => {
      const element=document.getElementById(id);
      return {id, hidden:element?.hidden, classes:element?.className, display:element?getComputedStyle(element).display:null, text:element?.textContent?.slice(0,1000)};
    }),
    openMenus:[...document.querySelectorAll('.floatMenu.open')].map(e=>e.id),
    runtime:globalThis.getWorldExplorerRuntimeDiagnostics?.()
  }); }).catch(error=>({captureError:String(error?.stack||error)}));
  await writeFile(`${evidenceDir}/failure.json`,JSON.stringify({ok:false,error:String(error?.stack||error),state,browserErrors,failedLocalResources},null,2)+'\n');
  await page.screenshot({path:`${evidenceDir}/failure.png`}).catch(()=>{});
  throw error;
} finally {
  await context.close();
  await browser.close();
  await server?.close();
}
