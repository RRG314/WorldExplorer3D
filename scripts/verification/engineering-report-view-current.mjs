import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = 'output/verification/engineering-career-20261103/entrance-1793735353782',
  backup = JSON.parse(await fs.readFile(source + '/qa-fieldwork-backup.json')),
  active = JSON.parse(await fs.readFile(source + '/failed-before-desk-radius-correction.json')).last
    .fieldwork,
  report = backup.events.find((e) => e.metadata?.workspaceDesignReport?.id === 'reusable-design')
    .metadata.workspaceDesignReport,
  record = backup.events.find((e) => e.eventId === active.workspace.recordId),
  output = 'output/verification/engineering-career-20261103/report-view-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'engineering',
    maximumDurationMs: 90000,
  }),
  { page } = qa;
try {
  qa.report.scope =
    'Only shared blueprint height/caption and historical active controls, native DOM with genuine saved source report and accepted partial checkpoint. Actual source Journal, methods, storage and canonical completed revisit remain accepted and are not replayed.';
  await page.route('**/engineering-layout-view', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app/styles/discovery.css"><style>body{background:#152d32;color:#e2efea;font:14px system-ui}main{position:fixed;top:12px;right:12px;bottom:12px;max-height:calc(100dvh - 24px);width:min(520px,calc(100vw - 24px));box-sizing:border-box;overflow:auto;padding:16px;background:#1b3031}</style><main><h2>Field engineer</h2><section class="discoveryOpeningChapter" id="view"></section></main>',
    })
  );
  await page.goto('http://127.0.0.1:4192/engineering-layout-view');
  for (const mode of ['report', 'active']) {
    await page.evaluate(
      async ({ mode, report, active, record }) => {
        const { workspaceReportMarkup, engineeringMarkup } = await import(
          '/app/js/campaign/engineering-workspace.js'
        );
        document.querySelector('#view').innerHTML =
          mode === 'report'
            ? workspaceReportMarkup(report)
            : engineeringMarkup({
                workspace: active.workspace,
                room: active.workspace.projects.active.inspection.room,
                home: { id: active.homeId },
                variantId: active.variantId,
                record,
                reviewing: true,
                ready: true,
                button: (id, label, disabled = false) =>
                  `<button data-home-action="${id}"${disabled ? ' disabled' : ''}>${label}</button>`,
              });
        document.querySelector('details')?.setAttribute('open', '');
      },
      { mode, report, active, record }
    );
    for (const [width, height] of [
      [1280, 800],
      [390, 844],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      const plot = page.locator('svg');
      await plot.scrollIntoViewIfNeeded();
      assert.equal(
        await page.locator('#view').evaluate((e) => e.scrollWidth > e.clientWidth + 1),
        false
      );
      assert.ok(
        await plot.evaluate((e) => e.getBoundingClientRect().height <= innerHeight * 0.36 + 1)
      );
      assert.doesNotMatch(await page.locator('figcaption').innerText(), /orange/);
      await page.screenshot({ path: output + '/' + mode + '-' + width + '.png' });
      qa.report.checks.push({
        mode,
        width,
        height,
        blueprintFits: true,
        captionMatchesVisibleLayers: true,
      });
    }
  }
  await qa.succeed();
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
