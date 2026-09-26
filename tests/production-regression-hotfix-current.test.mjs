import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyAircraftHeadingTurn,
  classicAircraftBankTurnRate,
  integrateFixedWingFlight,
  resolveAircraftFlightTuning
} from '../app/js/plane/flight-dynamics.js';
import { ctx as appCtx } from '../app/js/shared-context.js?v=55';
import { updateDrone } from '../app/js/physics/drone-flight.js';
import { shouldRenderRoadCenterMarkings, appendRoadCenterMarkings } from '../app/js/terrain/rebuild.js';
import { createRoadContactIndex } from '../app/js/terrain/road-contact-index.js';
import { compileElevatedAssembly } from '../app/js/world/compiler/transport-structure-assembly.js';
import { integrateSkydivingDynamics } from '../app/js/urban-sandbox/parachute-model.js';

test('aircraft heading preserves the established 4.3 positive-yaw control convention', () => {
  assert.ok(applyAircraftHeadingTurn(0, 1, .1) > 0);
  assert.ok(applyAircraftHeadingTurn(0, -1, .1) < 0);

  const flight = integrateFixedWingFlight(
    { speed: 70, climbRate: 0, pitch: 0, roll: .45 },
    { throttle: .7, powerFactor: 1, topSpeed: 140 },
    { role: 'personal' },
    1 / 60
  );
  assert.ok(flight.turnRate > 0, 'a positive bank publishes a positive turn rate');
  assert.ok(applyAircraftHeadingTurn(0, flight.turnRate, 1) > 0);
});

test('the player aircraft uses the exact 4.3 bank-to-heading authority', () => {
  const bank = .62;
  const speed = 20;
  const expected = Math.sin(bank) * (.55 + .58);
  assert.ok(Math.abs(classicAircraftBankTurnRate(bank, 0, speed) - expected) < 1e-12);
  assert.ok(classicAircraftBankTurnRate(bank, 0, speed) > .65, 'full bank must produce a tight turn');
});

test('aircraft classes remain distinct while every fixed-wing class has usable bank authority', () => {
  const roles = ['personal', 'aerobatic', 'bush', 'business', 'regional', 'airliner'];
  const tuning = roles.map((role) => resolveAircraftFlightTuning({ role }));
  for (const entry of tuning) {
    assert.ok(entry.turnResponse >= 1.6);
    assert.ok(entry.maxBank >= .45);
    assert.ok(entry.rollControl >= .5);
  }
  assert.ok(tuning.at(-1).turnResponse < tuning[0].turnResponse);
  assert.ok(tuning.at(-1).maxBank < tuning[0].maxBank);
});

test('parachute and freefall use the same left-positive heading convention as aircraft', () => {
  const left = integrateSkydivingDynamics(
    { heading: 0, bank: 0, horizontalSpeed: 8 },
    { deployed: true, turn: 1, verticalVelocity: -6 },
    .05
  );
  const right = integrateSkydivingDynamics(
    { heading: 0, bank: 0, horizontalSpeed: 8 },
    { deployed: true, turn: -1, verticalVelocity: -6 },
    .05
  );
  assert.ok(left.heading > 0);
  assert.ok(right.heading < 0);
});

test('a stationary drone keeps the camera direction selected by the player', () => {
  const originalDrone = appCtx.drone;
  const originalReadControlActions = appCtx.readControlActions;
  const originalTerrainEnabled = appCtx.terrainEnabled;
  const originalOnMars = appCtx.onMars;
  const originalOnMoon = appCtx.onMoon;
  try {
    appCtx.drone = {
      x: 0, y: 50, z: 0,
      pitch: 0, yaw: 0, roll: 0, speed: 30,
      cameraYawOffset: .84,
      cameraPitchOffset: -.31,
      cameraLookTimer: 0
    };
    appCtx.readControlActions = () => ({ move: 0, turn: 0, lookYaw: 0, lookPitch: 0, vertical: 0 });
    appCtx.terrainEnabled = false;
    appCtx.onMars = false;
    appCtx.onMoon = false;
    updateDrone(2);
    assert.equal(appCtx.drone.cameraYawOffset, .84);
    assert.equal(appCtx.drone.cameraPitchOffset, -.31);
  } finally {
    appCtx.drone = originalDrone;
    appCtx.readControlActions = originalReadControlActions;
    appCtx.terrainEnabled = originalTerrainEnabled;
    appCtx.onMars = originalOnMars;
    appCtx.onMoon = originalOnMoon;
  }
});

