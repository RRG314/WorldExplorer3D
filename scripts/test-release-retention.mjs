import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = String(process.env.WE3D_BASE_URL || '').trim();
const OUTPUT_DIR = path.join(process.cwd(), 'output', 'playwright', 'release-retention');

function randomEmail() {
  return `we3d.e2e.${Date.now()}@example.com`;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(OUTPUT_DIR, name) });
}

async function openMultiplayerTab(page) {
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('.tab-btn'))
      .find((node) => /multiplayer/i.test(node.textContent || ''));
    if (button instanceof HTMLElement) button.click();
  });
  await page.waitForFunction(() => {
    const panel = document.getElementById('tab-multiplayer');
    return !!panel && panel.classList.contains('active');
  }, { timeout: 45000 });
}

async function ensureSignedInUi(page) {
  await page.waitForFunction(() => {
    const btn = document.getElementById('appSignInBtn');
    return !!btn && /account/i.test(btn.textContent || '');
  }, { timeout: 45000 });
}

async function roomListText(page) {
  return (await page.locator('#mpOwnedRoomsList').innerText()).trim();
}

async function waitForLocalPersistenceModules(page) {
  await page.waitForFunction(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    return typeof mod?.ctx?.getBuildPersistenceStatus === 'function' &&
      typeof mod?.ctx?.getMemoryPersistenceStatus === 'function';
  }, null, { timeout: 45000 });
  await page.waitForFunction(() => (
    (localStorage.getItem('worldExplorer3D.buildBlocks.v1') || '').includes('blk_e2e') &&
    (localStorage.getItem('worldExplorer3D.memories.v1') || '').includes('mem_e2e')
  ), null, { timeout: 45000 });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function redactReport(result, secrets = []) {
  let serialized = JSON.stringify(result, null, 2);
  for (const secret of secrets) {
    const value = String(secret || '');
    if (value) serialized = serialized.replaceAll(value, '[redacted]');
  }
  return serialized;
}

async function cleanupStagingAccount(page, credentials) {
  return page.evaluate(async ({ email, password }) => {
    const auth = await import(`/js/auth-ui.js?cleanup=${Date.now()}`);
    if (!auth.getCurrentUser()) {
      await auth.signInWithEmailPassword(email, password);
    }
    const billing = await import(`/js/billing.js?cleanup=${Date.now()}`);
    const response = await billing.deleteAccount();
    await auth.signOutUser();
    return { accountDeleted: response?.deleted === true };
  }, credentials);
}

