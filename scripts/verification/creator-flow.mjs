import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const projectId = String(process.env.GCLOUD_PROJECT || process.env.GCLOUD_PROJECT_ID || '').trim();
const authHost = String(process.env.FIREBASE_AUTH_EMULATOR_HOST || '').trim();
const firestoreHost = String(process.env.FIRESTORE_EMULATOR_HOST || '').trim();

assert.ok(projectId, 'creator-flow must run inside firebase emulators:exec with a project id.');
assert.ok(authHost, 'creator-flow requires the Auth emulator.');
assert.ok(firestoreHost, 'creator-flow requires the Firestore emulator.');

const authOrigin = `http://${authHost}`;
const firestoreOrigin = `http://${firestoreHost}`;
const functionsOrigin = `http://127.0.0.1:5001/${projectId}/us-central1`;
const firestoreDocuments = `${firestoreOrigin}/v1/projects/${projectId}/databases/(default)/documents`;
const password = 'CreatorFlow-Emulator-Only-2026';
const root = process.cwd();
const requestedRoot = String(process.env.WE3D_VERIFY_ROOT || '').trim();
const servedRoot = requestedRoot ? path.resolve(root, requestedRoot) : root;
let featureId = '';
const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');
if (!admin.apps.length) admin.initializeApp({ projectId });

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { raw };
    }
  }
  return { status: response.status, ok: response.ok, payload };
}

async function createEmulatorUser(email, displayName, options = {}) {
  const signUp = await requestJson(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName, returnSecureToken: true })
    }
  );
  assert.equal(signUp.status, 200, `Could not create emulator user ${email}: ${JSON.stringify(signUp.payload)}`);
  assert.ok(signUp.payload?.localId && signUp.payload?.idToken, `Auth emulator returned an incomplete user for ${email}.`);
  let token = signUp.payload.idToken;
  if (options.emailVerified === true) {
    const update = await requestJson(
      `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:update?key=emulator-key`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token, emailVerified: true, returnSecureToken: true })
      }
    );
    assert.equal(update.status, 200, `Could not mark emulator user ${email} verified: ${JSON.stringify(update.payload)}`);
    token = update.payload?.idToken || token;
  }
  return {
    uid: signUp.payload.localId,
    email,
    token
  };
}

async function createAllowlistedModerator() {
  const user = await admin.auth().createUser({
    uid: 'emulator-moderator',
    email: 'moderator@example.test',
    emailVerified: true,
    displayName: 'Creator Moderator',
    password
  });
  await admin.auth().setCustomUserClaims(user.uid, { admin: true, role: 'admin' });
  const signIn = await requestJson(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'moderator@example.test', password, returnSecureToken: true })
    }
  );
  assert.equal(signIn.status, 200, `Could not sign in emulator moderator: ${JSON.stringify(signIn.payload)}`);
  return {
    uid: signIn.payload.localId,
    email: 'moderator@example.test',
    token: signIn.payload.idToken
  };
}

async function callFunction(name, body, token = '') {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return requestJson(`${functionsOrigin}/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {})
  });
}

async function readFirestore(path, token = '') {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return requestJson(`${firestoreDocuments}/${path}`, { headers });
}

async function patchFirestore(path, fields, token = '') {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return requestJson(`${firestoreDocuments}/${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields })
  });
}

