import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import {
  bindOceanQaState,
  walkOceanStation,
  pilotOceanSub,
  sailOceanStation,
} from './oceanography-qa-driver.mjs';
const source = process.env.WE3D_EXPLORER_RECOVERY,
  possessions = process.env.WE3D_EXPLORER_POSSESSIONS;
if (!source || !possessions)
  throw Error('Choose the genuine Explorer and possessions checkpoints.');
const backup = JSON.parse(await fs.readFile(source)),
  output = 'output/verification/explorer-career-20261103/coast-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'explorer',
    maximumDurationMs: 18 * 60 * 1000,
  }),
  { page, report } = qa;
const state = () => page.evaluate(() => window.__explorerCoast());
async function record(name) {
  await qa.record(name);
  await fs.writeFile(output + '/coast-state.json', JSON.stringify(await state(), null, 2) + '\n');
  await fs.writeFile(
    output + '/possessions.json',
    (await page.evaluate(() => localStorage.getItem('world-explorer:character-backpack:v3'))) +
      '\n',
    { mode: 0o600 }
  );
  console.log('Coast checkpoint: ' + name);
}
async function control(prefix, domain) {
  await page
    .locator('#' + prefix + (domain === 'coastal' ? 'Chapter' : 'Investigation'))
    .evaluate((e) => (e.open = true));
  const button = page.locator('#' + prefix + (domain === 'coastal' ? 'Action' : 'Investigate'));
  await button.click();
  await page.waitForFunction((domain) => !window.__explorerCoast()[domain]?.busy, domain);
  const s = (await state())[domain];
  assert.equal(s.failure, false, s.message);
}
async function swim(goal) {
  const result = await page.evaluate(async (goal) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      diver = ctx.oceanMode.diver,
      old = ctx.readControlActions,
      start = performance.now();
    let actions = {};
    ctx.readControlActions = (domain) => (domain === 'ocean' ? actions : old?.(domain) || {});
    try {
      while (performance.now() - start < 110000) {
        if (ctx.paused || !diver.active)
          throw Error('The normal-frame swim lost its active diver.');
        const actor = diver.navigationActor(),
          p = actor.position,
          dx = goal.x - p.x,
          dz = goal.z - p.z,
          d = Math.hypot(dx, dz),
          dy = goal.y - p.y,
          face = goal.face || goal,
          yaw = d > 0.7 ? Math.atan2(dx, dz) : Math.atan2(face.x - p.x, face.z - p.z),
          error = Math.atan2(Math.sin(yaw - actor.yaw), Math.cos(yaw - actor.yaw));
        if (
          d < 0.85 &&
          Math.abs(dy) < 0.3 &&
          Math.abs(error) < 0.6 &&
          actor.speed < 0.5 &&
          Math.abs(actor.vy) < 0.5
        )
          return { ok: true, position: p, seconds: (performance.now() - start) / 1000 };
        actions = {
          turn: Math.max(-1, Math.min(1, error * 2)),
          move: d > 0.65 && Math.abs(error) < 0.25 ? Math.min(0.8, d) : 0,
          vertical: Math.abs(dy) > 0.1 ? Math.max(-1, Math.min(1, dy * 1.5)) : 0,
        };
        await new Promise(requestAnimationFrame);
      }
      return { ok: false, goal, actor: diver.navigationActor() };
    } finally {
      actions = {};
      ctx.readControlActions = old;
    }
  }, goal);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}
