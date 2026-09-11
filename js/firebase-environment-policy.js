const PRODUCTION_PROJECT = 'worldexplorer3d-d9b83';
const PRODUCTION_HOSTS = new Set(['worldexplorer3d.io', 'www.worldexplorer3d.io',
  'worldexplorer3d-d9b83.web.app', 'worldexplorer3d-d9b83.firebaseapp.com']);

export function assertFirebaseEnvironment(config, location = globalThis.location) {
  if (!config) return config;
  const productionHost = location?.protocol === 'https:' && PRODUCTION_HOSTS.has(location.hostname);
  const referencesProduction = [config.projectId, config.storageBucket, config.authDomain]
    .some(value => String(value || '').includes(PRODUCTION_PROJECT)) ||
    String(config.appId || '').startsWith('1:469573887496:');
  if (referencesProduction && !productionHost) throw new Error('Production Firebase is blocked outside the live site. Use staging or emulators for testing.');
  if (productionHost && config.projectId !== PRODUCTION_PROJECT) throw new Error('The live site cannot use staging Firebase.');
  return config;
}

export function assertFunctionsOrigin(origin, config, location = globalThis.location, emulators = null) {
  assertFirebaseEnvironment(config, location);
  const url = new URL(origin), expected = `us-central1-${config?.projectId}.cloudfunctions.net`;
  const emulatorHost = String(emulators?.host || '127.0.0.1');
  const emulator = emulators?.enabled === true && url.hostname === emulatorHost &&
    ['localhost', '127.0.0.1', '[::1]'].includes(emulatorHost) && url.protocol === 'http:';
  if (!emulator && (url.protocol !== 'https:' || url.hostname !== expected || url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash)) throw new Error('Functions endpoint does not match the Firebase project. Cross-environment requests are blocked.');
  return origin.replace(/\/$/, '');
}