async function createDraftThroughUi(email) {
  const server = await startStaticServer({ rootDir: servedRoot, ports: [4392, 4393, 4394] });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const browserErrors = [];
  const localFailures = [];
  page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400 && !response.url().endsWith('/build-manifest.json')) {
      localFailures.push({ url: response.url(), status: response.status() });
    }
  });
  await page.addInitScript(({ project, functionsBase }) => {
    globalThis.WORLD_EXPLORER_FIREBASE = {
      projectId: project,
      apiKey: 'emulator-key',
      appId: 'emulator-app'
    };
    globalThis.WORLD_EXPLORER_FIREBASE_ENV = 'staging-emulator';
    globalThis.WORLD_EXPLORER_FIREBASE_EMULATORS = {
      enabled: true,
      host: '127.0.0.1',
      authPort: 9099,
      firestorePort: 8080
    };
    globalThis.WORLD_EXPLORER_FUNCTIONS_ORIGIN = functionsBase;
  }, { project: projectId, functionsBase: functionsOrigin });

  try {
    const params = new URLSearchParams({
      loc: 'custom', lat: '39.28305', lon: '-76.61270', lname: 'Baltimore Inner Harbor',
      launch: 'earth', gm: 'free', mode: 'walk'
    });
    await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
    await page.locator('#appSignInBtn').click();
    await page.locator('#authEmailInput').fill(email);
    await page.locator('#authPasswordInput').fill(password);
    await page.locator('#authEmailSubmitBtn').click();
    await page.waitForFunction(() => !document.querySelector('#authSignedInBlock')?.hidden, null, { timeout: 30_000 });

    await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
    if (await page.locator('#globeSelectorStartBtn').isVisible().catch(() => false)) {
      await page.locator('#globeSelectorStartBtn').click();
    }
    await page.locator('#loading.show').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('#loading').waitFor({ state: 'hidden', timeout: 300_000 });
    await page.waitForFunction(() => {
      const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      return diagnostics.gameStarted === true && diagnostics.worldLoading === false && diagnostics.modes?.walking === true;
    }, null, { timeout: 300_000 });

    await page.locator('#realEstateFloatBtn').click();
    await page.locator('#fEditorMode').click();
    await page.locator('#editorPanel.show').waitFor({ state: 'visible', timeout: 30_000 });
    if (await page.locator('#editorTutorialStartBtn').isVisible().catch(() => false)) {
      await page.locator('#editorTutorialStartBtn').click();
    }
    await page.locator('#editorSidebarPresetsBtn').click();
    await page.locator('[data-editor-preset="poi_marker"]').click();
    const exposedCanvasPoint = await page.evaluate(() => {
      const canvas = [...document.querySelectorAll('canvas')].find((entry) => {
        const rect = entry.getBoundingClientRect();
        const style = getComputedStyle(entry);
        return rect.width >= innerWidth * 0.8 && rect.height >= innerHeight * 0.8 &&
          style.display !== 'none' && style.visibility !== 'hidden';
      });
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      for (const yRatio of [0.42, 0.52, 0.62, 0.72]) {
        for (const xRatio of [0.50, 0.58, 0.66, 0.74]) {
          const x = rect.left + rect.width * xRatio;
          const y = rect.top + rect.height * yRatio;
          if (document.elementFromPoint(x, y) === canvas) return { x, y };
        }
      }
      return null;
    });
    assert.ok(exposedCanvasPoint, 'The overlay editor did not leave a visible world-canvas point for creation.');
    await page.mouse.click(exposedCanvasPoint.x, exposedCanvasPoint.y);
    const workspaceRow = page.locator('#editorWorkspaceFeatureList [data-editor-workspace-id]').first();
    await workspaceRow.waitFor({ state: 'visible', timeout: 20_000 });
    const createdFeatureId = String(await workspaceRow.getAttribute('data-editor-workspace-id') || '');
    assert.ok(createdFeatureId, 'Visible editor creation did not publish a selected workspace feature id.');
    const nameField = page.locator('[data-editor-guided-field="name"]').first();
    await nameField.fill('Creator Flow Review Point');
    await nameField.press('Tab');
    await page.locator('#editorToolbar [data-editor-action="preview"]').click();
    await page.locator('#editorSaveDraftBtn').click();
    await page.waitForFunction(() => /Draft Creator Flow Review Point saved\./i.test(document.querySelector('#editorStatus')?.textContent || ''), null, { timeout: 45_000 });
    await mkdir('output/release-evidence/current', { recursive: true });
    await page.screenshot({ path: 'output/release-evidence/current/creator-created-draft-desktop.png', fullPage: true });
    await page.locator('#editorTabBlocks').click();
    await page.locator('#blockBuilderPanel.show').waitFor({ state: 'visible', timeout: 30_000 });
    const blockCountText = await page.locator('#blockBuilderCount').textContent();
    await page.screenshot({ path: 'output/release-evidence/current/creator-integrated-block-tool-desktop.png', fullPage: true });
    await page.locator('#blockBuilderBack').click();
    await page.locator('#editorPanel.show').waitFor({ state: 'visible', timeout: 30_000 });
    const snapshot = await page.evaluate(() => ({
      status: document.querySelector('#editorStatus')?.textContent || '',
      authBadge: document.querySelector('#editorAuthBadge')?.textContent || '',
      panelVisible: document.querySelector('#editorPanel')?.classList.contains('show') === true,
      selectedName: document.querySelector('[data-editor-guided-field="name"]')?.value || ''
    }));
    return {
      ok: /Draft Creator Flow Review Point saved\./i.test(snapshot.status) && /blocks/i.test(blockCountText || ''),
      featureId: createdFeatureId,
      blockEditor: {
        roundTrip: snapshot.panelVisible === true,
        countText: String(blockCountText || '').trim()
      },
      snapshot,
      browserErrors,
      localFailures
    };
  } finally {
    await context.close();
    await browser.close();
    await server.close();
  }
}

