import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryDiscoveryProfileStore } from '../app/js/discovery/profile-store.js?v=5';
import { astronomyHarness } from './helpers/astronomy-study.mjs';
import { astronomyReportMarkup } from '../app/js/campaign/astronomy-report.js';
test('scientific detector exposures use the existing profile transaction without entering the photographic media owner', async () => {
  const h = astronomyHarness();
  h.finish();
  const store = createMemoryDiscoveryProfileStore();
  for (const e of h.events)
    await store.updateResearchCareer('astronomy', e.metadata.action, { now: e.occurredAt });
  const data = await store.exportData();
  assert.equal(data.profile.researchCareers.astronomy.active.phase, 'complete');
  assert.equal(data.events.filter((e) => e.metadata?.astronomyReport).length, 1);
  assert.equal((data.researchMedia || []).length, 0);
  const again = createMemoryDiscoveryProfileStore();
  await again.importData(data);
  assert.deepEqual(
    (await again.getProfile()).researchCareers.astronomy,
    data.profile.researchCareers.astronomy
  );
  const bad = structuredClone(data);
  bad.events.find((e) => e.metadata?.action?.exposure).metadata.action.exposure.image.seed++;
  await assert.rejects(again.importData(bad));
  assert.deepEqual(
    (await again.getProfile()).researchCareers.astronomy,
    data.profile.researchCareers.astronomy
  );
});
test('each observing report renders retained frames, measurements, source and variant-specific limitations without invalid values', () => {
  let state;
  for (const id of ['campaign', 'exposure-bracket', 'detector-dither']) {
    const h = astronomyHarness(state, id, 'projection-' + id + '-0001');
    state = h.finish();
    const r = state.active.report,
      html = astronomyReportMarkup(r);
    assert.equal(r.variantId, id);
    assert.equal((html.match(/<svg /g) || []).length, 3);
    assert.match(html, /Counts\/s/);
    assert.match(html, /HYG catalog/);
    assert.match(html, /seed/);
    assert.doesNotMatch(html, /undefined|NaN|Infinity/);
    if (id === 'detector-dither') assert.match(html, /Sky centroid shift/);
    if (id === 'exposure-bracket') assert.match(html, /CLIPPED/);
  }
});
