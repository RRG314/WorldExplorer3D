import assert from 'node:assert/strict';
import {
  buildFeatureStations,
  updateFeatureSurfaceProfile
} from '../app/js/structure-semantics.js';
import { classifyStructureSemantics } from '../app/js/structure-semantics/classification.js';
import { compileTunnelSystemModel } from '../app/js/world/compiler/tunnel-system-model.js';
import { compileTransportStructureModel } from '../app/js/world/compiler/transport-structure-model.js';
import {
  compileElevatedAssembly,
  compileTransportStructureAssemblies
} from '../app/js/world/compiler/transport-structure-assembly.js';
import { buildTransportJunctionProfileAnchors } from '../app/js/world/compiler/transport-junction-profile.js';
import { resolveTunnelCameraEnvelope } from '../app/js/hud/tunnel-camera-envelope.js';
import { isProtectedRoadFeature } from '../app/js/world/bridge-safety.js';
import { compileStructureColliderDescriptors } from '../app/js/world/structure-colliders.js';
import { shouldOmitUnmatchedElevatedPedestrianFeature } from '../app/js/world/load-linear-runtime.js';
import {
  PUBLISH_TUNNEL_STRUCTURE_VISUALS,
  shouldPublishTunnelShellSection
} from '../app/js/terrain/structure-visual-meshes.js';
import {
  canPublishElevatedStructureVisual,
  collectStructureVisualInstances
} from '../app/js/terrain/structure-visuals.js';
import { selectPortalMasksForBounds } from '../app/js/terrain/structure-terrain-portals.js';
import {
  canPublishTunnelVisual,
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
      completeness: options.completeness || 'lossless',
      routeState: options.routeState || 'complete',
      safeForDriving: options.driveable !== false,
      maxHeightMeters: options.maxHeightMeters || null,
      sourceTags: { ...tags }
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
  layerOnlyRoad: classifyStructureSemantics({ layer: '1' }, { featureKind: 'road', subtype: 'service' }),
  layerOnlyFootway: classifyStructureSemantics({ highway: 'footway', layer: '1' }, { featureKind: 'footway', subtype: 'footway' }),
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
assert.equal(taxonomy.layerOnlyRoad.terrainMode, 'at_grade');
assert.equal(taxonomy.layerOnlyRoad.topologySeparated, true);
assert.equal(taxonomy.layerOnlyRoad.physicalStructureEvidence, false);
assert.equal(taxonomy.layerOnlyFootway.terrainMode, 'at_grade');
assert.equal(taxonomy.layerOnlyFootway.physicalStructureEvidence, false);
assert.equal(taxonomy.indoorNo.indoor, false);
assert.equal(taxonomy.tunnel.isTunnel, true);
assert.equal(taxonomy.tunnel.terrainMode, 'subgrade');
assert.equal(taxonomy.tunnel.gradeSeparated, true);
assert.equal(taxonomy.tunnel.topologySeparated, true);
assert.equal(
  shouldOmitUnmatchedElevatedPedestrianFeature(
    { kind: 'footway', subtype: 'footway' },
    classifyStructureSemantics(
      { highway: 'footway', bridge: 'yes', layer: '1' },
      { featureKind: 'footway', subtype: 'footway' }
    )
  ),
  true,
  'standalone elevated footways must not publish inferred 3D structures'
);
assert.equal(
  shouldOmitUnmatchedElevatedPedestrianFeature(
    { kind: 'footway', subtype: 'steps' },
    classifyStructureSemantics(
      { highway: 'steps', bridge: 'yes', layer: '1' },
      { featureKind: 'footway', subtype: 'steps' }
    ),
    { matchedVehicleBridge: true }
  ),
  false,
  'a future positive vehicle-bridge match may retain the pedestrian structure'
);
assert.equal(
  shouldOmitUnmatchedElevatedPedestrianFeature(
    { kind: 'footway', subtype: 'footway' },
    taxonomy.layerOnlyFootway
  ),
  false,
  'ordinary terrain-draped footways must remain available'
);

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
bridgeA.transportRecord.completeness = 'lossless';
assert.equal(isProtectedRoadFeature(bridgeA), true);
compileTransportStructureAssemblies([bridgeA], () => -8);
const bridgeVisuals = collectStructureVisualInstances({
  featuresToProcess: [bridgeA],
  allElevatedFeatures: [bridgeA],
  elevatedVisualFeatures: [bridgeA],
  boundsIntersect: () => false,
  cachedTerrainHeight: () => -8,
  pointAlongPolyline,
  polylineCurvatureMetric: () => 0,
  roadConflictIndex: { query: () => [] }
});
assert.equal(
  bridgeVisuals.deckInstances.length,
  0,
  'vehicle road structures must not republish the obsolete overlapping segment-box body'
);
assert.equal(bridgeVisuals.elevatedDeckShells.length, 1, 'lossless road bridge must publish one continuous body');
assert.equal(bridgeVisuals.elevatedDeckShells[0].bodyCoverage, 1);
assert.ok(bridgeVisuals.girderInstances.length > 0, 'lossless road bridge must publish visible girders');
assert.ok(bridgeVisuals.supportInstances.length > 0, 'lossless road bridge must publish support/abutment geometry');

const curvedRamp = structureFeature(
  'osm:way:curved-ramp',
  [
    { x: 0, z: 0 },
    { x: 35, z: 8 },
    { x: 68, z: 30 },
    { x: 92, z: 66 },
    { x: 105, z: 110 },
    { x: 108, z: 155 }
  ],
  { highway: 'motorway_link', bridge: 'yes', layer: '1', 'bridge:structure': 'viaduct' },
  { width: 6.2, surfaceY: 11 }
);
curvedRamp.structureStations = [{ distance: 78, span: 32, source: 'feature_crossing' }];
compileTransportStructureModel([curvedRamp]);
const curvedRampAssembly = compileElevatedAssembly(curvedRamp, () => 0);
curvedRamp.transportStructureAssembly = curvedRampAssembly;
assert.equal(curvedRampAssembly.bodyCoverage, 1);
assert.equal(curvedRampAssembly.structureType, 'viaduct');
assert.ok(curvedRampAssembly.supportStations.length > 0, 'curved ramp lost every support station');
assert.ok(
  curvedRampAssembly.supportStations.every((station) => station.distance < 58.8 || station.distance > 97.2),
  'a support was placed inside the compiled crossing-clearance exclusion'
);
const curvedRampVisuals = collectStructureVisualInstances({
  featuresToProcess: [curvedRamp],
  allElevatedFeatures: [curvedRamp],
  cachedTerrainHeight: () => 0,
  pointAlongPolyline,
  roadConflictIndex: { candidates: () => [] }
});
assert.equal(curvedRampVisuals.elevatedDeckShells.length, 1);
assert.ok(curvedRampVisuals.supportInstances.length > 0, 'curved/ramp-like geometry must not suppress all supports');

const crossingSafeBridge = structureFeature(
  'osm:way:crossing-safe-bridge',
  [{ x: 0, z: 0 }, { x: 120, z: 0 }],
  { highway: 'motorway', bridge: 'yes', layer: '1' },
  { width: 12, surfaceY: 12 }
);
compileTransportStructureModel([crossingSafeBridge]);
const crossingSafeAssembly = compileElevatedAssembly(
  crossingSafeBridge,
  () => 0,
  {
    // Model a lower road occupying the full space beneath the deck center.
    // The compiler must select the outside-column layout instead of placing a
    // pier through the lower carriageway or suppressing the entire structure.
    supportConflict: (_feature, column) => Math.abs(column.z) < 7
  }
);
assert.ok(crossingSafeAssembly.supportStations.length > 0);
assert.ok(
  crossingSafeAssembly.supportStations.every((station) =>
    station.columns.length === 2 && station.columns.every((column) => Math.abs(column.z) >= 7)
  ),
  'support compiler did not move columns clear of an underlying road corridor'
);
const generalizedBridgeVisual = structureFeature(
  'shortbread:generalized-bridge',
  [{ x: 0, z: 10 }, { x: 60, z: 10 }],
  { highway: 'primary', bridge: 'yes', layer: '1' },
  { surfaceY: 9 }
);
generalizedBridgeVisual.transportRecord.completeness = 'generalized';
compileTransportStructureModel([generalizedBridgeVisual]);
const generalizedBridgeAssembly = compileElevatedAssembly(generalizedBridgeVisual, () => 0);
assert.equal(generalizedBridgeAssembly.bodyCoverage, 1);
assert.ok(
  generalizedBridgeAssembly.supportStations.length > 0 &&
    generalizedBridgeAssembly.supportStations.every((station) => station.columns.length > 0),
  'generalized bridge lost its sparse non-colliding visual support fallback'
);
assert.equal(
  isProtectedRoadFeature(generalizedBridgeVisual),
  false,
  'generalized structure geometry must not publish hard guardrail collision'
);
assert.equal(
  canPublishElevatedStructureVisual(generalizedBridgeVisual),
  true,
  'a complete mapped generalized bridge must retain a visible non-colliding deck'
);
generalizedBridgeVisual.transportRecord.routeState = 'incomplete';
assert.equal(
  canPublishElevatedStructureVisual(generalizedBridgeVisual),
  false,
  'an incomplete generalized bridge must not invent a visible route'
);
generalizedBridgeVisual.transportRecord.routeState = 'complete';
assert.equal(canPublishTunnelVisual(generalizedBridgeVisual), false);

const mergeMainline = structureFeature(
  'osm:way:merge-mainline',
  [{ x: 0, z: 20 }, { x: 100, z: 20 }],
  { highway: 'motorway' },
  { width: 10.8, surfaceY: 4 }
);
mergeMainline.structureSemantics = classifyStructureSemantics(
  { highway: 'motorway' },
  { featureKind: 'road', subtype: 'motorway' }
);
const mergeRamp = structureFeature(
  'osm:way:merge-ramp',
  [{ x: 50, z: 80 }, { x: 50, z: 20 }],
  { highway: 'motorway_link', bridge: 'yes', layer: '1' },
  { width: 6.2, surfaceY: 12 }
);
mergeMainline.transportGraphRef = { featureId: mergeMainline.sourceFeatureId };
mergeRamp.transportGraphRef = { featureId: mergeRamp.sourceFeatureId };
const mergeConnection = Object.freeze({
  left: Object.freeze({
    featureId: mergeRamp.sourceFeatureId,
    endpoint: 'end',
    segmentIndex: 0,
    segmentT: 1,
    distanceAlong: 60,
    point: Object.freeze({ x: 50, z: 20 })
  }),
  right: Object.freeze({
    featureId: mergeMainline.sourceFeatureId,
    endpoint: 'interior',
    segmentIndex: 0,
    segmentT: 0.5,
    distanceAlong: 50,
    point: Object.freeze({ x: 50, z: 20 })
  })
});
const mergeAnchors = buildTransportJunctionProfileAnchors(
  [mergeMainline, mergeRamp],
  { connections: [mergeConnection] },
  () => 0,
  (feature) => feature === mergeMainline ? 4 : 12
);
assert.equal(mergeAnchors.nodeCount, 1);
assert.equal(mergeAnchors.constrainedFeatureCount, 1);
assert.equal(mergeAnchors.anchorsByFeature.get(mergeRamp)[0].targetSurfaceY, 4);
assert.equal(
  mergeAnchors.anchorsByFeature.get(mergeRamp)[0].ownerFeatureId,
  mergeMainline.sourceFeatureId,
  'ramp merge did not inherit its interior mainline surface'
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
  { highway: 'primary', tunnel: 'yes', layer: '-1' },
  { surfaceY: -6 }
);
const crossingRoad = structureFeature(
  'osm:way:crossing',
  [{ x: 50, z: -30 }, { x: 50, z: 30 }],
  { highway: 'primary', layer: '0' }
);
underpass.connectedFeatures.start.push({ feature: surfaceStart });
underpass.connectedFeatures.end.push({ feature: surfaceEnd });
const underpassModel = compileTunnelSystemModel(underpass, () => 0, {
  features: [underpass, crossingRoad]
});
underpass.tunnelSystemModel = underpassModel;
compileTransportStructureModel([underpass, crossingRoad]);
assert.equal(underpassModel.visualKind, 'tunnel');
assert.equal(underpassModel.shellRanges.length, 1);
assert.equal(underpassModel.shellStart, 0);
assert.equal(underpassModel.shellEnd, 100);
assert.equal(underpassModel.portalDistances.length, 2);
assert.equal(underpassModel.portalZones.length, 2);

const tunnelColliders = compileStructureColliderDescriptors([underpass]);
const tunnelWalls = tunnelColliders.filter((collider) => collider.structureColliderKind === 'side_wall');
const tunnelCeilings = tunnelColliders.filter((collider) => collider.structureColliderKind === 'ceiling');
assert.equal(PUBLISH_TUNNEL_STRUCTURE_VISUALS, true);
assert.ok(tunnelWalls.length > 0, 'lossless compiled tunnel walls must own vehicle collision');
assert.equal(tunnelCeilings.length, 0, 'a tunnel ceiling must not become a lateral vehicle obstacle on the street above');
assert.ok(tunnelWalls.every((collider) => collider.maxY - collider.minY <= 3.05));
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
assert.ok(underpassVisuals.portalMasks.length > 0);
assert.ok(underpassVisuals.lights.length > 0);
assert.equal(underpassVisuals.shells[0].visualKind, 'tunnel');
assert.equal(
  selectPortalMasksForBounds(
    { minX: -5, maxX: 105, minZ: -15, maxZ: 15 },
    underpassVisuals.portalMasks
  ).length,
  underpassVisuals.portalMasks.length,
  'portal terrain masks must remain local to the compiled entrance approaches'
);
const tunnelCamera = resolveTunnelCameraEnvelope(underpass, 50, 0);
assert.equal(tunnelCamera.inside, true, 'camera occupancy must follow the compiled tunnel shell interval');
assert.equal(tunnelCamera.floorY, -6);
assert.ok(tunnelCamera.cameraHeight < tunnelCamera.clearance);

const exposedTunnelTag = structureFeature(
  'osm:way:exposed-tunnel-tag',
  [{ x: 0, z: 70 }, { x: 80, z: 70 }],
  { highway: 'service', tunnel: 'yes', layer: '-1' },
  { surfaceY: 0 }
);
exposedTunnelTag.tunnelSystemModel = compileTunnelSystemModel(exposedTunnelTag, () => 0);
compileTransportStructureModel([exposedTunnelTag]);
assert.equal(exposedTunnelTag.tunnelSystemModel.shellRanges.length, 0);
assert.equal(
  resolveTunnelCameraEnvelope(exposedTunnelTag, 40, 70).inside,
  false,
  'an unburied tunnel tag must not force the camera into tunnel mode'
);

const generalizedTunnel = structureFeature(
  'shortbread:generalized-tunnel',
  [{ x: 0, z: 20 }, { x: 100, z: 20 }],
  { highway: 'primary', tunnel: 'yes', layer: '-1' },
  { completeness: 'generalized' }
);
generalizedTunnel.tunnelSystemModel = compileTunnelSystemModel(generalizedTunnel, () => 8);
assert.equal(generalizedTunnel.tunnelSystemModel.visualKind, 'tunnel');
assert.equal(canPublishTunnelVisual(generalizedTunnel), true);
assert.equal(
  compileStructureColliderDescriptors([generalizedTunnel]).length,
  0,
  'generalized tunnel centerlines cannot publish hard collision geometry'
);
generalizedTunnel.transportRecord.routeState = 'incomplete';
assert.equal(canPublishTunnelVisual(generalizedTunnel), false);

const junctionStem = structureFeature(
  'osm:way:junction-stem',
  [{ x: 0, z: 0 }, { x: 60, z: 0 }],
  { highway: 'primary', tunnel: 'yes', layer: '-1' },
  { surfaceY: -7 }
);
const junctionLeft = structureFeature(
  'osm:way:junction-left',
  [{ x: 60, z: 0 }, { x: 110, z: -35 }],
  { highway: 'primary', tunnel: 'yes', layer: '-1' },
  { surfaceY: -7 }
);
const junctionRight = structureFeature(
  'osm:way:junction-right',
  [{ x: 60, z: 0 }, { x: 110, z: 35 }],
  { highway: 'primary', tunnel: 'yes', layer: '-1' },
  { surfaceY: -7 }
);
junctionStem.connectedFeatures.end.push({ feature: junctionLeft }, { feature: junctionRight });
junctionLeft.connectedFeatures.start.push({ feature: junctionStem }, { feature: junctionRight });
junctionRight.connectedFeatures.start.push({ feature: junctionStem }, { feature: junctionLeft });
for (const feature of [junctionStem, junctionLeft, junctionRight]) {
  feature.tunnelSystemModel = compileTunnelSystemModel(feature, () => 2);
  assert.equal(feature.tunnelSystemModel.junctionZones.length, 1);
  assert.equal(feature.tunnelSystemModel.junctionZones[0].connectionCount, 3);
}
const stemZone = junctionStem.tunnelSystemModel.junctionZones[0];
const junctionColliders = compileStructureColliderDescriptors([junctionStem]);
assert.ok(junctionColliders.length > 0, 'the tunnel stem must retain walls outside its junction');
assert.ok(
  junctionColliders.every((collider) => collider.pts.every((point) => point.x <= stemZone.start + 0.15)),
  'tunnel side-wall collision continued into a splitting drive lane'
);
const junctionVisuals = collectTunnelVisualInstances(
  junctionStem,
  junctionStem.pts,
  60,
  {
    samplePointAlongPolyline: pointAlongPolyline,
    sampleTerrainHeight: () => 2
  }
);
assert.equal(junctionVisuals.shells.length, 1);
assert.deepEqual(junctionVisuals.shells[0].junctionZones, junctionStem.tunnelSystemModel.junctionZones);
const chamberDistance = (stemZone.start + stemZone.end) * 0.5;
assert.equal(
  shouldPublishTunnelShellSection(junctionVisuals.shells[0], 0, chamberDistance),
  false,
  'left tunnel wall continued through the graph-owned junction chamber'
);
assert.equal(
  shouldPublishTunnelShellSection(junctionVisuals.shells[0], 5, chamberDistance),
  false,
  'right tunnel wall continued through the graph-owned junction chamber'
);
assert.equal(
  shouldPublishTunnelShellSection(junctionVisuals.shells[0], 2, chamberDistance),
  true,
  'junction chamber lost its terrain-occluding crown'
);
assert.equal(
  shouldPublishTunnelShellSection(junctionVisuals.shells[0], 0, stemZone.start - 1),
  true,
  'tunnel wall was removed outside the junction chamber'
);

const buildingPassage = structureFeature(
  'osm:way:building-passage',
  [{ x: 0, z: 50 }, { x: 40, z: 50 }],
  { highway: 'service', tunnel: 'building_passage', covered: 'yes' },
  { maxHeightMeters: 4.1 }
);
compileTransportStructureModel([buildingPassage]);
const coveredColliders = compileStructureColliderDescriptors([buildingPassage]);
assert.equal(
  coveredColliders.length,
  0,
  'a covered/building-passage tag must not invent a freestanding collision shell'
);
const coveredVisuals = collectStructureVisualInstances({
  featuresToProcess: [buildingPassage],
  allElevatedFeatures: [buildingPassage],
  cachedTerrainHeight: () => 0,
  pointAlongPolyline,
  roadConflictIndex: { query: () => [] }
});
assert.equal(coveredVisuals.roofInstances.length, 0);
assert.equal(coveredVisuals.wallInstances.length, 0);
assert.equal(coveredVisuals.portalInstances.length, 0);
assert.equal(
  resolveTunnelCameraEnvelope(buildingPassage, 20, 50).inside,
  false,
  'a covered/building-passage tag without a compiled shell must not force tunnel camera mode'
);

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
    bridgeDeckBodies: bridgeVisuals.elevatedDeckShells.length,
    bridgeGirders: bridgeVisuals.girderInstances.length,
    bridgeSupports: bridgeVisuals.supportInstances.length,
    curvedRampSupports: curvedRampVisuals.supportInstances.length,
    crossingSafeSupportStations: crossingSafeAssembly.supportStations.length,
    underpassShells: underpassVisuals.shells.length,
    underpassPortals: underpassVisuals.portals.length,
    coveredRoofs: coveredVisuals.roofInstances.length,
    coveredWalls: coveredVisuals.wallInstances.length,
    coveredPortals: coveredVisuals.portalInstances.length,
    tunnelJunctionZones: junctionStem.tunnelSystemModel.junctionZones.length
  },
  tunnelCamera: {
    inside: tunnelCamera.inside,
    floorY: tunnelCamera.floorY,
    ceilingY: tunnelCamera.ceilingY,
    exposedTagInside: resolveTunnelCameraEnvelope(exposedTunnelTag, 40, 70).inside
  },
  slopedTerrainCrossingClearance: Number((slopedUpperY - slopedLowerY).toFixed(3)),
  performance: {
    features: performanceModel.stats.featureCount,
    compileDurationMs: Number(compileDurationMs.toFixed(2))
  }
}, null, 2));
