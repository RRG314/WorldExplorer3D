import test from 'node:test';
import assert from 'node:assert/strict';
import { meteorologyHarness } from './helpers/meteorology-study.mjs';
import {
  meteorologyReportMarkup,
  meteorologyPairMarkup,
} from '../app/js/campaign/meteorology-report.js';
function report(id = 'campaign') {
  const h = meteorologyHarness(undefined, id);
  if (id !== 'campaign') {
    const base = meteorologyHarness();
    base.accept();
    base.source();
    base.measure();
    base.measure();
    base.forecast();
    base.measure();
    base.measure();
    base.report();
    const next = meteorologyHarness(base.state, id);
    return finish(next);
  }
  return finish(h);
}
function finish(h) {
  h.accept();
  h.source();
  h.measure();
  h.measure();
  h.forecast();
  h.measure();
  h.measure();
  return h.report().event.metadata.meteorologyReport;
}
test('weather card retains original forecast misses, actual raw samples, provenance and units without changing data', () => {
  const r = report('freshening'),
    raw = structuredClone(r);
  r.title = '<img src=x onerror=alert(1)>';
  const html = meteorologyReportMarkup(r);
  assert.ok(html.includes('At least one saved prediction missed'));
  assert.ok(html.includes('3.0–5.0 m/s'));
  assert.ok(html.includes('Fictional replay reference'));
  assert.ok(html.includes('not verify a public 10 m forecast'));
  assert.ok(html.includes('Issue age: not available'));
  assert.equal((html.match(/<svg /g) || []).length, 1);
  assert.equal((html.match(/<table>/g) || []).length, 6);
  assert.ok(html.includes('&lt;img'));
  assert.equal(html.includes('<img'), false);
  r.title = raw.title;
  assert.deepEqual(r, raw);
});
test('unknown or damaged weather metadata cannot break either Journal projection or produce Infinity', () => {
  const r = report(),
    badCloud = structuredClone(r),
    badTime = structuredClone(r);
  badCloud.readings.baseline.a.samples[0].cloudPaths[0] = null;
  badTime.readings.baseline.a.samples[1].activeSeconds = 0;
  for (const value of [
    null,
    {},
    { ...r, schemaVersion: 2 },
    { ...r, source: null },
    { ...r, forecast: null },
    badCloud,
    badTime,
  ])
    assert.equal(meteorologyReportMarkup(value), '');
  assert.equal(meteorologyPairMarkup(badTime.readings.baseline, 'Bad'), '');
});
