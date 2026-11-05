import {
  assertFirebaseEnvironment,
  assertFunctionsOrigin,
} from '../../../js/firebase-environment-policy.js';

const gateways = Object.freeze({
  '/api/geospatial/search': ['getPlaceLookup', 'search'],
  '/api/geospatial/reverse': ['getPlaceLookup', 'reverse'],
  '/api/geospatial/weather': ['getEnvironmentalData', 'weather'],
  '/api/geospatial/marine': ['getEnvironmentalData', 'marine'],
});

// Hosting rewrites own deployed requests. A source browser has no Hosting
// rewrite, so loopback development uses the SAME authenticated staging owner.
// Emulator sessions retain their explicit local proxy. Never route to a public
// geocoder or infer a production project from a development URL.
export function geospatialGatewayTarget(
  input,
  { location = globalThis.location, config = null, emulators = null } = {}
) {
  const origin = location?.origin || 'http://localhost';
  const target = new URL(input, origin);
  const gateway = gateways[target.pathname];
  if (target.origin !== origin || !gateway)
    throw new TypeError('Authenticated data requests require the application gateway.');
  assertFirebaseEnvironment(config, location);
  const loopback =
    location?.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!loopback || emulators?.enabled === true || !config) return input;
  if (config.projectId !== 'we3d-staging-20260712')
    throw new Error('Local place search requires the staging Firebase project or emulators.');
  const functionsOrigin = assertFunctionsOrigin(
    `https://us-central1-${config.projectId}.cloudfunctions.net`,
    config,
    location
  );
  const route = new URL(`/${gateway[0]}`, functionsOrigin);
  route.search = target.search;
  route.searchParams.set('kind', gateway[1]);
  return route.href;
}
