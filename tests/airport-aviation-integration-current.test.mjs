import test from 'node:test';
import assert from 'node:assert/strict';

import { compileAirportOperationalLayout } from '../app/js/transport/airport-layout.js';
import { derivedFleet } from '../app/js/transport/aviation-runtime.js';
import { getAviationCatalogEntry } from '../app/js/transport/aviation-catalog.js';
import { integrateFixedWingFlight } from '../app/js/plane/flight-dynamics.js';
import { integrateSkydivingDynamics } from '../app/js/urban-sandbox/parachute-model.js';
import { createCivicResponseModel } from '../app/js/urban-sandbox/civic-response-model.js';

function record(id, type, points, attributes = {}) {
  return Object.freeze({
    id,
    type,
    domain: 'aviation',
    mapped: true,
    geometry: Object.freeze({ kind: points.length > 1 ? 'path' : 'point', points: Object.freeze(points), complete: true }),
    attributes: Object.freeze(attributes),
    provenance: Object.freeze({ provider: 'test-map', license: 'ODbL-1.0' })
  });
}

function graph(records) {
  return Object.freeze({
    authority: 'compiled-mapped-transport-facilities',
    records: Object.freeze(records),
    byDomain: Object.freeze({ aviation: Object.freeze(records), maritime: Object.freeze([]) })
  });
}

test('one airport layout supplies runway, stands, tower, and ticket hall without inventing mapped provenance', () => {
  const source = graph([record('mapped:aerodrome', 'aerodrome', [{ x: 20, z: -10 }])]);
  const layout = compileAirportOperationalLayout(source, { location: { name: 'Test Airport' }, mobile: false });
  const mobileLayout = compileAirportOperationalLayout(source, { location: { name: 'Test Airport' }, mobile: true });
  assert.equal(layout.authority, 'compiled-airport-operational-layout');
  assert.equal(layout.mappedRunway, false);
  assert.equal(layout.primaryRunway.mapped, false);
  assert.equal(layout.primaryRunway.provenance.provider, 'World Explorer gameplay layout');
  assert.equal(layout.stands.length, 14);
  assert.equal(layout.ticketCounter.mapped, false);
  assert.ok(Number.isFinite(layout.ticketCounter.entrance.x));
  assert.equal(mobileLayout.mobile, true);
  assert.equal(mobileLayout.stands.length, 7);
});

test('mapped runway geometry remains the operational runway and dense fleet uses its stands', () => {
  const source = graph([
    record('mapped:runway', 'runway', [{ x: 0, z: -600 }, { x: 0, z: 600 }], { width: 46, ref: '15/33' }),
    record('mapped:apron', 'apron', [{ x: 100, z: 0 }])
  ]);
  const layout = compileAirportOperationalLayout(source, { mobile: false });
  const fleet = derivedFleet(source, { airportLayout: layout, mobile: false });
  assert.equal(layout.primaryRunway.id, 'mapped:runway');
  assert.equal(layout.runwayDesignator, '15/33');
  assert.equal(fleet.length, layout.stands.length);
  assert.equal(new Set(fleet.map(({ id }) => id)).size, fleet.length);
  assert.ok(fleet.some(({ trafficIntent }) => trafficIntent === 'circuit'));
  assert.ok(fleet.some(({ trafficIntent }) => trafficIntent === 'taxi'));
  assert.ok(fleet.filter(({ trafficIntent }) => trafficIntent === 'parked').length > fleet.length / 2);
});

test('personal aircraft is an aerobatic jet with a continuous loop flight path', () => {
  const jet = getAviationCatalogEntry('personal-prop');
  assert.equal(jet.role, 'aerobatic');
  assert.match(jet.label, /aerobatic jet/i);
  const top = integrateFixedWingFlight({ speed: 75, flightPathAngle: 1.45, pitch: Math.PI / 2, pitchRate: 1 }, { throttle: .85, powerFactor: 1, topSpeed: 150 }, jet, .05);
  const inverted = integrateFixedWingFlight({ speed: top.speed, flightPathAngle: 3.05, pitch: Math.PI, pitchRate: 1 }, { throttle: .85, powerFactor: 1, topSpeed: 150 }, jet, .05);
  assert.ok(top.climbRate > 0, 'top quarter of loop climbs');
  assert.ok(inverted.horizontalSpeed < 0, 'over the top of the loop continues through a signed flight path');
  assert.ok(Math.abs(inverted.flightPathAngle) > 2.5, 'flight path is not clamped to ordinary-aircraft pitch limits');
});

test('freefall and canopy have distinct controllable flight states', () => {
  const freefall = integrateSkydivingDynamics(null, { deployed: false, forward: 1, turn: .8, verticalVelocity: -5 }, .05);
  const canopy = integrateSkydivingDynamics(freefall, { deployed: true, forward: .4, turn: .8, flare: false, verticalVelocity: freefall.verticalSpeed }, .05);
  const flare = integrateSkydivingDynamics(canopy, { deployed: true, forward: 0, turn: 0, flare: true, verticalVelocity: canopy.verticalSpeed }, .2);
  assert.equal(freefall.phase, 'freefall');
  assert.equal(canopy.phase, 'canopy');
  assert.ok(Math.abs(canopy.bank) > 0);
  assert.ok(flare.verticalSpeed > canopy.verticalSpeed, 'flare reduces descent rate');
  assert.equal(canopy.profileId, 'standard-ram-air-v1');
});

test('civic response holds pursuit while responders see the actor and searches the last known area afterward', () => {
  let now = 1000;
  const model = createCivicResponseModel({ now: () => now });
  model.observe({ kind: 'collision', severity: 2, position: { x: 4, z: 8 } }, [{ id: 'witness:1', distance: 4 }]);
  for (let index = 0; index < 30; index += 1) model.update(.25, { x: 4, z: 8 }, { detected: false });
  let snapshot = model.snapshot();
  assert.equal(snapshot.phase, 'searching');
  for (let index = 0; index < 80; index += 1) {
    now += 250;
    snapshot = model.update(.25, { x: 20, z: 24 }, { detected: true });
  }
  assert.equal(snapshot.pursuit, true);
  assert.deepEqual(snapshot.lastKnownPosition, { x: 20, z: 24 });
  for (let index = 0; index < 8; index += 1) snapshot = model.update(.25, { x: 70, z: 70 }, { detected: false });
  assert.equal(snapshot.pursuit, false);
  assert.equal(snapshot.status.title, 'Searching last known area');
});
