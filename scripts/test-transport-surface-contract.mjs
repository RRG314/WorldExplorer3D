import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  TRANSPORT_SURFACE_SCHEMA_VERSION,
  compileTransportSurfaceModel,
  sampleTransportSurfaceAtDistance
} from '../app/js/world/compiler/transport-surface-model.js';
import {
  assignFeatureConnections,
  assignStructureStackRanks,
  buildFeatureStations,
  buildFeatureTransitionAnchors,
  buildFeatureRibbonEdges,
  isRoadSurfaceReachable,
  sampleFeatureSurfaceY,
  updateFeatureSurfaceProfile
} from '../app/js/structure-semantics.js';
import { detectRoadIntersections } from '../app/js/terrain/intersections.js';
import { roadHeadingAtSegment } from '../app/js/world/spawn-surface.js';
import { resolveVehicleSurface } from '../app/js/physics/vehicle-surface.js';

const EPSILON = 1e-4;
const SURFACE_BIAS = 0.08;
const repositoryRoot = path.resolve(import.meta.dirname, '..');

function straightFeature({
  id,
  length = 240,
  width = 10,
  originX = 0,
  originZ = 0,
  semantics
}) {
  return {
    sourceFeatureId: id,
    pts: [
      { x: originX, z: originZ },
      { x: originX + length * 0.5, z: originZ },
      { x: originX + length, z: originZ }
    ],
    width,
    surfaceBias: SURFACE_BIAS,
    structureSemantics: semantics,
    networkKind: 'road',
    type: semantics?.rampCandidate ? 'motorway_link' : 'primary'
  };
}

const terrainFamilies = [
  {
    id: 'flat_coastal',
    sample: () => 2
  },
  {
    id: 'rolling_inland',
    sample: (x, z) => 120 + Math.sin(x / 44) * 2.8 + Math.cos(z / 51) * 1.7
  },
  {
    id: 'high_mountain',
    sample: (x, z) => 1850 + x * 0.035 + Math.sin((x + z) / 31) * 3.2
  },
  {
    id: 'below_sea_level',
    sample: (x, z) => -86 + x * 0.018 + Math.cos(z / 37) * 1.2
  },
  {
    id: 'polar_plateau',
    sample: (x, z) => 640 + x * -0.024 + Math.sin(z / 29) * 0.9
  },
  {
    id: 'logical_tile_edge',
    sample: (x, z) => 55 + x * 0.028 + z * 0.006 + (x >= 120 ? 0.015 : 0)
  }
];

const geographyResults = [];

const curvedSpawnRoad = {
  pts: [
    { x: 0, z: 0 },
    { x: 0, z: 40 },
    { x: 40, z: 40 }
  ]
};
assert.ok(
  Math.abs(roadHeadingAtSegment(curvedSpawnRoad, 1) - Math.PI / 2) <= EPSILON,
  'projected spawn heading did not preserve the selected curved-road segment'
);
for (const terrain of terrainFamilies) {
  const feature = straightFeature({
    id: `at-grade-${terrain.id}`,
    semantics: {
      terrainMode: 'at_grade',
      gradeSeparated: false,
      rampCandidate: false,
      verticalGroup: 'at_grade:0:at_grade'
    }
  });
  const model = compileTransportSurfaceModel(feature, terrain.sample, {
    sampleStep: 2,
    maximumGrade: 0.12
  });
  assert.equal(model.schemaVersion, TRANSPORT_SURFACE_SCHEMA_VERSION);
  assert.equal(model.authority, 'compiled_transport_surface');
  assert.ok(model.stats.maximumGrade <= 0.1201, `${terrain.id}: grade limit exceeded`);
  assert.equal(model.cutFillPolicy.signed, true, `${terrain.id}: signed cut/fill disabled`);
  assert.ok(
    model.stats.maximumCut <= model.cutFillPolicy.maximumCutMeters + EPSILON,
    `${terrain.id}: cut bound exceeded`
  );
  assert.ok(
    model.stats.maximumFill <= model.cutFillPolicy.maximumFillMeters + EPSILON,
    `${terrain.id}: fill bound exceeded`
  );

  if (terrain.id === 'rolling_inland' || terrain.id === 'high_mountain') {
    assert.ok(model.stats.maximumCut > 0.02, `${terrain.id}: road still only raises terrain`);
    assert.ok(model.stats.maximumFill > 0.02, `${terrain.id}: road did not fill terrain dips`);
  }

  geographyResults.push({
    id: terrain.id,
    samples: model.distances.length,
    maximumGrade: Number(model.stats.maximumGrade.toFixed(5)),
    maximumCut: Number(model.stats.maximumCut.toFixed(4)),
    maximumFill: Number(model.stats.maximumFill.toFixed(4))
  });
}

