import test from 'node:test';
import assert from 'node:assert/strict';
import { oceanographyHarness } from './helpers/oceanography-study.mjs';
import {
  oceanographyReportMarkup,
  transectMarkup,
  waterColumnMarkup,
} from '../app/js/campaign/oceanography-report.js';
function report() {
  const h = oceanographyHarness();
  h.accept();
  h.cast();
  h.cast();
  h.mapping();
  h.inspect();
  h.returned();
  return h.report().event.metadata.oceanographyReport;
}
test('a saved ocean plate retains both profiles, uncertainty, geographic transect and provenance, escaping record text', () => {
  const r = report();
  r.conclusion = '<img src=x onerror=alert(1)>';
  r.result = 'future-safe-text';
  const html = oceanographyReportMarkup(r);
  assert.equal((html.match(/<tbody>/g) || []).length, 1);
  assert.equal((html.match(/<tbody>([\s\S]*?)<\/tbody>/)[1].match(/<tr>/g) || []).length, 6);
  assert.equal((html.match(/class="ocean-profile-chart"/g) || []).length, 2);
  assert.ok(html.includes('ocean-transect-chart'));
  assert.ok(html.includes('fixture-archived-chart'));
  assert.ok(html.includes('practical salinity'));
  assert.ok(html.includes('&lt;img'));
  assert.equal(html.includes('<img'), false);
});
test('unknown or incomplete reports and unrelated extension records cannot break the Journal', () => {
  for (const value of [
    null,
    {},
    { schemaVersion: 2 },
    { ...report(), schemaVersion: 2 },
    { ...report(), casts: {} },
  ])
    assert.equal(oceanographyReportMarkup(value), '');
  const r = report(),
    baseline = oceanographyReportMarkup(r);
  r.casts.future = { samples: null };
  r.plan.stationDepths.push(null, { depthMeters: 'unknown' });
  r.pings.push(null, { position: null });
  assert.equal(oceanographyReportMarkup(r), baseline);
  assert.equal(waterColumnMarkup(null), '');
  assert.equal(transectMarkup({ casts: {} }), '');
});
