import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const script = fileURLToPath(new URL('../scripts/release-finalize.mjs', import.meta.url));
function fixture(run) {
  const root = mkdtempSync(path.join(tmpdir(), 'we3d-finalization-test-'));
  const write = (name, data) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), data);
  };
  const manifest = { sourceDirty: false, buildId: 'unit-test', contentHash: 'unit-test', firebaseEnvironment: 'production', firebaseProjectId: 'test-production' };
  write('config/firebase.production.json', JSON.stringify({ projectId: 'test-production' }));
  // Synthetic isolated test data, never an approval file for a real artifact.
  const imagePath = 'output/release-evidence/current/synthetic.txt';
  write(imagePath, 'synthetic');
  write('approval.json', JSON.stringify({ approved: true, buildId: 'unit-test', contentHash: 'unit-test', reviewer: 'TEST FIXTURE ONLY', images: [{ path: imagePath, sha256: createHash('sha256').update('synthetic').digest('hex') }] }));
  write('scripts/verification/source.mjs', '');
  write('scripts/hosting-artifact.mjs', '');
  write('scripts/verification/world.mjs', "import fs from 'node:fs'; fs.writeFileSync('world-started', 'yes');");
  const execute = () => {
    write('dist/build-manifest.json', JSON.stringify(manifest));
    return spawnSync(process.execPath, [script], { cwd: root, env: { ...process.env, WE3D_RELEASE_APPROVAL_FILE: 'approval.json' }, encoding: 'utf8' });
  };
  try { run({ root, write, manifest, execute }); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

test('finalization rejects staging and a mismatched Firebase project before browser work', () => fixture(({ root, manifest, execute }) => {
  manifest.firebaseEnvironment = 'staging';
  let result = execute();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /production-configured artifact/);
  manifest.firebaseEnvironment = 'production';
  manifest.firebaseProjectId = 'other-project';
  result = execute();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /production-configured artifact/);
  assert.equal(existsSync(path.join(root, 'world-started')), false);
}));

for (const failing of ['release-scope', 'public-feature-claims']) test(`finalization enforces ${failing} readiness even with matching review metadata`, () => fixture(({ root, write, execute }) => {
  for (const name of ['release-scope', 'public-feature-claims']) write(`scripts/verification/${name}.mjs`,
    `import fs from 'node:fs'; fs.writeFileSync('${name}-args', JSON.stringify(process.argv.slice(2))); process.exit(${name === failing ? 1 : 0});`);
  const result = execute();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, new RegExp(`Finalization prerequisite failed: scripts/verification/${failing}`));
  assert.deepEqual(JSON.parse(readFileSync(path.join(root, `${failing}-args`), 'utf8')), ['--require-ready', '--promoted-production']);
  assert.equal(existsSync(path.join(root, 'world-started')), false);
}));
