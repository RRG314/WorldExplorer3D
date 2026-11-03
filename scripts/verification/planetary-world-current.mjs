import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { SHIP_STATIONS } from '../../app/js/expedition/ship-layout.js';
const output = 'output/verification/planetary-career-20261103/world-' + Date.now();
const source =
  process.env.WE3D_PLANETARY_RECOVERY ||
  'output/verification/planetary-career-20261103/home-1793700263011/qa-original-display-seed.json';
assert.match(source, /planetary-career-20261103\/(?:world|home)-\d+\/qa-[a-z-]+\.json$/);
const seed = JSON.parse(await fs.readFile(source)),
  data = seed.discovery || seed;
const keys = [
  'world-explorer:destination-missions:v1',
  'world-explorer:interstellar-expedition:v1',
  'world-explorer:character-backpack:v3',
];
const qa = await createFieldworkQaSession({
    output,
    careerId: 'planetary',
    maximumDurationMs: 12 * 60 * 1000,
    walkLegMaximumDurationMs: 120000,
  }),
  { page, report } = qa;
const base = 'http://127.0.0.1:4192';
async function bind() {
  await page.evaluate(async () => {
    window.lunarCtx = (await import('/app/js/shared-context.js?v=55')).ctx;
  });
}
const state = () =>
  page.evaluate(() => ({
    env: lunarCtx.getEnv(),
    paused: lunarCtx.paused,
    mission: lunarCtx.getDestinationMissionSnapshot?.(),
    expedition: lunarCtx.getInterstellarExpeditionSnapshot?.(),
    ship: lunarCtx.getShipInteriorSnapshot?.(),
    field: lunarCtx.planetaryFieldActivitySnapshot?.(),
    walker: lunarCtx.Walk?.state.walker,
    panel: document.querySelector('#shipStationPanel')?.textContent,
    journey: lunarCtx.spaceJourney,
  }));
