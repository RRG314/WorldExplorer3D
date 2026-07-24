import assert from 'node:assert/strict';
import {
  RENDER_PROVENANCE_VERSION,
  attachRenderProvenance,
  attachStreamProvenance,
  createRenderProvenance
} from '../app/js/world/render-provenance.js';

const provenance = createRenderProvenance({
  surfaceTile: {
    z: 14,
    x: 4705,
    y: 6244,
    profile: 'continuous_global',
    sources: ['overture-base', 'overture-base']
  },
  tileRecord: { source: 'overture-pmtiles', release: '2026-06-17.0' },
  provider: 'Overture Maps Foundation',
  layer: 'base.water',
  role: 'water-area'
});

assert.equal(provenance.version, RENDER_PROVENANCE_VERSION);
assert.equal(provenance.tileKey, '14/4705/6244');
assert.equal(provenance.profile, 'continuous_global');
assert.deepEqual(provenance.sources, ['overture-base']);
assert(Object.isFrozen(provenance));

const mesh = { userData: {} };
attachRenderProvenance(mesh, provenance);
assert.equal(mesh.userData.renderProvenance, provenance);

const streamMesh = { userData: {} };
attachStreamProvenance(
  streamMesh,
  { surfaceTile: { z: 14, x: 4705, y: 6244, profile: 'continuous_global' } },
  { source: 'overture-pmtiles', release: '2026-06-17.0', z: 14, x: 4705, y: 6244 },
  { layer: 'transportation.segment', role: 'road' }
);
assert.equal(streamMesh.userData.renderProvenance.provider, 'Overture Maps Foundation');

const osmStreamMesh = { userData: {} };
attachStreamProvenance(
  osmStreamMesh,
  { surfaceTile: { z: 14, x: 4705, y: 6244, profile: 'continuous_global', sources: ['osm-shortbread'] } },
  { source: 'osm-shortbread', release: 'shortbread_v1', z: 14, x: 4705, y: 6244 },
  { layer: 'transportation.segment', role: 'road' }
);
assert.equal(osmStreamMesh.userData.renderProvenance.provider, 'OpenStreetMap Foundation');
assert.equal(osmStreamMesh.userData.renderProvenance.dataset, 'osm-shortbread');
assert.deepEqual(osmStreamMesh.userData.renderProvenance.sources, ['osm-shortbread']);

console.log(JSON.stringify({
  ok: true,
  provenance,
  osmProvenance: osmStreamMesh.userData.renderProvenance
}, null, 2));