test('a generalized urban bridge searches beyond parallel roads for visible support', () => {
  const feature = {
    sourceFeatureId: 'shortbread:test:bridge',
    pts: [{ x: 0, z: 0 }, { x: 0, z: 180 }],
    width: 10.8,
    structureSemantics: {
      terrainMode: 'elevated',
      isBridge: true,
      featureCategory: 'road'
    },
    structureStations: [],
    transportRecord: {
      completeness: 'generalized',
      routeState: 'complete'
    },
    transportSurfaceModel: {
      distances: new Float32Array([0, 180]),
      centerHeights: new Float32Array([6.2, 6.2]),
      leftHeights: new Float32Array([6.2, 6.2]),
      rightHeights: new Float32Array([6.2, 6.2])
    }
  };
  const assembly = compileElevatedAssembly(feature, () => 0, {
    supportConflict: (_owner, column) => Math.abs(column.offset) < 14,
    supportSpanConflict: () => false,
    pointInMappedWater: () => false
  });

  assert.equal(assembly.publishBody, true);
  assert.ok(assembly.supportStations.length > 0);
  assert.ok(assembly.supportStations.some((station) =>
    station.columns.some((column) => Math.abs(column.offset) >= 14)
  ));
});

test('elevated markings stay disabled while terrain-conforming ground markings remain available', () => {
  const generalizedBridge = {
    type: 'primary',
    transportRecord: { completeness: 'generalized' },
    structureSemantics: { terrainMode: 'elevated' }
  };
  assert.equal(shouldRenderRoadCenterMarkings(generalizedBridge), false);
  assert.equal(shouldRenderRoadCenterMarkings({
    ...generalizedBridge,
    structureSemantics: { terrainMode: 'at_grade' }
  }), true);
  assert.equal(shouldRenderRoadCenterMarkings({
    ...generalizedBridge,
    transportRecord: { completeness: 'lossless' }
  }), false);
});

test('published ground markings are clipped to their folded surface and cannot attach to an elevated deck', () => {
  const mesh = (terrainMode, y) => ({
    geometry: { attributes: { position: { array: new Float32Array([
      0,y,-2, 0,y,2, 3,y,-2, 3,y,2, 6,y+2,-2, 6,y+2,2
    ]) } }, getIndex: () => ({ array: new Uint16Array([0,1,2,2,1,3,2,3,4,4,3,5]) }) },
    userData: { terrainMode }
  });
  const road = { type:'primary', width:10, structureSemantics:{terrainMode:'at_grade'} };
  const points = [{x:-2,z:0},{x:20,z:0}];
  const ground = createRoadContactIndex([mesh('at_grade',0)]);
  const elevated = createRoadContactIndex([mesh('elevated',10)]);
  try {
    const vertices=[], indices=[];
    appendRoadCenterMarkings(road,points,vertices,indices,null,()=>999,ground);
    assert.ok(indices.length>0);
    for(let i=0;i<indices.length;i+=3){
      const ids=indices.slice(i,i+3), x=ids.reduce((n,j)=>n+vertices[j*3],0)/3,
        z=ids.reduce((n,j)=>n+vertices[j*3+2],0)/3, y=ids.reduce((n,j)=>n+vertices[j*3+1],0)/3;
      assert.ok(x>=0&&x<=6,'no unsupported marking outside the published road');
      assert.ok(Math.abs(y-ground.sampleAt(x,z)-.012)<1e-5,'marking follows the folded mesh, not stale profile');
    }
    const unsupported=[], unsupportedIndices=[];
    appendRoadCenterMarkings(road,points,unsupported,unsupportedIndices,null,()=>10,elevated);
    assert.equal(unsupported.length,0,'a nearby raised road cannot support ground markings');
  } finally { ground.dispose(); elevated.dispose(); }
});
