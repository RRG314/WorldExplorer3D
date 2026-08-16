import assert from 'node:assert/strict';
import {
  LIVE_GPS_POLICY,
  boundaryStateForDistance,
  createLiveGpsModel,
  haversineMeters,
  ingestLiveGpsFix,
  liveGpsModelSnapshot,
  resetLiveGpsAtOrigin
} from '../app/js/live-gps/model.js';

const origin = { latitude: 39.2904, longitude: -76.6122 };
const now = 1_780_000_000_000;
const position = (latitude, longitude, accuracy = 8, offsetMs = 0, extra = {}) => ({
  coords: { latitude, longitude, accuracy, ...extra },
  timestamp: now + offsetMs
});

const model = createLiveGpsModel({ origin });
assert.equal(ingestLiveGpsFix(model, position(origin.latitude, origin.longitude), now).accepted, true);

const invalidModel = createLiveGpsModel({ origin });
const invalid = ingestLiveGpsFix(invalidModel, { coords: { latitude: origin.latitude, accuracy: 5 }, timestamp: now }, now);
assert.equal(invalid.reason, 'invalid', 'missing longitude must not silently normalize to Greenwich');

const north10m = origin.latitude + 10 / 111_000;
const accepted = ingestLiveGpsFix(model, position(north10m, origin.longitude, 7, 1_000), now + 1_000);
assert.equal(accepted.accepted, true);
assert(model.filtered && model.filtered.latitude > origin.latitude, 'accepted movement did not advance filtered latitude');
assert(model.rawSamples.length === 2, 'raw diagnostic ring did not retain accepted samples');

const poor = ingestLiveGpsFix(model, position(north10m, origin.longitude, 140, 2_000), now + 2_000);
assert.equal(poor.reason, 'poor-accuracy');

const stale = ingestLiveGpsFix(model, position(north10m, origin.longitude, 8, -20_000), now + 3_000);
assert.equal(stale.reason, 'stale');

const jump = ingestLiveGpsFix(model, position(origin.latitude + 0.01, origin.longitude, 8, 3_000), now + 3_000);
assert.equal(jump.reason, 'jump-quarantined');
assert.equal(model.counters.jumpRejected, 1);

const recovered = ingestLiveGpsFix(model, position(origin.latitude + 20 / 111_000, origin.longitude, 8, 4_000), now + 4_000);
assert.equal(recovered.accepted, true, 'normal fix after a bad jump did not recover');

assert.equal(boundaryStateForDistance(LIVE_GPS_POLICY.warningRadiusMeters - 1), 'inside');
assert.equal(boundaryStateForDistance(LIVE_GPS_POLICY.warningRadiusMeters), 'warning');
assert.equal(boundaryStateForDistance(LIVE_GPS_POLICY.recenterRadiusMeters), 'recenter-ready');
assert.equal(boundaryStateForDistance(LIVE_GPS_POLICY.hardPauseRadiusMeters), 'hard-pause');

const boundaryModel = createLiveGpsModel({ origin });
ingestLiveGpsFix(boundaryModel, position(origin.latitude, origin.longitude, 5), now);
const nineKmNorth = origin.latitude + 9_100 / 111_000;
const firstFar = ingestLiveGpsFix(boundaryModel, position(nineKmNorth, origin.longitude, 5, 30_000), now + 30_000);
assert.equal(firstFar.reason, 'jump-quarantined');
const confirmedFar = ingestLiveGpsFix(boundaryModel, position(nineKmNorth + 2 / 111_000, origin.longitude, 5, 31_000), now + 31_000);
assert.equal(confirmedFar.accepted, true, 'second nearby fix did not confirm relocation');
assert.equal(boundaryModel.boundaryState, 'warning');

assert(resetLiveGpsAtOrigin(boundaryModel, boundaryModel.filtered));
assert.equal(boundaryModel.boundaryState, 'inside');
assert(boundaryModel.boundaryDistanceMeters < 0.01);

const snapshot = liveGpsModelSnapshot(model, now + 5_000);
assert.equal(snapshot.hasFix, true);
assert.equal(snapshot.retainedRawSamples, 6);
assert(snapshot.counters.accepted >= 3);
assert(haversineMeters(origin, { latitude: origin.latitude + 1 / 111_000, longitude: origin.longitude }) > 0.9);

console.log(JSON.stringify({
  ok: true,
  policy: LIVE_GPS_POLICY,
  snapshot,
  verified: [
    'valid-fix',
    'missing-coordinate-rejected',
    'poor-accuracy-hold',
    'stale-hold',
    'impossible-jump-quarantine',
    'normal-recovery',
    'confirmed-relocation',
    'boundary-states',
    'recenter-reset',
    'bounded-raw-ring'
  ]
}, null, 2));
