import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { getAdaptiveLoadProfile, getWorldLodThresholds, getRoadSubdivisionStep } from '../app/js/world/budgets.js';
import { createPerfSettingsApi } from '../app/js/perf-settings.js';
import { hashGeoToInt, seededRandom } from '../app/js/procedural-random.js';
import { shouldRefreshRoadQuery } from '../app/js/physics/road-query-policy.js';
import { sampleFeatureSurfaceY } from '../app/js/structure-semantics.js';

test('a stale terrain callback cannot override an accepted transport profile', () => {
  const road = {
    pts: [{ x: 0, z: 0 }, { x: 10, z: 0 }], width: 4,
    structureSemantics: { terrainMode: 'at_grade' },
    surfaceTerrainSampler: () => { throw new Error('retired terrain callback executed'); },
    transportSurfaceModel: {
      distances: new Float32Array([0, 10]), pathDistances: new Float32Array([0, 10]),
      centerHeights: new Float32Array([2, 3]), leftHeights: new Float32Array([2, 3]),
      rightHeights: new Float32Array([2, 3])
    }
  };
  assert.equal(sampleFeatureSurfaceY(road, 5, 0), 2.5);
});

test('legacy mode and location depth cannot change production content or road detail', () => {
  const expected = getAdaptiveLoadProfile(0, 'baseline', 1, 'desktop');
  for (const mode of ['rdt', undefined, 'invalid', 'baseline']) {
    for (const depth of [0, 2, 4, 6, 100]) {
      assert.deepEqual(getAdaptiveLoadProfile(depth, mode, 1, 'desktop'), expected);
      assert.deepEqual(getWorldLodThresholds(depth, mode), getWorldLodThresholds(0, 'baseline'));
      assert.equal(getRoadSubdivisionStep('residential', depth, mode), 3.6);
    }
  }
  const settings = createPerfSettingsApi({ appCtx: {}, constants: { PERF_MODE_BASELINE: 'baseline' }, state: {} });
  assert.equal(settings.normalizePerfMode('rdt'), 'baseline');
  assert.equal(settings.normalizePerfMode(undefined), 'baseline');
});

test('procedural identities retain the established geographic seeds and sequence', () => {
  assert.deepEqual([
    hashGeoToInt(43.7397, 7.4243), hashGeoToInt(37.7923, -122.4144), hashGeoToInt(39.3035, -76.6118)
  ], [3471498321, 2788867055, 1236638276]);
  const next = seededRandom(123);
  assert.deepEqual(Array.from({ length: 4 }, next), [
    0.007376669906079769, 0.9356674966402352, 0.4893254810012877, 0.8946488266810775
  ]);
});

test('road query cannot reuse stale surface, transition, teleport or low-frame-rate state', () => {
  const cache = { queryX: 0, queryZ: 0, queryY: 2, queryTime: 100, queryRevision: 5,
    distanceToEndpoint: 20, distanceToTransitionZone: Infinity };
  const query = { x: 0, z: 0, y: 2, now: 110, revision: 5 };
  assert.equal(shouldRefreshRoadQuery(cache, query), false);
  for (const change of [{ now: 150 }, { revision: 6 }, { x: 1 }, { y: 2.3 }, { force: true }, { now: 90 }])
    assert.equal(shouldRefreshRoadQuery(cache, { ...query, ...change }), true);
  assert.equal(shouldRefreshRoadQuery({ ...cache, distanceToEndpoint: 0.2 }, { ...query, x: 0.1 }), true);
});

test('production sources cannot reintroduce duplicate retired road geometry', async () => {
  const root = new URL('../app/js/', import.meta.url);
  async function inspect(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const file = new URL(item.name + (item.isDirectory() ? '/' : ''), dir);
      if (item.isDirectory()) await inspect(file);
      else if (item.name.endsWith('.js')) {
        const source = await readFile(file, 'utf8');
        assert.doesNotMatch(source, /\bappendSolidAtGradeRoadGeometry\b|\bappendCompactIntersectionCap\b/, file.pathname);
      }
    }
  }
  await inspect(root);
});

test('production pavement cannot restore tile-local closing or a separate road barrier tessellator',async()=>{
  const pavement=await readFile(new URL('../app/js/world/compiler/street-pavement.js',import.meta.url),'utf8');
  const barriers=await readFile(new URL('../app/js/world/compiler/street-carriageway-barriers.js',import.meta.url),'utf8');
  assert.doesNotMatch(pavement,/clip\.offset\s*\(|closureRadius/);
  assert.doesNotMatch(barriers,/const\s+refine\s*=|WIDTH_TRANSITION_METERS/);
});


test('pavement publication has one mandatory terrain partition with an owned lifetime',async()=>{
  const runtime=await readFile(new URL('../app/js/world/street-pavement-runtime.js',import.meta.url),'utf8');
  const conformance=await readFile(new URL('../app/js/world/pavement-terrain-conformance.js',import.meta.url),'utf8');
  assert.match(runtime,/includeFarTerrain:true/);
  assert.match(runtime,/finally\s*\{\s*partitionSurface\?\.dispose\(\)/);
  assert.doesNotMatch(conformance,/conformRoadTriangles/);
  assert.match(conformance,/if \(!partitioned\) throw/);
});