const translatedTerrain = (x, z) => 325 + (x - 100000) * 0.025 + Math.sin((z + 80000) / 40) * 1.4;
const translatedRoad = straightFeature({
  id: 'translated-global-coordinate',
  originX: 100000,
  originZ: -80000,
  semantics: {
    terrainMode: 'at_grade',
    gradeSeparated: false,
    verticalGroup: 'at_grade:0:at_grade'
  }
});
const translatedModel = compileTransportSurfaceModel(translatedRoad, translatedTerrain);
assert.ok(translatedModel.stats.maximumGrade <= 0.1201);

const bridgeGround = (x) => 12 - 72 * Math.sin(Math.PI * Math.max(0, Math.min(1, x / 240))) ** 2;
const bridge = straightFeature({
  id: 'bridge-valley',
  semantics: {
    terrainMode: 'elevated',
    gradeSeparated: true,
    isBridge: true,
    deckClearance: 5.5,
    rampCandidate: false,
    verticalGroup: 'elevated:1:bridge'
  }
});
const bridgeModel = compileTransportSurfaceModel(bridge, bridgeGround);
assert.ok(bridgeModel.stats.minimumY > 17.4, 'bridge deck followed the valley instead of spanning it');
assert.ok(bridgeModel.stats.maximumY - bridgeModel.stats.minimumY < 0.05, 'level bridge deck became uneven');

const bridgeBumpGround = (x) => 12 + 11 * Math.exp(-((x - 120) ** 2) / 180);
const bridgeBumpModel = compileTransportSurfaceModel(
  straightFeature({
    id: 'bridge-terrain-bump',
    semantics: {
      terrainMode: 'elevated',
      gradeSeparated: true,
      isBridge: true,
      deckClearance: 5.5,
      rampCandidate: false,
      verticalGroup: 'elevated:1:bridge'
    }
  }),
  bridgeBumpGround
);
assert.ok(
  bridgeBumpModel.stats.maximumY - bridgeBumpModel.stats.minimumY < 0.05,
  'bridge deck copied a local terrain bump instead of preserving its engineered alignment'
);
for (let index = 0; index < bridgeBumpModel.distances.length; index += 1) {
  assert.ok(
    bridgeBumpModel.centerHeights[index] + EPSILON >=
      bridgeBumpGround(bridgeBumpModel.distances[index]) + 5.5 + SURFACE_BIAS,
    'flat bridge alignment lost required clearance over a terrain bump'
  );
}

const approachStart = straightFeature({
  id: 'bridge-approach-start',
  length: 100,
  originX: -100,
  semantics: {
    terrainMode: 'at_grade',
    gradeSeparated: false,
    verticalGroup: 'at_grade:0:at_grade'
  }
});
const connectedBridge = straightFeature({
  id: 'connected-bridge',
  length: 200,
  originX: 0,
  semantics: {
    terrainMode: 'elevated',
    gradeSeparated: true,
    isBridge: true,
    deckClearance: 5.5,
    verticalGroup: 'elevated:1:bridge'
  }
});
const approachEnd = straightFeature({
  id: 'bridge-approach-end',
  length: 100,
  originX: 200,
  semantics: {
    terrainMode: 'at_grade',
    gradeSeparated: false,
    verticalGroup: 'at_grade:0:at_grade'
  }
});
const connectedNetwork = [approachStart, connectedBridge, approachEnd];
updateFeatureSurfaceProfile(approachStart, () => 30);
updateFeatureSurfaceProfile(approachEnd, () => 30);
assignFeatureConnections(connectedNetwork);
connectedBridge.structureStations = buildFeatureStations(connectedBridge, {
  features: connectedNetwork,
  waterAreas: []
});
buildFeatureTransitionAnchors(connectedBridge, () => 30);
updateFeatureSurfaceProfile(connectedBridge, () => 30);
const connectedBridgeModel = connectedBridge.transportSurfaceModel;
assert.ok(
  Math.abs(sampleTransportSurfaceAtDistance(connectedBridgeModel, 0) - 30.08) <= 0.02,
  'bridge start did not meet its at-grade approach'
);
assert.ok(
  Math.abs(sampleTransportSurfaceAtDistance(connectedBridgeModel, 200) - 30.08) <= 0.02,
  'bridge end did not meet its at-grade approach'
);
assert.ok(
  sampleTransportSurfaceAtDistance(connectedBridgeModel, 100) >= 35.48,
  'connected bridge lost its required center clearance'
);
assert.ok(connectedBridgeModel.stats.maximumGrade <= 0.1201, 'connected bridge approach exceeded grade limit');

