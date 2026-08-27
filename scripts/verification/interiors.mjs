import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const requestedRoot = String(process.env.WE3D_VERIFY_ROOT || '').trim();
const servedRoot = requestedRoot ? path.resolve(root, requestedRoot) : root;
const server = await startStaticServer({ rootDir: servedRoot, ports: [4389, 4390, 4391] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const reportPath = path.join(root, 'output', 'verification', 'interiors', 'report.json');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
let context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
let page = await context.newPage();
const browserErrors = [];
const browserConsole = [];
const localFailures = [];
function bindPageEvidence(targetPage) {
  targetPage.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  targetPage.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) browserConsole.push(`${message.type()}: ${message.text()}`);
  });
  targetPage.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) localFailures.push({ url: response.url(), status: response.status() });
  });
}
bindPageEvidence(page);

const params = new URLSearchParams({
  loc: 'custom', lat: '39.28305', lon: '-76.61270', lname: 'Baltimore Inner Harbor',
  launch: 'earth', gm: 'free', mode: 'walk'
});

async function waitForWorld() {
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  if (await page.locator('#globeSelectorStartBtn').isVisible().catch(() => false)) {
    await page.locator('#globeSelectorStartBtn').click();
  }
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return diagnostics.gameStarted === true && diagnostics.worldLoading === false && diagnostics.modes?.walking === true &&
      Number(diagnostics.worldCounts?.buildings || 0) > 0;
  }, null, { timeout: 300_000 });
  await page.waitForTimeout(2_500);
}

async function chooseTarget() {
  return page.evaluate(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    const actor = diagnostics.activeActor?.position || {};
    const supports = diagnostics.interior?.candidates || [];
    const eligible = supports.filter((support) =>
      support?.synthetic !== true && Number.isFinite(support?.approachTarget?.x) && Number.isFinite(support?.approachTarget?.z)
    ).map((support) => {
        const bounds = support.bounds || {};
        const width = Math.max(0, Number(bounds.maxX) - Number(bounds.minX));
        const depth = Math.max(0, Number(bounds.maxZ) - Number(bounds.minZ));
        return {
          support,
          approachTarget: support.approachTarget,
          approachDistance: Math.hypot(
            Number(support.approachTarget.x) - Number(actor.x),
            Number(support.approachTarget.z) - Number(actor.z)
          ),
          mappedEntrance: support.mappedEntrance === true,
          width,
          depth
        };
      })
      .map((candidate) => {
        const sourceFloors = Math.max(
          1,
          Number(candidate.support.sourceLevels) ||
            Math.round(Number(candidate.support.sourceHeight || 0) / 3.4) || 1
        );
        return {
          ...candidate,
          sourceFloors,
          connectorEligible: candidate.support.connectorEligible === true && sourceFloors >= 2 &&
            Math.min(candidate.width, candidate.depth) >= 8.5 &&
            candidate.width * candidate.depth >= 92
        };
      })
      .filter((candidate) => Number.isFinite(candidate.approachDistance));
    eligible.sort((a, b) => {
      return Number(b.connectorEligible) - Number(a.connectorEligible) ||
        a.approachDistance - b.approachDistance ||
        (b.width * b.depth) - (a.width * a.depth) ||
        b.sourceFloors - a.sourceFloors;
    });
    const selected = eligible[0];
    const support = selected?.support;
    return support ? {
      key: support.key,
      label: support.label,
      entryAnchor: support.entryAnchor,
      approachTarget: selected.approachTarget,
      approachDistance: selected.approachDistance,
      mappedEntrance: selected.mappedEntrance,
      distance: support.distance,
      synthetic: !!support.synthetic,
      sourceBuildingId: support.sourceBuildingId || null,
      sourceLevels: support.sourceLevels,
      sourceHeight: support.sourceHeight,
      connectorEligible: selected.connectorEligible,
      width: selected.width,
      depth: selected.depth,
      candidateCount: eligible.length
    } : null;
  });
}

