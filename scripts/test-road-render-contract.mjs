import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function read(relPath) {
  return await fs.readFile(path.join(rootDir, relPath), 'utf8');
}

async function main() {
  const worldSource = await read('app/js/world.js');
  const terrainSource = await read('app/js/terrain.js');

  assert(
    worldSource.includes('from "./road-render.js?v=1"'),
    'world.js must import the shared road-render module.'
  );
  assert(
    terrainSource.includes('from "./road-render.js?v=1"'),
    'terrain.js must import the shared road-render module.'
  );

  assert(
    worldSource.includes('createRoadSurfaceMaterials(') && worldSource.includes('buildIndexedBatchMesh({'),
    'world.js must use shared road material and batch-mesh helpers.'
  );
  assert(
    terrainSource.includes('roadSurfaceMaterialCacheKey(') &&
      terrainSource.includes('createRoadSurfaceMaterials(') &&
      terrainSource.includes('buildIndexedBatchMesh({'),
    'terrain.js must use shared road render helpers.'
  );

  assert(
    !worldSource.includes('const roadMainMaterial = appCtx.asphaltTex ? new THREE.MeshStandardMaterial({'),
    'world.js should not define an inline roadMainMaterial builder.'
  );
  assert(
    !terrainSource.includes("const roadMat = typeof appCtx.asphaltTex !== 'undefined' && appCtx.asphaltTex ? new THREE.MeshStandardMaterial({"),
    'terrain.js should not define an inline roadMat builder.'
  );

  console.log(JSON.stringify({
    ok: true,
    checks: {
      worldSharedRoadRender: true,
      terrainSharedRoadRender: true,
      noInlineWorldRoadBuilder: true,
      noInlineTerrainRoadBuilder: true
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