const openBridge = straightFeature({
  id: 'open-bridge-transition',
  length: 180,
  semantics: {
    featureCategory: 'road',
    terrainMode: 'elevated',
    gradeSeparated: true,
    isBridge: true,
    deckClearance: 5.5,
    verticalGroup: 'elevated:1:bridge'
  }
});
assignFeatureConnections([openBridge]);
openBridge.structureStations = buildFeatureStations(openBridge, {
  features: [openBridge],
  waterAreas: []
});
const openBridgeAnchors = buildFeatureTransitionAnchors(openBridge, () => 30);
assert.deepEqual(
  openBridgeAnchors.map((anchor) => [anchor.endpoint, anchor.targetOffset, anchor.source]),
  [
    ['start', 0, 'open_structure_transition'],
    ['end', 0, 'open_structure_transition']
  ],
  'an incomplete bridge did not receive shared ground transitions at both open ends'
);
updateFeatureSurfaceProfile(openBridge, () => 30);
assert.ok(
  Math.abs(sampleTransportSurfaceAtDistance(openBridge.transportSurfaceModel, 0) - 30.08) <= 0.02 &&
  Math.abs(sampleTransportSurfaceAtDistance(openBridge.transportSurfaceModel, 180) - 30.08) <= 0.02,
  'open bridge endpoints did not return smoothly to the accepted ground surface'
);

const tunnelGround = (x) => 104 + 2 * Math.exp(-((x - 120) ** 2) / 180);
const tunnel = straightFeature({
  id: 'tunnel-hill',
  semantics: {
    terrainMode: 'subgrade',
    gradeSeparated: true,
    isTunnel: true,
    cutDepth: 4.6,
    rampCandidate: false,
    verticalGroup: 'subgrade:-1:tunnel'
  }
});
const tunnelModel = compileTransportSurfaceModel(tunnel, tunnelGround);
assert.ok(
  tunnelModel.stats.maximumY - tunnelModel.stats.minimumY < 0.05,
  'tunnel copied small terrain undulations instead of preserving its engineered alignment'
);
assert.ok(
  tunnelModel.stats.maximumY <= 99.6,
  'tunnel surface escaped its subgrade layer'
);

const ramp = straightFeature({
  id: 'smooth-ramp',
  length: 140,
  semantics: {
    terrainMode: 'elevated',
    gradeSeparated: true,
    deckClearance: 0,
    explicitBaseOffset: 0,
    rampCandidate: true,
    verticalGroup: 'elevated:1:ramp'
  }
});
ramp.structureTransitionAnchors = [
  { distance: 0, targetOffset: 0 },
  { distance: 140, targetOffset: 8 }
];
const rampModel = compileTransportSurfaceModel(ramp, () => 20, {
  maximumGrade: 0.1,
  sampleStep: 1
});
assert.ok(rampModel.stats.maximumGrade <= 0.1001, 'ramp grade exceeded ten percent');
assert.ok(rampModel.stats.maximumGradeDelta <= 0.02, 'ramp introduced an abrupt vertical kink');
assert.ok(sampleTransportSurfaceAtDistance(rampModel, 139) > sampleTransportSurfaceAtDistance(rampModel, 1) + 7.7);