async function submitReturnedDraftThroughUi(email) {
  const server = await startStaticServer({ rootDir: servedRoot, ports: [4392, 4393, 4394] });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const browserErrors = [];
  const localFailures = [];
  page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400 && !response.url().endsWith('/build-manifest.json')) {
      localFailures.push({ url: response.url(), status: response.status() });
    }
  });
  await page.addInitScript(({ project, functionsBase }) => {
    globalThis.WORLD_EXPLORER_FIREBASE = {
      projectId: project,
      apiKey: 'emulator-key',
      appId: 'emulator-app'
    };
    globalThis.WORLD_EXPLORER_FIREBASE_ENV = 'staging-emulator';
    globalThis.WORLD_EXPLORER_FIREBASE_EMULATORS = {
      enabled: true,
      host: '127.0.0.1',
      authPort: 9099,
      firestorePort: 8080
    };
    globalThis.WORLD_EXPLORER_FUNCTIONS_ORIGIN = functionsBase;
  }, { project: projectId, functionsBase: functionsOrigin });

  try {
    const params = new URLSearchParams({
      loc: 'custom', lat: '39.28305', lon: '-76.61270', lname: 'Baltimore Inner Harbor',
      launch: 'earth', gm: 'free', mode: 'walk'
    });
    await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
    await page.locator('#appSignInBtn').click();
    await page.locator('#authEmailInput').fill(email);
    await page.locator('#authPasswordInput').fill(password);
    await page.locator('#authEmailSubmitBtn').click();
    await page.waitForFunction(() => !document.querySelector('#authSignedInBlock')?.hidden, null, { timeout: 30_000 });

    await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
    if (await page.locator('#globeSelectorStartBtn').isVisible().catch(() => false)) {
      await page.locator('#globeSelectorStartBtn').click();
    }
    await page.locator('#loading.show').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('#loading').waitFor({ state: 'hidden', timeout: 300_000 });
    await page.waitForFunction(() => {
      const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      return diagnostics.gameStarted === true && diagnostics.worldLoading === false && diagnostics.modes?.walking === true;
    }, null, { timeout: 300_000 });

    await page.locator('#realEstateFloatBtn').click();
    await page.locator('#fEditorMine').waitFor({ state: 'visible', timeout: 20_000 });
    await page.locator('#fEditorMine').click();
    await page.locator('#editorPanel.show').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator(`#editorOwnFeatureList [data-editor-own-action="load"][data-editor-own-id="${featureId}"]`).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator(`#editorOwnFeatureList [data-editor-own-action="load"][data-editor-own-id="${featureId}"]`).click();
    await page.locator('#editorToolbar [data-editor-action="preview"]').click();
    await page.locator('#editorSubmitBtn').waitFor({ state: 'visible', timeout: 10_000 });
    await mkdir('output/release-evidence/current', { recursive: true });
    await page.screenshot({ path: 'output/release-evidence/current/creator-returned-draft-desktop.png', fullPage: true });
    await page.locator('#editorSubmitBtn').click();
    await page.waitForFunction(() => /Submitted .* for moderation/i.test(document.querySelector('#editorStatus')?.textContent || ''), null, { timeout: 45_000 });
    await page.screenshot({ path: 'output/release-evidence/current/creator-submitted-draft-desktop.png', fullPage: true });
    const snapshot = await page.evaluate(() => ({
      status: document.querySelector('#editorStatus')?.textContent || '',
      authBadge: document.querySelector('#editorAuthBadge')?.textContent || '',
      panelVisible: document.querySelector('#editorPanel')?.classList.contains('show') === true,
      tab: document.querySelector('#editorPanel')?.dataset.tab || '',
      featureTitle: document.querySelector('#editorSelectedFeatureTitle')?.textContent || ''
    }));
    return { ok: /Submitted .* for moderation/i.test(snapshot.status), snapshot, browserErrors, localFailures };
  } finally {
    await context.close();
    await browser.close();
    await server.close();
  }
}

async function configureEmulatorPage(page) {
  await page.addInitScript(({ project, functionsBase }) => {
    globalThis.WORLD_EXPLORER_FIREBASE = {
      projectId: project,
      apiKey: 'emulator-key',
      appId: 'emulator-app'
    };
    globalThis.WORLD_EXPLORER_FIREBASE_ENV = 'staging-emulator';
    globalThis.WORLD_EXPLORER_FIREBASE_EMULATORS = {
      enabled: true,
      host: '127.0.0.1',
      authPort: 9099,
      firestorePort: 8080
    };
    globalThis.WORLD_EXPLORER_FUNCTIONS_ORIGIN = functionsBase;
  }, { project: projectId, functionsBase: functionsOrigin });
}

