import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (file) => fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const [accountHtml, accountCenter, adminHtml, adminJs, analyticsJs, tutorialJs, diagnosticsJs, rdtJs, inputJs, mainJs] = await Promise.all([
  read('account/index.html'),
  read('account/account-center.js'),
  read('account/admin.html'),
  read('js/admin-dashboard.js'),
  read('js/analytics.js'),
  read('app/js/tutorial/tutorial.js'),
  read('app/js/runtime-diagnostics.js'),
  read('app/js/rdt.js'),
  read('app/js/input.js'),
  read('app/js/main.js')
]);

const accountSections = [...accountHtml.matchAll(/data-account-view="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(accountSections, ['overview', 'profile', 'social', 'support', 'security']);
assert.match(accountHtml, /id="accountPanel" hidden/);
assert.match(accountHtml, /id="moderationPanelLink"[^>]+hidden/);
assert.equal((accountHtml.match(/href="\.\/admin\.html"/g) || []).length, 1, 'Account Center must expose one admin entry');
assert.match(accountCenter, /searchParams\.set\('section', next\)/);
assert.match(accountHtml, /Security & Privacy[\s\S]*id="signOutBtn"[\s\S]*id="deleteAccountBtn"/);

const adminViews = [...adminHtml.matchAll(/data-view="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(adminViews, ['overview', 'moderation', 'users', 'multiplayer', 'content', 'analytics', 'system', 'activity']);
assert.equal((adminHtml.match(/data-view-panel="system"/g) || []).length, 2, 'System may compose readiness and operations panels');
assert.match(adminHtml, /Access is verified on every server request/);
assert.match(adminJs, /diagnostics: 'system'/);
assert.match(adminJs, /operations: 'system'/);

assert.match(tutorialJs, /MOVE_TARGET_METERS = 12/);
assert.deepEqual([...tutorialJs.matchAll(/\b(MOVE|EXPLORE|DISCOVER): '([^']+)'/g)].map((match) => match[2]), ['move', 'explore', 'discover']);
assert.match(tutorialJs, /tutorialTelemetry\('tutorial_begin'\)/);
assert.match(tutorialJs, /tutorialTelemetry\('tutorial_complete'\)/);
assert.match(tutorialJs, /addEventListener\?\.\('we3d:discovery-telemetry'/);
assert.doesNotMatch(tutorialJs, /stage:\s*['"]moon|stage:\s*['"]space|stage:\s*['"]room/);
assert.match(analyticsJs, /'tutorial_begin'/);
assert.match(analyticsJs, /'tutorial_complete'/);
assert.match(analyticsJs, /'we3d_discovery_action'/);
assert.doesNotMatch(analyticsJs, /latitude\s*:|longitude\s*:|\blat\s*:|\blon\s*:/);

assert.match(diagnosticsJs, /networkWrites: false/);
assert.match(diagnosticsJs, /diagnosticsParams\.get\('diagnostics'\) === '1'/);
assert.match(inputJs, /if \(!appCtx\.developerDiagnosticsEnabled\) return;/);
assert.match(mainJs, /appCtx\.developerDiagnosticsEnabled === true/);
assert.match(rdtJs, /let rdtNoiseEnabled = false/);
assert.match(rdtJs, /RDT_NOISE_CELL_CACHE_LIMIT = 8192/);
assert.match(rdtJs, /if \(!nextEnabled\) clearRdtNoiseCaches\(\)/);

console.log(JSON.stringify({
  ok: true,
  accountSections,
  adminViews,
  tutorialJourney: ['move', 'explore', 'discover'],
  diagnostics: { shippingOverlayHotkeys: false, networkWrites: false, rdtNoiseDefault: false }
}, null, 2));