async function main() {
  await ensureDir(OUTPUT_DIR);
  assert(BASE_URL, 'Set WE3D_BASE_URL to a running staging app URL before running retention tests.');

  const email = randomEmail();
  const password = 'Planet123!';
  const displayName = 'WE3D E2E';
  const result = {
    ok: false,
    baseUrl: BASE_URL,
    displayName,
    authUid: '',
    roomCode: '',
    beforeReloadRoomsText: '',
    afterReloadRoomsText: '',
    afterResignInRoomsText: '',
    localRecovery: {},
    events: []
  };
  let currentStep = 'boot';

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 }
  });
  const page = await context.newPage();
  let cleanupAttempted = false;

  const seenEvents = new Set();
  function recordEvent(prefix, text) {
    const trimmed = String(text || '').slice(0, 500);
    const key = `${prefix}:${trimmed}`;
    if (seenEvents.has(key)) return;
    seenEvents.add(key);
    if (result.events.length < 40) {
      result.events.push(`[${prefix}] ${trimmed}`);
    }
  }

  page.on('console', (msg) => {
    const text = msg.text();
    if (/auth|firebase|multiplayer|permission|error|failed/i.test(text)) {
      recordEvent(`console:${msg.type()}`, text);
    }
  });
  page.on('pageerror', (err) => {
    recordEvent('pageerror', err.message);
  });

  try {
    currentStep = 'load_app';
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#appSignInBtn');
    await page.waitForFunction(() => !!globalThis.WORLD_EXPLORER_FIREBASE_ENV, null, { timeout: 30000 });
    result.firebaseEnvironment = await page.evaluate(() => globalThis.WORLD_EXPLORER_FIREBASE_ENV || '');
    assert(
      result.firebaseEnvironment === 'staging',
      `Retention tests are staging-only; this page reports Firebase environment "${result.firebaseEnvironment || 'unknown'}".`
    );
    await screenshot(page, '01-title.png');

    currentStep = 'sign_up';
    await page.click('#appSignInBtn');
    await page.click('#authModeSignUpBtn');
    await page.fill('#authDisplayNameInput', displayName);
    await page.fill('#authEmailInput', email);
    await page.fill('#authPasswordInput', password);
    await page.fill('#authConfirmPasswordInput', password);
    await page.click('#authEmailSubmitBtn');

    currentStep = 'wait_signed_in';
    await ensureSignedInUi(page);
    await page.waitForTimeout(2500);
    result.authUid = await page.evaluate(() => globalThis.__WE3D_AUTH_UID__ || '');
    result.authState = await page.evaluate(() => ({
      uid: globalThis.__WE3D_AUTH_UID__ || '',
      entitlements: globalThis.__WE3D_ENTITLEMENTS__ || null,
      accountButton: document.getElementById('appSignInBtn')?.textContent || '',
      authSummary: document.getElementById('authUserSummary')?.textContent || ''
    }));
    await screenshot(page, '02-signed-in.png');

    currentStep = 'create_room';
    await openMultiplayerTab(page);
    await page.fill('#mpTitleRoomNameInput', 'E2E Retention Room');
    await page.fill('#mpTitleLocationTagInput', 'Baltimore');
    await page.click('#mpTitleCreateBtn');
    let createVia = 'ui';
    try {
      await page.waitForFunction(() => {
        const status = document.getElementById('mpTitleStatus');
        const code = document.getElementById('mpTitleCodeInput');
        return (
          (!!status && /created|invite link copied/i.test(status.textContent || '')) ||
          (!!code && String(code.value || '').trim().length === 6)
        );
      }, { timeout: 12000 });
    } catch {
      createVia = 'direct-api-fallback';
      result.uiCreateFallbackTriggered = true;
      result.uiCreatePreFallback = await page.evaluate(() => ({
        titleStatus: document.getElementById('mpTitleStatus')?.textContent || '',
        roomCodeInput: document.getElementById('mpTitleCodeInput')?.value || '',
        ownedRoomsStatus: document.getElementById('mpOwnedRoomsStatus')?.textContent || '',
        ownedRoomsList: document.getElementById('mpOwnedRoomsList')?.textContent || ''
      }));
      const created = await page.evaluate(async () => {
        const mod = await import(`/app/js/multiplayer/rooms.js?t=${Date.now()}`);
        const room = await Promise.race([
          mod.createRoom({
            name: 'E2E Retention Room',
            visibility: 'private',
            maxPlayers: 8,
            world: {
              kind: 'earth',
              lat: 39.2904,
              lon: -76.6122,
              seed: 'latlon:39.29040,-76.61220'
            },
            locationName: 'Baltimore',
            locationTag: { label: 'Baltimore', city: 'Baltimore', kind: 'earth' }
          }),
          new Promise((_, reject) => {
            globalThis.setTimeout(() => reject(new Error('direct create timeout')), 45000);
          })
        ]);
        return room ? {
          code: room.code || '',
          name: room.name || '',
          visibility: room.visibility || '',
          ownerUid: room.ownerUid || ''
        } : null;
      });
      result.directCreateResult = created;
      if (created?.code) {
        await page.fill('#mpTitleCodeInput', created.code);
      }
    }

    result.roomCreateMethod = createVia;
    result.roomCode = (await page.inputValue('#mpTitleCodeInput')).trim() ||
      String(result.directCreateResult?.code || '').trim();
    result.beforeReloadRoomsText = await roomListText(page);
    await screenshot(page, '03-room-created.png');

    currentStep = 'reload_after_room_create';
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#appSignInBtn');
    await ensureSignedInUi(page);
    currentStep = 'verify_room_after_reload';
    await openMultiplayerTab(page);
    await page.waitForFunction(() => {
      const list = document.getElementById('mpOwnedRoomsList');
      const code = document.getElementById('mpTitleCodeInput')?.value || '';
      const text = list?.textContent || '';
      return !!list && (!!code || !/no saved rooms yet|sign in to/i.test(text));
    }, { timeout: 60000 });
    if (result.roomCode) {
      await page.waitForFunction((roomCode) => {
        const list = document.getElementById('mpOwnedRoomsList');
        const text = list?.textContent || '';
        return text.includes(roomCode);
      }, result.roomCode, { timeout: 60000 });
    }
    result.afterReloadRoomsText = await roomListText(page);
    await screenshot(page, '04-after-reload.png');

    currentStep = 'sign_out';
    await page.evaluate(async () => {
      const mod = await import(`/js/auth-ui.js?t=${Date.now()}`);
      await mod.signOutUser();
    });
    await page.waitForFunction(() => {
      const state = globalThis.__WE3D_ENTITLEMENTS__ || {};
      return state.isAuthenticated !== true;
    }, { timeout: 45000 });

    currentStep = 'sign_back_in';
    await page.evaluate(async ({ email, password }) => {
      const mod = await import(`/js/auth-ui.js?t=${Date.now()}`);
      await mod.signInWithEmailPassword(email, password);
    }, { email, password });
    await page.waitForFunction(() => {
      const state = globalThis.__WE3D_ENTITLEMENTS__ || {};
      return state.isAuthenticated === true;
    }, { timeout: 45000 });
    currentStep = 'verify_room_after_resignin';
    await openMultiplayerTab(page);
    await page.waitForFunction(() => {
      const list = document.getElementById('mpOwnedRoomsList');
      return !!list && !/sign in to load your rooms|no saved rooms yet/i.test(list.textContent || '');
    }, { timeout: 60000 });
    if (result.roomCode) {
      await page.waitForFunction((roomCode) => {
        const list = document.getElementById('mpOwnedRoomsList');
        const text = list?.textContent || '';
        return text.includes(roomCode);
      }, result.roomCode, { timeout: 60000 });
    }
    result.afterResignInRoomsText = await roomListText(page);
    await screenshot(page, '05-after-resignin.png');

    currentStep = 'seed_local_recovery';
    await page.addInitScript(() => {
      localStorage.setItem('worldExplorer3D.buildBlocks.v1', '{bad json');
      localStorage.setItem('worldExplorer3D.buildBlocks.backup.v1', JSON.stringify([
        {
          id: 'blk_e2e',
          locationKey: '39.29040,-76.61220',
          lat: 39.2904,
          lon: -76.6122,
          gx: 0,
          gy: 1,
          gz: 0,
          materialIndex: 0,
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ]));
      localStorage.setItem('worldExplorer3D.memories.v1', '{bad json');
      localStorage.setItem('worldExplorer3D.memories.backup.v1', JSON.stringify([
        {
          id: 'mem_e2e',
          type: 'pin',
          message: 'Hello',
          lat: 39.2904,
          lon: -76.6122,
          locationKey: '39.29040,-76.61220',
          locationLabel: 'Baltimore',
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ]));
    });

    currentStep = 'reload_for_local_recovery';
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#appSignInBtn');
    await waitForLocalPersistenceModules(page);
    currentStep = 'verify_local_recovery';
    result.localRecovery.buildPrimaryRestored = await page.evaluate(() => (
      (localStorage.getItem('worldExplorer3D.buildBlocks.v1') || '').includes('blk_e2e')
    ));
    result.localRecovery.memoryPrimaryRestored = await page.evaluate(() => (
      (localStorage.getItem('worldExplorer3D.memories.v1') || '').includes('mem_e2e')
    ));

    result.localRecovery.overlayDrafts = await page.evaluate(async () => {
      localStorage.setItem('world_explorer_overlay_local_drafts_v1', '{bad json');
      localStorage.setItem('world_explorer_overlay_local_drafts_backup_v1', JSON.stringify([
        {
          featureId: 'draft_e2e',
          featureClass: 'poi',
          geometryType: 'Point',
          geometry: { type: 'Point', coordinates: [0, 0] },
          tags: { name: 'Draft' },
          reviewState: 'draft',
          publicationState: 'unpublished',
          createdAtMs: 1,
          updatedAtMs: 2
        }
      ]));

      const mod = await import(`/app/js/editor/local-drafts.js?t=${Date.now()}`);
      const rows = mod.listLocalOverlayDrafts();
      return {
        count: rows.length,
        restored: (localStorage.getItem('world_explorer_overlay_local_drafts_v1') || '').includes('draft_e2e')
      };
    });

    result.localRecovery.activityLibrary = await page.evaluate(async () => {
      localStorage.setItem('worldExplorer3D.activityLibrary.v1', '{bad json');
      localStorage.setItem('worldExplorer3D.activityLibrary.backup.v1', JSON.stringify([
        {
          id: 'creator_e2e',
          templateId: 'walking_route',
          title: 'Draft Activity',
          anchors: [
            { id: 'a', typeId: 'start', label: 'Start', x: 0, y: 0, z: 0 },
            { id: 'b', typeId: 'finish', label: 'Finish', x: 5, y: 0, z: 5 }
          ],
          createdAt: 1,
          updatedAt: 2
        }
      ]));

      const mod = await import(`/app/js/activity-discovery/library.js?t=${Date.now()}`);
      const rows = mod.listStoredActivities();
      return {
        count: rows.length,
        restored: (localStorage.getItem('worldExplorer3D.activityLibrary.v1') || '').includes('creator_e2e')
      };
    });

    await screenshot(page, '06-after-local-recovery.png');
    assert(result.authUid, 'Staging sign-up did not produce an authenticated user.');
    assert(result.roomCode, 'Staging room creation did not produce a room code.');
    assert(result.roomCreateMethod === 'ui', 'The visible Create Room control did not complete the room creation flow.');
    assert(result.afterReloadRoomsText.includes(result.roomCode), 'Room did not survive a page reload.');
    assert(result.afterResignInRoomsText.includes(result.roomCode), 'Room did not survive sign-out and re-sign-in.');
    assert(result.localRecovery.buildPrimaryRestored, 'Build-block backup did not restore its primary record.');
    assert(result.localRecovery.memoryPrimaryRestored, 'Memory backup did not restore its primary record.');
    assert(result.localRecovery.overlayDrafts?.restored, 'Overlay draft backup did not restore its primary record.');
    assert(result.localRecovery.activityLibrary?.restored, 'Activity library backup did not restore its primary record.');
    currentStep = 'cleanup_staging_account';
    cleanupAttempted = true;
    result.cleanup = await cleanupStagingAccount(page, { email, password });
    assert(result.cleanup.accountDeleted, 'Synthetic staging account cleanup did not complete.');
    result.ok = true;
  } catch (error) {
    result.step = currentStep;
    result.error = error && error.message ? error.message : String(error);
    try {
      result.debug = await page.evaluate(() => ({
        accountButton: document.getElementById('appSignInBtn')?.textContent || '',
        authPanelStatus: document.getElementById('authPanelStatus')?.textContent || '',
        authSummary: document.getElementById('authUserSummary')?.textContent || '',
        titleStatus: document.getElementById('mpTitleStatus')?.textContent || '',
        ownedRoomsStatus: document.getElementById('mpOwnedRoomsStatus')?.textContent || '',
        ownedRoomsList: document.getElementById('mpOwnedRoomsList')?.textContent || '',
        roomCodeInput: document.getElementById('mpTitleCodeInput')?.value || '',
        entitlements: globalThis.__WE3D_ENTITLEMENTS__ || null,
        authUid: globalThis.__WE3D_AUTH_UID__ || '',
        href: globalThis.location?.href || ''
      }));
    } catch {
      // Best effort only.
    }
    try {
      await screenshot(page, 'error-state.png');
    } catch {
      // Best effort only.
    }
  } finally {
    if (!cleanupAttempted) {
      cleanupAttempted = true;
      try {
        result.cleanup = await cleanupStagingAccount(page, { email, password });
      } catch (cleanupError) {
        const rawMessage = cleanupError?.message || String(cleanupError);
        result.cleanup = {
          accountDeleted: false,
          error: rawMessage.replaceAll(email, '[redacted]').replaceAll(password, '[redacted]')
        };
      }
    }
    await browser.close();
  }

  console.log(redactReport(result, [email, password, result.authUid, result.roomCode]));
  if (!result.ok) process.exitCode = 1;
}

await main();