async function startBaltimoreRuntime(page, baseUrl) {
  const params = new URLSearchParams({
    loc: 'custom', lat: '39.28305', lon: '-76.61270', lname: 'Baltimore Inner Harbor',
    launch: 'earth', gm: 'free', mode: 'walk'
  });
  await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  if (await page.locator('#globeSelectorStartBtn').isVisible().catch(() => false)) {
    await page.locator('#globeSelectorStartBtn').click();
  }
  await page.locator('#loading.show').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('#loading').waitFor({ state: 'hidden', timeout: 300_000 });
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return diagnostics.gameStarted === true && diagnostics.worldLoading === false && diagnostics.modes?.walking === true;
  }, null, { timeout: 300_000 });
}

async function signInThroughVisibleUi(page, email) {
  await page.locator('#appSignInBtn').click();
  await page.locator('#authEmailInput').fill(email);
  await page.locator('#authPasswordInput').fill(password);
  await page.locator('#authEmailSubmitBtn').click();
  await page.waitForFunction(() => !document.querySelector('#authSignedInBlock')?.hidden, null, { timeout: 30_000 });
}

async function createPublishedOverlayObserver() {
  const server = await startStaticServer({ rootDir: servedRoot, ports: [4395] });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const browserErrors = [];
  const browserConsole = [];
  const localFailures = [];
  page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      browserConsole.push({ type: message.type(), text: message.text() });
    }
  });
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400 && !response.url().endsWith('/build-manifest.json')) {
      localFailures.push({ url: response.url(), status: response.status() });
    }
  });
  await configureEmulatorPage(page);
  await startBaltimoreRuntime(page, baseUrl);
  try {
    await page.waitForFunction(() => {
      const overlays = globalThis.getWorldExplorerRuntimeDiagnostics?.().publishedOverlays;
      const identity = overlays?.providerBaseIdentity;
      return typeof overlays?.activeAreaSignature === 'string' && overlays.activeAreaSignature.length > 0 &&
        Number.isInteger(identity?.roadCount) && Number.isInteger(identity?.buildingCount) &&
        typeof identity?.roadIdentityHash === 'string' && typeof identity?.buildingIdentityHash === 'string';
    }, null, { timeout: 60_000 });
  } catch (error) {
    const diagnostics = await page.evaluate(() => {
      const runtime = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      return {
        gameStarted: runtime.gameStarted === true,
        worldLoading: runtime.worldLoading === true,
        worldCounts: runtime.worldCounts || null,
        publishedOverlays: runtime.publishedOverlays || null
      };
    });
    await context.close();
    await browser.close();
    await server.close();
    throw new Error(`Published-overlay observer did not bind its runtime authority: ${JSON.stringify({ diagnostics, browserErrors, browserConsole, localFailures })}`, { cause: error });
  }
  const snapshot = () => page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().publishedOverlays || null);
  const waitForFeature = async (id, expected) => {
    try {
      await page.waitForFunction(({ featureId: requestedId, shouldExist }) => {
        const overlays = globalThis.getWorldExplorerRuntimeDiagnostics?.().publishedOverlays || {};
        const exists = Array.isArray(overlays.featureIds) && overlays.featureIds.includes(requestedId);
        return shouldExist
          ? exists && Number(overlays.renderedObjectCount || 0) >= 1 && overlays.groupAttached === true
          : !exists && Number(overlays.publishedCount || 0) === 0 && Number(overlays.renderedObjectCount || 0) === 0;
      }, { featureId: id, shouldExist: expected }, { timeout: 45_000 });
    } catch (error) {
      throw new Error(`Second-client overlay state did not converge: ${JSON.stringify({ featureId: id, expected, snapshot: await snapshot(), browserErrors, browserConsole, localFailures })}`, { cause: error });
    }
    return snapshot();
  };
  return {
    page,
    browserErrors,
    browserConsole,
    localFailures,
    snapshot,
    waitForFeature,
    close: async () => {
      await context.close();
      await browser.close();
      await server.close();
    }
  };
}