function wrapYaw(value) {
  let result = Number(value) || 0;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

async function walkToInteriorPrompt(target, maxSteps = 1_400) {
  assert.equal(
    Number.isFinite(target?.approachTarget?.x) && Number.isFinite(target?.approachTarget?.z),
    true,
    'Selected building did not expose a usable exterior approach target.'
  );
  const path = [];
  let stagnant = 0;
  let previousDistance = Infinity;
  for (let step = 0; step < maxSteps; step += 1) {
    const state = await page.evaluate(({ x, z }) => {
      const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      const actor = diagnostics.activeActor || {};
      const position = actor.position || {};
      const orientation = actor.orientation || {};
      const prompt = document.querySelector('#interiorPrompt');
      return {
        x: Number(position.x),
        z: Number(position.z),
        yaw: Number(orientation.yaw),
        promptVisible: prompt?.classList.contains('show') === true,
        promptText: prompt?.textContent || '',
        promptTargetKey: diagnostics.interior?.promptTargetKey || '',
        distance: Math.hypot(x - Number(position.x), z - Number(position.z))
      };
    }, target.approachTarget);
    if (step % 20 === 0) path.push(state);
    if (state.promptVisible && /enter/i.test(state.promptText) && state.promptTargetKey === target.key) {
      return { reached: true, steps: step, path, final: state };
    }
    assert.equal(Number.isFinite(state.x) && Number.isFinite(state.z) && Number.isFinite(state.yaw), true, 'Walking actor state became unavailable.');

    const desiredYaw = Math.atan2(target.approachTarget.x - state.x, target.approachTarget.z - state.z);
    const yawDelta = wrapYaw(desiredYaw - state.yaw);
    if (Math.abs(yawDelta) > 0.14) {
      const turnKey = yawDelta > 0 ? 'ArrowLeft' : 'ArrowRight';
      await page.keyboard.down(turnKey);
      await page.evaluate(() => globalThis.advanceTime?.(70));
      await page.keyboard.up(turnKey);
    } else {
      const running = state.distance > 24;
      if (running) await page.keyboard.down('ShiftLeft');
      await page.keyboard.down('ArrowUp');
      await page.evaluate(() => globalThis.advanceTime?.(140));
      await page.keyboard.up('ArrowUp');
      if (running) await page.keyboard.up('ShiftLeft');
    }
    if (state.distance >= previousDistance - 0.015) stagnant += 1;
    else stagnant = 0;
    previousDistance = state.distance;
    if (stagnant > 90) break;
  }
  const final = await page.evaluate(() => {
    const prompt = document.querySelector('#interiorPrompt');
    return { promptVisible: prompt?.classList.contains('show') === true, promptText: prompt?.textContent || '' };
  });
  return { reached: false, steps: maxSteps, path, final };
}

async function walkToPoint(target, options = {}) {
  const stopDistance = Number.isFinite(options.stopDistance) ? options.stopDistance : 0.55;
  const maxSteps = Number.isFinite(options.maxSteps) ? options.maxSteps : 900;
  const allowBlocked = options.allowBlocked === true;
  const path = [];
  let stagnant = 0;
  let previousDistance = Infinity;
  let start = null;
  for (let step = 0; step < maxSteps; step += 1) {
    const state = await page.evaluate(({ x, z }) => {
      const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      const actor = diagnostics.activeActor || {};
      const position = actor.position || {};
      return {
        x: Number(position.x),
        z: Number(position.z),
        yaw: Number(actor.orientation?.yaw),
        distance: Math.hypot(Number(x) - Number(position.x), Number(z) - Number(position.z))
      };
    }, target);
    if (!start) start = state;
    if (step % 20 === 0) path.push(state);
    if (state.distance <= stopDistance) {
      return { reached: true, blocked: false, steps: step, start, final: state, path };
    }
    assert.equal(Number.isFinite(state.x) && Number.isFinite(state.z) && Number.isFinite(state.yaw), true,
      'Walking actor state became unavailable during interior traversal.');
    const desiredYaw = Math.atan2(Number(target.x) - state.x, Number(target.z) - state.z);
    const yawDelta = wrapYaw(desiredYaw - state.yaw);
    if (Math.abs(yawDelta) > 0.12) {
      const turnKey = yawDelta > 0 ? 'ArrowLeft' : 'ArrowRight';
      await page.keyboard.down(turnKey);
      await page.evaluate(() => globalThis.advanceTime?.(55));
      await page.keyboard.up(turnKey);
    } else {
      await page.keyboard.down('ArrowUp');
      await page.evaluate(() => globalThis.advanceTime?.(90));
      await page.keyboard.up('ArrowUp');
    }
    if (state.distance >= previousDistance - 0.008) stagnant += 1;
    else stagnant = 0;
    previousDistance = state.distance;
    if (stagnant > 70) {
      if (allowBlocked) return { reached: false, blocked: true, steps: step, start, final: state, path };
      break;
    }
  }
  const final = await page.evaluate(({ x, z }) => {
    const actor = globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor || {};
    return {
      x: Number(actor.position?.x),
      z: Number(actor.position?.z),
      yaw: Number(actor.orientation?.yaw),
      distance: Math.hypot(Number(x) - Number(actor.position?.x), Number(z) - Number(actor.position?.z))
    };
  }, target);
  return { reached: false, blocked: allowBlocked, steps: maxSteps, start, final, path };
}

async function interiorOwnershipSnapshot(targetKey) {
  return page.evaluate((key) => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    const active = diagnostics.interior || { active: false };
    const actor = diagnostics.activeActor || {};
    return {
      active: active.active === true,
      key: active?.key || null,
      label: active?.label || null,
      mode: active?.mode || null,
      floorId: active?.floorId || null,
      activeLevel: Number(active?.activeLevel || 0),
      floorCount: Number(active?.floorCount || 0),
      loadedLevels: Array.isArray(active?.loadedLevels) ? [...active.loadedLevels] : [],
      connectorsAvailable: active?.connectorsAvailable === true,
      stairCount: Array.isArray(active?.stairs) ? active.stairs.length : 0,
      interactionKinds: Array.isArray(active?.interactions) ? active.interactions.map((entry) => entry.kind) : [],
      walkSurfaceCount: Number(active?.walkSurfaceCount || 0),
      colliderCount: Number(active?.colliderCount || 0),
      buildingCollisionDisabled: active?.buildingCollisionDisabled === true,
      promptVisible: document.querySelector('#interiorPrompt')?.classList.contains('show') === true,
      promptText: document.querySelector('#interiorPrompt')?.textContent || '',
      walker: actor.position ? {
        x: actor.position.x,
        y: actor.position.y,
        z: actor.position.z,
        view: null
      } : null,
      groupAttached: active?.groupAttached === true
    };
  }, targetKey);
}

