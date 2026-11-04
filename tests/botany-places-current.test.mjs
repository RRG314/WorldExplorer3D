import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldResearchPlaces } from '../app/js/campaign/field-research-places.js';
test('completed marked plots select their original destination by variation; unfinished work takes precedence', () => {
  const site = (lat, name) => ({
    location: { lat, lon: -76 },
    locationContext: { lat, lon: -76, name },
    name
  });
  const botany = {
      active: { phase: 'complete', site: site(40, 'Latest') },
      records: {
        campaign: { site: site(39, 'Original') },
        'dry-summer': { site: site(41, 'Drought') }
      }
    },
    profile = { researchCareers: { botany } };
  assert.equal(fieldResearchPlaces('botany', { profile, variantId: 'campaign' })[0].lat, 39);
  assert.equal(fieldResearchPlaces('botany', { profile, variantId: 'dry-summer' })[0].lat, 41);
  botany.active = { phase: 'plants', site: site(42, 'In progress') };
  assert.equal(fieldResearchPlaces('botany', { profile, variantId: 'campaign' })[0].lat, 42);
});
