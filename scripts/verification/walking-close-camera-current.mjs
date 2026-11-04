import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output =
    process.cwd() + '/output/verification/coherence-whole-ui-20261103/close-camera-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    rootDir: process.cwd(),
    careerId: 'companions',
    maximumDurationMs: 180000,
  }),
  { page, report } = qa;
try {
  report.scope =
    'Controlled actual walking camera, real Three renderer and existing licensed avatar. Thin-panel projection/visibility/ownership boundary only. Accepted actual field collision/contact is reused; no new field, room, driving or locomotion claim.';
  await page.goto('http://127.0.0.1:4192/tests/fixtures/walking-close-camera.html');
  await page.waitForFunction(() => window.walkCamera?.snapshot().licensedAvatar, null, {
    timeout: 30000,
  });
  const states = {};
  for (const id of ['legacy', 'first', 'third', 'gallery', 'leave']) {
    await page.locator('#' + id).click();
    states[id] = await page.evaluate(() => walkCamera.snapshot());
    await page.screenshot({ path: output + '/' + id + '.png' });
  }
  const amber = (p) => p[0] > 120 && p[1] > 70 && p[2] < 65;
  assert.equal(amber(states.legacy.pixel), false);
  assert.equal(amber(states.first.pixel), true);
  assert.equal(states.first.avatarVisible, false);
  assert.equal(states.first.near, 0.08);
  assert.equal(states.third.near, 0.5);
  assert.equal(states.third.avatarVisible, true);
  assert.equal(states.gallery.near, 0.08);
  assert.equal(states.gallery.avatarVisible, false);
  assert.equal(states.leave.near, 0.5);
  assert.equal(states.leave.mode, 'drive');
  report.states = states;
  report.checks.push(
    {
      name: 'Panel omitted by previous .5 near plane is visible at .08, with stale first-person/avatar visibility corrected by the original camera owner',
    },
    {
      name: 'Third view and display-reading restore/show/hide the original licensed avatar appropriately; leaving walking restores the borrowed near plane',
    }
  );
  await page.evaluate(() => walkCamera.dispose());
  await qa.succeed();
} catch (error) {
  await page.screenshot({ path: output + '/failed.png' }).catch(() => {});
  await fs.writeFile(
    output + '/failed.json',
    JSON.stringify({ error: error.stack }, null, 2) + '\n'
  );
  throw error;
} finally {
  await qa.close();
}