async function pushAgainstInteriorWall() {
  const target = await page.evaluate(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    const actor = diagnostics.activeActor?.position || {};
    const walls = diagnostics.interior?.wallColliders || [];
    return walls.map((wall) => ({
      x: Number(wall.centerX),
      z: Number(wall.centerZ),
      distance: Math.hypot(Number(wall.centerX) - Number(actor.x), Number(wall.centerZ) - Number(actor.z))
    })).filter((wall) => Number.isFinite(wall.distance)).sort((a, b) => a.distance - b.distance)[0] || null;
  });
  assert.ok(target, 'Interior did not publish a wall collider for physical contact.');
  return walkToPoint(target, { stopDistance: 0.08, maxSteps: 360, allowBlocked: true });
}

async function climbPublishedStairs() {
  const prepared = await page.evaluate(() => {
    const interior = globalThis.getWorldExplorerRuntimeDiagnostics?.().interior || {};
    const stair = interior.stairs?.find((entry) => entry.floorLevel === 0);
    return stair ? {
      startLevel: interior.activeLevel,
      targetLevel: stair.targetLevel,
      start: stair.start,
      end: stair.end
    } : null;
  });
  assert.ok(prepared, 'Connector-eligible interior did not publish lobby stairs.');
  const dx = Number(prepared.end.x) - Number(prepared.start.x);
  const dz = Number(prepared.end.z) - Number(prepared.start.z);
  const length = Math.hypot(dx, dz) || 1;
  const stagingPoint = {
    x: Number(prepared.start.x) - dx / length * 1.65,
    z: Number(prepared.start.z) - dz / length * 1.65
  };
  const staging = await walkToPoint(stagingPoint, { stopDistance: 0.5, maxSteps: 900 });
  const approach = await walkToPoint(prepared.start, { stopDistance: 0.42, maxSteps: 320 });
  const traversal = await walkToPoint(prepared.end, { stopDistance: 0.42, maxSteps: 520 });
  return {
    ...prepared,
    stagingPoint,
    staging,
    approach,
    traversal,
    ...(await page.evaluate(() => {
      const interior = globalThis.getWorldExplorerRuntimeDiagnostics?.().interior || {};
      return { activeLevel: interior.activeLevel, floorId: interior.floorId, loadedLevels: interior.loadedLevels };
    }))
  };
}