const stackGround = () => 40;
const stackModels = [
  compileTransportSurfaceModel(straightFeature({
    id: 'stack-tunnel',
    semantics: {
      terrainMode: 'subgrade',
      gradeSeparated: true,
      cutDepth: 4.6,
      verticalGroup: 'subgrade:-1:tunnel'
    }
  }), stackGround),
  compileTransportSurfaceModel(straightFeature({
    id: 'stack-grade',
    semantics: {
      terrainMode: 'at_grade',
      gradeSeparated: false,
      verticalGroup: 'at_grade:0:at_grade'
    }
  }), stackGround),
  compileTransportSurfaceModel(straightFeature({
    id: 'stack-bridge',
    semantics: {
      terrainMode: 'elevated',
      gradeSeparated: true,
      isBridge: true,
      deckClearance: 5.5,
      verticalGroup: 'elevated:1:bridge'
    }
  }), stackGround)
];
const stackY = stackModels.map((model) => sampleTransportSurfaceAtDistance(model, 120));
assert.ok(stackY[1] - stackY[0] >= 4.5, 'tunnel and at-grade layers collapsed');
assert.ok(stackY[2] - stackY[1] >= 5.4, 'at-grade and bridge layers collapsed');
assert.equal(new Set(stackModels.map((model) => model.verticalGroup)).size, 3, 'stack layer identities collided');

const upperStackModel = compileTransportSurfaceModel(straightFeature({
  id: 'stack-upper-bridge',
  semantics: {
    terrainMode: 'elevated',
    gradeSeparated: true,
    isBridge: true,
    verticalOrder: 2,
    deckClearance: 11,
    verticalGroup: 'elevated:2:bridge'
  }
}), stackGround);
assert.ok(
  sampleTransportSurfaceAtDistance(upperStackModel, 120) - stackY[2] >= 5.4,
  'two elevated roadway layers do not preserve vehicle clearance'
);

const connectedElevatedA = straightFeature({
  id: 'connected-elevated-a',
  length: 100,
  originX: -100,
  semantics: {
    featureCategory: 'road',
    terrainMode: 'elevated',
    gradeSeparated: true,
    isBridge: true,
    verticalOrder: 1,
    deckClearance: 5.5,
    verticalGroup: 'elevated:1:bridge'
  }
});
const connectedElevatedB = straightFeature({
  id: 'connected-elevated-b',
  length: 100,
  originX: 0,
  semantics: {
    featureCategory: 'road',
    terrainMode: 'elevated',
    gradeSeparated: true,
    isBridge: true,
    verticalOrder: 1,
    deckClearance: 5.5,
    verticalGroup: 'elevated:1:bridge'
  }
});
assignFeatureConnections([connectedElevatedA, connectedElevatedB]);
for (const connected of [connectedElevatedA, connectedElevatedB]) {
  const stations = buildFeatureStations(connected, {
    features: [connectedElevatedA, connectedElevatedB],
    waterAreas: []
  });
  assert.equal(
    stations.some((station) => String(station.source).includes('feature_crossing')),
    false,
    'connected elevated road segments were mistaken for a crossing and given an artificial hump'
  );
}

const nearEndpointFragmentA = {
  ...connectedElevatedA,
  sourceFeatureId: 'near-endpoint-a',
  pts: [{ x: -100, z: 20 }, { x: 0, z: 20 }]
};
const nearEndpointFragmentB = {
  ...connectedElevatedB,
  sourceFeatureId: 'near-endpoint-b',
  pts: [{ x: 0.42, z: 20 }, { x: 100, z: 20 }]
};
assignFeatureConnections([nearEndpointFragmentA, nearEndpointFragmentB]);
assert.equal(
  nearEndpointFragmentA.connectedFeatures.end?.[0]?.feature,
  nearEndpointFragmentB,
  'sub-meter vector-tile endpoint drift broke a continuous elevated road'
);
assert.equal(
  nearEndpointFragmentB.connectedFeatures.start?.[0]?.feature,
  nearEndpointFragmentA,
  'near-endpoint connection ownership was not reciprocal'
);

