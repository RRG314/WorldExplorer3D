import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');

async function listModels(directory = 'app/assets/models') {
  const absolute = path.join(root, directory);
  const entries = await readdir(absolute, { withFileTypes: true });
  const models = [];
  for (const entry of entries) {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) models.push(...await listModels(relative));
    else if (/\.glb$/i.test(entry.name)) models.push(relative);
  }
  return models.sort();
}

const [html, modelAttribution, rules, analytics, consent, telemetry, roomRuntime, catalogModule] = await Promise.all([
  read('app/index.html'),
  read('app/assets/models/ATTRIBUTION.md'),
  read('firestore.rules'),
  read('js/analytics.js'),
  read('js/analytics-consent.js'),
  import(path.join(root, 'app/js/platform/product-telemetry.js')),
  read('app/js/multiplayer/ui-room-runtime.js'),
  import(path.join(root, 'app/js/leaderboards/catalog.js'))
]);

const models = await listModels();
for (const model of models) {
  const escaped = path.basename(model).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(modelAttribution, new RegExp(escaped), `Missing attribution for ${model}`);
}

assert.match(html, /© OpenStreetMap contributors/);
assert.match(html, /class="globe-legal-strip"/);
assert.match(html, /id="dataLicensesDialog"/);
assert.match(html, /id="analyticsConsentBanner"/);
assert.match(html, /id="analyticsConsentManageBtn"/);
assert.match(consent, /return value !== CONSENT_DENIED/);
assert.match(analytics, /readAnalyticsConsent\(\) !== 'granted'/);
assert.match(analytics, /ad_personalization:\s*'denied'/);
assert.match(consent, /MutationObserver\(syncTitleVisibility\)/);
assert.match(consent, /if \(!titleVisible\) hide\(\)/);

const sanitized = telemetry.sanitizeProductParams({
  board_id: 'flower',
  latitude: 40.7128,
  room_code: 'SECRET',
  player_name: 'Someone',
  message: 'private',
  result_count: 3
});
assert.deepEqual(sanitized, { board_id: 'flower', result_count: 3 });

assert.match(roomRuntime, /ensureLeaderboardSubscription/);
assert.match(roomRuntime, /if \(!state\.authUser\)[\s\S]*ensureLeaderboardSubscription\(\)/);
for (const id of ['flower', 'painttown', 'fishing', 'explorer', 'deflock']) {
  assert.equal(catalogModule.LEADERBOARD_CATALOG[id]?.id, id, `Missing catalog entry ${id}`);
}
for (const validator of ['validFlowerLeaderboardEntry', 'validPaintTownLeaderboardEntry', 'validFishingLeaderboardEntry', 'validDeFlockLeaderboardEntry']) {
  assert.match(rules, new RegExp(validator), `Missing rules validator ${validator}`);
}

console.log(JSON.stringify({
  ok: true,
  boards: Object.keys(catalogModule.LEADERBOARD_CATALOG),
  attributedModels: models,
  privacy: 'standard first-party measurement with explicit limited mode; account identity requires explicit standard preference; location, room, and message fields rejected'
}, null, 2));