async function backAwayFromWall() {
  const before = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.position || null);
  await page.keyboard.down('ArrowDown');
  await page.evaluate(() => globalThis.advanceTime?.(1_200));
  await page.keyboard.up('ArrowDown');
  const after = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.position || null);
  return {
    before,
    after,
    distance: Math.hypot(Number(after?.x) - Number(before?.x), Number(after?.z) - Number(before?.z))
  };
}

async function prepareInteriorInteraction(kind) {
  const interaction = await page.evaluate((interactionKind) => {
    const active = globalThis.getWorldExplorerRuntimeDiagnostics?.().interior || {};
    return active?.interactions?.find((entry) => entry.kind === interactionKind) || null;
  }, kind);
  if (!interaction) return null;
  const approach = await walkToPoint(interaction, {
    stopDistance: Math.max(0.5, Math.min(1.15, Number(interaction.radius || 1) * 0.45)),
    maxSteps: 900
  });
  return page.evaluate(({ interactionKind, approachEvidence }) => {
    const active = globalThis.getWorldExplorerRuntimeDiagnostics?.().interior || {};
    const resolved = active?.interactions?.find((entry) => entry.kind === interactionKind);
    const prompt = document.querySelector('#interiorPrompt');
    return {
      activeLevel: active.activeLevel,
      targetLevel: resolved?.targetLevel,
      promptVisible: prompt?.classList.contains('show') === true,
      promptText: prompt?.textContent || '',
      approach: approachEvidence
    };
  }, { interactionKind: kind, approachEvidence: approach });
}

async function tapVisibleInteriorPrompt() {
  const prompt = page.locator('#interiorPrompt.show');
  const bounds = await prompt.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  await prompt.tap({ timeout: 10_000 });
  return bounds;
}

