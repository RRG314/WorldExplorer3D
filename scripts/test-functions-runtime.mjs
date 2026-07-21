import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const functionsPackage = require('../functions/package.json');
const runtimeExports = require('../functions/index.js');

assert.equal(functionsPackage.engines?.node, '22', 'Cloud Functions must use the supported Node.js 22 runtime.');
assert.match(functionsPackage.dependencies?.['firebase-admin'] || '', /^\^13\./, 'Firebase Admin must remain on the audited namespace-compatible major.');
assert.match(functionsPackage.dependencies?.['firebase-functions'] || '', /^\^6\./, 'Firebase Functions must remain on the audited Gen 1-compatible major.');

const expectedExports = [
  'createCheckoutSession',
  'createPortalSession',
  'deleteAccount',
  'getAccountOverview',
  'getAdminDashboardOverview',
  'getAircraftStates',
  'getStreetImagery',
  'listBillingReceipts',
  'moderateOverlayFeature',
  'saveOverlayFeatureDraft',
  'startTrial',
  'stripeWebhook',
  'submitContribution',
  'submitOverlayFeature',
  'updateAccountProfile'
];

for (const exportName of expectedExports) {
  assert.equal(typeof runtimeExports[exportName], 'function', `Missing Cloud Function export: ${exportName}`);
}

console.log(JSON.stringify({
  ok: true,
  nodeRuntime: functionsPackage.engines.node,
  firebaseAdmin: functionsPackage.dependencies['firebase-admin'],
  firebaseFunctions: functionsPackage.dependencies['firebase-functions'],
  verifiedExports: expectedExports.length
}, null, 2));