async function moderateThroughVisibleUi(email, targetFeatureId, action, note, evidenceLabel = action) {
  const server = await startStaticServer({ rootDir: servedRoot, ports: [4396, 4397] });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const browserErrors = [];
  const localFailures = [];
  page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400 && !response.url().endsWith('/build-manifest.json')) {
      localFailures.push({ url: response.url(), status: response.status() });
    }
  });
  await configureEmulatorPage(page);
  try {
    const params = new URLSearchParams({
      loc: 'custom', lat: '39.28305', lon: '-76.61270', lname: 'Baltimore Inner Harbor',
      launch: 'earth', gm: 'free', mode: 'walk'
    });
    await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
    await signInThroughVisibleUi(page, email);
    await page.waitForFunction(() => globalThis.__WE3D_ENTITLEMENTS__?.isAdmin === true, null, { timeout: 30_000 });
    if (await page.locator('#globeSelectorStartBtn').isVisible().catch(() => false)) {
      await page.locator('#globeSelectorStartBtn').click();
    }
    await page.locator('#loading.show').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('#loading').waitFor({ state: 'hidden', timeout: 300_000 });
    await page.locator('#realEstateFloatBtn').click();
    await page.locator('#fModerationPanel').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('#fModerationPanel').click();
    await page.locator('#editorPanel.show').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator(`#editorModerationList [data-editor-moderation-id="${targetFeatureId}"]`).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator(`#editorModerationList [data-editor-moderation-id="${targetFeatureId}"]`).click();
    await page.locator('#editorModerationNoteInput').fill(note);
    const button = {
      approve: '#editorModerationApproveBtn',
      needs_changes: '#editorModerationNeedsBtn',
      reject: '#editorModerationRejectBtn'
    }[action];
    assert.ok(button, `Unsupported visible moderation action ${action}.`);
    await page.locator(button).click();
    const statusPattern = action === 'approve' ? /Approved and published/i : action === 'needs_changes' ? /Returned .* for changes/i : /Rejected/i;
    await page.waitForFunction(({ source }) => new RegExp(source, 'i').test(document.querySelector('#editorStatus')?.textContent || ''), { source: statusPattern.source }, { timeout: 45_000 });
    await mkdir('output/release-evidence/current', { recursive: true });
    await page.screenshot({
      path: `output/release-evidence/current/creator-moderation-${evidenceLabel}.png`,
      animations: 'disabled',
      fullPage: false,
      timeout: 45_000
    });
    const status = await page.locator('#editorStatus').textContent();
    return { ok: statusPattern.test(status || ''), action, status, browserErrors, localFailures };
  } finally {
    await context.close();
    await browser.close();
    await server.close();
  }
}

async function deleteReturnedDraftThroughVisibleUi(email, targetFeatureId) {
  const server = await startStaticServer({ rootDir: servedRoot, ports: [4396, 4397] });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const browserErrors = [];
  const localFailures = [];
  page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400 && !response.url().endsWith('/build-manifest.json')) {
      localFailures.push({ url: response.url(), status: response.status() });
    }
  });
  await configureEmulatorPage(page);
  try {
    const params = new URLSearchParams({
      loc: 'custom', lat: '39.28305', lon: '-76.61270', lname: 'Baltimore Inner Harbor',
      launch: 'earth', gm: 'free', mode: 'walk'
    });
    await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
    await signInThroughVisibleUi(page, email);
    if (await page.locator('#globeSelectorStartBtn').isVisible().catch(() => false)) {
      await page.locator('#globeSelectorStartBtn').click();
    }
    await page.locator('#loading.show').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('#loading').waitFor({ state: 'hidden', timeout: 300_000 });
    await page.locator('#realEstateFloatBtn').click();
    await page.locator('#fEditorMine').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('#fEditorMine').click();
    await page.locator('#editorPanel.show').waitFor({ state: 'visible', timeout: 30_000 });
    const deleteButton = page.locator(`#editorOwnFeatureList [data-editor-own-action="delete"][data-editor-own-id="${targetFeatureId}"]`);
    await deleteButton.waitFor({ state: 'visible', timeout: 30_000 });
    await deleteButton.click();
    await page.waitForFunction((id) => !document.querySelector(`[data-editor-own-id="${id}"]`) && /Removed /i.test(document.querySelector('#editorStatus')?.textContent || ''), targetFeatureId, { timeout: 45_000 });
    const status = await page.locator('#editorStatus').textContent();
    return { ok: /Removed /i.test(status || ''), status, browserErrors, localFailures };
  } finally {
    await context.close();
    await browser.close();
    await server.close();
  }
}

function firestoreString(document, field) {
  return document?.fields?.[field]?.stringValue || '';
}

const owner = await createEmulatorUser('creator-owner@example.test', 'Creator Owner');
const outsider = await createEmulatorUser('creator-outsider@example.test', 'Creator Outsider');
const moderator = await createAllowlistedModerator();

