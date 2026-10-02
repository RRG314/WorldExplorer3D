import test from 'node:test';
import assert from 'node:assert/strict';
import { createOceanBathymetryApi } from '../app/js/ocean/bathymetry.js';
function setup(values = [-20, -40, -60, -80], extra = {}) {
  const mode = { launchSite: { lat: 0, lon: 0 }, bathymetryCache: new Map(), bathymetryReady: true,
    globalBathymetryGrid: { size: 2, extent: 900, values }, ...extra };
  const api = createOceanBathymetryApi({ appCtx: { SCALE: 111000 }, oceanMode: mode, bathymetryGridUrl: '/fixture', constants: {} });
  return { mode, api };
}
test('missing and malformed corners never become zero-depth contributions', () => {
  for (const value of [null, undefined, NaN, Infinity, '', '0', false]) {
    const { api } = setup([value, -80, -80, -80]);
    assert.equal(api.sampleBathymetryEvidence(0, 0).truthType, 'unknown');
    assert.equal(api.sampleBathymetryEvidence(-900, -900).elevationMeters, null);
    assert.equal(api.sampleBathymetryEvidence(900, 900).depthMeters, 80);
    assert.equal(api.sampleBathymetryEvidence(900, 0).depthMeters, 80);
  }
});
test('interpolates complete cells, accepts their exact edges and refuses extrapolation', () => {
  const { api } = setup();
  assert.equal(api.sampleBathymetryEvidence(0, 0).depthMeters, 50);
  assert.equal(api.sampleBathymetryEvidence(-900, -900).depthMeters, 20);
  assert.equal(api.sampleBathymetryEvidence(900, 900).depthMeters, 80);
  for (const [x,z] of [[900.001,0],[-900.001,0],[0,900.001],[0,-900.001],[1100,0],[NaN,0]]) {
    assert.equal(api.sampleBathymetryEvidence(x,z).truthType, 'unknown');
  }
});
test('local grids preserve missing data and only provide evidence within their geographic bounds', () => {
  const local = { rows: 2, cols: 2, latMin: -1, latMax: 1, lonMin: -1, lonMax: 1, values: [null,-30,-30,-30] };
  const { api } = setup(null, { globalBathymetryGrid: null, localBathymetryGrid: local });
  assert.equal(api.sampleBathymetryEvidence(0,0).truthType, 'unknown');
  local.values[0] = -30;
  assert.equal(api.sampleBathymetryEvidence(0,0).depthMeters, 30);
  assert.equal(api.sampleBathymetryEvidence(111001,0).truthType, 'unknown');
});
test('unknown coverage uses procedural collision without stale neighboring cache values', () => {
  const { api, mode } = setup();
  api.sampleSeabedHeight(899,0);
  assert.equal(api.sampleSeabedHeight(901,0), api.sampleSeabedEvidence(901,0).proceduralWorldY);
  mode.globalBathymetryGrid.values[0] = null;
  assert.equal(api.sampleSeabedEvidence(0,0).presentationMode, 'procedural-only');
  assert.equal(api.sampleSeabedHeight(0,0), api.sampleSeabedEvidence(0,0).presentationWorldY);
});
test('provider outage leaves unknown evidence and finite procedural collision', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  try {
    const { api } = setup(null, { globalBathymetryGrid: null });
    assert.equal(await api.primeGlobalBathymetryGrid(), false);
    assert.equal(api.sampleBathymetryEvidence(0,0).truthType, 'unknown');
    assert.equal(Number.isFinite(api.sampleSeabedHeight(0,0)), true);
  } finally { globalThis.fetch = original; }
});
test('a late grid cannot publish into a replacement session at identical coordinates', async () => {
  const original = globalThis.fetch; let release;
  const ready = new Promise(resolve => release = resolve);
  globalThis.fetch = async () => { await ready; return { ok: true, text: async () => "value_list = '-80'" }; };
  try {
    const { api, mode } = setup(null, { globalBathymetryGrid: null });
    const pending = api.primeGlobalBathymetryGrid();
    mode.launchSite = { ...mode.launchSite };
    release(); assert.equal(await pending, false);
    assert.equal(mode.globalBathymetryGrid, null);
  } finally { globalThis.fetch = original; }
});
