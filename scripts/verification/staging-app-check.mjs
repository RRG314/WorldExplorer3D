import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

// Credentials stay outside the build and reports. This only configures the
// documented Firebase debug provider in an explicitly local staging browser.
export async function configureStagingAppCheck(page, baseUrl) {
  const credentialPath = process.env.WE3D_STAGING_APP_CHECK_FILE;
  if (!credentialPath) return { provider: 'default' };
  const url = new URL(baseUrl);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Debug attestation requires a loopback test URL.');
  const info = await stat(credentialPath);
  assert.equal(info.mode & 0o077, 0, 'App Check credentials must be private to their owner.');
  const credential = JSON.parse(await readFile(credentialPath, 'utf8'));
  const config = JSON.parse(await readFile(new URL('../../config/firebase.staging.json', import.meta.url), 'utf8'));
  assert.equal(credential.projectId, 'we3d-staging-20260712');
  assert.equal(credential.projectId, config.projectId);
  assert.equal(credential.appId, config.appId);
  assert.ok(Date.parse(credential.expiresAt) > Date.now(), 'Temporary App Check credential expired.');
  assert.match(credential.token, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  // A production-configured artifact assigns this global after init scripts.
  // Override only its loopback configuration module so local functional tests
  // remain on staging without changing production's environment policy.
  await page.route(`${new URL('/js/firebase-project-config.js', url).href}*`, route => route.fulfill({
    contentType: 'text/javascript',
    body: `window.WORLD_EXPLORER_FIREBASE_ENV = 'staging'; window.WORLD_EXPLORER_FIREBASE = ${JSON.stringify(config)};`
  }));
  await page.addInitScript(({ token, config }) => {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return;
    globalThis.WORLD_EXPLORER_FIREBASE = config;
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = token;
  }, { token: credential.token, config });
  return { provider: 'registered-staging-debug', projectId: config.projectId, artifactConfigurationOverridden: true, productionAttestationVerified: false };
}