try {
  await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
  await waitForWorld();
  await page.waitForFunction(() =>
    (globalThis.getWorldExplorerRuntimeDiagnostics?.().interior?.candidates || []).length > 0,
    null,
    { timeout: 30_000 }
  );
  const target = await chooseTarget();
  assert.ok(target, 'No published enterable building support was available within 650 meters.');

  const approach = await walkToInteriorPrompt(target);
  assert.equal(
    approach.reached,
    true,
    `Could not reach a real interior prompt using keyboard movement: ${JSON.stringify({ target, final: approach.final, path: approach.path })}`
  );
  const exteriorBefore = await interiorOwnershipSnapshot(target.sourceBuildingId);
  await page.keyboard.press('KeyE');
  try {
    await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().interior?.active === true, null, { timeout: 30_000 });
  } catch (error) {
    const failureState = await page.evaluate(() => {
      const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      return {
        diagnostics: {
          gameStarted: diagnostics.gameStarted,
          worldLoading: diagnostics.worldLoading,
          travelMode: diagnostics.modes?.walking ? 'walk' : 'other',
          runtimeErrors: diagnostics.runtimeErrors,
          interior: diagnostics.interior,
          actor: diagnostics.activeActor
        },
        promptText: document.querySelector('#interiorPrompt')?.textContent || '',
        promptVisible: document.querySelector('#interiorPrompt')?.classList.contains('show') === true
      };
    });
    throw new Error(`Interior did not activate after real KeyE input: ${JSON.stringify({ failureState, browserConsole, browserErrors })}`, { cause: error });
  }
  await page.waitForTimeout(1_000);
  const inside = await interiorOwnershipSnapshot(target.sourceBuildingId);
  await mkdir('output/release-evidence/current', { recursive: true });
  await page.screenshot({ path: 'output/release-evidence/current/interior-entered-desktop.png', fullPage: true });

  const stairTraversal = await climbPublishedStairs();
  assert.equal(
    stairTraversal.staging.reached && stairTraversal.approach.reached && stairTraversal.traversal.reached &&
      stairTraversal.activeLevel === stairTraversal.targetLevel,
    true,
    `Published stairs were not traversable through normal walking input: ${JSON.stringify(stairTraversal)}`
  );
  await page.screenshot({ path: 'output/release-evidence/current/interior-stairs-desktop.png', fullPage: true });

  const elevatorPrepared = await prepareInteriorInteraction('elevator');
  assert.equal(elevatorPrepared?.promptVisible, true, 'Elevator did not publish a contextual interaction prompt.');
  assert.match(elevatorPrepared.promptText, /elevator/i);
  await page.keyboard.press('KeyE');
  await page.waitForFunction((level) =>
    Number(globalThis.getWorldExplorerRuntimeDiagnostics?.().interior?.activeLevel) === Number(level),
    elevatorPrepared.targetLevel,
    { timeout: 10_000 }
  );
  const elevatorArrival = await interiorOwnershipSnapshot(target.sourceBuildingId);
  await page.screenshot({ path: 'output/release-evidence/current/interior-elevator-desktop.png', fullPage: true });

  for (let guard = 0; guard < 10; guard += 1) {
    const activeLevel = await page.evaluate(() =>
      Number(globalThis.getWorldExplorerRuntimeDiagnostics?.().interior?.activeLevel || 0)
    );
    if (activeLevel === 0) break;
    const elevator = await prepareInteriorInteraction('elevator');
    assert.ok(elevator, 'Upper floor did not retain its elevator interaction.');
    await page.keyboard.press('KeyE');
    await page.waitForFunction((previousLevel) =>
      Number(globalThis.getWorldExplorerRuntimeDiagnostics?.().interior?.activeLevel) !== Number(previousLevel),
      activeLevel,
      { timeout: 10_000 }
    );
  }

  const wallContact = await pushAgainstInteriorWall();
  const wallRecovery = await backAwayFromWall();

  const exitPrepared = await prepareInteriorInteraction('exit');
  assert.equal(exitPrepared?.promptVisible, true, 'Lobby did not publish its contextual exit prompt.');
  assert.match(exitPrepared.promptText, /exit/i);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().interior?.active === false, null, { timeout: 10_000 });
  const afterExit = await interiorOwnershipSnapshot(target.sourceBuildingId);
  await page.screenshot({ path: 'output/release-evidence/current/interior-exited-desktop.png', fullPage: true });

  const mobileParams = new URLSearchParams(params);
  mobileParams.set('rx', String(afterExit.walker.x));
  mobileParams.set('ry', String(afterExit.walker.y));
  mobileParams.set('rz', String(afterExit.walker.z));
  mobileParams.set('yaw', '0');
  await context.close();
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page = await context.newPage();
  bindPageEvidence(page);
  await page.goto(`${baseUrl}/app/?${mobileParams}`, { waitUntil: 'load', timeout: 120_000 });
  await waitForWorld();
  await page.waitForFunction(() => {
    const prompt = document.querySelector('#interiorPrompt');
    return prompt?.classList.contains('show') === true && /enter/i.test(prompt.textContent || '');
  }, null, { timeout: 10_000 });
  const mobileEnterBounds = await page.locator('#interiorPrompt.show').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
  });
  await tapVisibleInteriorPrompt();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().interior?.active === true, null, { timeout: 30_000 });
  const mobileEntered = await interiorOwnershipSnapshot(target.sourceBuildingId);
  const mobileExitPrepared = await prepareInteriorInteraction('exit');
  assert.equal(mobileExitPrepared?.promptVisible, true, 'Mobile lobby did not publish an exit action.');
  await tapVisibleInteriorPrompt();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().interior?.active === false, null, { timeout: 10_000 });
  const mobileExited = await interiorOwnershipSnapshot(target.sourceBuildingId);
  await page.waitForFunction(() => {
    const prompt = document.querySelector('#interiorPrompt');
    return prompt?.classList.contains('show') === true && /enter/i.test(prompt.textContent || '');
  }, null, { timeout: 10_000 });
  await tapVisibleInteriorPrompt();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().interior?.active === true, null, { timeout: 30_000 });
  const mobileReentered = await interiorOwnershipSnapshot(target.sourceBuildingId);
  await page.screenshot({ path: 'output/release-evidence/current/interior-mobile.png', fullPage: true });

  await page.reload({ waitUntil: 'load', timeout: 120_000 });
  await waitForWorld();
  const afterReload = await page.evaluate(() => ({
    diagnostics: globalThis.getWorldExplorerRuntimeDiagnostics?.().interior || { active: false },
    promptText: document.querySelector('#interiorPrompt')?.textContent || '',
    promptVisible: document.querySelector('#interiorPrompt')?.classList.contains('show') === true
  }));

  const distanceRestored = Math.hypot(
    Number(afterExit.walker?.x) - Number(exteriorBefore.walker?.x),
    Number(afterExit.walker?.z) - Number(exteriorBefore.walker?.z)
  );
  const checks = {
    publishedBuildingSelected: target.synthetic === false && !!target.sourceBuildingId && target.candidateCount > 0,
    connectorEligibleBuildingSelected: target.connectorEligible === true,
    realKeyboardApproach: approach.reached === true && approach.steps > 0 && /enter/i.test(approach.final.promptText),
    contextualKeyboardEntry: exteriorBefore.active === false && inside.active === true && inside.key === target.key,
    assembledInteriorOwned: inside.groupAttached && inside.walkSurfaceCount > 0 && inside.colliderCount > 0 &&
      inside.floorCount >= 2 && inside.loadedLevels.length >= 2 && inside.connectorsAvailable && inside.stairCount > 0,
    interiorPresentationModeHonest: ['mapped', 'generated'].includes(inside.mode),
    realWallContactBlocksTraversal: wallContact.blocked === true && wallContact.reached === false &&
      Math.hypot(
        Number(wallContact.final?.x) - Number(wallContact.start?.x),
        Number(wallContact.final?.z) - Number(wallContact.start?.z)
      ) > 0.15 && Number(wallContact.final?.distance) > 0.08 && wallRecovery.distance > 0.5,
    realStairInputChangesFloor: stairTraversal.activeLevel === stairTraversal.targetLevel &&
      stairTraversal.startLevel !== stairTraversal.activeLevel && stairTraversal.loadedLevels.includes(stairTraversal.activeLevel) &&
      stairTraversal.staging.reached === true && stairTraversal.approach.reached === true && stairTraversal.traversal.reached === true,
    contextualElevatorChangesFloor: elevatorArrival.activeLevel === elevatorPrepared.targetLevel &&
      elevatorArrival.floorId !== stairTraversal.floorId,
    contextualKeyboardExit: afterExit.active === false && distanceRestored < 0.6,
    exteriorOwnershipRestored: afterExit.colliderCount === 0 && afterExit.buildingCollisionDisabled === false,
    mobilePromptFitsViewport: mobileEnterBounds.left >= 0 && mobileEnterBounds.right <= 390 &&
      mobileEnterBounds.top >= 0 && mobileEnterBounds.bottom <= 844,
    contextualTouchEntryExitRecovery: mobileEntered.active === true && mobileExited.active === false &&
      mobileExited.colliderCount === 0 && mobileReentered.active === true && mobileReentered.key === target.key,
    reloadTearsDownInterior: afterReload.diagnostics.active === false,
    noBrowserErrors: browserErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  };
  const report = {
    ok: Object.values(checks).every(Boolean),
    contract: 'published-multifloor-building-keyboard-touch-lifecycle-v2',
    checks,
    target,
    approach,
    exteriorBefore,
    inside,
    wallContact,
    stairTraversal,
    elevatorPrepared,
    elevatorArrival,
    wallRecovery,
    afterExit,
    mobileEnterBounds,
    mobileEntered,
    mobileExited,
    mobileReentered,
    afterReload,
    distanceRestored,
    browserErrors,
    browserConsole,
    localFailures
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Interior entry/exit/reload journey failed.');
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
