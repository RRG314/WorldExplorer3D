import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/oceanography-career-20261102/first-cast-${Date.now()}`,
  qa = await createFieldworkQaSession({
    output,
    careerId: 'oceanography',
    maximumDurationMs: 420000
  }),
  { page, report } = qa;
async function state() {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      gameStarted: ctx.gameStarted,
      loading: ctx.worldLoading,
      boat: ctx.boatMode?.active,
      onDeck: ctx.boatDeck?.active,
      voyage: ctx.oceanVoyage?.current,
      deck: ctx.boatDeck?.snapshot(),
      survey: ctx.marineResearch?.oceanography.snapshot(),
      errors: ctx.getGameplayRegistrySnapshot?.()
    };
  });
}
async function checkpoint(label) {
  report.checks.push({ name: label, state: await state() });
  const data = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.discoveryProfileStore.exportData();
  });
  await fs.writeFile(output + '/qa-fieldwork-backup.json', JSON.stringify(data), { mode: 0o600 });
  await fs.writeFile(output + '/progress.json', JSON.stringify(report, null, 2));
  console.log(label);
}
async function walkStation(id) {
  await page.getByLabel('Deck destination').selectOption(id);
  await page.waitForTimeout(300);
  const route = (await state()).deck.route;
  assert.ok(route.length > 0, 'Published ship route exists');
  const deadline = Date.now() + 140000;
  try {
    for (const target of route) {
      while (Date.now() < deadline) {
        const s = await state(),
          p = s.deck.pose,
          d = Math.hypot(target.x - p.x, target.z - p.z);
        if (d < 0.22) break;
        assert.equal(s.onDeck, true);
        assert.equal(s.survey?.visible, true);
        await page.evaluate(async (target) => {
          const { ctx } = await import('/app/js/shared-context.js?v=55'),
            p = ctx.boatDeck.snapshot().pose,
            desired = Math.atan2(target.x - p.x, target.z - p.z),
            delta = Math.atan2(Math.sin(desired - p.yaw), Math.cos(desired - p.yaw));
          ctx.boatDeck.look(delta, -0.13 - (p.pitch || 0));
          ctx.renderer.domElement.focus({ preventScroll: true });
        }, target);
        await page.keyboard.down('w');
        await page.waitForTimeout(d < 0.6 ? 45 : 110);
        await page.keyboard.up('w');
      }
      if (Date.now() >= deadline)
        throw Error('The published walking route exceeded its bounded normal-frame duration');
    }
  } finally {
    await page.keyboard.up('w').catch(() => {});
  }
  assert.ok(
    await page.evaluate(async (id) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.boatDeck.stationDistance(id) < 2.4;
    }, id)
  );
}
try {
  report.scope =
    'Actual Activities→admitted research-vessel entry, keyboard walking under normal frames, two-station chart plan and first physically lowered/recovered CTD cast in real IndexedDB. Controlled facing; no pose teleport or time advance. Affected career boundary only, not a replayed full coastal chapter.';
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') + '/app/?diagnostics=1'
  );
  await page.getByRole('button', { name: '⌖ Activities', exact: true }).click();
  await page.locator('[data-experience-id="career:oceanographer"]').click();
  await page.locator('[data-experience-begin]').click();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    window.__oceanDeckActive=()=>!!ctx.boatDeck?.active;
    window.__oceanSurvey=()=>ctx.marineResearch?.oceanography.snapshot();
    window.__oceanEntryReady = () =>
      ctx.boatMode?.active &&
      !!ctx.oceanVoyage?.current &&
      ctx.marineResearch?.oceanography.snapshot().visible;
  });
  await page.waitForFunction(() => window.__oceanEntryReady(), {}, { timeout: 120000 });
  if (!(await state()).onDeck) {
    await page.getByRole('button', { name: 'Explore research vessel', exact: true }).click();
  }
  await page.waitForFunction(
    () => window.__oceanDeckActive(),
    {},
    { timeout: 60000 }
  );
  await checkpoint(
    'Activities starts the admitted actual vessel and coherent Oceanographer objective'
  );
  await page.screenshot({ path: output + '/entry.png' });
  await walkStation('chart');
  await page.getByRole('button', { name: 'Review both station charts', exact: true }).click();
  await page.getByRole('combobox', { name: 'Matched downcast protocol', exact: true }).waitFor();
  await page
    .getByRole('combobox', { name: 'Matched downcast protocol', exact: true })
    .selectOption('virtual-ctd-three-depths-v1');
  await page.getByRole('button', { name: 'Accept two-station survey', exact: true }).click();
  await page.waitForFunction(()=>window.__oceanSurvey()?.phase==='casts');
  await checkpoint(
    'Bridge chart admits both archived station depths and saves the matched survey plan'
  );
  await walkStation('sub');
  await page.getByRole('button', { name: 'Begin downcast', exact: true }).click();
  await page.waitForFunction(
    () => window.__oceanSurvey()?.cast?.ready===true,
    {},
    { timeout: 55000 }
  );
  await page.screenshot({ path: output + '/recovered-actual-cast.png' });
  await page.getByRole('button', { name: 'File recovered cast', exact: true }).click();
  await page.waitForFunction(()=>window.__oceanSurvey()?.active?.stationIndex===1);
  await checkpoint(
    'Actual normal-frame2/4/6m downcast recovers and commits first station to IndexedDB'
  );
  assert.equal((await qa.careerState()).active.casts.shelf.samples.length, 3);
  assert.deepEqual(report.errors, []);
  report.ok = true;
  await fs.writeFile(output + '/receipt.json', JSON.stringify(report, null, 2));
  console.log('PASS ' + output);
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
