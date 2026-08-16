import assert from 'node:assert/strict';
import { compileEntranceCatalog } from '../app/js/living-world/entrance-catalog.js';

function building(id, x, z, type = 'apartments') {
  return {
    sourceBuildingId: id,
    buildingType: type,
    baseY: 2,
    height: 18,
    levels: 6,
    pts: [
      { x: x - 5, z: z - 4 },
      { x: x + 5, z: z - 4 },
      { x: x + 5, z: z + 4 },
      { x: x - 5, z: z + 4 }
    ]
  };
}

const buildings = [
  building('building:residential', 18, 8),
  building('building:retail', 55, 12, 'retail'),
  building('building:far-away', 900, 0),
  { ...building('building:roof', 8, 8, 'roof') }
];
const nearestRoad = (x, z) => ({
  pt: { x, z: z - 22 },
  dist: 22,
  road: { sourceRoadId: 'road:test' }
});

const catalogA = compileEntranceCatalog({ buildings, nearestRoad, tier: 'balanced' });
const catalogB = compileEntranceCatalog({ buildings, nearestRoad, tier: 'balanced' });
assert.deepEqual(catalogA, catalogB, 'entrance compilation must be deterministic');
assert.ok(Object.isFrozen(catalogA));
assert.ok(Object.isFrozen(catalogA.entrances));
assert.equal(catalogA.entrances.length, 2, 'invalid and out-of-radius building candidates leaked into the catalog');
assert.equal(catalogA.entrances[0].buildingSourceId, 'building:retail', 'commercial priority was not applied');
assert.equal(catalogA.entrances[0].provenance, 'inferred');
assert.equal(catalogA.entrances[0].roadSourceId, 'road:test');
assert.ok(catalogA.entrances[0].approachZ < catalogA.entrances[0].z, 'approach did not face the road');

const mappedCatalog = compileEntranceCatalog({
  buildings,
  nearestRoad,
  mappedEntrances: [{
    id: 'node:123',
    buildingSourceId: 'building:retail',
    x: 50,
    y: 2,
    z: 12,
    normalX: -1,
    normalZ: 0
  }]
});
const mapped = mappedCatalog.entrances.find((entrance) => entrance.buildingSourceId === 'building:retail');
assert.equal(mapped.provenance, 'mapped', 'mapped entrance did not override inference');
assert.equal(mapped.id, 'entrance:building:retail:mapped:node:123');
assert.equal(mappedCatalog.diagnostics.mapped, 1);
assert.equal(mappedCatalog.diagnostics.inferred, 1);

console.log(JSON.stringify({
  ok: true,
  contract: 'living-world-entrance-catalog-v1',
  inferred: catalogA.diagnostics.inferred,
  mappedWins: mapped.provenance === 'mapped',
  deterministic: true,
  additionalProviderQueries: 0
}, null, 2));
