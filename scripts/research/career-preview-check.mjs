import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createFieldworkQaSession } from '../verification/fieldwork-qa-session.mjs';
const output = path.resolve(`output/research/career-world-20261105/preview-${Date.now()}`);
const qa = await createFieldworkQaSession({
  output,
  maximumDurationMs: 180000,
  careerId: 'explorer',
});
const page = qa.page,
  report = {
    scope:
      'Interactive design simulation and original native contracts; no fieldwork or release acceptance.',
    checks: [],
    images: [],
  };
const url = 'http://127.0.0.1:4192/docs/career-world-integration/index.html';
async function state() {
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()));
}
async function visit(screen) {
  if (await page.locator('#nav').isHidden()) await page.locator('#menuBtn').click();
  await page.locator(`#nav [data-screen="${screen}"]`).click();
  assert.equal((await state()).screen, screen);
  report.checks.push(`screen:${screen}`);
}
try {
  await page.goto(url);
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  if (process.env.WE3D_PREVIEW_NATIVE_ONLY === '1') {
    await page.locator('#nativeBtn').click();
    await page.waitForFunction(() => window.nativePrototypeResult);
    assert.equal(await page.evaluate(() => window.nativePrototypeResult.ok), true);
    report.checks.push('final-native-browser-contracts');
    await page.screenshot({ path: path.join(output, 'native-results.png'), fullPage: true });
  } else {
    if (process.env.WE3D_PREVIEW_VISUAL_ONLY !== '1') {
      for (const model of ['A', 'B', 'C', 'D']) {
        await page.selectOption('#model', model);
        assert.equal((await state()).model, model);
        report.checks.push(`model:${model}`);
      }
      for (const intro of ['A', 'B', 'C']) {
        await page.selectOption('#intro', intro);
        await page.locator('[data-action=intro]').click();
        assert.equal((await state()).screen, 'intro');
        report.checks.push(`intro:${intro}`);
      }
      await page.selectOption('#model', 'C');
      await page.selectOption('#intro', 'B');
      await visit('careers');
      assert.equal(await page.locator('[data-career]').count(), 20);
      await page.locator('[data-career="career:geologist"]').click();
      await page.locator('[data-action=focus]').click();
      await page.locator('#prepared').check();
      await page.locator('#view [data-screen=play]').click();
      await page.locator('[data-action=record]').click();
      await page.locator('[data-action=review]').click();
      assert.equal((await state()).reviewed, true);
      await page.locator('[data-screen=switch]').first().click();
      await page.locator('[data-career="career:racer"]').click();
      await page.locator('[data-action=focus]').click();
      assert.equal((await state()).recorded, true);
      report.checks.push('focus-switch-keeps-preview-result');
      for (const screen of [
        'worlds',
        'experiences',
        'kit',
        'progress',
        'qualifications',
        'geology',
        'mining',
        'store',
        'crew',
        'home',
        'travel',
        'controls',
        'journal',
      ])
        await visit(screen);
      await visit('store');
      await page.locator('[data-action=shop]').click();
      assert.equal((await state()).shop, true);
      await visit('crew');
      await page.locator('[data-action=crew]').click();
      assert.equal((await state()).crew, true);
      await visit('travel');
      for (const world of ['earth', 'ocean', 'space', 'moon']) {
        await page.locator(`[data-world=${world}]`).click();
        assert.equal((await state()).world, world);
      }
      report.checks.push('four-world-contexts');
      await page.locator('#nativeBtn').click();
      await page.waitForFunction(() => window.nativePrototypeResult);
      assert.equal(await page.evaluate(() => window.nativePrototypeResult.ok), true);
      await page.locator('#closeNative').click();
      report.checks.push('native-five-prototypes-browser');
    }
    await page.locator('#resetBtn').click();
    await page.locator('#view [data-screen=careers]').first().click();
    await page.locator('[data-career="career:geologist"]').click();
    for (const composition of (process.env.WE3D_PREVIEW_COMPOSITIONS || 'field,atlas,desk').split(
      ','
    )) {
      await page.selectOption('#composition', composition);
      for (const viewport of [
        { width: 1440, height: 1000 },
        { width: 390, height: 844 },
        { width: 844, height: 390 },
      ]) {
        await page.setViewportSize(viewport);
        await page.selectOption('#device', viewport.width === 390 ? 'phone' : 'desktop');
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(100);
        const name = `${composition}-${viewport.width}.png`;
        await page.screenshot({ path: path.join(output, name), fullPage: true });
        report.images.push(name);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
          `${name}: horizontal page overflow`
        );
        assert.equal(
          await page
            .locator('#view img')
            .evaluateAll((imgs) => imgs.every((i) => i.complete && i.naturalWidth > 0)),
          true,
          `${name}: missing image`
        );
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.selectOption('#device', 'desktop');
    await page.selectOption('#composition', 'atlas');
    await visit('worlds');
    await page.locator('[data-world=earth]').click();
    await page.locator('[data-screen=play]').first().click();
    await page.screenshot({ path: path.join(output, 'atlas-play.png'), fullPage: true });
    await page.selectOption('#composition', 'desk');
    await visit('journal');
    await page.screenshot({ path: path.join(output, 'desk-journal.png'), fullPage: true });
  }
  assert.deepEqual(qa.report.errors, []);
  report.ok = true;
} catch (e) {
  report.ok = false;
  report.failure = e.stack;
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  report.pageErrors = qa.report.errors;
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await qa.close();
  console.log(JSON.stringify({ output, ...report }, null, 2));
}
