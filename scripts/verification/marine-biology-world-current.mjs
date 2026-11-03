import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import {
  bindOceanQaState,
  oceanQaState,
  walkOceanStation,
  pilotOceanSub,
} from './oceanography-qa-driver.mjs';
import { MARINE_BIOLOGY_STUDIES } from '../../app/js/campaign/marine-biology-career.js';
const source = path.resolve(
  process.env.WE3D_MARINE_RECOVERY ||
    'output/verification/oceanography-career-20261102/review-1793679360059/qa-fieldwork-backup.json'
);
assert.ok(source.startsWith(path.resolve('output/verification') + path.sep));
const recovery = JSON.parse(await fs.readFile(source)),
  output = `output/verification/marine-biology-career-20261102/world-${Date.now()}`;
const qa = await createFieldworkQaSession({
    output,
    careerId: 'marine-biology',
    maximumDurationMs: 12 * 60 * 1000,
  }),
  { page, report } = qa;
const click = (name) => page.getByRole('button', { name, exact: true }).click(),
  state = () => page.evaluate(() => window.__qaMarine());
async function record(name) {
  await qa.record(name);
  report.checks.at(-1).marine = await state();
  await fs.writeFile(output + '/progress.json', JSON.stringify(report, null, 2));
}
async function begin(variant) {
  if (await page.getByRole('button', { name: '⌖ Activities', exact: true }).isVisible())
    await click('⌖ Activities');
  else {
    if (!(await page.locator('#fWorldDiscovery').isVisible()))
      await page.locator('#exploreBtn').click();
    await page.locator('#fActivities').click();
    await page.getByRole('tab', { name: 'Careers', exact: true }).click();
  }
  await page.locator('[data-experience-id="career:marine-biologist"]').click();
  if (await page.locator('[data-experience-variant]').count())
    await page.locator('[data-experience-variant]').selectOption(variant);
  else assert.equal(variant, 'campaign', 'Only the initial study is offered before its capstone');
  await page.locator('[data-experience-begin]').click();
  await page.waitForFunction(
    () =>
      window.__qaMarine().study.visible &&
      window.__qaMarine().study.ready &&
      !window.__qaMarine().loading,
    {},
    { timeout: 120000 }
  );
}
async function deploy() {
  if ((await state()).underwater) {
    await page.waitForFunction(
      () => window.__qaMarine().study.instrumentAvailable,
      {},
      { timeout: 60000 }
    );
    return;
  }
  if (!(await state()).onDeck) {
    await click('Explore research vessel');
    await page.waitForFunction(() => window.__qaMarine().onDeck);
  }
  await walkOceanStation(page, 'sub');
  await page.locator('#researchDeckAction').click();
  await page.waitForFunction(() => window.__qaMarine().underwater, {}, { timeout: 90000 });
  await page.waitForFunction(
    () => window.__qaMarine().study.instrumentAvailable,
    {},
    { timeout: 60000 }
  );
  // Leave the stern cradle below the solid hull before rising at the marked station.
  const s = await state(),
    p = s.sub.position,
    u = s.unit;
  report.checks.push({
    name: 'Normal-frame dive clear of hull',
    result: await pilotOceanSub(page, { ...p, y: -12 / u, face: { x: p.x, z: p.z + 20 / u } }),
  });
  const t = (await state()).study.target;
  if (t)
    report.checks.push({
      name: 'Normal-frame hull-safe route to study water',
      result: await pilotOceanSub(page, { x: t.x, z: t.z, y: -12 / u, face: await facePoint() }),
    });
}
async function facePoint() {
  const s = await state();
  return s.animals.length
    ? s.animals.reduce(
        (p, a) => ({
          x: p.x + a.position.x / s.animals.length,
          z: p.z + a.position.z / s.animals.length,
        }),
        { x: 0, z: 0 }
      )
    : { x: s.sub.position.x, z: s.sub.position.z + 80 / s.unit };
}
async function toTarget() {
  const s = await state(),
    t = s.study.target;
  assert.ok(t);
  report.checks.push({
    name: 'Normal-frame navigation to ' + t.label,
    result: await pilotOceanSub(page, { ...t, face: await facePoint() }),
  });
}
async function watch(label) {
  await click('Begin observation window');
  await page.waitForFunction(() => !!window.__qaMarine().study.window);
  if ((await state()).study.window.config.method === 'habitat-transect-v1') {
    await page.waitForFunction(
      () => window.__qaMarine().study.window.gateIndex >= 1,
      {},
      { timeout: 5000 }
    );
    await toTarget();
  }
  await page.waitForFunction(
    () => window.__qaMarine().study.window.ready || window.__qaMarine().study.window.interrupted,
    {},
    { timeout: 35000 }
  );
  const s = await state();
  assert.equal(s.study.window.ready, true, JSON.stringify(s.study));
  await page.screenshot({ path: `${output}/${label}-ready.png` });
}
async function fileWindow() {
  const s = await state(),
    old = s.study.active.habitats.length,
    p = s.study.phase;
  await click(
    s.study.window.observations.length ? 'File observed individuals' : 'File no-sighting record'
  );
  await page.waitForFunction(
    ({ p, old }) => {
      const s = window.__qaMarine().study;
      return s.phase !== p || s.active.habitats.length > old;
    },
    { p, old }
  );
}
try {
  report.scope =
    'Actual source Marine Biologist continuation. Genuine prior source history imported; normal-frame submarine analog controls and published keyboard deck routes. No pose teleport/time advance/rewritten accepted observations. Controlled facing and scientific answers, not a user study.';
  report.source = source;
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') + '/app/?diagnostics=1'
  );
  await page.evaluate(async (data) => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
      '/app/js/discovery/profile-store.js?v=5'
    );
    await createIndexedDbDiscoveryProfileStore().importData(data);
  }, recovery);
  await bindOceanQaState(page);
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    window.__qaMarine = () => ({
      started: ctx.gameStarted,
      loading: ctx.worldLoading,
      paused: ctx.paused,
      onDeck: ctx.boatDeck?.active,
      underwater: ctx.oceanMode?.active,
      unit: ctx.METERS_PER_WORLD_UNIT || 1,
      sub: ctx.oceanMode?.active
        ? {
            position: { ...ctx.oceanMode.submarine.position },
            yaw: ctx.oceanMode.submarine.yaw,
            speed: ctx.oceanMode.submarine.speed,
          }
        : null,
      study: ctx.marineResearch?.marineBiology.snapshot() || {},
      voyage: ctx.oceanVoyage?.current,
      scene: ctx.oceanMode?.scene?.uuid,
      animals: (ctx.oceanMode?.cetaceans || [])
        .filter((a) => a.visualState === 'licensed')
        .map((a) => ({ id: a.individualId, position: { ...a.mesh.position } })),
      focusedWorld: document.activeElement === ctx.renderer?.domElement,
    });
  });
  let finished = 0;
  for (const variant of Object.keys(MARINE_BIOLOGY_STUDIES)) {
    if (recovery.profile.researchCareers['marine-biology']?.completed?.[variant]) continue;
    await begin(variant);
    await record(variant + ' · public Activities entry, original source history retained');
    let commands = 0;
    while ((await state()).study.phase !== 'complete') {
      assert.ok(++commands <= 12, 'Finite seven-command study');
      const s = await state(),
        p = s.study.phase;
      if (p === 'briefing') {
        await click('Begin marine study');
        await page.waitForFunction(() => window.__qaMarine().study.phase === 'surface');
      } else if (p === 'surface') {
        await deploy();
        const t = (await state()).study.target;
        report.checks.push({
          name: 'Normal-frame rise beside the vessel',
          result: await pilotOceanSub(page, { ...t, y: -2.35 / s.unit, face: await facePoint() }),
        });
        await watch(variant + '-surface');
        await fileWindow();
      } else if (p === 'habitat') {
        await deploy();
        await toTarget();
        const index = (await state()).study.active.habitats.length;
        await watch(variant + '-habitat-' + index);
        await fileWindow();
        await record(variant + ' · habitat ' + index + ' filed before navigation review');
        if (variant === 'campaign') {
          const before = await state();
          await click('Pause marine study');
          assert.equal((await state()).study.visible, false);
          await begin(variant);
          const after = await state();
          assert.equal(after.scene, before.scene);
          assert.deepEqual(after.study.active.habitats, before.study.active.habitats);
          report.checks.push({
            name: 'Public pause/Continue preserves all accepted habitats and same scene',
            ok: true,
          });
        }
      } else if (p === 'follow') {
        await deploy();
        let s = await state();
        const animal = s.animals[0];
        assert.ok(animal);
        const dx = s.sub.position.x - animal.position.x,
          dz = s.sub.position.z - animal.position.z,
          d = Math.hypot(dx, dz) || 1;
        const goal = {
          x: animal.position.x + ((dx / d) * 78) / s.unit,
          z: animal.position.z + ((dz / d) * 78) / s.unit,
          y: animal.position.y - 5 / s.unit,
          face: animal.position,
        };
        report.checks.push({
          name: 'Normal-frame respectful individual approach',
          result: await pilotOceanSub(page, goal),
        });
        // Re-aim at the currently moving cohort without changing position or simulation time.
        s = await state();
        await pilotOceanSub(page, { ...s.sub.position, face: await facePoint() });
        await click('Refresh visible individuals');
        const field = page.getByRole('combobox', { name: 'Visible individual', exact: true });
        assert.ok(
          (await field.locator('option').count()) > 1,
          'An actual licensed visible individual is selectable'
        );
        await field.selectOption(await field.locator('option').nth(1).getAttribute('value'));
        await page.waitForFunction(() => !!window.__qaMarine().study.selectedIndividualId);
        await watch(variant + '-follow');
        const ready = (await state()).study;
        const behavior = ready.behaviorOptions.find((v) =>
          ['swam-through-view', 'changed-depth', 'changed-direction'].includes(v)
        );
        assert.ok(behavior);
        await page
          .getByRole('combobox', { name: 'Visible movement', exact: true })
          .selectOption(behavior);
        await page
          .getByRole('combobox', { name: 'What does the sequence establish?', exact: true })
          .selectOption('observed-motion-not-feeding-or-intent');
        await click('File behavior sequence');
        await page.waitForFunction(() => window.__qaMarine().study.phase === 'comparison');
      } else if (p === 'comparison') {
        if (s.underwater) {
          await page.locator('#oceanVoyageRecover').click();
          await page.waitForFunction(() => window.__qaMarine().onDeck, {}, { timeout: 90000 });
        }
        await walkOceanStation(page, 'lab');
        await page
          .getByRole('combobox', { name: 'What do these records show?', exact: true })
          .selectOption((await state()).study.comparison.result);
        await page
          .getByRole('combobox', { name: 'Limit on the habitat comparison', exact: true })
          .selectOption('individual-records-not-population-or-cause');
        await page
          .getByRole('combobox', { name: 'Current context', exact: true })
          .selectOption('no-local-current-measurement');
        await click('Save habitat comparison');
        await page.waitForFunction(() => window.__qaMarine().study.phase === 'report');
      } else if (p === 'report') {
        if (!(await state()).onDeck) throw Error('Same-vessel lab remains required');
        await walkOceanStation(page, 'lab');
        await page
          .getByRole('combobox', { name: 'Follow-up habitat', exact: true })
          .selectOption(MARINE_BIOLOGY_STUDIES[variant].habitats[0]);
        await page
          .getByRole('combobox', { name: 'Follow-up method', exact: true })
          .selectOption('repeat-matched-effort-other-time');
        await click('Save marine habitat plate');
        await page.waitForFunction(() => window.__qaMarine().study.phase === 'complete');
      } else throw Error('Unexpected Marine phase ' + p);
      await record(variant + ' · ' + p + ' accepted');
    }
    await page.screenshot({ path: `${output}/${variant}-complete.png` });
    finished++;
    if (process.env.WE3D_MARINE_ALL !== '1') break;
  }
  report.completedThisRun = finished;
  await qa.succeed();
} catch (e) {
  try {
    report.marineFailure = await state();
  } catch {}
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
