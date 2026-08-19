import assert from 'node:assert/strict';
import { createOceanBathymetryApi } from '../app/js/ocean/bathymetry.js';

const oceanMode = {
  launchSite: { lat: 0, lon: -140, name: 'Pacific test site' },
  bathymetryCache: new Map(),
  globalBathymetryGrid: null,
  globalBathymetryReady: false,
  globalBathymetryPromise: null,
  localBathymetryGrid: null,
  localBathymetryReady: false
};
const appCtx = {
  SCALE: 100000,
  getAcceptedGroundRuntimeSnapshot: () => ({ status: 'unavailable' })
};
const originalFetch = globalThis.fetch;
let requestCount = 0;
globalThis.fetch = async (url) => {
  requestCount += 1;
  const bbox = new URL(url).searchParams.get('BBOX').split(',').map(Number);
  const centerLon = (bbox[0] + bbox[2]) * 0.5;
  const centerLat = (bbox[1] + bbox[3]) * 0.5;
  const depth = Math.round(-4300 + centerLon * 0.5 + centerLat * 0.25);
  return {
    ok: true,
    text: async () => `GetFeatureInfo results:\nvalue_list = '${depth}'`
  };
};

try {
  const api = createOceanBathymetryApi({
    appCtx,
    bathymetryGridUrl: '',
    constants: {},
    oceanMode
  });
  assert.equal(await api.primeGlobalBathymetryGrid(), true);
  assert.equal(requestCount, 25);
  assert.equal(oceanMode.globalBathymetryReady, true);
  assert.equal(oceanMode.globalBathymetryGrid.dataset, 'GEBCO current WMS grid');
  assert.equal(oceanMode.globalBathymetryGrid.datasetRelease, 'service-layer-current');
  assert.equal(oceanMode.globalBathymetryGrid.values.length, 25);
  const centerEvidence = api.sampleSeabedEvidence(0, 0);
  assert.equal(centerEvidence.bathymetry.truthType, 'modeled');
  assert.equal(centerEvidence.bathymetry.navigationSafe, false);
  assert.equal(centerEvidence.presentationMode, 'procedural-bathymetry-blend');
  assert(centerEvidence.bathymetryBlend > 0 && centerEvidence.bathymetryBlend < 1);
  const centerHeight = api.sampleSeabedHeight(0, 0);
  assert(Number.isFinite(centerHeight));
  assert(centerHeight < -40, `expected deep-ocean seabed, received ${centerHeight}`);
} finally {
  globalThis.fetch = originalFetch;
}

console.log(JSON.stringify({
  ok: true,
  provider: 'GEBCO current WMS grid GetFeatureInfo',
  samplesPerLaunch: requestCount,
  grid: '5x5 bilinear',
  fallback: 'local-grid-then-accepted-ground-then-procedural'
}, null, 2));
