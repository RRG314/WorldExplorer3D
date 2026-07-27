import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  verifyWorldPublicationStable,
  worldPublicationCounts
} from '../app/js/world/load-runtime-session.js';

const root = process.cwd();
const forbiddenFiles = [
  'app/js/earth-streaming.js',
  'app/js/earth-origin.js',
  'app/js/world/load-continuous-world.js',
  'app/js/world/streaming-aerial-context.js',
  'app/js/world/streaming-vector-chunks.js',
  'app/js/world/streaming-vector-geometry.js',
  'app/js/world/streaming-vector-materials.js',
  'app/js/world/streaming-landcover.js',
  'app/js/world/streaming-initial-retirement.js'
];

for (const relativePath of forbiddenFiles) {
  await assert.rejects(
    fs.access(path.join(root, relativePath)),
    undefined,
    `${relativePath} must remain deleted`
  );
}

const sourceFiles = [];
async function collectSourceFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectSourceFiles(resolved);
    else if (entry.name.endsWith('.js')) sourceFiles.push(resolved);
  }
}
await collectSourceFiles(path.join(root, 'app', 'js'));
sourceFiles.push(path.join(root, 'app', 'index.html'));

const forbiddenPatterns = [
  /Continuous World/i,
  /Continuous Earth/i,
  /\bgetContinuousWorldEnabled\b/,
  /\bsetContinuousWorldEnabled\b/,
  /\bloadContinuousEarthWorld\b/,
  /\bprimeContinuousEarthNeighborhood\b/,
  /\bcontinuous_global\b/,
  /\bscheduleDeferred[A-Z]\w*/
];
const violations = [];
for (const filename of sourceFiles) {
  const source = await fs.readFile(filename, 'utf8');
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(source)) {
      violations.push({
        file: path.relative(root, filename),
        pattern: String(pattern)
      });
    }
  }
}
assert.deepEqual(violations, [], `Phase 3 ownership violations: ${JSON.stringify(violations)}`);

const appCtx = {
  roads: [{ id: 1 }],
  roadMeshes: [{}],
  buildings: [{ id: 2 }],
  buildingMeshes: [{}],
  landuses: [],
  landuseMeshes: [],
  linearFeatures: [{ id: 3 }],
  linearFeatureMeshes: [],
  pois: [],
  poiMeshes: [],
  historicSites: [],
  historicMarkers: [],
  structureVisualMeshes: [],
  streetFurnitureMeshes: [],
  vegetationFeatures: [],
  vegetationMeshes: [],
  waterAreas: [],
  waterways: []
};
const publication = Object.freeze({ counts: worldPublicationCounts(appCtx) });
assert.equal(verifyWorldPublicationStable(appCtx, publication).stable, true);
appCtx.buildings.push({ id: 4 });
const mutated = verifyWorldPublicationStable(appCtx, publication);
assert.equal(mutated.stable, false);
assert.deepEqual(mutated.changes, [{
  collection: 'buildings',
  expected: 1,
  actual: 2
}]);

const finalizerSource = await fs.readFile(
  path.join(root, 'app/js/world/load-support.js'),
  'utf8'
);
const markIndex = finalizerSource.lastIndexOf(
  'markLoaded();',
  finalizerSource.indexOf('export function createSyntheticFallbackWorld')
);
for (const requiredStep of [
  "runFinalStep('buildTraversalNetworks'",
  "runFinalStep('spawnOnRoad'",
  "runFinalStep('updateWorldLod'"
]) {
  const stepIndex = finalizerSource.indexOf(requiredStep);
  assert(stepIndex >= 0 && stepIndex < markIndex, `${requiredStep} must complete before publication`);
}

console.log(JSON.stringify({
  ok: true,
  forbiddenFilesDeleted: forbiddenFiles.length,
  scannedSources: sourceFiles.length,
  publicationCollections: Object.keys(publication.counts).length
}, null, 2));
