import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { configureStagingAppCheck } from './staging-app-check.mjs';

assert(
  process.env.WE3D_STAGING_APP_CHECK_FILE,
  'Run through attested-source-check; never weaken the service or place credentials in evidence.'
);
const output = path.resolve(`output/verification/cinematic-app-20261105/search-${Date.now()}`),
  url = 'http://127.0.0.1:4192/app/';
const qa = await createFieldworkQaSession({
  output,
  careerId: 'explorer',
  maximumDurationMs: 150000,
});
const page = qa.page,
  report = {
    scope:
      'Actual source browser and live staging place service with disposable registered automation App Check. No route/provider response mocks; not normal reCAPTCHA acceptance.',
    checks: [],
    responses: [],
  };
page.on('response', (response) => {
  const u = new URL(response.url());
  if (
    u.hostname === 'us-central1-we3d-staging-20260712.cloudfunctions.net' &&
    u.pathname === '/getPlaceLookup'
  )
    report.responses.push({ host: u.hostname, path: u.pathname, status: response.status() });
});
try {
  await configureStagingAppCheck(page, url, { proxyGeospatial: false });
  await page.goto(url);
  await page.locator('#playerEntryScreen').waitFor({ state: 'visible', timeout: 90000 });
  await page.locator('#playerEntryScreen [data-entry=explore]').first().click();
  for (const [query, minLat, maxLat, minLon, maxLon] of [
    ['Kyoto, Japan', 33, 37, 133, 137],
    ['10 Downing Street, London', 51, 52, -1, 1],
  ]) {
    await page.locator('#globeLocationSearch').fill(query);
    await page.locator('#globeLocationSearch').press('Enter');
    await page
      .locator('#globeLocationSearchResults button')
      .first()
      .waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('#globeLocationSearchResults button').first().click();
    const selection = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.globeSelector.getSelection();
    });
    assert(
      selection.lat > minLat &&
        selection.lat < maxLat &&
        selection.lon > minLon &&
        selection.lon < maxLon,
      query + ': wrong selected region'
    );
    report.checks.push({
      query,
      selection: { name: selection.name, lat: selection.lat, lon: selection.lon },
    });
  }
  await page.screenshot({ path: path.join(output, 'live-address-selection.png'), fullPage: true });
  assert(
    report.responses.some((r) => r.status === 200),
    'No real staging response observed'
  );
  assert.deepEqual(qa.report.errors, []);
  report.errors = qa.report.errors;
  report.providerErrors = qa.report.providerErrors;
  report.ok = true;
  await fs.writeFile(path.join(output, 'receipt.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('PASS ' + output);
} catch (error) {
  report.failure = error.stack;
  report.errors = qa.report.errors;
  report.providerErrors = qa.report.providerErrors;
  await page.screenshot({ path: path.join(output, 'failed.png'), fullPage: true }).catch(() => {});
  await fs.writeFile(path.join(output, 'failed.json'), JSON.stringify(report, null, 2) + '\n');
  throw error;
} finally {
  await qa.close();
}
