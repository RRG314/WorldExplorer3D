import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

test('interrupting a fresh gate cannot leave an earlier success as current evidence', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'we3d-interrupted-evidence-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'config'));
  const output = path.join(root, 'output/release-evidence/current');
  mkdirSync(path.join(output, 'gates/candidate'), { recursive: true });
  const scopePath = path.join(output, 'execution-manifest.json');
  const gatePath = path.join(output, 'gates/candidate/probe.json');
  writeFileSync(scopePath, JSON.stringify({ ok: true, previous: true }));
  writeFileSync(gatePath, JSON.stringify({ ok: true, previous: true }));
  writeFileSync(path.join(root, '.gitignore'), 'output/\n');
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '5.3.0' }));
  // This child belongs solely to the disposable verifier. It exits immediately
  // after interrupting that verifier, leaving no browser/server or long timer.
  writeFileSync(path.join(root, 'config/system-release-gates.json'), JSON.stringify({
    schemaVersion: 1, targetVersion: '5.3.0', documents: {}, systems: [],
    gates: { probe: { scope: 'candidate', artifactRequired: false,
      command: [process.execPath, '-e', "process.kill(process.ppid, 'SIGTERM')"] } }
  }));
  const git = args => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git(['init', '-q']); git(['add', '.']);
  git(['-c', 'user.name=Verification Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'fixture']);
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL('../scripts/verification/system-release.mjs', import.meta.url)),
    '--run', '--fresh', '--scope=candidate'
  ], { cwd: root, encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.signal, 'SIGTERM', result.stderr);
  for (const file of [scopePath, gatePath]) {
    const evidence = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(evidence.ok, false, `${file} must no longer say the latest verification passed`);
    assert.equal(evidence.state, 'running');
    assert.equal(evidence.completedAt, null);
  }
});

test('continue-on-failure gathers later gate evidence without converting a failed run to success', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'we3d-continued-evidence-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'config'));
  writeFileSync(path.join(root, '.gitignore'), 'output/\n');
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '5.3.0' }));
  writeFileSync(path.join(root, 'config/system-release-gates.json'), JSON.stringify({
    schemaVersion: 1, targetVersion: '5.3.0', documents: {}, systems: [],
    gates: Object.fromEntries([['first', 3], ['second', 0]].map(([id, code]) => [id, {
      scope: 'candidate', artifactRequired: false, command: [process.execPath, '-e', `process.exit(${code})`]
    }]))
  }));
  const git = args => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git(['init', '-q']); git(['add', '.']);
  git(['-c', 'user.name=Verification Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'fixture']);
  const script = fileURLToPath(new URL('../scripts/verification/system-release.mjs', import.meta.url));
  const run = extra => spawnSync(process.execPath, [script, '--run', '--fresh', '--scope=candidate', '--gate=first,second', ...extra],
    { cwd: root, encoding: 'utf8', timeout: 10_000 });
  const stopped = run([]);
  assert.equal(stopped.status, 1, stopped.stderr);
  assert.doesNotMatch(stopped.stdout, /START second/);
  const continued = run(['--continue-on-failure']);
  assert.equal(continued.status, 1, continued.stderr);
  assert.match(continued.stdout, /PASS second/);
  const read = id => JSON.parse(readFileSync(path.join(root, `output/release-evidence/current/gates/candidate/${id}.json`), 'utf8'));
  assert.equal(read('first').ok, false);
  assert.equal(read('second').ok, true);
});