const connectedDeckCrossing = {
  ...straightFeature({
    id: 'connected-deck-crossing',
    length: 100,
    originX: 50,
    semantics: {
      featureCategory: 'road',
      terrainMode: 'elevated',
      gradeSeparated: true,
      isBridge: true,
      verticalOrder: 1,
      deckClearance: 5.5,
      verticalGroup: 'elevated:1:bridge'
    }
  }),
  pts: [{ x: 50, z: -50 }, { x: 50, z: 50 }]
};
const connectedDeckNetwork = [connectedElevatedA, connectedElevatedB, connectedDeckCrossing];
assignFeatureConnections(connectedDeckNetwork);
assignStructureStackRanks(connectedDeckNetwork, () => 10);
assert.equal(
  connectedElevatedA.structureStackOffset,
  connectedElevatedB.structureStackOffset,
  'source fragments of one connected deck received different stack heights'
);
assert.ok(
  Math.abs(connectedDeckCrossing.structureStackOffset - connectedElevatedB.structureStackOffset) >= 5.5,
  'an unconnected crossing did not separate from the connected deck'
);
for (const connected of [connectedElevatedA, connectedElevatedB]) {
  connected.structureStations = buildFeatureStations(connected, {
    features: connectedDeckNetwork,
    waterAreas: []
  });
  buildFeatureTransitionAnchors(connected, () => 10);
  updateFeatureSurfaceProfile(connected, () => 10);
}
const connectedJoinA = sampleTransportSurfaceAtDistance(
  connectedElevatedA.transportSurfaceModel,
  connectedElevatedA.transportSurfaceModel.distances.at(-1)
);
const connectedJoinB = sampleTransportSurfaceAtDistance(
  connectedElevatedB.transportSurfaceModel,
  0
);
assert.ok(
  Math.abs(connectedJoinA - connectedJoinB) <= EPSILON,
  'connected grade-separated source fragments produced a vertical seam at their shared endpoint'
);

const sameLayerCrossingA = straightFeature({
  id: 'same-layer-crossing-a',
  length: 120,
  originX: -60,
  semantics: {
    featureCategory: 'road',
    terrainMode: 'elevated',
    gradeSeparated: true,
    isBridge: true,
    verticalOrder: 1,
    deckClearance: 5.5,
    verticalGroup: 'elevated:1:bridge'
  }
});
const sameLayerCrossingB = {
  ...straightFeature({
    id: 'same-layer-crossing-b',
    length: 120,
    originX: -60,
    semantics: {
      featureCategory: 'road',
      terrainMode: 'elevated',
      gradeSeparated: true,
      isBridge: true,
      verticalOrder: 1,
      deckClearance: 5.5,
      verticalGroup: 'elevated:1:bridge'
    }
  }),
  pts: [{ x: 0, z: -60 }, { x: 0, z: 60 }]
};
assignFeatureConnections([sameLayerCrossingA, sameLayerCrossingB]);
assignStructureStackRanks([sameLayerCrossingA, sameLayerCrossingB]);
const sameLayerStationSets = [sameLayerCrossingA, sameLayerCrossingB].map((crossing) =>
  buildFeatureStations(crossing, {
    features: [sameLayerCrossingA, sameLayerCrossingB],
    waterAreas: []
  })
);
const sameLayerCrossingTargets = sameLayerStationSets
  .flat()
  .filter((station) => String(station.source).includes('feature_crossing'))
  .map((station) => station.targetOffset);
assert.equal(
  sameLayerCrossingTargets.length,
  2,
  'an ambiguous unconnected same-layer crossing was not assigned consistent district stack ranks'
);
assert.ok(
  Math.max(...sameLayerCrossingTargets) - Math.min(...sameLayerCrossingTargets) >= 5.5,
  'district stack ranks do not preserve vehicle clearance'
);

const lowerCrossingRoad = {
  ...straightFeature({
    id: 'unrelated-lower-overpass',
    length: 100,
    originX: -50,
    semantics: {
      terrainMode: 'elevated',
      gradeSeparated: true,
      isBridge: true,
      verticalOrder: 1,
      deckClearance: 5.5,
      verticalGroup: 'elevated:1:bridge'
    }
  })
};
const upperCrossingRoad = {
  ...straightFeature({
    id: 'unrelated-upper-overpass',
    length: 100,
    originX: -50,
    originZ: 0,
    semantics: {
      terrainMode: 'elevated',
      gradeSeparated: true,
      isBridge: true,
      verticalOrder: 1,
      deckClearance: 5.5,
      verticalGroup: 'elevated:1:bridge'
    }
  }),
  pts: [{ x: 0, z: -50 }, { x: 0, z: 50 }]
};
updateFeatureSurfaceProfile(lowerCrossingRoad, () => 20);
updateFeatureSurfaceProfile(upperCrossingRoad, () => 20);
assert.equal(
  isRoadSurfaceReachable({
    road: upperCrossingRoad,
    dist: 0.2,
    verticalDelta: 4.8,
    distanceToTransitionZone: Infinity
  }, {
    currentRoad: lowerCrossingRoad
  }),
  false,
  'unconnected overpasses sharing a generic layer label allowed the car to jump decks'
);

