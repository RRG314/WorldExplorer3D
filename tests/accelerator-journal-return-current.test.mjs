import test from 'node:test';
import assert from 'node:assert/strict';
import { acceleratorHarness } from './helpers/accelerator-study.mjs';
import { CERN_ARRIVALS } from '../app/js/campaign/cern-study-sites.js';
import { journalReturnDestination } from '../app/js/discovery/journal-return.js';
test('the two-site notebook returns outside the actual CMS analysis facility, including an early generic Meyrin Journal location', () => {
  const h = acceleratorHarness();
  h.finish();
  const event = h.events.at(-1),
    place = CERN_ARRIVALS['cms-point-five'];
  assert.deepEqual(event.locationSnapshot, { lat: place.lat, lon: place.lon, name: place.name });
  const early = {
      ...event,
      locationSnapshot: {
        lat: 46.23353415849373,
        lon: 6.056988453434153,
        name: 'CERN · Meyrin and CMS',
      },
    },
    destination = journalReturnDestination(early);
  assert.equal(destination.label, 'Return to CMS visit');
  assert.equal(destination.location.lat, place.lat);
  assert.equal(destination.location.lon, place.lon);
  const unrelated = structuredClone(early);
  unrelated.metadata.action.evidence.sourceBuildingId = 'way/1';
  assert.equal(journalReturnDestination(unrelated).location.lat, early.locationSnapshot.lat);
  assert.equal(journalReturnDestination({ ...early, environment: 'SPACE' }), null);
});
