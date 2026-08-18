import assert from 'node:assert/strict';
import {
  civicAgencyForLocation,
  createCivicResponseModel
} from '../app/js/urban-sandbox/civic-response-model.js';

function advance(model, seconds, actorPosition = { x: 0, z: 0 }) {
  const steps = Math.ceil(seconds / .2);
  for (let index = 0; index < steps; index += 1) model.update(.2, actorPosition);
  return model.snapshot();
}

assert.equal(civicAgencyForLocation({ location: { name: 'Baltimore, Maryland' } }), 'Baltimore civic response');
assert.equal(civicAgencyForLocation({ location: { name: 'Yellowstone National Park' } }), 'Ranger service');

const model = createCivicResponseModel({
  request: { location: { name: 'Baltimore, Maryland' } },
  getActorPosition: () => ({ x: 0, z: 0 })
});
const ignored = model.observe({ kind: 'vehicle_taken', position: { x: 0, z: 0 } }, []);
assert.equal(ignored.accepted, false, 'an unwitnessed event created civic attention');
assert.equal(model.snapshot().phase, 'clear');

const witnessed = model.observe(
  { kind: 'vehicle_taken', vehicleId: 'vehicle:1', severity: 1, position: { x: 4, z: 8 } },
  [{ id: 'pedestrian:2', distance: 9.4, reaction: 'reporting' }]
);
assert.equal(witnessed.accepted, true);
assert.equal(model.snapshot().phase, 'observed');
assert.equal(model.snapshot().level, 1);
assert.equal(model.snapshot().lastEvent.witnessCount, 1);

assert.equal(advance(model, 2.6).phase, 'reporting');
assert.equal(advance(model, 3.8).phase, 'searching');
assert.equal(model.snapshot().searchRadius, 105);

const repeated = model.observe(
  { kind: 'reckless_driving', vehicleId: 'vehicle:1', severity: 1, position: { x: 7, z: 9 } },
  [{ id: 'pedestrian:4', distance: 12.1, reaction: 'reporting' }]
);
assert.equal(repeated.accepted, true);
assert.equal(model.snapshot().level, 2, 'a repeated witnessed event did not escalate attention');
assert.equal(model.snapshot().recentEvents.length, 2);

advance(model, 2.6, { x: 500, z: 500 });
advance(model, 3.8, { x: 500, z: 500 });
assert.equal(model.snapshot().phase, 'searching');
advance(model, 13, { x: 500, z: 500 });
assert.equal(model.snapshot().phase, 'cooling', 'leaving the search radius did not accelerate its decay');
assert.equal(advance(model, 8.2, { x: 500, z: 500 }).phase, 'clear');
assert.equal(model.snapshot().level, 0);

console.log(JSON.stringify({ ok: true, agency: model.agency, final: model.snapshot() }, null, 2));