async function save(name) {
  const checkpoint = await page.evaluate(
    async (keys) => ({
      discovery: await (window.fixture?.store || lunarCtx.discoveryProfileStore).exportData(),
      storage: Object.fromEntries(keys.map((k) => [k, localStorage.getItem(k)])),
      snapshot: {
        env: lunarCtx.getEnv(),
        mission: lunarCtx.getDestinationMissionSnapshot?.(),
        expedition: lunarCtx.getInterstellarExpeditionSnapshot?.(),
      },
    }),
    keys,
  );
  await fs.writeFile(output + '/qa-lunar-checkpoint.json', JSON.stringify(checkpoint), {
    mode: 0o600,
  });
  report.checks.push({ name, snapshot: checkpoint.snapshot });
  await fs.writeFile(output + '/progress.json', JSON.stringify(report, null, 2));
  console.log(name);
}
async function start(id) {
  await page.goto(base + '/app/?diagnostics=1');
  await bind();
  if (await page.locator('#analyticsConsentDenyBtn').isVisible())
    await page.locator('#analyticsConsentDenyBtn').click();
  await page.getByRole('button', { name: '⌖ Activities', exact: true }).click();
  await page.getByRole('tab', { name: 'Careers', exact: true }).click();
  await page.locator('[data-experience-id="career:planetary-scientist"]').click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-experience-begin]')?.disabled === false &&
      !!document.querySelector('[data-experience-place]')?.value,
  );
  if (await page.locator('[data-experience-variant]').count()) {
    await page.locator('[data-experience-variant]').selectOption(id);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-experience-begin]')?.disabled === false &&
        !!document.querySelector('[data-experience-place]')?.value,
    );
    assert.equal(await page.locator('[data-experience-variant]').inputValue(), id);
  }
  console.log('Native Activities entry ' + id);
  await page.locator('[data-experience-begin]').click();
  await page.waitForFunction(
    () =>
      lunarCtx.getShipInteriorSnapshot?.()?.active ||
      (lunarCtx.getEnv() === 'MOON' &&
        lunarCtx.moonSurface?.userData.ready &&
        lunarCtx.planetaryFieldActivitySnapshot?.()?.activities.length === 4 &&
        !lunarCtx.worldLoading) ||
      (lunarCtx.getEnv() === 'SPACE_FLIGHT' &&
        lunarCtx.getInterstellarExpeditionSnapshot?.()?.podJourney?.phase === 'local_flight'),
    null,
    { timeout: 120000 },
  );
  assert.equal((await state()).mission.activeMissionId, 'mission:moon:' + id);
  console.log('Existing ship ready ' + id);
}
async function closeStation() {
  if (await page.locator('[data-close-station]').isVisible())
    await page.locator('[data-close-station]').click();
}
async function station(id) {
  await closeStation();
  // The existing ship traversal/deck matrix is accepted separately. Only these
  // changed station controls are exercised with controlled ship presence.
  await page.evaluate(
    (s) => {
      lunarCtx.switchSolisReachDeck(s.deckId);
      Object.assign(lunarCtx.Walk.state.walker, {
        x: s.x,
        z: s.z,
        y: 1.74,
        angle: 0,
        yaw: 0,
        lookYawOffset: 0,
        pitch: 0,
        vy: 0,
        onGround: true,
      });
      lunarCtx.renderer.domElement.focus();
    },
    SHIP_STATIONS.find((s) => s.id === id),
  );
  await page.waitForTimeout(250);
  await page.keyboard.press('e');
  await page.locator('#shipStationPanel').waitFor({ state: 'visible' });
}
async function prepare(id, strategy) {
  if (['available', 'briefing'].includes((await state()).mission.phase)) {
    await station('navigation-course');
    await page.locator('[data-lunar-brief]').click();
    await page.locator('[data-mission-begin]').click();
    await page.locator('[data-mission-close]').click();
  }
  if ((await state()).mission.phase === 'approach') {
    await station('navigation-course');
    await page.locator('[data-lunar-brief]').click();
    for (const [width, height] of [
      [1280, 800],
      [390, 844],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await page.locator('[data-mission-close]').scrollIntoViewIfNeeded();
      assert.equal(
        await page.locator('[data-mission-close]').evaluate((e) => {
          const r = e.getBoundingClientRect();
          return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === e;
        }),
        true,
      );
      await page.screenshot({ path: output + '/mission-modal-' + width + '.png' });
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#destinationMissionPanel').isVisible(), false);
    await page.setViewportSize({ width: 1280, height: 800 });
  }
  await station('science-survey');
  if (id === 'alternate-method')
    assert.equal(await page.locator('[data-lunar-prepare="observe"]').count(), 0);
  await page.locator('[data-lunar-prepare="' + strategy + '"]').click();
  await page.waitForFunction(
    (s) => lunarCtx.getDestinationMissionSnapshot()?.preparation?.strategy === s,
    strategy,
  );
  await closeStation();
  await save(id + ' native science preparation');
}
async function approachFlight() {
  if (await page.locator('#spaceFlightHUD').evaluate((e) => e.classList.contains('collapsed')))
    await page.locator('#sfHudToggle').click();
  // Reuse the explicitly controlled flight-approach scope of accepted H10–H12.
  // No new flight/arrival, battery-failure or ascent-failure matrix is claimed.
  assert.equal(
    await page.evaluate(() => {
      lunarCtx.engageRenderedJourneyAssist();
      for (let i = 0; i < 3200 && lunarCtx.spaceJourney?.phase !== 'approach'; i++)
        lunarCtx.updateRenderedSpaceJourney({ realDtS: 0.1 });
      return lunarCtx.spaceJourney?.phase;
    }),
    'approach',
  );
  await page.waitForFunction(() => document.getElementById('sfLandBtn')?.disabled === false, null, {
    timeout: 20000,
  });
  await page.locator('#sfLandBtn').click();
}
async function land() {
  const current = await state();
  if (current.expedition?.podJourney?.phase === 'local_flight' && !current.ship?.active) {
    assert.equal(await page.evaluate(() => lunarCtx.setSolarSystemCourse('moon').accepted), true);
  } else {
    await station('craft-bay-status');
    await page.locator('[data-pod-mission]').click();
  }
  await page.waitForFunction(
    () => lunarCtx.getInterstellarExpeditionSnapshot()?.podJourney?.phase === 'local_flight',
    null,
    { timeout: 30000 },
  );
  await approachFlight();
  await page.waitForFunction(
    () =>
      lunarCtx.getEnv() === 'MOON' &&
      lunarCtx.moonSurface?.userData.ready &&
      lunarCtx.getInterstellarExpeditionSnapshot()?.podJourney?.phase === 'surface',
    null,
    { timeout: 60000 },
  );
  await page.evaluate(() => {
    lunarCtx.setTravelMode('walk', {
      source: 'lunar-verification',
      force: true,
      emitTutorial: false,
    });
    lunarCtx.renderer.domElement.focus();
  });
  await page.waitForFunction(() => lunarCtx.Walk.state.mode === 'walk' && !lunarCtx.paused);
  await save('actual native Moon arrival');
}
async function walk(point, tolerance = 0.4) {
  await page.evaluate(() => lunarCtx.renderer.domElement.focus());
  await page.keyboard.down('Shift');
  try {
    await qa.walkTo(point, tolerance);
  } finally {
    await page.keyboard.up('Shift');
  }
}
async function field(evidenceId) {
  if ((await state()).mission.evidence.includes(evidenceId)) {
    console.log('REUSE accepted ' + evidenceId);
    return;
  }
  const a = await page.evaluate(
    (id) => lunarCtx.planetaryFieldActivitySnapshot().activities.find((a) => a.evidenceId === id),
    evidenceId,
  );
  // Walk around the east side of each rig, keeping out of its actual geometry.
  await walk({ x: a.x + 3, z: a.z });
  await page.evaluate((p) => {
    const w = lunarCtx.Walk.state.walker;
    w.yaw = Math.atan2(p.x - w.x, p.z - w.z);
    w.pitch = -0.2;
    w.lookYawOffset = 0;
  }, a);
  const before = (await state()).walker;
  assert.ok(before.onGround, 'Physical lunar walking must finish on the native ground');
  for (let i = 0; i < 3; i++) {
    assert.equal(await page.evaluate(() => lunarCtx.handlePrimaryContextInteraction()), true);
    await page.waitForTimeout(160);
  }
  await page.waitForFunction(
    (id) => lunarCtx.getDestinationMissionSnapshot().evidence.includes(id),
    evidenceId,
    { timeout: 8000 },
  );
  await page.screenshot({
    path: output + '/' + (await state()).mission.surveyVariantId + '-' + evidenceId + '.png',
  });
  await save('normal-frame lunar walk and fresh scoped ' + evidenceId);
}
async function recover() {
  const current = await state();
  if (!current.ship?.active && current.expedition?.podJourney.phase !== 'rendezvous') {
    const p = await page.evaluate(() => {
      const p = lunarCtx.scene.children.find(
        (c) => c.userData?.bodyId === 'moon' && Number.isFinite(c.userData.surfaceGroundY),
      );
      if (!p) throw Error('Native recovery pod missing');
      return { x: p.position.x + 3, z: p.position.z };
    });
    await walk(p);
    assert.equal(await page.evaluate(() => lunarCtx.handlePrimaryContextInteraction()), true);
    await page.locator('[data-surface-launch]').click();
    await page.waitForFunction(
      () =>
        lunarCtx.getEnv() === 'SPACE_FLIGHT' &&
        lunarCtx.getInterstellarExpeditionSnapshot()?.podJourney?.phase === 'rendezvous',
      null,
      { timeout: 35000 },
    );
  }
  if ((await state()).ship?.active) return;
  if (await page.locator('#spaceFlightHUD').evaluate((e) => e.classList.contains('collapsed')))
    await page.locator('#sfHudToggle').click();
  await page.waitForFunction(() => !!lunarCtx.getExpeditionPodDockingTarget?.()?.position, null, {
    timeout: 10000,
  });
  await page.evaluate(() => {
    const t = lunarCtx.getExpeditionPodDockingTarget();
    lunarCtx.spaceFlight.rocket.position
      .copy(t.position)
      .add(new THREE.Vector3(0, 0, Math.max(2, t.radius * 0.25)));
    lunarCtx.spaceFlight.velocity.set(0, 0, 0);
    lunarCtx.spaceFlight.gravityVelocity?.set(0, 0, 0);
    lunarCtx.spaceFlight.speed = 0;
  });
  await page.waitForFunction(() => document.getElementById('sfLandBtn')?.disabled === false);
  await page.locator('#sfLandBtn').click();
  await page.waitForFunction(
    () =>
      lunarCtx.getInterstellarExpeditionSnapshot()?.podJourney?.phase === 'recovered' &&
      lunarCtx.getShipInteriorSnapshot?.()?.active,
    null,
    { timeout: 30000 },
  );
  await save('same actual pod recovered to existing ship');
}
async function earth() {
  await station('craft-bay-status');
  await page.locator('[data-pod-earth]').click();
  await page.waitForFunction(
    () => lunarCtx.getInterstellarExpeditionSnapshot()?.podJourney?.phase === 'local_flight',
    null,
    { timeout: 30000 },
  );
  assert.equal(await page.evaluate(() => lunarCtx.setSolarSystemCourse('earth').accepted), true);
  await approachFlight();
  await page.waitForFunction(
    () =>
      lunarCtx.getEnv() === 'EARTH' &&
      !lunarCtx.worldLoading &&
      !lunarCtx.spaceFlight.active &&
      lunarCtx.buildings?.length > 0,
    null,
    { timeout: 180000 },
  );
  await save('native Earth return retains completed lunar study');
}
async function display(id) {
  // Same native Earth desk boundary verified above: controlled room, actual
  // existing home owner/Backpack/GLBs, now the genuine NEW field report.
  await page.goto(base + '/scripts/verification/fixtures/personal-workspace.html');
  await page.waitForFunction(() => window.fixture && !fixture.runtime.snapshot().busy);
  await page
    .locator('[data-home-action="place"], [data-home-action="lunar-display"]')
    .first()
    .waitFor({ state: 'visible' });
  if (await page.locator('[data-home-action="place"]').count()) {
    await page.locator('[data-home-action="place"]').click();
    await page.waitForFunction(
      () => fixture.runtime.snapshot().furnitureReady && !fixture.runtime.snapshot().busy,
    );
  }
  await page.waitForFunction(
    () => fixture.runtime.snapshot().furnitureReady && !fixture.runtime.snapshot().busy,
  );
  await page.evaluate(async () => {
    const { workspaceGeometry } = await import('/app/js/campaign/personal-workspace.js'),
      g = workspaceGeometry(fixture.active, fixture.runtime.snapshot().workspace.pose);
    Object.assign(fixture.walker, { ...g.use, y: g.use.y + 1.7 });
    fixture.state.ui.setOpen(true);
  });
  await page
    .locator('[data-home-lunar-record]')
    .selectOption('event:destination-mission:moon:' + id);
  await page.locator('[data-home-action="lunar-display"]').click();
  await page.waitForFunction(
    () => fixture.runtime.snapshot().furnitureReady && !fixture.runtime.snapshot().busy,
  );
  await page.locator('[data-home-action="lunar-review"]').click();
  await page.waitForFunction(() => !fixture.runtime.snapshot().busy);
  assert.equal(
    await page.evaluate(
      async (id) =>
        (await fixture.store.getEventsById(['event:campaign:lunar-homecoming:' + id])).length,
      id,
    ),
    1,
  );
  await bind();
  await save(id + ' actual new field report reviewed through native controlled Earth desk');
}
try {
  report.scope =
    'New repeat mission integration only. Actual source lunar surface normal keyboard walking/running and procedures, scoped specimens, existing pod/ship/analysis/Earth owners. Controlled ship station presence, accepted accelerated flight approach/docking boundary, controlled native Earth room. Genuine old optical report reused, no original lunar methods or full accepted H10–H12 matrix replay. The base homecoming seed is a real native controlled-room review, NOT a mapped-city return claim.';
  report.source = source;
  await page.addInitScript(() => {
    window.__skipOpeningChapterFixture = true;
  });
  await page.goto(base + '/app/?diagnostics=1');
  await page.evaluate(
    async ({ data, storage }) => {
      const { createIndexedDbDiscoveryProfileStore } = await import(
        '/app/js/discovery/profile-store.js?v=5'
      );
      await createIndexedDbDiscoveryProfileStore().importData(data);
      for (const [k, v] of Object.entries(storage || {}))
        if (v !== null) localStorage.setItem(k, v);
    },
    { data, storage: seed.storage },
  );
  for (const id of ['alternate-method', 'planned-return']) {
    const done = await page.evaluate(async (id) => {
      const { createIndexedDbDiscoveryProfileStore } = await import(
        '/app/js/discovery/profile-store.js?v=5'
      );
      return (
        await createIndexedDbDiscoveryProfileStore().getEventsById([
          'event:campaign:lunar-homecoming:' + id,
        ])
      ).length;
    }, id);
    if (done) {
      console.log('REUSE completed ' + id);
      continue;
    }
    const returnedReport = await page.evaluate(async (id) => {
      const { createIndexedDbDiscoveryProfileStore } = await import(
        '/app/js/discovery/profile-store.js?v=5'
      );
      const rows = await createIndexedDbDiscoveryProfileStore().getEventsById([
        'event:destination-mission:moon:' + id,
      ]);
      const pod = JSON.parse(
        localStorage.getItem('world-explorer:interstellar-expedition:v1') || 'null',
      )?.podJourney;
      return rows.length && pod?.bodyId === 'earth' && pod.phase === 'surface';
    }, id);
    if (returnedReport) {
      await display(id);
      continue;
    }
    await start(id);
    let s = await state();
    if (['available', 'briefing', 'approach'].includes(s.mission.phase) && !s.mission.preparation)
      await prepare(id, id === 'alternate-method' ? 'samples' : 'observe');
    s = await state();
    if (s.env !== 'MOON' && !['complete', 'analysis'].includes(s.mission.phase)) await land();
    if ((await state()).mission.phase !== 'complete') {
      await field('mare-context');
      await field(id === 'alternate-method' ? 'mare-sample' : 'mare-observation');
      if (id === 'planned-return' && !(await state()).mission.siteARecovery) {
        const oldPod = (await state()).expedition.podJourney.id;
        assert.equal(
          await page.evaluate(() => {
            const a = lunarCtx
              .planetaryFieldActivitySnapshot()
              .activities.find((a) => a.evidenceId === 'fragment-context');
            return lunarCtx.canRecordLunarFieldActivity(a);
          }),
          false,
        );
        await recover();
        await page.waitForFunction(() => !!lunarCtx.getDestinationMissionSnapshot()?.siteARecovery);
        assert.equal((await state()).mission.siteARecovery.podId, oldPod);
        await land();
        assert.notEqual((await state()).expedition.podJourney.id, oldPod);
        assert.ok((await page.evaluate(() => lunarCtx.getLunarFieldPower().remainingS)) > 1150);
        await save(
          'planned real recovery gates Site B and new sortie recharges without resetting A',
        );
      }
      await field('fragment-context');
      await field(id === 'alternate-method' ? 'fragment-sample' : 'fragment-observation');
      await recover();
      await station('analysis-review');
      const labGate = await page.evaluate(async () => {
        const { canAnalyzeDestination } = await import(
            '/app/js/universe/mission-progression.js?v=1'
          ),
          { getDestinationMission } = await import('/app/js/universe/mission-catalog.js?v=3'),
          { lunarSampleId } = await import('/app/js/planetary/lunar-samples.js');
        const m = lunarCtx.getDestinationMissionSnapshot(),
          w = lunarCtx.Walk.state.walker;
        return {
          canAnalyze: canAnalyzeDestination(lunarCtx, getDestinationMission('moon')),
          shipActive: lunarCtx.activeShipInterior,
          frame: lunarCtx.universeRuntime?.current?.id,
          transition: !!lunarCtx.universeRuntime?.transition,
          fieldMethod: m.fieldMethod,
          missionId: m.activeMissionId,
          carried: ['mare-sample', 'fragment-sample'].map((id) => [
            id,
            lunarCtx.playerBackpackInventory?.has(lunarSampleId(id, m.activeMissionId)),
          ]),
          stations: lunarCtx.activeInterior?.interactions
            ?.filter((s) => s.id === 'analysis-review' || s.stationId === 'analysis-review')
            .map((s) => ({
              id: s.id,
              x: s.x,
              z: s.z,
              radius: s.radius,
              distance: Math.hypot(w.x - s.x, w.z - s.z),
            })),
        };
      });
      report.labGate = labGate;
      console.log(JSON.stringify(labGate));
      assert.equal(labGate.canAnalyze, true);
      await page.locator('[data-complete-destination-analysis="cautious-baseline"]').click();
      await page.waitForFunction(
        () => lunarCtx.getDestinationMissionSnapshot()?.phase === 'complete',
      );
      await save(id + ' unique report from actual analysis');
      await closeStation();
    }
    await earth();
    await display(id);
  }
  const final = await page.evaluate(async () => {
    const { lunarStudyState, lunarStudyEventIds } = await import(
      '/app/js/planetary/lunar-study-records.js'
    );
    const rows = await fixture.store.getEventsById(lunarStudyEventIds),
      s = lunarStudyState(rows);
    return {
      reports: Object.keys(s.reports).filter((id) => s.reports[id]),
      displays: Object.keys(s.displays).filter((id) => s.displays[id]),
      rows,
    };
  });
  assert.equal(final.reports.length, 3);
  assert.equal(final.displays.length, 3);
  report.final = final;
  await qa.succeed();
} catch (e) {
  try {
    await bind();
    await save('durable failure checkpoint; accepted records retained');
    report.lunarLast = await state();
  } catch {}
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
