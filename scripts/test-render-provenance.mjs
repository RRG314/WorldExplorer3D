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
    sources: ['osm-shortbread', 'osm-shortbread']
  },
  tileRecord: { source: 'shortbread-vector', release: 'live' },
  provider: 'OpenStreetMap Foundation',
  layer: 'water_polygons',
  role: 'water-area'
});

assert.equal(provenance.version, RENDER_PROVENANCE_VERSION);
assert.equal(provenance.tileKey, '14/4705/6244');
assert.equal(provenance.profile, 'continuous_global');
assert.deepEqual(provenance.sources, ['osm-shortbread']);
assert(Object.isFrozen(provenance));

const mesh = { userData: {} };
attachRenderProvenance(mesh, provenance);
assert.equal(mesh.userData.renderProvenance, provenance);

const streamMesh = { userData: {} };
attachStreamProvenance(
  streamMesh,
  { surfaceTile: { z: 14, x: 4705, y: 6244, profile: 'continuous_global' } },
  { source: 'shortbread-vector', release: 'live', z: 14, x: 4705, y: 6244 },
  { layer: 'streets', role: 'road' }
);
assert.equal(streamMesh.userData.renderProvenance.provider, 'OpenStreetMap Foundation');

console.log(JSON.stringify({ ok: true, provenance }, null, 2));
