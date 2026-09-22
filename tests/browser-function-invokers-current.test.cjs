const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../firebase.json');
// Construct SDK declarations only. No credentials or network calls are needed.
process.env.GCLOUD_PROJECT ||= 'we3d-local-contract';
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT, storageBucket: 'we3d-local-contract.appspot.com' });
const endpoints = require('../functions/index.js');
const hosted = [...new Set(config.hosting.rewrites.filter(route => route.function).map(route => typeof route.function === 'string' ? route.function : route.function.functionId))];

test('browser-hosted HTTP functions explicitly preserve public invocation at deployment', () => {
  for (const id of hosted) {
    assert.ok(endpoints[id]?.__endpoint?.httpsTrigger, `${id} must export an HTTP function`);
    assert.deepEqual(endpoints[id].__endpoint.httpsTrigger.invoker, ['public'], `${id} must reach its application auth handler without Google Cloud IAM credentials`);
  }
});

test('background capture worker does not acquire the browser invocation policy', () => {
  assert.notDeepEqual(endpoints.realityCaptureWorker.__endpoint.httpsTrigger.invoker, ['public']);
  assert.equal(hosted.includes('realityCaptureWorker'), false);
});

test('repaired browser routes still reject unauthenticated mutations before backend access', async () => {
  const ids = ['createCheckoutSession','createPortalSession','startTrial','updateUrbanVehicle','releaseUrbanVehicle','commitUrbanImpacts','listExplorerDiscoveries','createDiscoveryTrade','acceptDiscoveryTrade','cancelDiscoveryTrade','claimDeFlockVirtualDisable','resolveUrbanCivicOutcome','submitContribution','moderateOverlayFeature','deleteOverlayFeatureDraft','listAdminUsers','updateAdminRoomFlags','publishAdminSiteContent'];
  for (const id of ids) {
    let status, body;
    const req = { method: 'POST', body: {}, headers: {}, get: () => '' };
    const res = { set() { return this; }, status(value) { status = value; return this; }, json(value) { body = value; return this; }, send(value) { body = value; return this; } };
    await endpoints[id](req, res);
    assert.equal(status, 401, `${id} still requires Firebase authentication`);
    assert.match(body.error, /bearer token/i);
  }
});
