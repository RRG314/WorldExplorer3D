import test from 'node:test';
import assert from 'node:assert/strict';

import { ctx as appCtx } from '../app/js/shared-context.js?v=55';
import {
  OPEN_OCEAN_SHORE_VISIBILITY_METERS,
  shouldSuppressOpenOceanSurfaceLayers
} from '../app/js/boat-mode/surface-layer-visibility.js';
import { createWalkingPhysicsHelpers } from '../app/js/walking/physics.js';
import { getMaritimeCatalogEntry } from '../app/js/transport/maritime-catalog.js';
import { vesselPlacementConflictsWithMappedShip } from '../app/js/transport/maritime-runtime.js';
import { resolveMappedVesselIdentity } from '../app/js/world/water-adjacent-structures.js';
import { reviewedMappedVesselDataNear } from '../app/js/world/reviewed-mapped-vessels.js';
import { mergeMappedWaterStructures } from '../app/js/world/water-structure-source.js';

test('open-water presentation restores the mapped shore before the boat reaches it', () => {
  const common = { active: true, waterKind: 'open_ocean' };
  assert.equal(shouldSuppressOpenOceanSurfaceLayers({
    ...common,
    shorelineDistance: OPEN_OCEAN_SHORE_VISIBILITY_METERS + 1
  }), true);
  assert.equal(shouldSuppressOpenOceanSurfaceLayers({
    ...common,
    shorelineDistance: OPEN_OCEAN_SHORE_VISIBILITY_METERS
  }), false);
  assert.equal(shouldSuppressOpenOceanSurfaceLayers({ ...common, shorelineDistance: 90 }), false);
  assert.equal(shouldSuppressOpenOceanSurfaceLayers({ ...common, shorelineDistance: undefined }), false);
  assert.equal(shouldSuppressOpenOceanSurfaceLayers({ ...common, waterKind: 'harbor', shorelineDistance: 5000 }), false);
});

test('mapped vessel identity preserves provider names and uses the correct historic class', () => {
  assert.deepEqual(resolveMappedVesselIdentity({
    name: 'USS Constellation',
    historic: 'ship',
    building: 'ship'
  }), {
    name: 'USS Constellation',
    typeId: 'sloop-of-war',
    typeLabel: 'Sloop-of-war museum ship',
    label: 'USS Constellation · Sloop-of-war museum ship'
  });
  assert.equal(resolveMappedVesselIdentity({ name: 'Harbor Queen', 'ship:type': 'ferry' }).label,
    'Harbor Queen · Passenger ferry');
  assert.equal(resolveMappedVesselIdentity({ building: 'houseboat' }).label, 'Houseboat');
});

test('generated fleet placement cannot cover a mapped historic ship', () => {
  const mapped = {
    userData: {
      isMappedVessel: true,
      lodCenter: { x: 100, z: 50 },
      buildingFootprint: [
        { x: 90, z: 45 }, { x: 110, z: 45 },
        { x: 110, z: 55 }, { x: 90, z: 55 }
      ]
    }
  };
  const cargo = getMaritimeCatalogEntry('container-cargo-ship');
  assert.equal(vesselPlacementConflictsWithMappedShip(110, 50, cargo, [mapped]), true);
  assert.equal(vesselPlacementConflictsWithMappedShip(400, 50, cargo, [mapped]), false);
});

test('reviewed OSM ship identity remains available when the optional live query is unavailable', () => {
  const reviewed = reviewedMappedVesselDataNear({ lat: 39.28305, lon: -76.61270 });
  assert.equal(reviewed?._reviewedMappedVesselCount, 1);
  const footprintData = { elements: [], _overpassSource: 'overture-buildings-pmtiles' };
  const summary = mergeMappedWaterStructures(footprintData, reviewed, { lat: 39.28305, lon: -76.61270 });
  assert.equal(summary.semanticVessels, 1);
  const vessel = footprintData.elements.find((element) => element.type === 'way');
  assert.equal(vessel.tags.name, 'USS Constellation');
  assert.equal(vessel.tags['ship:type'], 'sloop_of_war');
  assert.equal(vessel.tags._license, 'ODbL-1.0');
});

