import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source =
    process.env.WE3D_DOCUMENTARY_RECOVERY ||
    'output/verification/pilot-career-20261103/review-1793741706007/qa-fieldwork-backup.json',
  backup = JSON.parse(await fs.readFile(source)),
  output = 'output/verification/documentary-career-20261103/world-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'documentary',
    maximumDurationMs: 14 * 60 * 1000,
    walkLegMaximumDurationMs: 45000,
  }),
  { page, report } = qa;
async function read() {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return (await ctx.discoveryProfileStore.getProfile()).threeViews;
  });
}
async function focus() {
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.toggleWorldDiscoveryJournal(false);
    ctx.renderer.domElement.focus({ preventScroll: true });
  });
}
async function panel() {
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.openWorldDiscoverySection('today');
  });
}
async function action(id) {
  await page.locator(`[data-photo-action="${id}"]`).click();
  await page.waitForFunction(() => !window.__docSnapshot().busy);
}
async function record(name) {
  await qa.record(name);
  await fs.writeFile(
    output + '/possessions.json',
    (await page.evaluate(() => localStorage.getItem('world-explorer:character-backpack:v3'))) +
      '\n',
    { mode: 0o600 }
  );
}
async function walk(point) {
  await focus();
  const route = await page.evaluate(async (p) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { planFieldworkWalk } = await import('/scripts/verification/fieldwork-walk-plan.mjs');
    return planFieldworkWalk(ctx, p, {
      spacingMeters: 0.9,
      maximumCells: 18000,
      paddingMeters: 12,
      stepHeightMeters: 0.25,
      includeUrbanActors: true,
    });
  }, point);
  for (const p of route) await qa.walkTo(p, 0.28);
}
async function aim(target) {
  await page.evaluate(async (target) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      w = ctx.Walk.state.walker,
      c = w;
    w.yaw = Math.atan2(target.x - c.x, target.z - c.z);
    w.lookYawOffset = 0;
    w.pitch = Math.atan2(target.y - c.y, Math.hypot(target.x - c.x, target.z - c.z));
  }, target);
  await page.waitForTimeout(300);
  const diagnostic = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { inspectPhotoSubject } = await import('/app/js/campaign/three-views-capture.js'),
      w = ctx.Walk.state.walker;
    let actual;
    try {
      actual = inspectPhotoSubject(ctx, { regionId: 'diagnostic', regionLabel: 'diagnostic' });
    } catch (e) {
      actual = { error: e.message };
    }
    return {
      walker: { x: w.x, y: w.y, z: w.z, yaw: w.yaw, pitch: w.pitch, offset: w.lookYawOffset },
      view: ctx.Walk.state.view,
      camera: ctx.camera.position.toArray(),
      direction: ctx.camera.getWorldDirection(new THREE.Vector3()).toArray(),
      actual,
    };
  });
  report.lastAim = diagnostic;
  console.log('Actual aim ' + JSON.stringify(diagnostic));
}
try {
  report.scope =
    'Connected actual source Documentary career: normal keyboard walking and normal rendered shutter frames; controlled facing and public view/daylight controls. No actor/camera position, velocity or physics writes, teleport or time advance. Old camera/occlusion/media/quota matrix reused; these are new first-job photographs in the changed entry journey. Captured images must be inspected before finishing the story.';
  report.source = source;
  report.inspectionFile = output + '/inspected-story.json';
  const possessions = await fs.readFile(
    'output/verification/pilot-career-20261103/world-1793741598882/possessions.json',
    'utf8'
  );
  await page.addInitScript(
    (raw) => localStorage.setItem('world-explorer:character-backpack:v3', raw),
    possessions
  );
  await page.goto('http://127.0.0.1:4192/app/?diagnostics=1');
  await page.evaluate(async (b) => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
      '/app/js/discovery/profile-store.js?v=5'
    );
    await createIndexedDbDiscoveryProfileStore().importData(b);
  }, backup);
  await page.getByRole('button', { name: '⌖ Activities', exact: true }).click();
  await page.locator('[data-experience-id="career:documentary-explorer"]').click();
  if (await page.locator('[data-experience-variant]').count())
    await page.locator('[data-experience-variant]').selectOption('campaign');
  await page.locator('[data-experience-begin]').click();
  await qa.waitForCareer('campaign');
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    window.__docSnapshot = () => ctx.worldDiscoveryRuntime.threeViews.snapshot();
    if (ctx.getCurrentTravelMode() !== 'walk') ctx.setTravelMode('walk');
  });
  await focus();
  for (let i = 0; i < 3; i++) {
    if (
      await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        return ctx.Walk.state.view === 'first';
      })
    )
      break;
    await page.keyboard.press('KeyC');
  }
  await page.waitForTimeout(400);
  for (let i = 0; i < 5; i++) {
    if (
      await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        return ctx.timeOfDay === 'day';
      })
    )
      break;
    await page.locator('#quickTimeOfDay').click();
  }
  await focus();
  let state = await read();
  if (state.phase === 'available') {
    await panel();
    await action('accept:photo');
    await record('Selected Documentary starts its photo job without First Bearings');
    state = await read();
  }
  let plan;
  if (!['complete', 'review'].includes(state.phase)) {
    plan = await page.evaluate(async (expected) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55'),
        { chooseDocumentaryViewpoints } = await import(
          '/scripts/verification/documentary-viewpoints.mjs'
        );
      return chooseDocumentaryViewpoints(ctx, expected);
    }, state.subject?.id || null);
    report.viewpointAdmission = plan;
    await fs.writeFile(output + '/viewpoints.json', JSON.stringify(plan, null, 2) + '\n');
    if (state.phase === 'choose') {
      await walk(plan.viewpoints.context);
      await aim(plan.target);
      await panel();
      await action('aim');
      await aim(plan.target);
      await page.keyboard.press('KeyE');
      await page.waitForFunction(
        () => window.__docSnapshot().phase === 'framing' || !!window.__docSnapshot().message,
        null,
        { timeout: 5000 }
      );
      assert.equal(
        (await read()).phase,
        'framing',
        await page.evaluate(() => window.__docSnapshot().message)
      );
      assert.equal((await read()).subject.id, plan.subjectId);
      await record('Actual clear frontage selected after walking to the street viewpoint');
    }
    for (const kind of ['context', 'detail', 'setting']) {
      state = await read();
      if (state.views.some((v) => v.kind === kind)) continue;
      await walk(plan.viewpoints[kind]);
      await aim(plan.target);
      await panel();
      await action('arm:' + kind);
      await aim(plan.target);
      await page.keyboard.press('KeyE');
      await page.waitForFunction(
        () => window.__docSnapshot().candidate || !!window.__docSnapshot().message,
        null,
        { timeout: 15000 }
      );
      assert.equal(
        await page.evaluate(() => window.__docSnapshot().candidate),
        true,
        await page.evaluate(() => window.__docSnapshot().message)
      );
      await action('keep');
      await record(
        'Actual ' + kind + ' photograph kept through normal-frame shutter and profile transaction'
      );
    }
  }
  state = await read();
  const album = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.discoveryProfileStore.getThreeViewsAlbum();
  });
  assert.equal(album.photos.length, 3);
  for (const photo of album.photos)
    await fs.writeFile(
      output + '/photo-' + photo.kind + '.jpg',
      Buffer.from(photo.dataUrl.split(',')[1], 'base64')
    );
  await record('Three actual saved photographs ready for visual review');
  console.log(
    'INSPECT actual JPEGs now, then write ' +
      report.inspectionFile +
      ' within 90 seconds. No finish is saved before inspection.'
  );
  let story,
    deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      story = JSON.parse(await fs.readFile(report.inspectionFile));
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await page.waitForTimeout(500);
  }
  if (!story?.approveViews)
    throw Error(
      'Stopped at the durable three-photo review checkpoint; image inspection is still required.'
    );
  if ((await read()).phase === 'review') {
    await panel();
    await action('finish');
    await record('Visually inspected three-view album completed once');
  }
  await panel();
  await action('next');
  await page.locator('[data-experience-variant]').selectOption('field-story');
  await page.locator('[data-experience-begin]').click();
  await qa.waitForCareer('field-story');
  const before = await read(),
    sequence = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx._worldLoadSequence;
    });
  if (!before.story) {
    await page.locator('[name=title]').fill(story.title);
    await page.locator('[name=question]').fill(story.question);
    await page.getByRole('button', { name: 'Choose the story photographs', exact: true }).click();
    await page.waitForFunction(
      () => window.__docSnapshot().phase === 'select' && !window.__docSnapshot().busy
    );
  }
  if ((await read()).story.phase === 'select') {
    for (const [i, kind] of story.order.entries())
      await page.locator(`[name=order-${i}]`).selectOption(kind);
    await page.getByRole('button', { name: 'Use this sequence', exact: true }).click();
    await page.waitForFunction(
      () => window.__docSnapshot().phase === 'edit' && !window.__docSnapshot().busy
    );
    await record('Visual question and original photograph sequence saved');
  }
  if ((await read()).story.phase === 'edit') {
    for (const [k, v] of Object.entries(story.captions))
      await page.locator(`[name=caption-${k}]`).fill(v);
    await page.locator('[name=conclusion]').fill(story.conclusion);
    await page.getByRole('button', { name: 'Review story', exact: true }).click();
    await page.waitForFunction(
      () => window.__docSnapshot().phase === 'review' && !window.__docSnapshot().busy
    );
    await record('Current source captions and evidence-limited conclusion saved for review');
  }
  if ((await read()).story.phase === 'review') {
    await action('story-publish');
    await page.waitForFunction(
      () => window.__docSnapshot().phase === 'complete' && !window.__docSnapshot().busy
    );
    await record('Actual source photo story and immutable Journal record saved');
  }
  const after = await read();
  for (const key of Object.keys(before).filter((k) => !['story', 'revision'].includes(k)))
    assert.deepEqual(after[key], before[key]);
  assert.equal(
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx._worldLoadSequence;
    }),
    sequence
  );
  await page.screenshot({ path: output + '/story-complete.png' });
  const download = page.waitForEvent('download');
  await action('story-export');
  await (await download).saveAs(output + '/field-story.html');
  report.final = after;
  report.export = true;
  report.noNewWorldForEditing = true;
  await qa.succeed();
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
