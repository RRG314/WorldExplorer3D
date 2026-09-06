import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCompiledRoadSurfaceSampler,
  createRoadTerrainConformanceAudit,
  finalizeRoadTerrainConformanceAudit,
  recordAtGradeRoadTerrainConformance
} from '../app/js/terrain/rebuild.js';

function atGradeFeature() {
  return {
    id: 'road-1',
    name: 'Terrain Test Road',
    pts: [{ x: 0, z: 0 }, { x: 10, z: 0 }],
    structureSemantics: { terrainMode: 'at_grade' },
    transportSurfaceModel: {
      distances: new Float32Array([0, 10]),
      pathDistances: new Float32Array([0, 10]),
      centerHeights: new Float32Array([2, 2]),
      leftHeights: new Float32Array([2, 2]),
      rightHeights: new Float32Array([2, 2])
    }
  };
}

test('at-grade road sampler cannot publish below rendered outer terrain', () => {
  const diagnostics = {};
  const sample = createCompiledRoadSurfaceSampler(atGradeFeature(), () => 5, diagnostics);
  assert.equal(sample(5, 0), 5);
  assert.equal(diagnostics.renderedTerrainClamps, 1);
});

test('structure-owned road profiles are not clamped to terrain', () => {
  for (const terrainMode of ['elevated', 'subgrade']) {
    const feature = atGradeFeature();
    feature.structureSemantics.terrainMode = terrainMode;
    const sample = createCompiledRoadSurfaceSampler(feature, () => 5, {});
    assert.equal(sample(5, 0), 2);
  }
});

test('per-road conformance audit covers at-grade batches and excludes tunnels', () => {
  const audit = createRoadTerrainConformanceAudit();
  const feature = atGradeFeature();
  recordAtGradeRoadTerrainConformance(
    audit,
    feature,
    [0, 5.2, 0, 10, 4.5, 0],
    () => 5,
    (x) => ({ lat: 39 + x / 1000, lon: -76 })
  );
  recordAtGradeRoadTerrainConformance(
    audit,
    { ...feature, structureSemantics: { terrainMode: 'subgrade' } },
    [0, -5, 0],
    () => 5
  );
  const result = finalizeRoadTerrainConformanceAudit(audit);
  assert.equal(result.totalSamples, 2);
  assert.equal(result.issuesFound, 1);
  assert.equal(result.minimumDelta, -0.5);
  assert.equal(result.worstDeltas[0].roadName, 'Terrain Test Road');
});