const parityFeature = straightFeature({
  id: 'render-gameplay-parity',
  semantics: {
    terrainMode: 'at_grade',
    gradeSeparated: false,
    verticalGroup: 'at_grade:0:at_grade'
  }
});
const parityTerrain = (x, z) => 75 + x * 0.02 + z * 0.015;
updateFeatureSurfaceProfile(parityFeature, parityTerrain);
const parityRibbon = buildFeatureRibbonEdges(
  parityFeature,
  parityFeature.pts,
  parityFeature.width * 0.5,
  parityTerrain
);
for (let index = 0; index < parityFeature.pts.length; index += 1) {
  const center = parityFeature.pts[index];
  const left = parityRibbon.leftEdge[index];
  const right = parityRibbon.rightEdge[index];
  const projected = {
    x: center.x,
    z: center.z,
    segIndex: Math.min(index, parityFeature.pts.length - 2),
    t: index === parityFeature.pts.length - 1 ? 1 : 0
  };
  const centerY = sampleFeatureSurfaceY(parityFeature, center.x, center.z, projected);
  const leftY = sampleFeatureSurfaceY(parityFeature, left.x, left.z, projected);
  const rightY = sampleFeatureSurfaceY(parityFeature, right.x, right.z, projected);
  assert.ok(Math.abs(left.y - leftY) <= EPSILON, 'left render/collision surface diverged');
  assert.ok(Math.abs(right.y - rightY) <= EPSILON, 'right render/collision surface diverged');
  assert.ok(Number.isFinite(centerY), 'center gameplay surface unavailable');
}

const rightAngleRoad = {
  ...straightFeature({
    id: 'right-angle-miter',
    length: 40,
    width: 10,
    semantics: {
      terrainMode: 'at_grade',
      gradeSeparated: false,
      verticalGroup: 'at_grade:0:at_grade'
    }
  }),
  pts: [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 20 }]
};
updateFeatureSurfaceProfile(rightAngleRoad, () => 10);
const rightAngleRibbon = buildFeatureRibbonEdges(
  rightAngleRoad,
  rightAngleRoad.pts,
  5,
  () => 10
);
const cornerLeft = rightAngleRibbon.leftEdge[1];
const cornerRight = rightAngleRibbon.rightEdge[1];
assert.ok(
  Math.abs(Math.abs(cornerLeft.z) - 5) <= EPSILON &&
    Math.abs(Math.abs(cornerLeft.x - 20) - 5) <= EPSILON &&
    Math.abs(Math.abs(cornerRight.z) - 5) <= EPSILON &&
    Math.abs(Math.abs(cornerRight.x - 20) - 5) <= EPSILON,
  'corridor miter failed to preserve width through a right-angle curve'
);

const intersectionRoad = (id, endX, endZ) => ({
  sourceFeatureId: id,
  pts: [{ x: 0, z: 0 }, { x: endX, z: endZ }],
  width: 10,
  surfaceBias: SURFACE_BIAS,
  structureSemantics: {
    terrainMode: 'at_grade',
    gradeSeparated: false,
    verticalGroup: 'at_grade:0:at_grade'
  }
});
const intersectionRoads = [
  intersectionRoad('intersection-east', 80, 0),
  intersectionRoad('intersection-west', -80, 0),
  intersectionRoad('intersection-north', 0, -80),
  intersectionRoad('intersection-south', 0, 80)
];
intersectionRoads.forEach((road) => updateFeatureSurfaceProfile(road, () => 10));
const detectedIntersection = detectRoadIntersections(intersectionRoads)
  .find((intersection) => intersection.roads.length === 4);
assert.ok(detectedIntersection, 'four-branch graph intersection was not detected');
assert.equal(
  fs.existsSync(path.join(repositoryRoot, 'app', 'js', 'terrain', 'intersection-geometry.js')),
  false,
  'separate intersection fill geometry must not compete with continuous road ribbons'
);
const earthRoadProfile = resolveVehicleSurface({
  onMars: false,
  onMoon: false,
  car: { onRoad: true, road: { surfaceTag: 'asphalt' } }
});
const earthTerrainProfile = resolveVehicleSurface({
  onMars: false,
  onMoon: false,
  car: { onRoad: false, road: { surfaceTag: 'sand' } }
});
assert.equal(earthRoadProfile, earthTerrainProfile, 'Earth handling changed away from mapped road geometry');
assert.equal(earthRoadProfile.kind, 'asphalt', 'Earth did not retain its neutral driving profile');

