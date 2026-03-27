import assert from 'node:assert/strict';
import {
  buildFeatureStations,
  classifyStructureSemantics,
  featureTraversalKey,
  sampleFeatureSurfaceY,
  updateFeatureSurfaceProfile
} from '../app/js/structure-semantics.js';

function makeFeature(id, pts, tags, width = 8, kind = 'road', subtype = '') {
  const semantics = classifyStructureSemantics(tags, {
    featureKind: kind,
    subtype
  });
  return {
    id,
    pts,
    width,
    kind,
    networkKind: kind,
    subtype,
    structureTags: tags,
    structureSemantics: semantics,
    surfaceBias: 0.42,
    bounds: {
      minX: Math.min(...pts.map((p) => p.x)) - width,
      maxX: Math.max(...pts.map((p) => p.x)) + width,
      minZ: Math.min(...pts.map((p) => p.z)) - width,
      maxZ: Math.max(...pts.map((p) => p.z)) + width
    }
  };
}

function flatTerrain() {
  return 0;
}

function run() {
  const atGradeRoad = makeFeature(
    'grade-road',
    [{ x: -80, z: 0 }, { x: 80, z: 0 }],
    { highway: 'primary' },
    12,
    'road',
    'primary'
  );

  const bridgeRoad = makeFeature(
    'bridge-road',
    [{ x: 0, z: -90 }, { x: 0, z: 0 }, { x: 0, z: 90 }],
    { highway: 'primary', bridge: 'yes', layer: '1' },
    12,
    'road',
    'primary'
  );
  bridgeRoad.structureStations = buildFeatureStations(bridgeRoad, {
    features: [atGradeRoad, bridgeRoad],
    waterAreas: []
  });
  updateFeatureSurfaceProfile(bridgeRoad, flatTerrain, { surfaceBias: 0.42 });

  const bridgeCenterY = sampleFeatureSurfaceY(bridgeRoad, 0, 0);
  const bridgeEdgeY = sampleFeatureSurfaceY(bridgeRoad, 0, 82);
  assert.ok(bridgeRoad.structureStations.length > 0, 'bridge should generate structure stations');
  assert.ok(bridgeCenterY > 4.5, `bridge deck should rise above grade at crossings, got ${bridgeCenterY}`);
  assert.ok(bridgeEdgeY > 4.5, `bridge endpoints should stay on the elevated deck, got ${bridgeEdgeY}`);
  assert.ok(Math.abs(bridgeCenterY - bridgeEdgeY) < 2.2, 'bridge deck should stay continuous between span center and endpoints');

  const tunnelRoad = makeFeature(
    'tunnel-road',
    [{ x: -80, z: 24 }, { x: 0, z: 24 }, { x: 80, z: 24 }],
    { highway: 'secondary', tunnel: 'yes', layer: '-1' },
    10,
    'road',
    'secondary'
  );
  tunnelRoad.structureStations = buildFeatureStations(tunnelRoad, {
    features: [atGradeRoad, tunnelRoad],
    waterAreas: []
  });
  updateFeatureSurfaceProfile(tunnelRoad, flatTerrain, { surfaceBias: 0.42 });
  const tunnelCenterY = sampleFeatureSurfaceY(tunnelRoad, 0, 24);
  assert.ok(tunnelCenterY < -3, `tunnel profile should cut below grade, got ${tunnelCenterY}`);

  const culvert = classifyStructureSemantics({
    waterway: 'stream',
    tunnel: 'culvert',
    layer: '-1'
  }, {
    featureKind: 'road',
    subtype: 'service'
  });
  assert.equal(culvert.structureKind, 'culvert');
  assert.equal(culvert.terrainMode, 'subgrade');

  const skywalk = classifyStructureSemantics({
    highway: 'footway',
    bridge: 'yes',
    indoor: 'yes',
    level: '2'
  }, {
    featureKind: 'connector',
    subtype: 'footway'
  });
  assert.equal(skywalk.structureKind, 'skywalk');
  assert.equal(skywalk.terrainMode, 'elevated');

  assert.notEqual(
    featureTraversalKey(atGradeRoad),
    featureTraversalKey(bridgeRoad),
    'traversal keys must separate grade-level and elevated features'
  );

  const result = {
    ok: true,
    bridgeStations: bridgeRoad.structureStations.length,
    bridgeCenterY,
    bridgeEdgeY,
    tunnelCenterY,
    bridgeTraversalKey: featureTraversalKey(bridgeRoad),
    roadTraversalKey: featureTraversalKey(atGradeRoad),
    skywalkKind: skywalk.structureKind,
    culvertKind: culvert.structureKind
  };

  console.log(JSON.stringify(result, null, 2));
}

try {
  run();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: String(error?.message || error)
  }, null, 2));
  process.exitCode = 1;
}
