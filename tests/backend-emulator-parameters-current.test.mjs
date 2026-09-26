import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareBackendEmulatorParameters } from '../scripts/verification/backend-emulator-parameters.mjs';
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'we3d-emulator-'));
  mkdirSync(path.join(root, 'functions'));
  writeFileSync(path.join(root, 'functions/index.js'), "defineString('WE3D_STRIPE_SECRET'); defineString('WE3D_EMAIL_FROM'); defineString('WE3D_STRIPE_PRICE_PRO'); defineString('WE3D_STRIPE_PRICE_SUPPORTER');");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, file: path.join(root, 'functions/.env.local') };
}
test('emulators start without live service parameters and remove only their generated file', t => {
  const { root, file } = fixture(t); const cleanup = prepareBackendEmulatorParameters(root);
  assert.match(readFileSync(file, 'utf8'), /WE3D_STRIPE_SECRET=local-emulator-unused/);
  assert.match(readFileSync(file, 'utf8'), /WE3D_STRIPE_PRICE_PRO=price_emulator_pro\n/);
  assert.match(readFileSync(file, 'utf8'), /WE3D_STRIPE_PRICE_SUPPORTER=price_emulator_supporter\n/);
  cleanup(); assert.equal(existsSync(file), false); cleanup();
});
test('existing or subsequently edited configuration is preserved', t => {
  const { root, file } = fixture(t);
  writeFileSync(file, 'owner configuration'); prepareBackendEmulatorParameters(root)();
  assert.equal(readFileSync(file, 'utf8'), 'owner configuration');
  rmSync(file); const cleanup = prepareBackendEmulatorParameters(root);
  writeFileSync(file, 'changed by owner'); cleanup();
  assert.equal(readFileSync(file, 'utf8'), 'changed by owner');
});
