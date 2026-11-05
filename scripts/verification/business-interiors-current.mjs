import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = path.resolve(`output/verification/trail-hud-20261104/business-${Date.now()}`),
  report = {
    scope:
      'Native business scene builder, real CC0 furniture leases, controlled safe footprint. No claim of actual mapped entry from this fixture.',
    cases: [],
  };
let qa;
try {
  qa = await createFieldworkQaSession({
    rootDir: process.cwd(),
    output,
    careerId: 'explorer',
    maximumDurationMs: 4 * 60 * 1000,
  });
  const { page } = qa;
  await page.setViewportSize({ width: 1280, height: 800 });
  const pageFault = new Promise((_, reject) => page.once('pageerror', reject));
  await page.goto('http://127.0.0.1:4192/tests/fixtures/business-interiors.html');
  assert.deepEqual(qa.report.errors, []);
  await Promise.race([
    page.waitForFunction(() => window.ready === 'food-service', null, { timeout: 60000 }),
    pageFault,
  ]);
  const selected = new Set((process.env.WE3D_BUSINESS_PROGRAMS || '').split(',').filter(Boolean));
  for (const program of await page.evaluate(() => businessFixture.programs)) {
    if (selected.size && !selected.has(program)) continue;
    if ((await page.evaluate(() => window.ready)) !== program) {
      await page.locator('#program').selectOption(program);
      await Promise.race([
        page.waitForFunction((p) => window.ready === p, program, { timeout: 60000 }),
        pageFault,
      ]);
    }
    const state = await page.evaluate(() => businessFixture.snapshot());
    assert.ok(state.fixtures.length >= 2);
    assert.ok(state.colliders >= state.fixtures.length);
    if (['food-service', 'office', 'education'].includes(program))
      assert.ok(state.leases > 0, 'real furniture loaded');
    await page.screenshot({ path: path.join(output, program + '.png') });
    report.cases.push({ program, fixtures: state.fixtures.length, leases: state.leases, ok: true });
  }
  await page.evaluate(() => businessFixture.dispose());
  assert.deepEqual(qa.report.errors, []);
  report.ok = true;
} catch (e) {
  report.ok = false;
  report.failure = e.stack;
  await qa?.fail(e);
} finally {
  await qa?.close();
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(
  JSON.stringify({ ok: report.ok, output, cases: report.cases.length, failure: report.failure })
);
if (!report.ok) process.exitCode = 1;
