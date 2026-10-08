import test from 'node:test';
import assert from 'node:assert/strict';
import {isOptionalExternalUrl, isOptionalProviderConsole} from '../scripts/verification/optional-provider-console.mjs';

const pageOrigin = 'http://127.0.0.1:4481';
const message = (target, origin = pageOrigin) => `Access to fetch at '${target}' from origin '${origin}' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`;
test('optional provider CORS failures are classified by request target even when Chrome reports the local source page', () => {
  assert.equal(isOptionalProviderConsole({text: message('https://overpass.private.coffee/api/interpreter'), sourceUrl: pageOrigin + '/app/', pageOrigin}), true);
  assert.equal(isOptionalProviderConsole({text: 'Failed to load resource: net::ERR_FAILED', sourceUrl: 'https://lz4.overpass-api.de/api/interpreter', pageOrigin}), true);
});
test('required geometry, application services, foreign origins and lookalike provider URLs remain fatal', () => {
  for (const target of ['https://vector.openstreetmap.org/shortbread_v1/0/0/0.mvt', pageOrigin + '/api/geospatial/marine', 'https://overpass.private.coffee.evil.test/api/interpreter', 'https://evil.test/overpass.private.coffee/api/interpreter', 'http://overpass.private.coffee/api/interpreter', 'invalid']) {
    assert.equal(isOptionalExternalUrl(target), false, target);
    assert.equal(isOptionalProviderConsole({text: message(target), sourceUrl: pageOrigin + '/app/', pageOrigin}), false, target);
  }
  assert.equal(isOptionalProviderConsole({text: message('https://overpass.private.coffee/api/interpreter', 'https://other.test'), sourceUrl: pageOrigin, pageOrigin}), false);
  assert.equal(isOptionalProviderConsole({text: 'TypeError in local application while using overpass.private.coffee', sourceUrl: pageOrigin, pageOrigin}), false);
});
