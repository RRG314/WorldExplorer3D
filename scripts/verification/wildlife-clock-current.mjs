import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/wildlife-career-20261102/clock-${Date.now()}`,
  qa = await createFieldworkQaSession({ output, careerId: 'wildlife', maximumDurationMs: 90000 }),
  { page, report } = qa;
try {
  report.scope =
    'Affected instrument-v2 coupling only, actual licensed animated actors and normal frames in controlled flat WebGL habitat. Stub save collects the volatile result; source field studies/IndexedDB/capstones are reused.';
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/wildlife-presentation.html'
  );
  await page.waitForFunction(() => window.wildlifeVisual);
  await page.evaluate(async () => {
    const { createWildlifeTools } = await import('/app/js/campaign/wildlife-tools.js'),
      v = wildlifeVisual;
    v.records = [];
    Object.assign(v.state.active, { method: 'trail-camera', captures: {}, surveys: {} });
    v.runtime.Walk.state.view = 'first';
    v.tools = createWildlifeTools(v.runtime, v.qualified, v.presentation, {
      careerId: 'wildlife',
      getState: () => v.state,
      isCurrent: () => true,
      save: async (command) => {
        v.records.push(command);
        v.state.active.habitatIndex++;
      }
    });
    v.tools.start();
  });
  await page.waitForFunction(() => wildlifeVisual.tools.snapshot().effort.activeSeconds >= 1.5);
  const before = await page.evaluate(() => {
    wildlifeVisual.runtime.paused = true;
    return wildlifeVisual.tools.snapshot().effort.activeSeconds;
  });
  await page.waitForTimeout(800);
  const paused = await page.evaluate(() => {
    const result = wildlifeVisual.tools.snapshot().effort.activeSeconds;
    wildlifeVisual.runtime.paused = false;
    return result;
  });
  assert.equal(paused, before);
  if (process.env.WE3D_WILDLIFE_TICK_ONLY === '1') {
    report.scope =
      'Post-diagnostic cleanup: affected real instrument ticks and paused-frame boundary only; accepted full windows are reused.';
    const effort = await page.evaluate(() => wildlifeVisual.tools.snapshot().effort);
    assert.ok(effort.activeSeconds >= 1.5 && effort.observations.length === 1);
    report.tick = { activeSeconds: effort.activeSeconds, observations: effort.observations.length };
  }
  for (const id of process.env.WE3D_WILDLIFE_TICK_ONLY === '1' ? [] : ['a', 'b']) {
    if (id === 'b')
      await page.evaluate(() => {
        const v = wildlifeVisual;
        v.runtime.Walk.state.walker.x = 9;
        v.tools.start();
      });
    await page.waitForFunction(
      () => wildlifeVisual.tools.snapshot().effort.complete,
      {},
      { timeout: 30000 }
    );
    const effort = await page.evaluate(async () => {
      await wildlifeVisual.tools.perform('record');
      return wildlifeVisual.records.at(-1).effort;
    });
    assert.equal(effort.instrumentVersion, 2);
    assert.ok(effort.activeSeconds >= 10);
    assert.equal(effort.observations.length, 1);
    assert.ok(effort.observations[0].detections >= 4 && effort.observations[0].detections <= 6);
    report.checks.push({
      id,
      activeSeconds: effort.activeSeconds,
      detections: effort.observations[0].detections,
      version: effort.instrumentVersion,
      excludedSeconds: effort.excludedSeconds
    });
  }
  await page.evaluate(() => {
    wildlifeVisual.tools.dispose();
    wildlifeVisual.presentation.dispose();
  });
  report.pause = { before, paused };
  report.ok = true;
  await fs.writeFile(`${output}/receipt.json`, JSON.stringify(report, null, 2) + '\n');
  console.log('PASS ' + output);
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
