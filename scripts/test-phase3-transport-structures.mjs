import assert from 'node:assert/strict';
import {
  buildFeatureStations,
  updateFeatureSurfaceProfile
} from '../app/js/structure-semantics.js';
import { classifyStructureSemantics } from '../app/js/structure-semantics/classification.js';
import { compileTunnelSystemModel } from '../app/js/world/compiler/tunnel-system-model.js';
import { compileTransportStructureModel } from '../app/js/world/compiler/transport-structure-model.js';
import { compileStructureColliderDescriptors } from '../app/js/world/structure-colliders.js';
import {
  collectCoveredVisualInstances,
  collectTunnelVisualInstances
} from '../app/js/terrain/structure-tunnel-visuals.js';

function constantProfile(length, y = 0, width = 8) {
  return {
    width,
    pathDistances: new Float32Array([0, length]),
    distances: new Float32Array([0, length]),
    centerHeights: new Float32Array([y, y]),
    leftHeights: new Float32Array([y, y]),
    rightHeights: new Float32Array([y, y])
  };
}

function structureFeature(id, points, tags, options = {}) {
  const length = points.slice(1).reduce((distance, point, index) =>
    distance + Math.hypot(point.x - points[index].x, point.z - points[index].z), 0);
  return {
    sourceFeatureId: id,
    width: options.width || 8,
    type: options.type || tags.highway || 'primary',
    networkKind: 'road',
    pts: points,
    driveable: options.driveable !== false,
    structureSemantics: classifyStructureSemantics(tags, {
      featureKind: 'road',
      subtype: options.type || tags.highway || 'primary'
    }),
    transportRecord: {
      identity: id,
      routeState: options.routeState || 'complete',
      safeForDriving: options.driveable !== false,
      maxHeightMeters: options.maxHeightMeters || null
    },
    transportSurfaceModel: constantProfile(length, options.surfaceY || 0, options.width || 8),
    connectedFeatures: { start: [], end: [] }
  };
}

function pointAlongPolyline(points, distance) {
  const target = Math.max(0, Number(distance) || 0);
  let traveled = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (!(length > 0)) continue;
    if (target <= traveled + length || index === points.length - 2) {
      const t = Math.max(0, Math.min(1, (target - traveled) / length));
      return {
        x: start.x + dx * t,
        z: start.z + dz * t,
        tangentX: dx / length,
        tangentZ: dz / length
      };
    }
    traveled += length;
  }
  return null;
}

const taxonomy = {
  bridge: classifyStructureSemantics({ bridge: 'yes', layer: '1' }, { featureKind: 'road', subtype: 'primary' }),
  tunnel: classifyStructureSemantics({ tunnel: 'yes', layer: '-1' }, { featureKind: 'road', subtype: 'primary' }),
  underground: classifyStructureSemantics({ location: 'underground' }, { featureKind: 'road', subtype: 'primary' }),
  covered: classifyStructureSemantics({ covered: 'yes' }, { featureKind: 'road', subtype: 'service' }),
  buildingPassage: classifyStructureSemantics({ tunnel: 'building_passage' }, { featureKind: 'road', subtype: 'service' }),
  culvert: classifyStructureSemantics({ tunnel: 'culvert', layer: '-1' }, { featureKind: 'road', subtype: 'service' }),
  cutting: classifyStructureSemantics({ cutting: 'yes' }, { featureKind: 'road', subtype: 'secondary' }),
  embankment: classifyStructureSemantics({ embankment: 'yes' }, { featureKind: 'road', subtype: 'secondary' }),
  indoorNo: classifyStructureSemantics({ indoor: 'no' }, { featureKind: 'road', subtype: 'service' })
};
assert.equal(taxonomy.bridge.structureKind, 'bridge');
assert.equal(taxonomy.tunnel.structureKind, 'tunnel');
assert.equal(taxonomy.underground.underground, true);
assert.equal(taxonomy.covered.structureKind, 'covered');
assert.equal(taxonomy.buildingPassage.buildingPassage, true);
assert.equal(taxonomy.buildingPassage.isTunnel, false);
assert.equal(taxonomy.culvert.structureKind, 'culvert');
assert.equal(taxonomy.cutting.cutting, true);
assert.equal(taxonomy.embankment.embankment, true);
assert.equal(taxonomy.indoorNo.indoor, false);

