import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { explorerCareerView } from '../../app/js/campaign/explorer-career.js';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { runPrescribedGameActions } from './prescribed-game-actions.mjs';
const source = process.env.WE3D_EXPLORER_RECOVERY;
if (!source) throw Error('Choose the genuine completed Explorer source checkpoint.');
const backup = JSON.parse(await fs.readFile(source));
assert.equal(explorerCareerView(backup.profile, backup.events).phase, 'complete');
const output = 'output/verification/explorer-career-20261103/display-' + Date.now(),
  qa = await createFieldworkQaSession({ output, careerId: 'explorer', maximumDurationMs: 120000 }),
  { page, report } = qa;
try {
  report.scope =
    'Current Explorer view component with genuine completed source data. Exact prescribed game-client choreography opens the chapter disclosure. No world, chapter procedure, frame-budget or device-hardware claim.';
  report.source = source;
  await page.route('**/explorer-native-view', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/app/styles/discovery.css"><style>body{background:#152d32;color:#e2efea;font:14px system-ui}main{max-width:750px;margin:20px;padding:16px;background:#1b3031}</style><main><section id="discoveryOpeningChapter" class="discoveryOpeningChapter"></section></main>',
    })
  );
  await page.goto('http://127.0.0.1:4192/explorer-native-view');
  await page.evaluate(async (b) => {
    const { explorerCareerView, explorerJourneyMarkup } = await import(
        '/app/js/campaign/explorer-career.js'
      ),
      v = explorerCareerView(b.profile, b.events);
    document.querySelector('#discoveryOpeningChapter').innerHTML = explorerJourneyMarkup(v);
    window.advanceTime = async () => new Promise(requestAnimationFrame);
    window.render_game_to_text = () =>
      JSON.stringify({
        scope: 'Actual source-data component; no chapter replay',
        phase: v.phase,
        milestones: v.completedMilestones,
        chapters: v.chapters.length,
        expanded: document.querySelector('details').open,
      });
  }, backup);
  const root = await page.locator('#discoveryOpeningChapter').boundingBox(),
    summary = await page
      .getByText('All chapters and saved decisions', { exact: true })
      .boundingBox();
  await runPrescribedGameActions(
    page,
    output,
    [
      {
        buttons: ['left_mouse_button'],
        frames: 1,
        mouse_x: summary.x - root.x + 20,
        mouse_y: summary.y - root.y + 12,
      },
      { buttons: [], frames: 2 },
    ],
    '#discoveryOpeningChapter'
  );
  assert.equal(await page.locator('details').evaluate((e) => e.open), true);
  assert.equal(await page.locator('details > ol > li').count(), 12);
  await page.screenshot({ path: output + '/chapters-expanded.png' });
  await fs.writeFile(
    output + '/state.json',
    (await page.evaluate(() => render_game_to_text())) + '\n'
  );
  await qa.succeed();
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
