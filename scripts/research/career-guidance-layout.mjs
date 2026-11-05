import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createFieldworkQaSession } from '../verification/fieldwork-qa-session.mjs';
const output = path.resolve(`output/research/career-world-20261105/guidance-layout-${Date.now()}`),
  qa = await createFieldworkQaSession({ output, careerId: 'explorer', maximumDurationMs: 90000 }),
  page = qa.page;
const report = {
  scope:
    'Original tutorial UI + actual shared styles; controlled presentation fixture, not a source-world journey.',
  checks: [],
};
try {
  await page.goto('http://127.0.0.1:4192/docs/career-world-integration/index.html');
  for (const viewport of process.env.WE3D_GUIDANCE_LANDSCAPE_ONLY === '1'
    ? [{ width: 844, height: 390 }]
    : [
        { width: 1280, height: 800 },
        { width: 390, height: 844 },
        { width: 844, height: 390 },
      ])
    for (const scale of process.env.WE3D_GUIDANCE_LARGE_ONLY === '1' ? [2] : [1, 2]) {
      await page.setViewportSize(viewport);
      await page.setContent(
        `<link rel="stylesheet" href="/styles/world-explorer-tokens.css"><link rel="stylesheet" href="/app/styles/tutorial.css"><link rel="stylesheet" href="/app/styles/gameplay-shell.css"><style>html{--wx-text-scale:${scale}}body{margin:0;background:#384850}#menuFixture{position:fixed;right:12px;top:12px;width:48px;height:48px}</style><button id="menuFixture">☰</button>`
      );
      await page.evaluate(async (scale) => {
        document.documentElement.dataset.we3dTextScale = String(scale * 100);
        const { createTutorialUi } = await import('/app/js/tutorial/ui.js');
        const runtime = { state: {} };
        const ui = createTutorialUi({
          runtime,
          safeCall: (fn) => fn?.(),
          onLater: () => ui.hidePrompt(),
        });
        ui.createCardIfNeeded();
        runtime.eyebrowEl.textContent = 'First Journey · 1 of 4';
        runtime.titleEl.textContent = 'Move and look';
        runtime.bodyEl.textContent =
          'Move a short distance. Open Details when you want more help. You can dismiss the lesson and return later.';
        runtime.card.dataset.guidanceRequested = 'false';
        runtime.card.hidden = false;
        window.fixtureRuntime = runtime;
      }, scale);
      assert.equal(
        await page.locator('#tutorialHintCard').isVisible(),
        false,
        'Unrequested ambient tutorial must stay quiet'
      );
      await page.evaluate(() => (fixtureRuntime.card.dataset.guidanceRequested = 'true'));
      await page.locator('#tutorialHintCard').waitFor({ state: 'visible' });
      assert(
        Math.abs(
          (await page
            .locator('#tutorialHintCard')
            .evaluate((e) => parseFloat(getComputedStyle(e).fontSize))) -
            14 * scale
        ) < 0.1,
        'Fixture did not apply actual text size'
      );
      for (const expanded of [false, true]) {
        if (expanded) await page.locator('.tutorial-details-btn').click();
        const geometry = await page.evaluate(() => {
          const r = document.getElementById('tutorialHintCard').getBoundingClientRect(),
            m = document.getElementById('menuFixture').getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            overflow: document.documentElement.scrollWidth > innerWidth,
            menuOverlap: r.x < m.right && r.right > m.x && r.y < m.bottom && r.bottom > m.y,
          };
        });
        const label = `${viewport.width}-${scale}-${expanded ? 'details' : 'compact'}`;
        await page.screenshot({ path: path.join(output, label + '.png') });
        report.checks.push({ label, geometry });
        assert(
          !geometry.overflow &&
            geometry.x >= 0 &&
            geometry.y >= 0 &&
            geometry.x + geometry.width <= viewport.width &&
            geometry.y + geometry.height <= viewport.height,
          'Guidance outside viewport'
        );
        assert(!geometry.menuOverlap, 'Guidance overlaps menu');
      }
      await page.locator('.tutorial-card .tutorial-icon-btn').click();
      assert.equal(await page.locator('#tutorialHintCard').isVisible(), false, 'Dismiss failed');
    }
  report.ok = true;
} catch (e) {
  report.ok = false;
  report.failure = e.stack;
  process.exitCode = 1;
} finally {
  report.pageErrors = qa.report.errors;
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await qa.close();
  console.log(JSON.stringify({ output, ...report }, null, 2));
}