const bridgeA = structureFeature(
  'osm:way:bridge-a',
  [{ x: 0, z: 0 }, { x: 50, z: 0 }],
  { highway: 'primary', bridge: 'yes', layer: '1' }
);
const bridgeB = structureFeature(
  'osm:way:bridge-b',
  [{ x: 50, z: 0 }, { x: 100, z: 0 }],
  { highway: 'primary', bridge: 'yes', layer: '1' }
);
const surfaceStart = structureFeature(
  'osm:way:surface-start',
  [{ x: -30, z: 0 }, { x: 0, z: 0 }],
  { highway: 'primary' }
);
const surfaceEnd = structureFeature(
  'osm:way:surface-end',
  [{ x: 100, z: 0 }, { x: 130, z: 0 }],
  { highway: 'primary' }
);
bridgeA.connectedFeatures.start.push({ feature: surfaceStart });
bridgeA.connectedFeatures.end.push({ feature: bridgeB });
bridgeB.connectedFeatures.start.push({ feature: bridgeA });
bridgeB.connectedFeatures.end.push({ feature: surfaceEnd });
const bridgeModel = compileTransportStructureModel(
  [surfaceStart, bridgeA, bridgeB, surfaceEnd],
  { transportGraphId: 'transport-network:test' }
);
assert.equal(bridgeModel.authority, 'compiled_transport_structures');
assert.equal(bridgeModel.transportGraphId, 'transport-network:test');
assert.equal(bridgeModel.stats.chainCount, 1);
assert.equal(bridgeA.transportStructureRef.chainId, bridgeB.transportStructureRef.chainId);
assert.equal(bridgeA.transportStructureRef.start.state, 'surface_transition');
assert.equal(bridgeA.transportStructureRef.end.state, 'structure_continuation');
assert.ok(
  bridgeA.transportStructureRef.specification.barrierOffset > bridgeA.width * 0.5,
  'bridge barrier was not constrained to the deck side'
);

const incompleteRamp = structureFeature(
  'osm:way:incomplete-ramp',
  [{ x: 0, z: 30 }, { x: 45, z: 30 }],
  { highway: 'motorway_link', bridge: 'yes', layer: '1' },
  { routeState: 'incomplete', driveable: false }
);
const incompleteModel = compileTransportStructureModel([incompleteRamp]);
assert.equal(incompleteModel.stats.incompleteCount, 1);
assert.equal(incompleteRamp.transportStructureRef.driveable, false);
assert.equal(incompleteRamp.transportStructureRef.start.state, 'incomplete_source');
assert.equal(incompleteRamp.transportStructureRef.start.policy, 'non_drivable');

const underpass = structureFeature(
  'osm:way:underpass',
  [{ x: 0, z: 0 }, { x: 100, z: 0 }],
  { highway: 'primary', tunnel: 'yes', layer: '-1' }
);
const crossingRoad = structureFeature(
  'osm:way:crossing',
  [{ x: 50, z: -30 }, { x: 50, z: 30 }],
  { highway: 'primary', layer: '0' }
);
const underpassModel = compileTunnelSystemModel(underpass, () => 0, {
  features: [underpass, crossingRoad]
});
underpass.tunnelSystemModel = underpassModel;
compileTransportStructureModel([underpass, crossingRoad]);
assert.equal(underpassModel.visualKind, 'underpass');
assert.equal(underpassModel.shellRanges.length, 1);
assert.ok(underpassModel.shellStart < 50 && underpassModel.shellEnd > 50);
assert.equal(underpassModel.portalDistances.length, 2);
assert.equal(underpassModel.portalZones.length, 2);

const tunnelColliders = compileStructureColliderDescriptors([underpass]);
const tunnelWalls = tunnelColliders.filter((collider) => collider.structureColliderKind === 'side_wall');
const tunnelCeilings = tunnelColliders.filter((collider) => collider.structureColliderKind === 'ceiling');
assert.ok(tunnelWalls.length >= 2);
assert.ok(tunnelCeilings.length >= 1);
assert.ok(tunnelCeilings.every((collider) => collider.minY >= underpassModel.clearance));
assert.ok(tunnelWalls.every((collider) => {
  const centerZ = collider.pts.reduce((sum, point) => sum + point.z, 0) / collider.pts.length;
  return Math.abs(centerZ) > underpass.width * 0.5;
}), 'tunnel wall collider crossed the drivable centerline');
const underpassVisuals = collectTunnelVisualInstances(
  underpass,
  underpass.pts,
  100,
  {
    samplePointAlongPolyline: pointAlongPolyline,
    sampleTerrainHeight: () => 8
  }
);
assert.equal(underpassVisuals.shells.length, 1);
assert.equal(underpassVisuals.portals.length, 6);
assert.equal(underpassVisuals.lights.length, 0);
assert.equal(underpassVisuals.shells[0].visualKind, 'underpass');

