import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PARKED_VEHICLE_CATALOG,
  vehicleConditionDynamics,
  vehicleHandlingProfile
} from '../app/js/engine/vehicle-catalog.js';
import { ROAD_CAR_CONFIG } from '../app/js/physics/vehicle-config.js';
import { carSpeedToMph } from '../app/js/physics/vehicle-speed-units.js';
import { createCharacter } from '../app/js/character/model.js';
import { resolveCharacterCapability } from '../app/js/character/capability-resolver.js';
import { groundVehicleTuning } from '../app/js/character/vehicle-assistance.js';
import { compileTrafficGraph } from '../app/js/living-world/navigation-graphs.js';
import { createTrafficVehicleSurfaceSampler } from '../app/js/living-world/runtime.js';

test('the normal road-car ceiling is the advertised 120 mph', () => {
  assert.equal(carSpeedToMph(ROAD_CAR_CONFIG.maxSpd), 120);
  assert.equal(carSpeedToMph(ROAD_CAR_CONFIG.boostMax), 120);
  assert.ok(ROAD_CAR_CONFIG.boostAccel > ROAD_CAR_CONFIG.accel, 'boost should change acceleration, not top speed');
});

test('crash damage degrades the same vehicle handling contract and totaled cars cannot accelerate', () => {
  const healthy = vehicleConditionDynamics(1);
  const damaged = vehicleConditionDynamics(.35);
  const totaled = vehicleConditionDynamics(.05);

  assert.equal(healthy.topSpeedScale, 1);
  assert.ok(damaged.topSpeedScale < healthy.topSpeedScale);
  assert.ok(damaged.accelerationScale < healthy.accelerationScale);
  assert.ok(damaged.steeringScale < healthy.steeringScale);
  assert.equal(totaled.operable, false);
});

test('enterable vehicle families resolve genuinely different handling', () => {
  const profiles = PARKED_VEHICLE_CATALOG.map((variant) => vehicleHandlingProfile(variant));
  const signatures = new Set(profiles.map((profile) => [
    profile.accelerationScale,
    profile.steeringScale,
    profile.gripScale,
    profile.brakeScale,
    profile.wheelBase
  ].join('|')));

  assert.equal(signatures.size, PARKED_VEHICLE_CATALOG.length);
  assert.equal(vehicleHandlingProfile('compact').label, 'Nimble');
  assert.equal(vehicleHandlingProfile('suv').label, 'Planted');
  assert.ok(vehicleHandlingProfile('compact').steeringScale > vehicleHandlingProfile('pickup').steeringScale);
  assert.ok(vehicleHandlingProfile('suv').gripScale > vehicleHandlingProfile('sedan').gripScale);
});

test('road vehicles never exceed 120 mph and police vehicles get response tuning', () => {
  for (const variant of PARKED_VEHICLE_CATALOG) {
    assert.ok(vehicleHandlingProfile(variant).topSpeedMph <= 120, variant.id);
  }

  const civilian = vehicleHandlingProfile('sedan');
  const police = vehicleHandlingProfile('sedan', { serviceType: 'responder' });
  assert.equal(police.topSpeedMph, 120);
  assert.equal(police.label, 'Response-tuned');
  assert.ok(police.accelerationScale > civilian.accelerationScale);
  assert.ok(police.steeringScale > civilian.steeringScale);
  assert.ok(police.brakeScale > civilian.brakeScale);
});

test('Piloting assists the existing vehicle identity without changing its speed ceiling', () => {
  const general = groundVehicleTuning(resolveCharacterCapability(
    createCharacter({ backgroundId: 'general-explorer', now: 1 }),
    'ground-vehicle',
    { vehicleAvailable: true }
  ));
  const pilot = groundVehicleTuning(resolveCharacterCapability(
    createCharacter({ backgroundId: 'expedition-pilot', traits: ['sure-footed'], now: 1 }),
    'ground-vehicle',
    { vehicleAvailable: true }
  ));
  assert.ok(pilot.accelerationScale > general.accelerationScale);
  assert.ok(pilot.steeringResponseScale > general.steeringResponseScale);
  assert.ok(pilot.recoveryScale > general.recoveryScale);
  assert.ok(pilot.accelerationScale <= 1.12);
  assert.ok(pilot.steeringAngleScale <= 1.08);
  assert.equal(vehicleHandlingProfile('compact').topSpeedMph, 120);
  assert.ok(
    vehicleHandlingProfile('compact').steeringScale * pilot.steeringAngleScale >
    vehicleHandlingProfile('pickup').steeringScale * pilot.steeringAngleScale
  );
});

test('traffic wheel samples stay bound to their published source segment', () => {
  const feature = {
    id: 'hairpin-road',
    pts: [
      { x: 0, z: 0 },
      { x: 0, z: 20 },
      { x: 1, z: 0 }
    ],
    width: 8,
    driveable: true,
    type: 'residential',
    structureSemantics: { terrainMode: 'at_grade' },
    transportRecord: {
      identity: 'fixture:hairpin',
      completeness: 'lossless',
      crossSection: { widthMeters: 8 },
      speed: { metersPerSecond: 8 }
    }
  };
  const compiled = compileTrafficGraph({
    traversal: {
      authority: 'fixture',
      segments: [{
        feature,
        direction: 'forward',
        segIndex: 0,
        sourceTStart: 0,
        sourceTEnd: 1,
        p1: feature.pts[0],
        p2: feature.pts[1]
      }]
    },
    sampleSurface: () => 4
  });
  const edge = compiled.publication.edges[0];
  let receivedProjection = null;
  const sample = createTrafficVehicleSurfaceSampler({
    sampleFeatureSurfaceY(_feature, _x, _z, projection) {
      receivedProjection = projection;
      return projection.segIndex === 0 ? 4 : 40;
    }
  }, compiled);

  assert.equal(edge.sourceSegIndex, 0);
  assert.equal(sample(edge, 0.6, 1), 4.08);
  assert.equal(receivedProjection.segIndex, 0);
});

test('traffic transition connectors publish a continuous four-wheel surface', () => {
  const sample = createTrafficVehicleSurfaceSampler({ sampleFeatureSurfaceY: () => NaN }, {
    runtimeFeatureByEdge: new Map()
  });
  const connector = {
    p1: { x: 0, y: 2, z: 0 },
    p2: { x: 0, y: 4, z: 10 }
  };
  assert.equal(sample(connector, 1, 5), 3);
  assert.equal(sample(connector, -1, 7.5), 3.5);
});
