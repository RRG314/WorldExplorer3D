import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PALAEONTOLOGY_STUDIES } from '../../app/js/campaign/palaeontology-career.js';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/palaeontology-career-20261102/world-${Date.now()}`;
let recovery = null,
  recoveredFrom = null;
if (process.env.WE3D_FOSSIL_RECOVERY) {
  const source = path.resolve(process.env.WE3D_FOSSIL_RECOVERY);
  assert.ok(
    source.startsWith(
      path.resolve('output/verification/palaeontology-career-20261102') + path.sep
    ) &&
      ['qa-fieldwork-backup.json', 'qa-fieldwork-failed-backup.json'].includes(
        path.basename(source)
      )
  );
  const bytes = await fs.readFile(source);
  recovery = JSON.parse(bytes);
  assert.ok(recovery.profile?.researchCareers?.palaeontology?.active);
  recoveredFrom = {
    source,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    scope: 'Actual field checkpoint; accepted completed actions retained.'
  };
}
const qa = await createFieldworkQaSession({
    output,
    careerId: 'palaeontology',
    walkLegMaximumDurationMs: 45000
  }),
  { page, report } = qa,
  offsets = { bed: 2.7, bench: 1.3 };
const face = async (slot) => {
  if ((await qa.careerState()).active.phase === 'photographs')
    await page.locator('[data-field-eye-level]').click();
  await page.waitForTimeout(100);
  await page.evaluate(async (slot) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      root = ctx.scene.getObjectByName('Field course · palaeontology'),
      object = root.getObjectByName(
        slot === 'layer' ? 'Fossil surrounding layer' : 'Fossil orientation subject'
      ),
      T = globalThis.THREE,
      p = new T.Box3().setFromObject(object).getCenter(new T.Vector3()),
      w = ctx.Walk.state.walker,
      c = ctx.camera.getWorldPosition(new T.Vector3());
    w.yaw = Math.atan2(p.x - w.x, p.z - w.z);
    w.lookYawOffset = 0;
    w.pitch = -Math.atan2(c.y - p.y, Math.hypot(p.x - w.x, p.z - w.z));
    ctx.renderer.domElement.focus({ preventScroll: true });
  }, slot);
  await page.waitForTimeout(200);
};
try {
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') + '/app/?diagnostics=1'
  );
  if (recovery) {
    await page.evaluate(async (data) => {
      const { createIndexedDbDiscoveryProfileStore } = await import(
        '/app/js/discovery/profile-store.js?v=5'
      );
      await createIndexedDbDiscoveryProfileStore().importData(data);
    }, recovery);
    report.recoveredFrom = recoveredFrom;
  }
  const currentVariant =
      recovery?.profile.researchCareers.palaeontology.active.variantId || 'campaign',
    variants = Object.entries(PALAEONTOLOGY_STUDIES),
    start = variants.findIndex(([id]) => id === currentVariant);
  await page.getByRole('button', { name: '⌖ Activities', exact: true }).click();
  await page.locator('[data-experience-id="career:palaeontologist"]').click();
  if (currentVariant !== 'campaign')
    await page.locator('[data-experience-variant]').selectOption(currentVariant);
  if (process.env.WE3D_FOSSIL_RELOCATE === '1') {
    assert.ok(recovery);
    await page.locator('[data-experience-recovery=relocate-course]').click();
    report.recoveryAction =
      'Explicit Move training site from the retained water-blocked checkpoint; earlier completed cases and all evidence are retained.';
  } else await page.locator('[data-experience-begin]').click();
  const initial = await qa.waitForCareer(currentVariant);
  if (process.env.WE3D_FOSSIL_RELOCATE === '1') {
    const moved = await qa.careerState(),
      old = recovery.profile.researchCareers.palaeontology;
    assert.deepEqual(moved.completed, old.completed);
    assert.notEqual(moved.active.runId, old.active.runId);
    assert.equal(moved.active.priorAttempts.at(-1).runId, old.active.runId);
    assert.equal(moved.active.phase, 'brief');
  }
  assert.equal(initial.fieldwork.presentation.colliders, 2);
  assert.ok(initial.fieldwork.presentation.vertices < 50000);
  await qa.record(
    'Fossil course admitted with two supported stations and bounded scene/model leases'
  );
  if (await page.locator('#quickTimeOfDay').isVisible()) {
    for (let i = 0; i < 6; i++) {
      if ((await page.locator('#quickTimeOfDay').getAttribute('data-mode')) === 'day') break;
      await page.locator('#quickTimeOfDay').click();
    }
  }
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.renderer.domElement.focus({ preventScroll: true });
  });
  if (process.env.WE3D_FOSSIL_REVIEW_ONLY === '1')
    report.scope =
      'Affected actual source Journal/Profile and restored-photo boundary only. Three completed physical cases and site relocation are imported from the actual completed source checkpoint, without replaying their procedures.';
  for (const [index, [variantId, study]] of (process.env.WE3D_FOSSIL_REVIEW_ONLY === '1'
    ? []
    : variants
  ).entries()) {
    if (index < start) continue;
    if (index > start) {
      await page.getByRole('button', { name: 'Choose next case', exact: true }).click();
      await page.locator('[data-experience-variant]').selectOption(variantId);
      await page.locator('[data-experience-begin]').click();
      const next = await qa.waitForCareer(variantId);
      assert.equal(next.worldSequence, initial.worldSequence);
      assert.equal(next.fieldwork.presentation.colliders, 2);
    }
    let state = await qa.careerState();
    if (state.active.phase === 'brief') {
      await qa.approach({ offsets, perimeterSide: 'west', dryApproach: true });
      await page.locator('select[name=form]').selectOption(study.form);
      await qa.submit('Record exposed form');
      await qa.record(`${variantId}: visible form inspected at the physical formation`);
    }
    state = await qa.careerState();
    if (state.active.phase === 'photographs') {
      if (await page.locator('.research-station[open]').count())
        await page.locator('[data-research-close]').click();
      for (const slot of ['layer', 'orientation']) {
        state = await qa.careerState();
        if (state.active.captures[slot]) continue;
        await qa.approach({
          stationId: 'bed',
          open: false,
          perimeterSide: 'west',
          dryApproach: true,
          offsets: { ...offsets, bed: slot === 'layer' ? 2.7 : 1.8 }
        });
        await face(slot);
        if (variantId === 'campaign' && slot === 'layer') {
          const revision = state.revision;
          await page.evaluate(async () => {
            const { ctx } = await import('/app/js/shared-context.js?v=55');
            ctx.Walk.state.walker.yaw += Math.PI;
          });
          await page.waitForTimeout(150);
          await page.locator('[data-field-shutter=layer]').click();
          await page
            .locator('.field-photo-toolbar [role=status]')
            .filter({ hasText: /Aim|obscured/ })
            .waitFor();
          assert.equal((await qa.careerState()).revision, revision);
          await face(slot);
          await qa.record(
            'Shutter rejects an out-of-frame subject without saving progress or pixels'
          );
        }
        await qa.submit('', () => page.locator(`[data-field-shutter=${slot}]`).click());
        await page.screenshot({ path: `${output}/${variantId}-${slot}-camera.png` });
        await qa.record(
          `${variantId}: actual rendered ${slot} photograph saved with its pixels and field context`
        );
      }
      await page.locator('[data-research-station]').click();
      await page.locator('input[name=layer]').fill(study.layer);
      await page.locator('select[name=orientation]').selectOption(study.orientation);
      await qa.submit('Save orientation card');
      await qa.record(`${variantId}: layer and axis recorded before touching the cast`);
    }
    state = await qa.careerState();
    if (state.active.phase === 'preparation') {
      if (!(await page.locator('.research-station[open]').count()))
        await qa.approach({ offsets, perimeterSide: 'west', dryApproach: true });
      for (const [position, [zone, tool]] of [
        ['outer-matrix', 'blunt-probe'],
        ['margin', 'soft-brush']
      ].entries())
        if (state.active.preparation.length <= position) {
          await page.locator('select[name=zone]').selectOption(zone);
          await page.locator('select[name=tool]').selectOption(tool);
          await qa.submit('Expose bounded patch');
          state = await qa.careerState();
        }
      if (!state.active.support) {
        await page.locator('select[name=support]').selectOption(study.support);
        await qa.submit('Support and label specimen');
      }
      await page.locator('[data-research-close]').click();
      await face('orientation');
      await page.screenshot({ path: `${output}/${variantId}-prepared-bed.png` });
      await page.locator('[data-research-station]').click();
      await qa.submit('Lift supported specimen');
      await qa.record(
        `${variantId}: diagnostic surface preserved, support labelled and exact specimen lifted`
      );
    }
    state = await qa.careerState();
    if (state.active.phase === 'comparison') {
      if (variantId === currentVariant) {
        const before = await qa.snapshot();
        await page.locator('[data-research-pause]').click();
        await page.locator('#exploreBtn').click();
        await page.locator('#fWorldDiscovery').click();
        await page.locator('#sandboxNearbyActivities').click();
        await page.getByRole('tab', { name: 'Careers', exact: true }).click();
        await page.locator('[data-experience-id="career:palaeontologist"]').click();
        await page.locator('[data-experience-begin]').click();
        const resumed = await qa.waitForCareer(variantId);
        assert.equal(resumed.worldSequence, before.worldSequence);
        assert.deepEqual(resumed.fieldwork.items, before.fieldwork.items);
        await qa.record(
          'Public Activities pause/resume keeps the same world, prepared specimen and saved photographs'
        );
      }
      await qa.approach({ offsets, perimeterSide: 'west', dryApproach: true });
      state = await qa.careerState();
      for (const method of ['structure', 'surface', 'sediment'])
        if (!state.active.tests[method])
          await qa.submit('', () =>
            page.locator(`[data-research-action=examine][data-method=${method}]`).click()
          );
      await page.locator('select[name=structure]').selectOption(study.traits.structure);
      await page.locator('select[name=surface]').selectOption(study.traits.surface);
      await page.locator('select[name=classification]').selectOption(study.classification);
      await qa.submit('Save morphology comparison');
      await qa.record(
        `${variantId}: structure, preserved surface and enclosing sediment compared using the actual Backpack specimen`
      );
    }
    state = await qa.careerState();
    if (state.active.phase === 'interpretation') {
      if (!(await page.locator('.research-station[open]').count()))
        await qa.approach({ offsets, perimeterSide: 'west', dryApproach: true });
      await page.locator('select[name=interpretation]').selectOption(study.interpretation);
      await page.locator('select[name=limitation]').selectOption(study.limitation);
      await qa.submit('Save fossil report and museum plate');
      await qa.record(
        `${variantId}: evidence-based environment report and retained limitation saved`
      );
    }
    assert.equal((await qa.careerState()).active.phase, 'complete');
    await page.screenshot({ path: `${output}/${variantId}-report.png` });
  }
  if (process.env.WE3D_FOSSIL_PROFILE_ONLY !== '1') {
    const complete = await qa.careerState();
    assert.equal(Object.keys(complete.completed).length, 3);
    if (process.env.WE3D_FOSSIL_REVIEW_ONLY === '1') {
      await page.locator('#exploreBtn').click();
      await page.locator('#fWorldDiscovery').click();
      await page.locator('[data-discovery-tab=journal]').click();
    } else await page.getByRole('button', { name: 'View Journal', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelectorAll('#discoveryJournalList .fossil-report').length === 3,
      {},
      { timeout: 10000 }
    );
    const reports = page
      .locator('#discoveryJournalList .discoveryJournalEvent')
      .filter({ has: page.locator('.fossil-report') });
    assert.equal(await reports.count(), 3);
    if (process.env.WE3D_FOSSIL_RELOCATE === '1')
      assert.equal(await page.locator('#discoveryJournalList .fossil-archive').count(), 1);
    await reports.first().locator('summary').click();
    await reports.first().locator('[data-research-photo]').first().click();
    await reports.first().locator('.field-photo-record img').waitFor();
    const image = await reports
      .first()
      .locator('.field-photo-record img')
      .evaluate((el) => ({ loaded: el.complete && el.naturalWidth >= 64, src: el.src }));
    assert.equal(image.loaded, true);
    await page.screenshot({ path: `${output}/journal-restored-photograph.png` });
    await qa.record(
      'Three actual fossil reports and a restored original photograph visible in Journal'
    );
  } else {
    report.scope =
      'Affected Profile refresh/keyboard focus/visible badge boundary only; the accepted Journal and all completed physical cases are reused.';
    report.reusedJournal = 'world-1793664257970/journal-restored-photograph.png';
    await page.locator('#exploreBtn').click();
    await page.locator('#fWorldDiscovery').click();
  }
  await page.locator('#discoveryProfileBtn').click();
  const badge = page.locator('[data-explorer-badge=fossil-recorder]');
  await badge.waitFor({ state: 'attached' });
  const group = page.locator('[data-profile-group=badges]'),
    summary = group.locator('summary');
  await summary.focus();
  if (!(await group.evaluate((el) => el.open))) await page.keyboard.press('Enter');
  const oldBadge = await badge.elementHandle();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.toggleWorldDiscoveryJournal(true);
  });
  await page.waitForFunction((el) => !el.isConnected, oldBadge, { timeout: 10000 });
  assert.equal(await group.evaluate((el) => el.open), true);
  assert.equal(await summary.evaluate((el) => el === document.activeElement), true);
  await badge.scrollIntoViewIfNeeded();
  const badgeBox = await badge.boundingBox();
  assert.ok(badgeBox.y >= 0 && badgeBox.y + badgeBox.height <= 800);
  report.profileBoundary = { expandedAfterRefresh: true, summaryFocusRetained: true, badgeBox };
  await page.screenshot({ path: `${output}/profile-badge.png` });
  await qa.record('Fossil Recorder badge visible in the existing Profile');
  report.saved = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      data = await ctx.discoveryProfileStore.exportData();
    return {
      specimens: data.items.filter(
        (row) => row.researchLabel?.careerId === 'palaeontology' && row.tradeable === false
      ).length,
      photos: data.researchMedia.filter((row) => row.careerId === 'palaeontology').length,
      sceneRoots: ctx.scene.children.filter((row) => row.name === 'Field course · palaeontology')
        .length,
      colliders: ctx.dynamicBuildingColliders.filter((row) =>
        row.sourceBuildingId?.startsWith('research-palaeontology:')
      ).length
    };
  });
  assert.deepEqual(report.saved, { specimens: 3, photos: 6, sceneRoots: 1, colliders: 2 });
  await qa.succeed();
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
