import assert from 'node:assert/strict';
import {
  loadAcceptedGroundCatalog,
  parseAcceptedGroundCatalog
} from '../app/js/terrain/accepted-ground-catalog.js';

const catalogUrl = 'https://example.test/assets/ground/manifest-catalog.json';
const manifest = {
  schemaVersion: 1,
  artifactId: 'fixture-ground',
  providerId: 'usgs-3dep-best-available',
  artifactUrl: './fixture-ground.json'
};
const parsed = parseAcceptedGroundCatalog({
  schemaVersion: 1,
  manifests: [manifest]
}, { url: catalogUrl });
assert.equal(parsed.status, 'accepted');
assert.equal(
  parsed.manifests[0].url,
  'https://example.test/assets/ground/fixture-ground.json'
);
assert.equal(Object.isFrozen(parsed.manifests[0]), true);

const empty = parseAcceptedGroundCatalog({
  schemaVersion: 1,
  manifests: []
}, { url: catalogUrl });
assert.equal(empty.status, 'accepted');
assert.deepEqual(empty.manifests, []);

assert.equal(parseAcceptedGroundCatalog(null).status, 'rejected');
assert.equal(parseAcceptedGroundCatalog({
  schemaVersion: 2,
  manifests: []
}).reason, 'unsupported-catalog-schema');
assert.equal(parseAcceptedGroundCatalog({
  schemaVersion: 1,
  manifests: {}
}).reason, 'catalog-manifests-must-be-an-array');

const loaded = await loadAcceptedGroundCatalog({
  url: catalogUrl,
  fetchImpl: async () => ({
    ok: true,
    url: catalogUrl,
    json: async () => ({ schemaVersion: 1, manifests: [manifest] })
  })
});
assert.equal(loaded.status, 'accepted');
assert.equal(loaded.manifests.length, 1);

const failed = await loadAcceptedGroundCatalog({
  url: catalogUrl,
  fetchImpl: async () => ({ ok: false, status: 503 })
});
assert.equal(failed.reason, 'catalog-fetch-failed');

console.log(JSON.stringify({
  ok: true,
  contract: 'accepted-ground-catalog',
  resolvesArtifactUrls: true,
  emptyCatalogIsExplicit: true,
  rejectsMalformedCatalogs: true
}, null, 2));
