import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import {
  bindOceanQaState,
  oceanQaState,
  walkOceanStation,
  sailOceanStation,
  pilotOceanSub,
} from './oceanography-qa-driver.mjs';
import {
  OCEANOGRAPHY_STUDIES,
  OCEANOGRAPHY_STATIONS,
  oceanographyComparison,
} from '../../app/js/campaign/oceanography-career.js';
const source = path.resolve(
  process.env.WE3D_OCEAN_RECOVERY ||
    'output/verification/oceanography-career-20261102/first-cast-1793677385925/qa-fieldwork-backup.json'
);
assert.ok(
  source.startsWith(path.resolve('output/verification/oceanography-career-20261102') + path.sep)
);
const recovery = JSON.parse(await fs.readFile(source)),
  output = `output/verification/oceanography-career-20261102/world-${Date.now()}`,
  qa = await createFieldworkQaSession({
    output,
    careerId: 'oceanography',
    maximumDurationMs: 12 * 60 * 1000,
  }),
  { page, report } = qa;
const click = (name) => page.getByRole('button', { name, exact: true }).click(),
  survey = async () => (await oceanQaState(page)).survey;
async function record(label) {
  report.checks.push({ name: label, state: await oceanQaState(page) });
  const data = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.discoveryProfileStore.exportData();
  });
  await fs.writeFile(output + '/qa-fieldwork-backup.json', JSON.stringify(data), { mode: 0o600 });
  await fs.writeFile(output + '/progress.json', JSON.stringify(report, null, 2));
  console.log(label);
}
async function begin(variant) {
  if (await page.getByRole('button', { name: '⌖ Activities', exact: true }).isVisible())
    await click('⌖ Activities');
  else {
    if (!(await page.locator('#fWorldDiscovery').isVisible()))
      await page.locator('#exploreBtn').click();
    await page.locator('#fWorldDiscovery').click();
    await page.locator('#sandboxNearbyActivities').click();
    await page.getByRole('tab', { name: 'Careers', exact: true }).click();
  }
  await page.locator('[data-experience-id="career:oceanographer"]').click();
  if (await page.locator('[data-experience-variant]').count())
    await page.locator('[data-experience-variant]').selectOption(variant);
  await page.locator('[data-experience-begin]').click();
  await page.waitForFunction(
    () => {
      const s = window.__qaOcean();
      return s.started && s.survey?.visible && s.survey.ready && !s.loading;
    },
    {},
    { timeout: 120000 }
  );
}
async function deploy() {
  if (!(await oceanQaState(page)).onDeck) {
    await click('Explore research vessel');
    await page.waitForFunction(() => window.__qaOcean().onDeck);
  }
  await walkOceanStation(page, 'sub');
  await page.locator('#researchDeckAction').click();
  await page.waitForFunction(() => window.__qaOcean().underwater, {}, { timeout: 90000 });
  await page.waitForFunction(
    () => window.__qaOcean().survey.target || window.__qaOcean().survey.phase === 'return',
    {},
    { timeout: 60000 }
  );
}
try {
  report.scope =
    'Actual source career continuation from the genuine saved prefix. Published ship route via keyboard; continuous analog helm/submarine inputs under normal frames; no pose teleport or simulation-time advance. Accepted casts/procedures are never repeated.';
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
  const variants = Object.keys(OCEANOGRAPHY_STUDIES),
    start = Math.max(
      0,
      variants.indexOf(
        recovery.profile.researchCareers.oceanography.active?.variantId || 'campaign'
      )
    );
  for (let vi = start; vi < variants.length; vi++) {
    const variant = variants[vi],
      study = OCEANOGRAPHY_STUDIES[variant];
    if (recovery.profile.researchCareers.oceanography.completed[variant]) continue;
    await begin(variant);
    await record(
      variant +
        ' · original vessel/career checkpoint restored without replaying accepted observations'
    );
    let n = 0;
    while ((await survey()).phase !== 'complete') {
      if (++n > 20) throw Error('The finite vessel workflow exceeded its command bound');
      const s = await survey(),
        p = s.phase;
      if (p === 'planning') {
        await walkOceanStation(page, 'chart');
        await click('Review both station charts');
        await page
          .getByRole('combobox', { name: 'Matched downcast protocol', exact: true })
          .waitFor();
        await page
          .getByRole('combobox', { name: 'Matched downcast protocol', exact: true })
          .selectOption('virtual-ctd-three-depths-v1');
        await click('Accept two-station survey');
        await page.waitForFunction(() => window.__qaOcean().survey.phase === 'casts');
      } else if (p === 'casts') {
        const station = OCEANOGRAPHY_STATIONS[s.active.stationIndex];
        if (s.nextStationMeters > 23) {
          await walkOceanStation(page, 'helm');
          await page.locator('#researchDeckAction').click();
          await page.waitForFunction(() => !window.__qaOcean().onDeck);
          await click('Release mooring');
          report.checks.push({
            name: 'Normal-frame helm navigation to ' + station.id,
            result: await sailOceanStation(page, station),
          });
          await click('Moor vessel');
          await click('Explore research vessel');
          await page.waitForFunction(() => window.__qaOcean().onDeck);
        }
        await walkOceanStation(page, 'sub');
        const old = s.active.stationIndex;
        await click('Begin downcast');
        await page.waitForFunction(
          () => window.__qaOcean().survey.cast?.ready === true,
          {},
          { timeout: 60000 }
        );
        await page.getByRole('button', { name: 'File recovered cast', exact: true }).waitFor();
        assert.equal(
          await page.getByRole('button', { name: 'File recovered cast', exact: true }).isEnabled(),
          true
        );
        await page.screenshot({ path: `${output}/${variant}-${station.id}-recovered.png` });
        await click('File recovered cast');
        await page.waitForFunction(
          (old) => window.__qaOcean().survey.active.stationIndex > old,
          old
        );
      } else if (p === 'mapping') {
        if (!(await oceanQaState(page)).underwater) await deploy();
        const current = await survey(),
          t = current.target;
        assert.ok(t);
        const goal = await page.evaluate(async (t) => {
          const { ctx } = await import('/app/js/shared-context.js?v=55'),
            u = ctx.METERS_PER_WORLD_UNIT || 1,
            d = Math.hypot(t.x, t.z) || 1;
          return {
            x: t.x - ((t.x / d) * 35) / u,
            z: t.z - ((t.z / d) * 35) / u,
            y: Math.min(-3, t.y + 6 / u),
            face: t,
          };
        }, t);
        report.checks.push({
          name: 'Physical sonar leg toward ' + t.id,
          result: await pilotOceanSub(page, goal),
        });
        const count = current.active.pings.length;
        await click('Record geometry return');
        await page.waitForFunction(
          (count) => window.__qaOcean().survey.active.pings.length > count,
          count
        );
        await page.screenshot({ path: `${output}/${variant}-return-${t.id}.png` });
      } else if (p === 'select-target') {
        await page
          .getByRole('combobox', { name: 'Mapped dive target', exact: true })
          .selectOption(study.target);
        await page
          .getByRole('combobox', { name: 'What does the return establish?', exact: true })
          .selectOption('return-shape-not-identification');
        await click('Choose inspection target');
        await page.waitForFunction(() => window.__qaOcean().survey.phase === 'inspection');
      } else if (p === 'inspection') {
        if (!(await oceanQaState(page)).underwater) await deploy();
        const t = (await survey()).target,
          u = await page.evaluate(async () => {
            const { ctx } = await import('/app/js/shared-context.js?v=55');
            return ctx.METERS_PER_WORLD_UNIT || 1;
          });
        report.checks.push({
          name: 'Physical submersible feature inspection approach',
          result: await pilotOceanSub(page, {
            x: t.x,
            z: t.z + 2.5 / u,
            y: Math.min(-2.5, t.y + 4.5 / u),
            face: t,
          }),
        });
        await page.screenshot({ path: `${output}/${variant}-direct-view.png` });
        await page.getByRole('combobox', { name: 'Visible structure', exact: true }).selectOption(
          {
            habitat: 'branching-colonies-on-rock',
            rock: 'unbroken-mineral-surface',
            case: 'straight-edges-and-latches',
          }[t.id]
        );
        await click('Record direct submersible view');
        await page.waitForFunction(() => window.__qaOcean().survey.phase === 'return');
      } else if (p === 'return') {
        if (!(await oceanQaState(page)).underwater) await deploy();
        const goal = await page.evaluate(async () => {
          const { ctx } = await import('/app/js/shared-context.js?v=55'),
            { oceanParentPosition } = await import('/app/js/ocean/stream-runtime.js'),
            p = oceanParentPosition(ctx.oceanMode, ctx.SCALE),
            u = ctx.METERS_PER_WORLD_UNIT || 1,
            yaw = ctx.oceanVoyage.current.ship.yaw + (p.yawOffset || 0);
          return {
            x: p.x + (Math.cos(yaw) * 16) / u,
            z: p.z - (Math.sin(yaw) * 16) / u,
            y: 0.08 - 12 / u,
          };
        });
        report.checks.push({
          name: 'Normal-frame return to the same parent vessel',
          result: await pilotOceanSub(page, goal),
        });
        await click('Record approach to this vessel');
        await page.waitForFunction(() => window.__qaOcean().survey.phase === 'report');
      } else if (p === 'report') {
        if ((await oceanQaState(page)).underwater) {
          await page.locator('#oceanVoyageRecover').click();
          await page.waitForFunction(
            () => window.__qaOcean().onDeck && !window.__qaOcean().underwater,
            {},
            { timeout: 90000 }
          );
        }
        await walkOceanStation(page, 'lab');
        await page.screenshot({ path: `${output}/${variant}-wet-lab.png` });
        for (const [label, value] of [
          ['Supported water-column result', oceanographyComparison(s.active).result],
          ['Limit on this comparison', study.limit],
          ['Relationship to the inspected feature', 'virtual-feature-not-a-regional-cause'],
          ['Useful follow-up', 'repeat-matched-profiles-other-time'],
        ])
          await page.getByRole('combobox', { name: label, exact: true }).selectOption(value);
        await click('Save annotated transect');
        await page.waitForFunction(() => window.__qaOcean().survey.phase === 'complete');
      } else throw Error('Unsupported source survey phase ' + p);
      await record(variant + ' · saved ' + p);
    }
    await page.screenshot({ path: `${output}/${variant}-completed.png` });
    await record(variant + ' · full annotated survey complete');
    if (process.env.WE3D_OCEAN_ALL !== '1') break;
    await click('Pause survey');
  }
  assert.deepEqual(report.errors, []);
  report.ok = true;
  await fs.writeFile(output + '/receipt.json', JSON.stringify(report, null, 2));
  console.log('PASS ' + output);
} catch (e) {
  report.oceanFailure = await oceanQaState(page).catch(() => null);
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
