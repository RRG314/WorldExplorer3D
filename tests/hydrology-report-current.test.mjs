import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrologyHarness } from './helpers/hydrology-study.mjs';
import {
  hydrologyReportMarkup,
  hydrologyMeasurementMarkup,
} from '../app/js/campaign/hydrology-report.js';
function report() {
  const h = hydrologyHarness();
  h.accept();
  h.trace();
  h.measure();
  h.measure();
  h.context();
  h.declare();
  h.measure();
  h.measure();
  return h.report().event.metadata.hydrologyReport;
}
test('water plate keeps actual paired values, archived dates/units and causal limits, escaping record text', () => {
  const r = report(),
    raw = structuredClone(r);
  r.title = '<img src=x onerror=alert(1)>';
  const html = hydrologyReportMarkup(r);
  assert.ok(html.includes('2024-01-01'));
  assert.ok(html.includes('27.3 ft³/s'));
  assert.ok(html.includes('m³/s'));
  assert.ok(html.includes('does not identify'));
  assert.ok(html.includes('not calibrated NTU'));
  assert.equal((html.match(/<table>/g) || []).length, 5);
  assert.ok(html.includes('&lt;img'));
  assert.equal(html.includes('<img'), false);
  r.title = raw.title;
  assert.deepEqual(r, raw);
});
test('unknown or incomplete water records cannot break either Journal reader', () => {
  for (const r of [
    null,
    {},
    { ...report(), schemaVersion: 2 },
    { ...report(), site: null },
    { ...report(), context: { reference: null } },
  ])
    assert.equal(hydrologyReportMarkup(r), '');
  assert.equal(hydrologyMeasurementMarkup({ lanes: 'abc', optical: 'abc' }), '');
});

test('water map and comparison projections fail closed for missing coordinates or beam changes', () => {
  const r = report(),
    noCoordinate = structuredClone(r),
    noDelta = structuredClone(r);
  delete noCoordinate.site.location.lon;
  delete noDelta.comparison[0].obstructionChange;
  assert.equal(hydrologyReportMarkup(noCoordinate), '');
  assert.equal(hydrologyReportMarkup(noDelta), '');
  const html = hydrologyReportMarkup(r);
  assert.equal((html.match(/<svg /g) || []).length, 2);
  assert.equal(html.includes('NaN'), false);
  assert.ok(html.includes('Beam Δ %'));
});

test('compact water comparison retains an accessible row classification without an overflowing fifth column', () => {
  const r = report(),
    html = hydrologyReportMarkup(r);
  assert.ok(html.includes('aria-label="A: flow increased"'));
  assert.ok(html.includes('A ↑'));
  assert.equal(html.includes('<th>Flow</th>'), false);
  r.comparison[0].flowResult = 'unknown';
  assert.equal(hydrologyReportMarkup(r), '');
});
