import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AVIATION_CATALOG, AVIATION_FLEET_CATALOG } from '../app/js/transport/aviation-catalog.js';
import { derivedFleet } from '../app/js/transport/aviation-runtime.js';
import {
  PARACHUTE_POLICY,
  evaluateAircraftSkydivingExit,
  evaluateHighDropParachuteOffer,
  integrateParachuteFall,
  parachuteHorizontalSpeed
} from '../app/js/urban-sandbox/parachute-model.js';

const graph = Object.freeze({
  byDomain: Object.freeze({
    aviation: Object.freeze([
      Object.freeze({
        id: 'osm:node:airport', type: 'aerodrome',
        geometry: Object.freeze({ kind: 'point', points: Object.freeze([{ x: 20, z: -10 }]) }),
        provenance: Object.freeze({ provider: 'OpenStreetMap', license: 'ODbL-1.0' })
      }),
      Object.freeze({
        id: 'osm:node:pad', type: 'helipad',
        geometry: Object.freeze({ kind: 'point', points: Object.freeze([{ x: -25, z: 30 }]) }),
        provenance: Object.freeze({ provider: 'OpenStreetMap', license: 'ODbL-1.0' })
      })
    ])
  })
});

test('personal and airport-fleet aviation classes use the shared playable transport contract', () => {
  assert.equal(AVIATION_CATALOG.length, 6);
  assert.deepEqual(AVIATION_CATALOG.map(({ id }) => id), [
    'personal-prop', 'expedition-prop', 'business-jet', 'regional-jet', 'long-range-airliner', 'utility-helicopter'
  ]);
  for (const entry of AVIATION_CATALOG) {
    assert.equal(entry.domain, 'aviation');
    assert.equal(entry.playable, true);
    assert.equal(entry.enterable, true);
    assert.equal(entry.interaction.companionAboard, true);
    assert.equal(entry.rights.kind, 'original-generic-design');
    assert.equal(entry.rights.brand, 'unbranded');
    assert.match(entry.visual.referenceEvidence, /aviation-fleet-and-damage-2026-08-29\.png$/);
    assert.ok(entry.dimensions.length > 0);
    assert.ok(entry.performance.topSpeed > 0);
  }
});

test('playable aircraft are generated as explicit gameplay activity anchored to mapped facilities', () => {
  const fleet = derivedFleet(graph, {
    airportLayout: {
      scale: 'regional',
      stands: AVIATION_FLEET_CATALOG.map((_, index) => ({ id: `stand:${index}`, x: index * 20, z: 0, yaw: 0 }))
    }
  });
  assert.equal(fleet.length, AVIATION_FLEET_CATALOG.length);
  assert.equal(fleet.some(({ catalog }) => catalog.directModeOnly === true), false);
  assert.equal(new Set(fleet.map(({ id }) => id)).size, fleet.length);
  assert.equal(fleet.every(({ mapped }) => mapped === false), true);
  assert.equal(fleet.every(({ generatedActivity }) => generatedActivity === true), true);
  assert.equal(fleet.every(({ provenance }) => provenance.mappedAnchorProvider === 'OpenStreetMap'), true);
  assert.equal(fleet.find(({ catalog }) => catalog.aircraftKind === 'rotorcraft').anchorFacilityType, 'helipad');
});

test('aircraft skydiving requires useful clearance and auto-equips only at the safer height', () => {
  assert.equal(evaluateAircraftSkydivingExit({ airborne: false, aircraftY: 100, groundY: 0 }).reason, 'aircraft-grounded');
  assert.equal(evaluateAircraftSkydivingExit({ airborne: true, aircraftY: 8, groundY: 0 }).reason, 'too-low-to-jump');
  const allowed = evaluateAircraftSkydivingExit({ airborne: true, aircraftY: PARACHUTE_POLICY.automaticEquipClearance + 2, groundY: 0 });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.autoEquip, true);
  assert.ok(parachuteHorizontalSpeed(true) < parachuteHorizontalSpeed(false));
  const ordinaryDescent = integrateParachuteFall(-5.8, .5, true, false);
  const flaredDescent = integrateParachuteFall(-5.8, .5, true, true);
  assert.ok(Math.abs(flaredDescent) < Math.abs(ordinaryDescent));
  assert.ok(flaredDescent <= -PARACHUTE_POLICY.flaredDescentSpeed);
});

test('leaving a tall building offers the reusable parachute without auto-deploying it', () => {
  assert.equal(evaluateHighDropParachuteOffer({
    environment: 'EARTH', travelMode: 'walk', leftElevatedSupport: true,
    onGround: false, feetY: 18, groundY: 0, verticalVelocity: -1
  }).allowed, true);
  assert.equal(evaluateHighDropParachuteOffer({
    environment: 'EARTH', travelMode: 'walk', leftElevatedSupport: true,
    onGround: false, feetY: 5, groundY: 0, verticalVelocity: -1
  }).reason, 'too-low');
  assert.equal(evaluateHighDropParachuteOffer({
    environment: 'EARTH', travelMode: 'walk', leftElevatedSupport: false,
    onGround: false, feetY: 30, groundY: 0, verticalVelocity: -1
  }).reason, 'not-an-elevated-drop');
});

test('aviation, parachute, companion, and world lifecycle use existing shared authorities', async () => {
  const [runtime, plane, input, walking, companion, lifecycle, urban, visuals] = await Promise.all([
    readFile(new URL('../app/js/transport/aviation-runtime.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/plane-mode.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/input.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/walking/physics.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/discovery/companions.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/world/load-runtime-session.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/urban-sandbox/runtime.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/urban-sandbox/equipment-visuals.js', import.meta.url), 'utf8')
  ]);
  assert.match(runtime, /registerContextInteraction/);
  assert.match(runtime, /setTravelMode\?\.\('plane'/);
  assert.match(runtime, /stopPlaneMode\?\.\(\{ targetMode: 'skydive'/);
  assert.match(runtime, /prepareAirborneParachute/);
  assert.match(plane, /applyTransportDamage\(state/);
  assert.match(input, /equipped\?\.\(\)\?\.id === 'parachute'/);
  assert.match(walking, /parachuteHorizontalSpeed/);
  assert.match(walking, /evaluateHighDropParachuteOffer/);
  assert.match(walking, /source: 'building_drop'/);
  assert.match(urban, /setParachuteReady\?\.\(false\)/);
  assert.match(urban, /setParachuteDeployed\?\.\(false\)/);
  assert.match(urban, /handoffDistance/);
  assert.match(visuals, /parachutePack\.visible = parachuteReady \|\| parachuteCanopy\.visible/);
  assert.match(visuals, /parachuteSnapshot\(\)/);
  assert.match(companion, /mode === 'plane'.*vehicle-occupant/);
  assert.match(lifecycle, /startAviationRuntime/);
  assert.match(lifecycle, /disposeAviationRuntime/);
  assert.doesNotMatch(runtime, /Baltimore|BWI|Rotterdam/);
});
