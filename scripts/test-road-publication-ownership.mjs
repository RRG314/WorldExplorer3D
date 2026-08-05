import fs from 'node:fs/promises';
import path from 'node:path';
import { buildRoadGeometryPass } from '../app/js/world/load-road-pass.js';
import { ctx as appCtx } from '../app/js/shared-context.js?v=55';

const root = process.cwd();
const read = (relativePath) => fs.readFile(path.join(root, relativePath), 'utf8');

const [featurePass, roadLoader, reset, finalizer, publisher, roadRenderer] = await Promise.all([
  read('app/js/world/load-road-pass.js'),
  read('app/js/world/load-roads.js'),
  read('app/js/world/load-reset.js'),
  read('app/js/world/load-support.js'),
  read('app/js/terrain/rebuild.js'),
  read('app/js/road-render.js')
]);

const failures = [];
const requireContract = (condition, message) => {
  if (!condition) failures.push(message);
};

requireContract(
  !featurePass.includes('buildIndexedBatchMesh') &&
    !featurePass.includes('createRoadSurfaceMaterials') &&
    !featurePass.includes('transportSurfacePublication'),
  'The road feature compiler must not create or publish visual road meshes.'
);
requireContract(
  featurePass.includes("authority: 'transport_feature_compiler'") &&
    featurePass.includes('meshCount: 0'),
  'The road feature compiler must report its non-visual authority explicitly.'
);
requireContract(
  featurePass.includes('export async function buildRoadGeometryPass') &&
    featurePass.includes('await yieldToMainThread()') &&
    roadLoader.includes('await buildRoadGeometryPass({'),
  'Road feature compilation must yield cooperatively without changing feature ownership.'
);
requireContract(
  roadLoader.includes("throw new Error('Road feature compilation published visual meshes before final terrain authority')"),
  'World loading must fail fast if the feature pass publishes a road mesh.'
);
requireContract(
  !roadLoader.includes('refreshStructureAwareFeatureProfiles();') &&
    roadLoader.includes('deferStructureRefresh: true'),
  'The normal load path must defer structure/network compilation until final publication.'
);
requireContract(
  (roadLoader.match(/refreshStructureAwareFeatureProfiles,/g) || []).length === 2,
  'The loader may inject structure refresh into its linear-feature helper, but not into building publication.'
);
requireContract(
  reset.includes('appCtx.transportSurfacePublication = null;'),
  'World reload must retire the previous transport-surface publication.'
);
requireContract(
  (finalizer.match(/appCtx\.publishCompiledTransportMeshes\(\)/g) || []).length === 1,
  'World finalization must invoke the compiled transport publisher exactly once.'
);
requireContract(
  (publisher.match(/appCtx\.transportSurfacePublication\s*=\s*Object\.freeze/g) || []).length === 1,
  'The terrain-aligned publisher must have one transport publication site.'
);
requireContract(
  (publisher.match(/appCtx\.refreshStructureAwareFeatureProfiles\(\)/g) || []).length === 1,
  'Final terrain publication must compile structure and network profiles exactly once.'
);
requireContract(
  publisher.includes('const MAX_ROAD_BATCH_VERTICES = 60000;') &&
    publisher.includes('roadMainBatches.forEach') &&
    publisher.includes('flushRoadMainBatch();'),
  'Dense cities must publish bounded road index buffers rather than one monolithic mesh.'
);
requireContract(
  featurePass.includes('const ROAD_SURFACE_BIAS = 0.18;') &&
    publisher.includes('const ROAD_SURFACE_BIAS = 0.18;'),
  'Road contact and visual geometry must share enough terrain clearance to prevent mapped asphalt from being depth-covered.'
);
requireContract(
  publisher.includes('buildIndexedBatchMesh({') &&
    roadRenderer.includes('color: 0x303236') &&
    !roadRenderer.includes('asphaltTex') &&
    !roadRenderer.includes("geometry.setAttribute('uv'"),
  'Compiled roads must use the stable flat-asphalt path instead of an invalid textured batch that exposes terrain.'
);

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

const originalRoads = appCtx.roads;
const originalRoadMeshes = appCtx.roadMeshes;
const originalGeoToWorld = appCtx.geoToWorld;
try {
  appCtx.roads = [];
  appCtx.roadMeshes = [];
  appCtx.geoToWorld = (lat, lon) => ({ x: Number(lon), z: Number(lat) });
  const nodes = {};
  const roadWays = Array.from({ length: 65 }, (_, index) => {
    const firstId = `road-${index}-a`;
    const secondId = `road-${index}-b`;
    nodes[firstId] = { lat: index, lon: 0 };
    nodes[secondId] = { lat: index, lon: 20 };
    return {
      id: `road-${index}`,
      nodes: [firstId, secondId],
      tags: { highway: 'residential' }
    };
  });
  let observedYields = 0;
  const loadMetrics = {
    roads: { sourcePoints: 0, decimatedPoints: 0 }
  };
  const result = await buildRoadGeometryPass({
    classifyStructureSemantics: () => ({
      terrainMode: 'at_grade',
      gradeSeparated: false,
      verticalOrder: 0
    }),
    cloneStructureSemantics: (value) => ({ ...value }),
    decimateRoadCenterlineByDepth: (points) => points,
    featureTileKeyForLatLon: () => null,
    geometryGuards: {},
    getRoadSubdivisionStep: () => 4,
    loadMetrics,
    nodes,
    perfModeNow: 'baseline',
    polylineBounds: () => ({ minX: 0, maxX: 20, minZ: 0, maxZ: 65 }),
    rdtDepthForFeatureTile: () => 0,
    roadWays,
    sanitizeWorldPathPoints: (points) => points,
    tileBudgetCfg: { tileDegrees: 0.01 },
    useRdtBudgeting: false,
    wayCenterLatLon: () => ({ lat: 0, lon: 0 }),
    worldBaseTerrainY: () => 0,
    yieldEveryRoads: 32,
    yieldToMainThread: async () => { observedYields += 1; }
  });
  requireContract(result.roadCount === 65, 'Chunking must preserve every valid road feature.');
  requireContract(result.meshCount === 0, 'Chunking must not publish visual meshes.');
  requireContract(result.yieldCount === 2 && observedYields === 2, 'A 65-road pass must yield after roads 32 and 64.');
} finally {
  appCtx.roads = originalRoads;
  appCtx.roadMeshes = originalRoadMeshes;
  appCtx.geoToWorld = originalGeoToWorld;
}

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  message: 'Road feature compilation and terrain-aligned visual publication have separate, single owners.'
}, null, 2));
