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
import { resolveVehicleRoadContactPose } from '../app/js/engine/vehicle-road-attitude.js';
import { edgeLookup } from '../app/js/living-world/population.js';
import * as THREE from 'three';
import { syncCuratedVehicleGroundPivot } from '../app/js/urban-sandbox/curated-traffic-vehicle.js';
import { vehicleWheelContactLayout, VEHICLE_ROOT_TO_GROUND_METERS } from '../app/js/engine/vehicle-catalog.js';

test('rendered wheel anchors stay on the sampled plane through pitch, bank and fade', () => {
  const variant = { width: 2, length: 10.4 };
  const layout = vehicleWheelContactLayout(variant);
  const surface = (x, z) => 7 + .2 * x + .4 * z;
  const pose = resolveVehicleRoadContactPose({ x: 12, z: -5, yaw: 1.17, variant, sampleSurface: surface });
  for (const scale of [1, .3]) {
    const host = new THREE.Group();
    const visual = new THREE.Group();
    host.add(visual);
    host.userData.curatedTrafficVehicleAttachment = { visual };
    host.position.set(pose.x, pose.y + VEHICLE_ROOT_TO_GROUND_METERS * scale, pose.z);
    host.rotation.order = 'YXZ';
    host.rotation.set(pose.pitch, pose.yaw, pose.roll);
    host.scale.setScalar(scale);
    syncCuratedVehicleGroundPivot(host);
    host.updateMatrixWorld(true);
    for (const side of [-1, 1]) for (const front of [-1, 1]) {
      const point = new THREE.Vector3(side * layout.halfTrack, 0, front * layout.halfWheelbase)
        .applyMatrix4(visual.matrixWorld);
      assert.ok(Math.abs(point.y - surface(point.x, point.z)) < 1e-7,
        'Actual Three.js mesh transform must agree with wheel-contact diagnostics.');
    }
  }
});

test('long traffic vehicles contact a planar grade at their rotated wheel positions', () => {
  for (const length of [3.65, 10.4]) for (const yaw of [0, 1.17, Math.PI]) {
    const pose = resolveVehicleRoadContactPose({
      x: 12, z: -5, yaw, variant: { width: 2, length },
      sampleSurface: (x, z) => 7 + .2 * x + .4 * z
    });
    const forwardSlope = .2 * Math.sin(yaw) + .4 * Math.cos(yaw);
    const rightSlope = .2 * Math.cos(yaw) - .4 * Math.sin(yaw);
    assert.ok(Math.abs(pose.pitch + Math.atan(forwardSlope)) < 1e-7);
    assert.ok(Math.abs(pose.roll - Math.atan(rightSlope * Math.cos(pose.pitch))) < 1e-7);
    assert.ok(pose.maximumWheelGap < 1e-7, 'A rigid planar road must not leave a wheel floating.');
    assert.ok(pose.maximumWheelPenetration < 1e-7);
  }
});

test('unrepresentable road twist is reported honestly and missing samples retain fallback', () => {
  const pose = resolveVehicleRoadContactPose({
    variant: { width: 2, length: 5 }, sampleSurface: (x, z) => x * z
  });
  assert.ok(pose.maximumWheelGap > .22);
  assert.equal(pose.contactAnomaly.length, 4);
  assert.equal(resolveVehicleRoadContactPose({ y: 12, sampleSurface: () => null }).authority, 'edge-plane-fallback');
});

test('inferred traffic links cannot jump between stacked roads or steep short gaps', () => {
  const edge = (from, to, p1, p2) => ({ from, to, p1, p2 });
  const incoming = edge(0, 1, { x: 0, y: 6, z: -10 }, { x: 0, y: 6, z: 0 });
  const beneath = edge(2, 3, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 11 });
  const steepGap = edge(4, 5, { x: 0, y: 7, z: 1 }, { x: 0, y: 7, z: 11 });
  const continuation = edge(6, 7, { x: 0, y: 6.2, z: 2 }, { x: 0, y: 7, z: 12 });
  const lookup = edgeLookup({ edges: [incoming, beneath, steepGap, continuation] }, { connectNearby: true });
  assert.deepEqual(lookup.get(incoming.to), [3]);
});

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
