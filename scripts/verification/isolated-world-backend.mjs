import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Only an already-running, explicitly selected local emulator suite is admitted.
// No cloud debug credential is created, and no production service is substituted.
export async function configureIsolatedWorldBackend(page, baseUrl) {
  assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):9099$/);
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):8080$/);
  assert.equal(process.env.GCLOUD_PROJECT, 'we3d-staging-20260712');
  const base = new URL(baseUrl);
  assert.ok(['127.0.0.1', 'localhost'].includes(base.hostname));
  const config = JSON.parse(await readFile(new URL('../../config/firebase.staging.json', import.meta.url)));
  assert.equal(config.projectId, process.env.GCLOUD_PROJECT);
  await page.addInitScript(config => {
    globalThis.WORLD_EXPLORER_FIREBASE = config;
    globalThis.WORLD_EXPLORER_FIREBASE_ENV = 'staging';
    globalThis.WORLD_EXPLORER_FIREBASE_EMULATORS = {enabled:true,host:'127.0.0.1',authPort:9099,firestorePort:8080};
    globalThis.WORLD_EXPLORER_FUNCTIONS_ORIGIN = `http://127.0.0.1:5001/${config.projectId}/us-central1`;
  }, config);
  await page.route(`${base.origin}/js/firebase-project-config.js*`, route => route.fulfill({
    contentType:'text/javascript', body:`window.WORLD_EXPLORER_FIREBASE_ENV='staging';window.WORLD_EXPLORER_FIREBASE=${JSON.stringify(config)};`
  }));
  const rewrites = {'/api/geospatial/search':'getPlaceLookup','/api/geospatial/reverse':'getPlaceLookup','/api/geospatial/weather':'getEnvironmentalData','/api/geospatial/marine':'getEnvironmentalData','/api/geospatial/aircraft':'getAircraftStates'};
  await page.route(url => url.origin === base.origin && !!rewrites[url.pathname], async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({url:`http://127.0.0.1:5001/${config.projectId}/us-central1/${rewrites[url.pathname]}${url.search}`});
    await route.fulfill({response});
  });
}