const creatorUi = await createDraftThroughUi(owner.email);
assert.equal(creatorUi.ok, true, `Owner UI creation failed: ${JSON.stringify(creatorUi)}`);
featureId = creatorUi.featureId;
const uiDraftSnapshot = await admin.firestore().collection('overlayFeatures').doc(featureId).get();
assert.equal(uiDraftSnapshot.exists, true, 'The visible editor save did not create a cloud draft.');
const uiDraft = uiDraftSnapshot.data() || {};
const feature = {
  featureId,
  worldKind: uiDraft.worldKind,
  presetId: uiDraft.presetId,
  featureClass: uiDraft.featureClass,
  sourceType: uiDraft.sourceType,
  mergeMode: uiDraft.mergeMode,
  geometryType: uiDraft.geometryType,
  geometry: uiDraft.geometry,
  threeD: uiDraft.threeD,
  tags: uiDraft.tags,
  summary: uiDraft.summary,
  submission: {
    contributorNote: 'Emulator-only review journey.',
    changeSummary: 'Add a staged World Explorer place overlay.',
    editIntent: 'release verification'
  },
  validation: { valid: true, issues: [] }
};

const anonymousSave = await callFunction('saveOverlayFeatureDraft', feature);
const ownerSave = await callFunction('saveOverlayFeatureDraft', feature, owner.token);
assert.equal(ownerSave.status, 200, `Owner draft save failed: ${JSON.stringify(ownerSave.payload)}`);
assert.equal(ownerSave.payload?.item?.reviewState, 'draft', 'A newly saved overlay must remain a draft.');
assert.equal(ownerSave.payload?.item?.publicationState, 'unpublished', 'A draft must not be publicly published.');

const anonymousDraftRead = await readFirestore(`overlayFeatures/${featureId}`);
const ownerDraftRead = await readFirestore(`overlayFeatures/${featureId}`, owner.token);
const outsiderDraftRead = await readFirestore(`overlayFeatures/${featureId}`, outsider.token);
const ownerDirectWrite = await patchFirestore(
  `overlayFeatures/${featureId}`,
  { summary: { stringValue: 'Direct client tamper attempt' } },
  owner.token
);

const ownerSubmit = await callFunction('submitOverlayFeature', { featureId }, owner.token);
assert.equal(ownerSubmit.status, 200, `Owner submission failed: ${JSON.stringify(ownerSubmit.payload)}`);
assert.equal(ownerSubmit.payload?.item?.reviewState, 'submitted', 'Submission did not enter the moderation queue.');

const outsiderSubmit = await callFunction('submitOverlayFeature', { featureId }, outsider.token);
const ownerEditWhileSubmitted = await callFunction(
  'saveOverlayFeatureDraft',
  { ...feature, summary: 'Attempted edit after submission' },
  owner.token
);
const outsiderModeration = await callFunction(
  'moderateOverlayFeature',
  { featureId, action: 'approve', note: 'Unauthorized approval attempt.' },
  outsider.token
);

const overlayObserver = await createPublishedOverlayObserver();
const observerBeforeApproval = await overlayObserver.snapshot();
assert.equal(observerBeforeApproval.publishedCount, 0, 'Fresh second client unexpectedly began with a published overlay.');

const approve = await moderateThroughVisibleUi(
  moderator.email,
  featureId,
  'approve',
  'Reviewed through the visible minimum-5.0 moderation panel.'
);
assert.equal(approve.ok, true, `Visible moderator approval failed: ${JSON.stringify(approve)}`);
const observerAfterApproval = await overlayObserver.waitForFeature(featureId, true);

const publicReadAfterApproval = await readFirestore(`overlayPublished/${featureId}`);
const publicDirectWrite = await patchFirestore(
  `overlayPublished/${featureId}`,
  { summary: { stringValue: 'Anonymous published-layer tamper attempt' } }
);

const returnForChanges = await moderateThroughVisibleUi(
  moderator.email,
  featureId,
  'needs_changes',
  'Exercise visible rollback and the revision lifecycle.'
);
assert.equal(returnForChanges.ok, true, `Visible needs-changes moderation failed: ${JSON.stringify(returnForChanges)}`);
const observerAfterReturn = await overlayObserver.waitForFeature(featureId, false);

const publicReadAfterReturn = await readFirestore(`overlayPublished/${featureId}`);
const revisedSave = await callFunction(
  'saveOverlayFeatureDraft',
  {
    ...feature,
    summary: 'Creator Flow Review Point Revised',
    tags: { ...feature.tags, name: 'Creator Flow Review Point Revised' },
    submission: { ...feature.submission, changeSummary: 'Revise after moderator feedback.' }
  },
  owner.token
);
assert.equal(revisedSave.status, 200, `Owner could not revise a returned draft: ${JSON.stringify(revisedSave.payload)}`);
assert.equal(revisedSave.payload?.item?.reviewState, 'draft', 'A revised returned feature must go back to draft before resubmission.');

