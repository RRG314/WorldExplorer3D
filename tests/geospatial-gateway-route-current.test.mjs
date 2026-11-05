import test from 'node:test';
import assert from 'node:assert/strict';
import { geospatialGatewayTarget } from '../app/js/geospatial/gateway-route.js';

const config = { projectId: 'we3d-staging-20260712' };
const local = new URL('http://127.0.0.1:4192/app/');
test('source city and address requests keep the staging backend authority and query', () => {
  const route = new URL(
    geospatialGatewayTarget('/api/geospatial/search?q=10+Downing+Street&limit=8', {
      location: local,
      config,
    })
  );
  assert.equal(route.origin, 'https://us-central1-we3d-staging-20260712.cloudfunctions.net');
  assert.equal(route.pathname, '/getPlaceLookup');
  assert.equal(route.searchParams.get('q'), '10 Downing Street');
  assert.equal(route.searchParams.get('kind'), 'search');
  assert.equal(route.searchParams.get('limit'), '8');
});
test('reverse and environment data use their existing owners', () => {
  for (const kind of ['reverse', 'weather', 'marine']) {
    const route = new URL(
      geospatialGatewayTarget(`/api/geospatial/${kind}?lat=0&lon=-179.9`, {
        location: local,
        config,
      })
    );
    assert.equal(route.pathname, kind === 'reverse' ? '/getPlaceLookup' : '/getEnvironmentalData');
    assert.equal(route.searchParams.get('kind'), kind);
    assert.equal(route.searchParams.get('lon'), '-179.9');
  }
});
test('Hosting and explicit emulators retain same-origin rewrites', () => {
  const request = '/api/geospatial/search?q=Tokyo';
  assert.equal(
    geospatialGatewayTarget(request, {
      location: new URL('https://we3d-staging-20260712.web.app/app/'),
      config,
    }),
    request
  );
  assert.equal(
    geospatialGatewayTarget(request, { location: local, config, emulators: { enabled: true } }),
    request
  );
  assert.equal(geospatialGatewayTarget(request, { location: local }), request);
});
test('untrusted routes and production configuration cannot receive development requests', () => {
  for (const request of [
    'https://example.com/api/geospatial/search',
    '/getPlaceLookup',
    '/api/geospatial/unknown',
  ])
    assert.throws(
      () => geospatialGatewayTarget(request, { location: local, config }),
      /application gateway/
    );
  assert.throws(
    () =>
      geospatialGatewayTarget('/api/geospatial/search', {
        location: local,
        config: { projectId: 'worldexplorer3d-d9b83' },
      }),
    /Production Firebase/
  );
  assert.throws(
    () =>
      geospatialGatewayTarget('/api/geospatial/search', {
        location: local,
        config: { projectId: 'unrelated-project' },
      }),
    /staging Firebase/
  );
});
