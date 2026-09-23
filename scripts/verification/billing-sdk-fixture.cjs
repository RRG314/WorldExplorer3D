// Verification-only SDK transport. Loaded through NODE_OPTIONS by the isolated
// account emulator group; it is outside functions/ and is never deployed.
const Module = require('node:module');
const fs = require('node:fs');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  const actual = originalLoad.call(this, request, parent, isMain);
  if (request !== 'stripe' || process.env.FUNCTIONS_EMULATOR !== 'true' ||
      !process.env.WE3D_VERIFICATION_STRIPE_FIXTURE) return actual;
  return class EmulatorStripe extends actual {
    constructor(key, options) {
      if (key !== 'local-emulator-unused' ||
          !/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
        throw new Error('Billing fixture requires an isolated emulator and non-service key');
      }
      super(key, { ...options, maxNetworkRetries: 0,
        httpClient: actual.createFetchHttpClient(async (url, init) => {
          const target = new URL(url);
          if (target.hostname !== 'api.stripe.com' || init.method !== 'GET' ||
              target.pathname !== '/v1/subscriptions/sub_emulator_billing') {
            throw new Error('Unexpected request in isolated Stripe fixture');
          }
          const file = process.env.WE3D_VERIFICATION_STRIPE_FIXTURE;
          const state = JSON.parse(fs.readFileSync(file, 'utf8'));
          fs.appendFileSync(`${file}.requests`, JSON.stringify({ path: target.pathname }) + '\n');
          return new Response(JSON.stringify(state.body), {
            status: state.status, headers: { 'content-type': 'application/json' }
          });
        })
      });
    }
  };
};
