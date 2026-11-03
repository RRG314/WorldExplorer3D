import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldResearchPlaces } from '../app/js/campaign/field-research-places.js';
test('a water study reopens its chosen saved stations while an unfinished course keeps precedence', () => {
  const saved = { site: { locationContext: { lat: 40, lon: -76, name: 'Saved water course' } } },
    profile = { researchCareers: { hydrology: { active: { phase: 'complete' } } } };
  assert.equal(fieldResearchPlaces('hydrology', { profile, completedRecord: saved })[0].lat, 40);
  profile.researchCareers.hydrology.active = {
    phase: 'revisit',
    site: { locationContext: { lat: 41, lon: -76, name: 'Unfinished' } },
  };
  assert.equal(fieldResearchPlaces('hydrology', { profile, completedRecord: saved })[0].lat, 41);
});

// The old station centre remains clear in this case. The new rack footprint
// crosses blocked ground, so accepting only the centre would be unsafe.
import { hydrologySiteEligibility } from '../app/js/campaign/hydrology-presentation.js';
test('side-mounted water instruments cannot be admitted over a blocked footprint', () => {
  const qualified = { points: { a: { x: 0, z: 0 }, b: { x: 10, z: 0 } }, metersPerUnit: 1 };
  assert.equal(hydrologySiteEligibility({}, { ...qualified, ground: () => ({ y: 0 }) }), true);
  const blocked = (x, z) => (x > 1 && x < 1.8 && z > -0.6 ? null : { y: 0 });
  assert.match(hydrologySiteEligibility({}, { ...qualified, ground: blocked }), /bank instruments/);
});
