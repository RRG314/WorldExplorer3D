import test from 'node:test';
import assert from 'node:assert/strict';
import { marineBiologyHarness } from './helpers/marine-biology-study.mjs';
import {
  marineBiologyReportMarkup,
  marineHabitatPlot,
  marineBehaviorPlot,
} from '../app/js/campaign/marine-biology-report.js';
function report() {
  const h = marineBiologyHarness();
  h.accept();
  h.file('surface');
  h.file('habitat');
  h.file('habitat', h.window('habitat', { observations: [] }));
  h.file('follow');
  h.compare();
  return h.report().event.metadata.marineBiologyReport;
}
test('marine plate preserves non-detection limits, depth/trajectory charts and raw context without unsafe record markup', () => {
  const r = report();
  r.title = '<img src=x onerror=alert(1)>';
  const html = marineBiologyReportMarkup(r);
  assert.ok(html.includes('None recorded'));
  assert.ok(html.includes('one recorded none') || html.includes('other recorded none'));
  assert.ok(html.includes('Offset m'));
  assert.ok(html.includes('N ↑'));
  assert.ok(html.includes('Current: unavailable'));
  assert.ok(html.includes('not establish population size, absence or a cause'));
  assert.ok(html.includes('&lt;img'));
  assert.equal(html.includes('<img'), false);
  assert.equal((html.match(/<svg/g) || []).length, 2);
  assert.equal(/NaN|Infinity|undefined/.test(html), false);
  const raw = structuredClone(r);
  marineBiologyReportMarkup(r);
  assert.deepEqual(r, raw);
});
test('unknown or incomplete marine plates cannot break Journal and degenerate paths retain a bounded scale', () => {
  for (const r of [null, {}, { ...report(), schemaVersion: 2 }, { ...report(), follow: null }])
    assert.equal(marineBiologyReportMarkup(r), '');
  assert.equal(marineHabitatPlot(null), '');
  assert.equal(marineBehaviorPlot({ trajectory: [null, null, null] }), '');
  const r = report();
  for (const p of r.follow.trajectory) p.position = { x: 0, y: -8, z: 0 };
  const html = marineBehaviorPlot(r.follow);
  assert.equal(/NaN|Infinity/.test(html), false);
  const width = Number(html.match(/M290 200h([\d.]+)/)[1]);
  assert.ok(width <= 110);
});