test('a walker who lands on a mapped roof can move across that roof', () => {
  const touched = new Map();
  const setCtx = (key, value) => {
    touched.set(key, Object.hasOwn(appCtx, key) ? appCtx[key] : Symbol.for('missing'));
    appCtx[key] = value;
  };
  const building = {
    pts: [
      { x: -8, z: -8 }, { x: 8, z: -8 },
      { x: 8, z: 8 }, { x: -8, z: 8 }
    ],
    minX: -8,
    maxX: 8,
    minZ: -8,
    maxZ: 8,
    minY: 0,
    maxY: 10,
    baseY: 0,
    height: 10
  };
  const pointInPolygon = (x, z, points) => {
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minZ = Math.min(...points.map((point) => point.z));
    const maxZ = Math.max(...points.map((point) => point.z));
    return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
  };
  const state = {
    walker: {
      x: 0, z: 0, y: 11.7, angle: 0, yaw: 0, lookYawOffset: 0,
      pitch: 0, speedMph: 0, vy: 0, onGround: true, onBuilding: true,
      wallJumpTimer: 0, mobileForward: 0, mobileStrafe: 0,
      mobileMoveBasisYaw: null, mobileMoveWasActive: false
    },
    characterMesh: null
  };
  const CFG = {
    eyeHeight: 1.7,
    runSpeed: 5.6,
    walkSpeed: 2.8,
    turnSpeed: 2.6,
    wallDetectRadius: 1.65,
    wallJumpVelocity: 7.2,
    wallJumpOutward: .28,
    wallJumpCooldown: .18,
    blockStepHeight: .65
  };
  const collisionCalls = [];
  try {
    setCtx('onMoon', false);
    setCtx('onMars', false);
    setCtx('activePlanetaryBodyId', null);
    setCtx('activeInterior', null);
    setCtx('urbanSandboxRuntime', null);
    setCtx('METERS_PER_WORLD_UNIT', 1);
    setCtx('readControlActions', () => ({ move: 1, strafe: 0, sprint: 0, jump: 0, turn: 0, lookYaw: 0, lookPitch: 0 }));
    setCtx('checkBuildingCollision', (x, z, radius, options = {}) => {
      const collision = { collision: true, building, inside: true };
      const accepted = options.acceptCollision?.(collision) !== false;
      collisionCalls.push({ x, z, actorBaseY: options.actorBaseY, accepted });
      return accepted ? collision : { collision: false };
    });
    setCtx('SurfaceQuery', { terrainAt: () => ({ position: { y: 0 } }) });
    setCtx('getBuildTopSurfaceAtWorldXZ', undefined);
    setCtx('getBuildCollisionAtWorldXZ', undefined);
    setCtx('resolveUrbanActorCollision', undefined);
    setCtx('isUrbanParachuteDeployed', () => false);
    setCtx('onUrbanParachuteLanded', () => {});
    setCtx('liveGpsTranslationOwned', () => false);

    const physics = createWalkingPhysicsHelpers({
      CFG,
      animateCharacterWalk() {},
      getBuildingsArray: () => [building],
      getNearbyBuildings: () => [building],
      getWalkGroundY: () => 0,
      isPointInPolygon: pointInPolygon,
      keys: {},
      state
    });
    physics.updateWalkPhysics(.1, (value, fallback) => Number.isFinite(value) ? value : fallback);
    assert.ok(state.walker.z > .2, `expected roof movement, received z=${state.walker.z}; collision calls=${JSON.stringify(collisionCalls)}`);
    assert.equal(state.walker.onGround, true);
    assert.equal(state.walker.onBuilding, true);
    assert.equal(state.walker.y, 11.7);
  } finally {
    for (const [key, prior] of touched) {
      if (prior === Symbol.for('missing')) delete appCtx[key];
      else appCtx[key] = prior;
    }
  }
});