const buildingPassage = structureFeature(
  'osm:way:building-passage',
  [{ x: 0, z: 50 }, { x: 40, z: 50 }],
  { highway: 'service', tunnel: 'building_passage', covered: 'yes' },
  { maxHeightMeters: 4.1 }
);
compileTransportStructureModel([buildingPassage]);
const coveredColliders = compileStructureColliderDescriptors([buildingPassage]);
assert.ok(coveredColliders.some((collider) => collider.structureColliderKind === 'ceiling'));
assert.ok(coveredColliders.some((collider) => collider.structureColliderKind === 'side_wall'));
const coveredVisuals = collectCoveredVisualInstances(
  buildingPassage,
  buildingPassage.pts,
  { samplePointAlongPolyline: pointAlongPolyline }
);
assert.equal(coveredVisuals.roofs.length, 1);
assert.equal(coveredVisuals.walls.length, 2);
assert.equal(coveredVisuals.portals.length, 6);

const slopedLower = structureFeature(
  'fixture:sloped-lower',
  [{ x: -100, z: 0 }, { x: 100, z: 0 }],
  { highway: 'motorway_link', bridge: 'yes', layer: '1' }
);
const slopedUpper = structureFeature(
  'fixture:sloped-upper',
  [{ x: 0, z: -100 }, { x: 0, z: 100 }],
  { highway: 'motorway_link', bridge: 'yes', layer: '2' }
);
const slopedGround = (x) => x * x / 1000;
for (let refinement = 0; refinement < 3; refinement += 1) {
  for (const feature of [slopedLower, slopedUpper]) {
    feature.structureStations = buildFeatureStations(feature, {
      features: [slopedLower, slopedUpper],
      sampleTerrainY: slopedGround
    });
    updateFeatureSurfaceProfile(feature, slopedGround);
  }
}
for (const feature of [slopedLower, slopedUpper]) {
  feature.structureStations = buildFeatureStations(feature, {
    features: [slopedLower, slopedUpper],
    sampleTerrainY: slopedGround
  });
  updateFeatureSurfaceProfile(feature, slopedGround);
}
const slopedLowerY = slopedLower.transportSurfaceModel.centerHeights[
  Math.floor(slopedLower.transportSurfaceModel.centerHeights.length / 2)
];
const slopedUpperY = slopedUpper.transportSurfaceModel.centerHeights[
  Math.floor(slopedUpper.transportSurfaceModel.centerHeights.length / 2)
];
assert.ok(
  slopedUpperY - slopedLowerY >= 5.4,
  `world-space crossing clearance collapsed to ${(slopedUpperY - slopedLowerY).toFixed(3)}m`
);

const performanceFixture = Array.from({ length: 600 }, (_, index) => structureFeature(
  `fixture:bridge:${index}`,
  [
    { x: index * 12, z: 100 },
    { x: index * 12 + 80, z: 100 }
  ],
  { highway: 'primary', bridge: 'yes', layer: '1' }
));
const compileStartedAt = performance.now();
const performanceModel = compileTransportStructureModel(performanceFixture, {
  transportGraphId: 'transport-network:performance-fixture'
});
const compileDurationMs = performance.now() - compileStartedAt;
assert.equal(performanceModel.stats.featureCount, performanceFixture.length);
assert.ok(compileDurationMs < 1000, `structure compiler exceeded bounded fixture budget: ${compileDurationMs.toFixed(1)}ms`);

console.log(JSON.stringify({
  ok: true,
  taxonomy: Object.keys(taxonomy),
  chains: {
    count: bridgeModel.stats.chainCount,
    bridgeChainId: bridgeA.transportStructureRef.chainId
  },
  incompleteRoutePolicy: incompleteRamp.transportStructureRef.start.policy,
  underpass: {
    shellStart: Number(underpassModel.shellStart.toFixed(2)),
    shellEnd: Number(underpassModel.shellEnd.toFixed(2)),
    portals: underpassModel.portalDistances.length
  },
  collision: {
    tunnelWalls: tunnelWalls.length,
    tunnelCeilings: tunnelCeilings.length,
    coveredColliders: coveredColliders.length
  },
  visuals: {
    underpassShells: underpassVisuals.shells.length,
    underpassPortals: underpassVisuals.portals.length,
    coveredRoofs: coveredVisuals.roofs.length,
    coveredWalls: coveredVisuals.walls.length,
    coveredPortals: coveredVisuals.portals.length
  },
  slopedTerrainCrossingClearance: Number((slopedUpperY - slopedLowerY).toFixed(3)),
  performance: {
    features: performanceModel.stats.featureCount,
    compileDurationMs: Number(compileDurationMs.toFixed(2))
  }
}, null, 2));
