import test from 'node:test';
import assert from 'node:assert/strict';
import { cartographyHarness } from './helpers/cartography-study.mjs';
import {
  validateCartographyCareerBackup,
  cartographyLegValue,
  cartographyCareerBadge,
  transitionCartographyCareer,
} from '../app/js/campaign/cartography-career.js';
import { cartographyReportMarkup } from '../app/js/campaign/cartography-report.js';
import { cartographyMapMarkup } from '../app/js/campaign/cartography-report.js';
test('malformed future map and source containers cannot break Journal rendering', () => {
  const h = finish(cartographyHarness()),
    r = h.state.active.report;
  for (const bad of [null, {}, [null], []]) {
    const copy = structuredClone(r);
    copy.site.plan.legs = bad;
    assert.equal(cartographyReportMarkup(copy), '');
    assert.equal(cartographyMapMarkup(copy.site), '');
  }
  const bad = structuredClone(r);
  bad.site.plan.legs[0].sources = [null];
  assert.equal(cartographyReportMarkup(bad), '');
});
function finish(h) {
  h.accept();
  h.controls();
  h.measure();
  h.measure();
  h.access();
  h.reconcile();
  h.publish();
  return h;
}
test('actual loaded sidewalk path kind is retained while unsupported water samples are rejected', () => {
  const h = cartographyHarness();
  h.accept();
  h.controls();
  h.measure((r) => r.samples.forEach((s) => (s.surfaceKind = 'path')));
  assert.equal(h.state.active.legs[0].samples[0].surfaceKind, 'path');
  assert.throws(
    () => h.measure((r) => r.samples.forEach((s) => (s.surfaceKind = 'water'))),
    /supported loaded-surface/
  );
});
test('three complete route studies retain real differences and once-only original sheets', () => {
  const base = finish(cartographyHarness()),
    reciprocal = finish(cartographyHarness(base.state, 'reciprocal')),
    dogleg = finish(cartographyHarness(reciprocal.state, 'dogleg')),
    events = [...base.events, ...reciprocal.events, ...dogleg.events];
  validateCartographyCareerBackup(dogleg.state, events, []);
  assert.equal(Object.keys(dogleg.state.completed).length, 3);
  assert.equal(cartographyCareerBadge(dogleg.state).label, 'Route Survey');
  assert.deepEqual(
    reciprocal.state.active.report.reference,
    base.state.active.legs.map(cartographyLegValue).reverse()
  );
  assert.ok(
    Math.abs(
      cartographyLegValue(base.state.active.legs[0]).bearing +
        180 -
        cartographyLegValue(reciprocal.state.active.legs[1]).bearing
    ) < 0.01
  );
  const r = cartographyLegValue(dogleg.state.active.legs[1]);
  assert.ok(r.distance / r.chord > 1.4);
  const report = base.state.active.report,
    h = cartographyHarness(dogleg.state);
  h.accept();
  assert.deepEqual(h.state.active.report, report);
  assert.equal(Object.keys(h.state.completed).length, 3);
  assert.throws(() => h.publish(), /unfinished/);
});
test('blocked sightline, fabricated samples and real-access claims cannot complete a step', () => {
  const h = cartographyHarness();
  h.accept();
  assert.throws(
    () =>
      h.step('controls', {
        north: 'true-north',
        controls: {
          siteId: h.site.id,
          runId: h.state.active.runId,
          at: h.now,
          sights: [
            { id: 'a', clear: false, rangeMeters: 14 },
            { id: 'b', clear: true, rangeMeters: 28 },
          ],
        },
      }),
    /Sight/
  );
  h.controls();
  const before = structuredClone(h.state);
  assert.throws(
    () =>
      h.measure((r) => {
        r.samples[2].position.lon += 0.01;
      }),
    /discontinuous/
  );
  assert.deepEqual(h.state, before);
  h.measure();
  h.measure();
  assert.throws(() => h.step('access', { accessClaim: 'public-access' }), /Inspect/);
  h.access();
  assert.throws(() => h.step('reconcile', { heightSource: 'mapped-elevation' }), /Separate/);
});
test('reciprocal controls must belong to the original campaign and raw history remains canonical', () => {
  const base = finish(cartographyHarness()),
    h = cartographyHarness(base.state, 'reciprocal');
  h.site.points.origin.lat += 0.000005;
  assert.throws(() => h.accept(), /Reverse/);
  const altered = structuredClone(base.state);
  altered.active.legs[0].samples[2].heightMeters = 8;
  assert.throws(() => validateCartographyCareerBackup(altered, base.events, []), /incomplete/);
  assert.throws(
    () => transitionCartographyCareer(base.state, { type: 'accept', revision: 0 }),
    /changed/
  );
});
test('route sheets reject unknown shapes and render north, scale and limitations for all three studies', () => {
  for (const bad of [
    undefined,
    {},
    { schemaVersion: 99 },
    { schemaVersion: 1, truthType: 'loaded-virtual-route-survey', legs: [{}, {}] },
  ])
    assert.equal(cartographyReportMarkup(bad), '');
  let state;
  for (const id of ['campaign', 'reciprocal', 'dogleg']) {
    const h = finish(cartographyHarness(state, id));
    state = h.state;
    const text = cartographyReportMarkup(state.active.report);
    assert.match(text, /N ↑/);
    assert.match(text, /Mapped elevation was not established/);
    assert.match(text, /Real public access is unverified/);
    assert.doesNotMatch(text, /NaN|Infinity|undefined/);
  }
});
