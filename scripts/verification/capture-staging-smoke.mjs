import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const origin = 'https://we3d-staging-20260712.web.app';
const output = 'output/verification/capture-staging-live';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
page.setDefaultTimeout(20000);
const errors = [];
let lastResponse = '';
page.on('pageerror', e => errors.push(e.message));
page.on('response', async response => {
  if (/\/(retryRealityCapture|getMyRealityCapture)$/.test(new URL(response.url()).pathname)) {
    const body = await response.json().catch(() => ({}));
    const message = JSON.stringify({ endpoint: new URL(response.url()).pathname, http: response.status(), state: body.capture?.status || body.status, error: body.error });
    if (message !== lastResponse) console.log(message);
    lastResponse = message;
  }
});
let account;
const resumeId = process.argv.includes('--resume') ? process.argv[process.argv.indexOf('--resume') + 1] : '';
async function resumeBenchmark(password) {
  if (!/^capture_[a-f0-9]{32}$/.test(resumeId)) throw Error('Invalid benchmark capture ID');
  const cli = createRequire(path.join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'firebase-tools/package.json'));
  const auth = cli('./lib/auth'), { requireAuth } = cli('./lib/requireAuth'), { Client } = cli('./lib/apiv2');
  const operator = auth.getGlobalDefaultAccount();
  await requireAuth({ project: 'we3d-staging-20260712', user: operator?.user, tokens: operator?.tokens });
  const db = new Client({ urlPrefix: 'https://firestore.googleapis.com', auth: true });
  const capture = (await db.get(`/v1/projects/we3d-staging-20260712/databases/(default)/documents/realityCaptures/${resumeId}`)).body.fields;
  if (capture.building?.mapValue?.fields?.worldId?.stringValue !== 'capture-benchmark-only' ||
      capture.building?.mapValue?.fields?.label?.stringValue !== 'Private photogrammetry benchmark — not a mapped house') throw Error('Not an operator benchmark');
  const uid = capture.ownerUid.stringValue;
  const service = new Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', auth: true });
  const user = (await service.post('/v1/projects/we3d-staging-20260712/accounts:lookup', { localId: [uid] })).body.users?.[0];
  if (!/^capture-smoke-\d+@example\.test$/.test(user?.email || '')) throw Error('Refusing to alter a real user account');
  // Recover only our disposable benchmark identity. No tokens/passwords are
  // persisted; reuse its frozen 24-photo manifest instead of uploading it again.
  await service.post('/v1/projects/we3d-staging-20260712/accounts:update', { localId: uid, password });
  return user.email;
}
try {
  await page.goto(origin + '/app/capture.html');
  await page.locator('#googleSignIn').waitFor({ state: 'visible' });
  const config = await page.evaluate(() => globalThis.WORLD_EXPLORER_FIREBASE);
  if (config.projectId !== 'we3d-staging-20260712') throw Error('Non-staging page refused');
  let email = `capture-smoke-${Date.now()}@example.test`;
  const password = randomBytes(24).toString('base64url');
  if (resumeId) email = await resumeBenchmark(password);
  else {
  const signUp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${config.apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  account = await signUp.json();
  if (!signUp.ok) throw Error(`Test account creation: ${account.error?.message}`);
  }
  await page.locator('[name=email]').fill(email);
  await page.locator('[name=password]').fill(password);
  await page.locator('#emailSignIn button').click();
  await page.locator('#phoneCaptures').waitFor({ state: 'visible' });
  const admitted = resumeId ? { capture: { captureId: resumeId } } : await page.evaluate(async () => {
    const api = await import('/js/community-reality-capture-api.js?v=4');
    return api.createRealityCaptureDraft({ captureKind: 'exterior', publicContributionRequested: false,
      building: { sourceBuildingId: 'osm:way:424242', worldId: 'capture-benchmark-only', sourceAuthority: 'osm',
        label: 'Private photogrammetry benchmark — not a mapped house', lat: 0, lon: 0 } });
  });
  const id = admitted.capture.captureId;
  console.log(JSON.stringify({ phase: 'authenticated-and-attested-draft', captureId: id, private: true }));
  await page.goto(origin + '/app/capture.html#capture=' + id);
  await page.locator('#realityCapturePanel.show').waitFor();
  if (resumeId) {
    const current = await page.evaluate(async id => (await import('/js/community-reality-capture-api.js?v=4')).getMyRealityCapture(id), id);
    if (current.capture.status === 'processing_failed' && process.argv.includes('--retry')) {
      await page.locator('[data-capture-retry]').click();
      await page.waitForFunction(() => /queued|processing/i.test(document.querySelector('[data-capture-server-status]')?.textContent || ''), null, { timeout: 60000 });
      console.log(JSON.stringify({ phase: 'retried-via-ui-with-saved-photos', captureId: id }));
    }
  } else {
  // Public AliceVision benchmark images, never user photographs. This verifies
  // the provider path, not house alignment, real room navigation or phone hardware.
  const files = await fetch('https://api.github.com/repos/alicevision/dataset_monstree/contents/full').then(r => r.json());
  const photos = files.filter(x => /\.jpg$/i.test(x.name));
  for (let sector = 0; sector < 8; sector++) {
    await page.locator(`[data-sector-index="${sector}"]`).click();
    const batch = [];
    for (let j = 0; j < 3; j++) {
      const photo = photos[Math.floor((sector * 3 + j) * photos.length / 24)];
      const r = await fetch(photo.download_url);
      if (!r.ok) throw Error('Public benchmark image unavailable');
      batch.push({ name: photo.name, mimeType: 'image/jpeg', buffer: Buffer.from(await r.arrayBuffer()) });
    }
    await page.locator('[data-capture-input]').setInputFiles(batch);
    await page.waitForFunction(count => document.querySelector('[data-capture-count]')?.textContent.startsWith(`${count} /`), (sector + 1) * 3);
  }
  await page.screenshot({ path: `${output}/photos-ready.png`, fullPage: false });
  await page.locator('[data-capture-upload]').click();
  await page.waitForFunction(() => /queued|processing|reconstruction is ready/i.test(document.querySelector('[data-capture-server-status]')?.textContent || '') ||
    !document.querySelector('[data-capture-upload]')?.disabled, null, { timeout: 240000 });
  const submission = await page.locator('[data-capture-server-status]').textContent();
  if (!/queued|processing|reconstruction is ready/i.test(submission)) throw Error(await page.locator('[data-capture-status]').textContent());
  }
  console.log(JSON.stringify({ phase: resumeId ? 'resumed-saved-benchmark' : 'uploaded-via-ui', photos: 24, captureId: id }));
  await page.screenshot({ path: `${output}/processing.png` });
  await writeFile(`${output}/capture.json`, JSON.stringify({ captureId: id, phase: 'processing', source: 'https://github.com/alicevision/dataset_monstree', private: true }));
  const deadline = Date.now() + 35 * 60_000;
  let previous = '';
  while (Date.now() < deadline) {
    const state = await page.evaluate(async id => (await import('/js/community-reality-capture-api.js?v=4')).getMyRealityCapture(id), id);
    if (state.capture.status !== previous) {
      previous = state.capture.status;
      console.log(JSON.stringify({ phase: previous, failure: state.capture.failure || null }));
    }
    if (previous === 'processing_failed') throw Error(`Reconstruction failed: ${JSON.stringify(state.capture.failure)}`);
    if (previous === 'review_required') {
      await page.locator('[data-capture-refresh]').click();
      await page.locator('[data-capture-preview]').click();
      await page.locator('[data-capture-viewer] canvas').waitFor({ timeout: 60000 });
      await page.locator('[data-viewer-action=rotate]').click();
      await page.screenshot({ path: `${output}/private-result.png` });
      const desktop = await page.context().newPage();
      await desktop.setViewportSize({ width: 1440, height: 960 });
      await desktop.goto(origin + '/app/capture.html#capture=' + id);
      await desktop.locator('[data-capture-preview]').click();
      await desktop.locator('[data-capture-viewer] canvas').waitFor({ timeout: 60000 });
      await desktop.locator('[data-viewer-action=closer]').click();
      await desktop.screenshot({ path: `${output}/private-result-desktop.png` });
      await desktop.close();
      await writeFile(`${output}/report.json`, JSON.stringify({ ok: true, actualCloudReconstruction: true, captureId: id,
        processed: state.capture.processed, errors, limitation: 'Public benchmark, not a real house/room or physical phone acceptance.' }, null, 2));
      console.log('Private cloud reconstruction visible in the phone-sized UI.');
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
  if (previous !== 'review_required') throw Error('Reconstruction acceptance timed out');
} catch (error) {
  console.error(JSON.stringify({ error: error.message, browserErrors: errors, uiStatus: await page.locator('[data-capture-status]').textContent().catch(() => '') }));
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  // Never persist test passwords or browser storage containing bearer tokens.
  // Keep the private benchmark record for operator inspection; remove the test
  // account only after that record and its media have been removed by the owner.
  await browser.close();
}