try {
  report.scope =
    'Connected missing H06–H09 chapters on the same genuine Explorer profile. Existing source and accepted procedure matrices retained. Published deck routes use real keyboard/frames; vessel/sub/diver use bounded normal-frame scripted control actions. No actor/camera/body position writes, controller time advance or reconstructed completion history.';
  report.source = source;
  await page.addInitScript(
    (raw) => localStorage.setItem('world-explorer:character-backpack:v3', raw),
    await fs.readFile(possessions, 'utf8')
  );
  await page.goto('http://127.0.0.1:4192/app/?diagnostics=1');
  await page.evaluate(async (b) => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
      '/app/js/discovery/profile-store.js?v=5'
    );
    await createIndexedDbDiscoveryProfileStore().importData(b);
  }, backup);
  await bindOceanQaState(page);
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    window.__explorerCoast = () => ({
      coastal: ctx.marineResearch?.coastal.snapshot(),
      investigation: ctx.marineResearch?.investigation.snapshot(),
      reef: ctx.marineResearch?.snapshot(),
      voyage: ctx.oceanVoyage?.current,
      boat: ctx.boatMode?.active,
      moored: ctx.boatMode?.moored,
      deck: ctx.boatDeck?.active,
      sub: ctx.oceanMode?.active,
      diver: ctx.oceanMode?.diver?.active,
    });
  });
  await page.getByRole('button', { name: '⌖ Activities', exact: true }).click();
  await page.locator('[data-experience-id="career:explorer"]').click();
  await page.locator('[data-experience-begin]').click();
  await qa.waitForCareer('campaign');
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    await ctx.worldDiscoveryRuntime.ui.refreshData();
  });
  await page.locator('[data-explorer-target=coast]:visible').click();
  await page.waitForFunction(
    () => {
      const s = window.__explorerCoast();
      return (s.deck || s.sub) && s.coastal?.ready;
    },
    null,
    { timeout: 180000 }
  );
  if (!backup.events.some((e) => e.eventId === 'coastal-departure-v1:plan'))
    await record('Explorer next action opens the existing coastal vessel owner');
  else report.reusedAcceptedPrefix = 'coast-1793747616117/failed.json';
  let s = await state();
  if (!s.coastal.completed) {
    assert.equal(s.deck, true);
    if (!s.moored) await page.locator('#researchDeckMoor').click();
    if (!s.reef.started) {
      await walkOceanStation(page, 'lab');
      await page.locator('#marineResearchLab').click();
      await page.waitForFunction(() => window.__explorerCoast().reef.started);
    }
    s = await state();
    if (s.coastal.phase === 'available') {
      await walkOceanStation(page, 'chart');
      await control('coastalDeck', 'coastal');
      await page.waitForFunction(() =>
        window.__explorerCoast().coastal.choices?.some((c) => c.allowed)
      );
      const choice =
        (await state()).coastal.choices.find((c) => c.id === 'shelf' && c.allowed) ||
        (await state()).coastal.choices.find((c) => c.allowed);
      assert.ok(choice);
      await page.locator('#coastalDeckSite').selectOption(choice.id);
      await control('coastalDeck', 'coastal');
      await record('Actual Navigation chart plan and current modeled conditions saved');
    }
    s = await state();
    if (s.coastal.phase === 'station') {
      if (s.coastal.distance > 70) {
        await page.locator('#researchDeckHelm').click();
        report.stationSailing = await sailOceanStation(page, s.coastal.site);
        await page.locator('#researchDeckMoor').click();
        await page.getByRole('button', { name: 'Explore research vessel', exact: true }).click();
      }
      await walkOceanStation(page, 'chart');
      await control('coastalDeck', 'coastal');
      await record('Same vessel moored at the accepted study station');
    }
    if ((await state()).coastal.phase === 'ladder') {
      await walkOceanStation(page, 'dive');
      await control('coastalDeck', 'coastal');
      await record('Actual return ladder reached and checked');
    }
    if ((await state()).coastal.phase === 'cradle') {
      await walkOceanStation(page, 'sub');
      await control('coastalDeck', 'coastal');
      await record('Same vessel’s actual loaded submarine prepared at its cradle');
    }
    if ((await state()).coastal.phase === 'launch') {
      await walkOceanStation(page, 'sub');
      await page.locator('#researchDeckAction').click();
      await page.waitForFunction(() => window.__explorerCoast().sub, null, { timeout: 90000 });
      await control('coastalOcean', 'coastal');
      await record('Same identified submarine deployed; Coastal Departure saved');
    }
  }
  await page.waitForFunction(() => window.__explorerCoast().investigation?.ready);
  s = await state();
  if (s.investigation.phase === 'available') {
    await control('coastalOcean', 'investigation');
    await record('Original seabed investigation opened from the completed departure');
  }
  const contacts = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.oceanMode.habitat.plan.contacts;
    }),
    u = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.METERS_PER_WORLD_UNIT || 1;
    });
  assert.equal(contacts.length, 3);
  const center = {
    x: contacts.reduce((n, t) => n + t.x / 3, 0),
    z: contacts.reduce((n, t) => n + t.z / 3, 0),
    y: -12 / u,
  };
  if ((await state()).investigation.phase === 'sonar')
    for (const target of contacts) {
      if ((await state()).investigation.contacts.some((e) => e.metadata.target.id === target.id))
        continue;
      await page.locator('#coastalOceanContact').selectOption(target.id);
      await pilotOceanSub(page, { ...center, face: target });
      await control('coastalOcean', 'investigation');
      await record('Actual normal-frame sonar contact ' + target.id + ' saved');
    }
  if ((await state()).investigation.phase === 'chart') {
    await control('coastalOcean', 'investigation');
    await page.screenshot({ path: output + '/three-contact-chart.png' });
    await record('Original three-contact annotated chart saved');
  }
  if ((await state()).investigation.phase === 'selection') {
    const choices = (await state()).investigation.choices,
      choice = choices.find((c) => c.id === 'case' && c.allowed) || choices.find((c) => c.allowed);
    assert.ok(choice);
    await page.locator('#coastalOceanContact').selectOption(choice.id);
    await control('coastalOcean', 'investigation');
    await record('Actual shallow, visible dive target selected');
  }
  s = await state();
  const target = contacts.find((t) => t.id === s.investigation.selected);
  assert.ok(target);
  if (s.investigation.phase === 'dive') {
    if (!s.diver) {
      await pilotOceanSub(page, {
        x: target.x + 12 / u,
        z: target.z - 4 / u,
        y: Math.max(-12 / u, target.y + 2.4 / u),
        face: target,
      });
      await page.locator('#oceanDiverToggle').click();
      await page.waitForFunction(() => window.__explorerCoast().diver);
    }
    for (const offset of [
      [3, -2],
      [-2, -2],
    ]) {
      s = await state();
      if (s.investigation.views.length >= (offset[0] === 3 ? 1 : 2)) continue;
      report.swims ??= [];
      report.swims.push(
        await swim({
          x: target.x + offset[0] / u,
          z: target.z + offset[1] / u,
          y: target.y + 2.1 / u,
          face: target,
        })
      );
      await control('coastalDiver', 'investigation');
      await page.screenshot({
        path: output + '/direct-view-' + (await state()).investigation.views.length + '.png',
      });
      await record(
        'Actual diver viewpoint ' + (await state()).investigation.views.length + ' saved'
      );
    }
  }
  if ((await state()).investigation.phase === 'return') {
    const goal = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55'),
        s = ctx.oceanMode.submarine,
        p = s.position;
      return {
        x: p.x + (Math.cos(s.yaw) * 5.5) / (ctx.METERS_PER_WORLD_UNIT || 1),
        z: p.z - (Math.sin(s.yaw) * 5.5) / (ctx.METERS_PER_WORLD_UNIT || 1),
        y: p.y + 1,
        face: p,
      };
    });
    await swim(goal);
    await page.locator('#oceanDiverToggle').click();
    await page.waitForFunction(
      () => !window.__explorerCoast().diver && window.__explorerCoast().investigation.diver
    );
    await record('Unaided normal-frame return to the same parked submarine saved');
  }
  s = await state();
  if (s.investigation.phase === 'report') {
    if (s.sub) {
      const goal = await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55'),
          m = ctx.oceanMode,
          { oceanParentPosition } = await import('/app/js/ocean/stream-runtime.js'),
          p = oceanParentPosition(m, ctx.SCALE),
          u = ctx.METERS_PER_WORLD_UNIT || 1,
          yaw = ctx.oceanVoyage.current.ship.yaw + (p.yawOffset || 0);
        return {
          x: p.x + (Math.cos(yaw) * 16) / u,
          z: p.z - (Math.sin(yaw) * 16) / u,
          y: 0.08 - 12 / u,
        };
      });
      await pilotOceanSub(page, goal);
      await page.locator('#oceanVoyageRecover').click();
      await page.waitForFunction(
        () => window.__explorerCoast().deck && !window.__explorerCoast().sub,
        null,
        { timeout: 90000 }
      );
    }
    await walkOceanStation(page, 'lab');
    await page.locator('#coastalDeckInvestigation').evaluate((e) => (e.open = true));
    await page.locator('#coastalDeckConclusion').selectOption(target.id);
    await control('coastalDeck', 'investigation');
    await record('Supported original coastal report saved at the same vessel wet lab');
  }
  assert.equal((await state()).investigation.completed, true);
  assert.equal((await state()).voyage.id, (await state()).coastal.plan.metadata.voyageId);
  await page.screenshot({ path: output + '/coastal-complete.png' });
  await qa.succeed();
} catch (error) {
  try {
    await fs.writeFile(
      output + '/coast-state-failed.json',
      JSON.stringify(await state(), null, 2) + '\n'
    );
    await fs.writeFile(
      output + '/possessions.json',
      (await page.evaluate(() => localStorage.getItem('world-explorer:character-backpack:v3'))) +
        '\n',
      { mode: 0o600 }
    );
  } catch {}
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