const uiResubmit = await submitReturnedDraftThroughUi(owner.email);
assert.equal(uiResubmit.ok, true, `Owner UI resubmission failed: ${JSON.stringify(uiResubmit)}`);
const resubmit = await readFirestore(`overlayFeatures/${featureId}`, owner.token);
assert.equal(resubmit.status, 200, `Owner resubmission record was unavailable: ${JSON.stringify(resubmit.payload)}`);
assert.equal(firestoreString(resubmit.payload, 'reviewState'), 'submitted', 'UI resubmission did not enter the moderation queue.');
const reapprove = await moderateThroughVisibleUi(
  moderator.email,
  featureId,
  'approve',
  'Revision accepted through visible moderation.',
  'reapprove'
);
assert.equal(reapprove.ok, true, `Visible moderator reapproval failed: ${JSON.stringify(reapprove)}`);
const observerAfterReapproval = await overlayObserver.waitForFeature(featureId, true);

const finalPublicRead = await readFirestore(`overlayPublished/${featureId}`);
const ownerRevisions = await readFirestore(`overlayFeatures/${featureId}/revisions`, owner.token);
const outsiderRevisions = await readFirestore(`overlayFeatures/${featureId}/revisions`, outsider.token);
const reject = await moderateThroughVisibleUi(
  moderator.email,
  featureId,
  'reject',
  'Final visible rejection verifies projection deletion and owner cleanup.'
);
assert.equal(reject.ok, true, `Visible moderator rejection failed: ${JSON.stringify(reject)}`);
const observerAfterReject = await overlayObserver.waitForFeature(featureId, false);
const ownerModerationAfterReject = await readFirestore(`overlayFeatures/${featureId}/moderation`, owner.token);
const ownerDelete = await deleteReturnedDraftThroughVisibleUi(owner.email, featureId);
assert.equal(ownerDelete.ok, true, `Visible owner deletion failed: ${JSON.stringify(ownerDelete)}`);
const deletedDraftRead = await readFirestore(`overlayFeatures/${featureId}`, owner.token);
const deletedPublicRead = await readFirestore(`overlayPublished/${featureId}`);
const [deletedDraftSnapshot, deletedPublicSnapshot] = await Promise.all([
  admin.firestore().collection('overlayFeatures').doc(featureId).get(),
  admin.firestore().collection('overlayPublished').doc(featureId).get()
]);
const observerAfterDelete = await overlayObserver.snapshot();
await overlayObserver.close();