const separatedCrossingRoads = [
  {
    ...intersectionRoad('crossing-at-grade', 160, 0),
    pts: [{ x: -80, z: 0 }, { x: 80, z: 0 }]
  },
  {
    ...intersectionRoad('crossing-overpass', 0, 160),
    pts: [{ x: 0, z: -80 }, { x: 0, z: 80 }],
    structureSemantics: {
      terrainMode: 'elevated',
      gradeSeparated: true,
      isBridge: true,
      deckClearance: 5.5,
      verticalGroup: 'elevated:1:bridge'
    }
  }
];
separatedCrossingRoads.forEach((road) => updateFeatureSurfaceProfile(road, () => 10));
assert.equal(
  detectRoadIntersections(separatedCrossingRoads).some((intersection) =>
    Math.hypot(intersection.x, intersection.z) < 1),
  false,
  'grade-separated crossing was flattened into an at-grade intersection'
);

const sourceRoot = path.join(repositoryRoot, 'app', 'js');
const sourceFiles = [];
const collectSourceFiles = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collectSourceFiles(target);
    else if (entry.isFile() && entry.name.endsWith('.js')) sourceFiles.push(target);
  }
};
collectSourceFiles(sourceRoot);
const forbiddenRuntimeOwners = [
  'rebuildRoadsWithTerrain',
  'requestWorldSurfaceSync',
  'roadsNeedRebuild',
  'lastRoadRebuildCheck'
];
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const forbidden of forbiddenRuntimeOwners) {
    assert.equal(
      source.includes(forbidden),
      false,
      `${path.relative(repositoryRoot, file)} restored losing transport owner ${forbidden}`
    );
  }
}
const publicationCallers = sourceFiles
  .filter((file) => fs.readFileSync(file, 'utf8').includes('publishCompiledTransportMeshes'))
  .map((file) => path.relative(repositoryRoot, file))
  .sort();
assert.deepEqual(publicationCallers, [
  'app/js/terrain.js',
  'app/js/terrain/rebuild.js',
  'app/js/world/load-support.js'
]);
const terrainTileSource = fs.readFileSync(path.join(sourceRoot, 'terrain', 'tiles.js'), 'utf8');
assert.ok(
  terrainTileSource.includes('side: THREE.FrontSide'),
  'terrain underside must not occlude subgrade transport interiors'
);
const transportPublisherSource = fs.readFileSync(path.join(sourceRoot, 'terrain', 'rebuild.js'), 'utf8');
const markingGuard = transportPublisherSource.slice(
  transportPublisherSource.indexOf('function appendRoadCenterMarkings'),
  transportPublisherSource.indexOf('export function buildRoadSkirts')
);
assert.equal(
  markingGuard.includes('terrainMode !== "at_grade"'),
  false,
  'bridge and tunnel primary roads lost their compiled center markings'
);
const retiredEarthDrivingTerms = /\b(?:offRoad|offroad|off-road|offMax|offFriction|indOff)\b/i;
for (const relativePath of [
  'app/index.html',
  'app/js/engine.js',
  'app/js/hud.js',
  'app/js/physics.js',
  'app/js/physics/vehicle-surface.js'
]) {
  const source = fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
  assert.equal(
    retiredEarthDrivingTerms.test(source),
    false,
    `${relativePath} restored retired Earth off-road behavior`
  );
}

console.log(JSON.stringify({
  ok: true,
  schemaVersion: TRANSPORT_SURFACE_SCHEMA_VERSION,
  geographyMatrix: geographyResults,
  structureMatrix: {
    bridgeSpanY: Number(bridgeModel.stats.minimumY.toFixed(3)),
    tunnelMaximumY: Number(tunnelModel.stats.maximumY.toFixed(3)),
    rampMaximumGrade: Number(rampModel.stats.maximumGrade.toFixed(5)),
    rampMaximumGradeDelta: Number(rampModel.stats.maximumGradeDelta.toFixed(5)),
    stackedSurfaceY: stackY.map((value) => Number(value.toFixed(3)))
  },
  parity: 'compiled-render-query-width-aware',
  ownership: {
    compiledPublicationCallers: publicationCallers,
    forbiddenRuntimeOwners,
    earthDrivingProfile: earthRoadProfile.kind
  }
}, null, 2));
