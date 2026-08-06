import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8');

const baselineSource = read('app/js/terrain/worldcover-baseline.js');
const profileSource = read('app/js/terrain/surface-profiles.js');
const transportSource = read('app/js/terrain/rebuild.js');
const surfaceContractSource = read('app/js/world/surface-contract.js');

assert.equal(
  fs.existsSync(path.join(sourceRoot, 'app/js/terrain/sidewalk-batching.js')),
  false,
  'The disabled sidewalk geometry batcher must not ship.'
);
assert.equal(
  fs.existsSync(path.join(sourceRoot, 'app/js/terrain/sidewalk-helpers.js')),
  false,
  'The disabled sidewalk extrusion policy must not ship.'
);

assert.match(
  baselineSource,
  /surfaceBuiltWeights:\s*buildSmoothedClassWeight\(classes, size, 'built'\)/,
  'WorldCover must publish a smoothed, per-pixel built-up weight instead of making a whole terrain tile urban.'
);
assert.doesNotMatch(
  baselineSource,
  /new THREE\.CanvasTexture|putImageData\(/,
  'WorldCover classification must not upload an unused categorical GPU texture.'
);
assert.match(
  profileSource,
  /geometry\.setAttribute\('surfaceBuiltWeight'/,
  'Terrain vertices must receive the mapped built-up weight.'
);
assert.match(
  profileSource,
  /if \(result\.surfaceTints\)/,
  'WorldCover PBR application must use the retained semantic arrays directly.'
);
assert.match(
  profileSource,
  /mix\(naturalTexelColor, builtTexelColor, surfaceBuiltBlend\(\)\)/,
  'The accepted terrain shader must blend natural and built PBR detail locally.'
);
assert.doesNotMatch(
  profileSource,
  /result\.dominantClass === 'built'\s*\?\s*'urban'/,
  'A built-dominant classification must not turn the entire terrain tile into a gray urban square.'
);
assert.match(
  transportSource,
  /publishCompiledTransportMeshes/,
  'The compiled road publisher must remain present.'
);
assert.doesNotMatch(
  transportSource,
  /sidewalk-batching|shouldBuildSidewalks|getSharedUrbanSurfaceMaterials|buildSidewalkStripBatch|sidewalkBatchVerts|sidewalkBatchIdx/,
  'Disabled sidewalk extrusion must not be loaded, allocated, or evaluated during Earth publication.'
);
assert.match(
  surfaceContractSource,
  /:\s*'terrain_worldcover';/,
  'Broad land-use polygons must stay semantic-only unless they are an explicit paved, parking, or water surface.'
);

console.log('City surface semantics contract passed.');