const checks = {
  anonymousCannotSaveDraft: anonymousSave.status === 401,
  ownerCanCreateCloudDraftThroughUi: creatorUi.ok === true && creatorUi.browserErrors.length === 0 &&
    creatorUi.localFailures.length === 0 && uiDraftSnapshot.exists === true,
  ownerCanSaveCloudDraft: ownerSave.status === 200,
  privateDraftDeniedToAnonymous: anonymousDraftRead.status === 403,
  ownerCanReadOwnDraft: ownerDraftRead.status === 200,
  privateDraftDeniedToOutsider: outsiderDraftRead.status === 403,
  directClientDraftWritesDenied: ownerDirectWrite.status === 403,
  ownerCanSubmitForReview: ownerSubmit.status === 200,
  outsiderCannotSubmitOwnersDraft: outsiderSubmit.status === 403,
  submittedDraftCannotBeEdited: ownerEditWhileSubmitted.status === 409,
  nonModeratorCannotApprove: outsiderModeration.status === 403,
  moderatorCanPublishThroughVisibleUi: approve.ok === true && approve.browserErrors.length === 0 && approve.localFailures.length === 0,
  publishedProjectionIsPublic: publicReadAfterApproval.status === 200 &&
    firestoreString(publicReadAfterApproval.payload, 'reviewState') === 'approved' &&
    firestoreString(publicReadAfterApproval.payload, 'publicationState') === 'published',
  secondClientRendersApprovedOverlay: observerAfterApproval.featureIds.includes(featureId) &&
    observerAfterApproval.runtimePoiCount >= 1 && observerAfterApproval.renderedObjectCount >= 1,
  directPublishedWritesDenied: publicDirectWrite.status === 403,
  needsChangesUnpublishesThroughVisibleUi: returnForChanges.ok === true && publicReadAfterReturn.status === 404 &&
    !observerAfterReturn.featureIds.includes(featureId) && observerAfterReturn.renderedObjectCount === 0,
  ownerCanReviseAndResubmit: revisedSave.status === 200 && resubmit.status === 200 && uiResubmit.ok === true &&
    uiResubmit.browserErrors.length === 0 && uiResubmit.localFailures.length === 0,
  revisedApprovalRepublishesToSecondClient: reapprove.ok === true && finalPublicRead.status === 200 &&
    firestoreString(finalPublicRead.payload, 'summary') === 'Creator Flow Review Point Revised' &&
    observerAfterReapproval.featureIds.includes(featureId),
  ownerCanAuditRevisionHistory: ownerRevisions.status === 200 &&
    Array.isArray(ownerRevisions.payload?.documents) && ownerRevisions.payload.documents.length >= 6,
  outsiderCannotReadRevisionHistory: outsiderRevisions.status === 403,
  ownerCanAuditModerationHistory: ownerModerationAfterReject.status === 200 &&
    Array.isArray(ownerModerationAfterReject.payload?.documents) && ownerModerationAfterReject.payload.documents.length >= 4,
  allModerationActionsUseCleanVisibleAdminUi: [approve, returnForChanges, reapprove, reject].every((entry) =>
    entry.ok === true && entry.browserErrors.length === 0 && entry.localFailures.length === 0),
  visibleRejectRemovesSecondClientProjection: reject.ok === true && !observerAfterReject.featureIds.includes(featureId) &&
    observerAfterReject.renderedObjectCount === 0,
  ownerCanDeleteReturnedDraftThroughVisibleUi: ownerDelete.ok === true &&
    deletedDraftSnapshot.exists === false && deletedPublicSnapshot.exists === false,
  providerBaseDataStayedImmutable: JSON.stringify(observerBeforeApproval.providerBaseIdentity) === JSON.stringify(observerAfterApproval.providerBaseIdentity) &&
    JSON.stringify(observerBeforeApproval.providerBaseIdentity) === JSON.stringify(observerAfterReturn.providerBaseIdentity) &&
    JSON.stringify(observerBeforeApproval.providerBaseIdentity) === JSON.stringify(observerAfterReapproval.providerBaseIdentity) &&
    JSON.stringify(observerBeforeApproval.providerBaseIdentity) === JSON.stringify(observerAfterReject.providerBaseIdentity) &&
    JSON.stringify(observerBeforeApproval.providerBaseIdentity) === JSON.stringify(observerAfterDelete.providerBaseIdentity),
  secondClientHadNoBrowserOrResourceErrors: overlayObserver.browserErrors.length === 0 && overlayObserver.localFailures.length === 0
};

const report = {
  ok: Object.values(checks).every(Boolean),
  contract: 'world-explorer-reviewed-overlay-flow-v1',
  checks,
  authority: {
    projectId,
    environment: 'local-emulators-only',
    writesProduction: false,
    featureId,
    finalReviewState: 'deleted-after-visible-reject',
    finalPublicationState: 'unpublished-and-deleted',
    approvedProjectionReviewState: firestoreString(finalPublicRead.payload, 'reviewState'),
    approvedProjectionPublicationState: firestoreString(finalPublicRead.payload, 'publicationState'),
    revisionCount: ownerRevisions.payload?.documents?.length || 0,
    moderationEventCount: ownerModerationAfterReject.payload?.documents?.length || 0
  },
  ui: {
    createdDraft: creatorUi,
    resubmittedDraft: uiResubmit,
    moderation: { approve, returnForChanges, reapprove, reject },
    ownerDelete
  },
  secondClient: {
    beforeApproval: observerBeforeApproval,
    afterApproval: observerAfterApproval,
    afterReturn: observerAfterReturn,
    afterReapproval: observerAfterReapproval,
    afterReject: observerAfterReject,
    afterDelete: observerAfterDelete,
    browserErrors: overlayObserver.browserErrors,
    browserConsole: overlayObserver.browserConsole,
    localFailures: overlayObserver.localFailures
  },
  deniedStatuses: {
    anonymousSave: anonymousSave.status,
    anonymousDraftRead: anonymousDraftRead.status,
    outsiderDraftRead: outsiderDraftRead.status,
    ownerDirectWrite: ownerDirectWrite.status,
    outsiderSubmit: outsiderSubmit.status,
    ownerEditWhileSubmitted: ownerEditWhileSubmitted.status,
    outsiderModeration: outsiderModeration.status,
    publicDirectWrite: publicDirectWrite.status,
    outsiderRevisions: outsiderRevisions.status,
    deletedDraftRead: deletedDraftRead.status,
    deletedPublicRead: deletedPublicRead.status
  }
};

console.log(JSON.stringify(report, null, 2));
assert.equal(report.ok, true, 'Reviewed overlay creator flow failed.');
