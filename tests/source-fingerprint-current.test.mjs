import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { sourceFingerprint, fingerprintClass, sameAcceptanceSource } from '../scripts/verification/source-fingerprint.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'we3d-source-fingerprint-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = args => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  const write = (file, content) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), content); };
  const commit = () => { git(['add', '.']); git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'fixture']); };
  write('.gitignore', 'output/\ndist/\nprogress.md\n');
  for (const file of ['app/game.js', 'app/assets/README.md', 'tests/game.test.mjs', 'config/game.json', 'docs/audit.md', 'README.md', 'unknown.input']) write(file, 'first');
  git(['init', '-q']); commit();
  return { root, write, git, commit, read: () => sourceFingerprint(root) };
}

test('documentation alone changes its own fingerprint; commit IDs do not invalidate unchanged game/test/environment inputs', t => {
  const f = fixture(t), first = f.read();
  f.write('docs/audit.md', 'verified observations'); f.write('NEW-NOTES.md', 'new note');
  const dirty = f.read();
  assert.equal(sameAcceptanceSource(first, dirty), true);
  assert.notEqual(dirty.fingerprints.documentation, first.fingerprints.documentation);
  f.commit(); const committed = f.read();
  assert.notEqual(first.headCommit, committed.headCommit);
  assert.equal(sameAcceptanceSource(first, committed), true);
  assert.equal(committed.dirty, false);
  f.write('output/report.json', 'evidence'); f.write('dist/artifact.js', 'artifact'); f.write('progress.md', 'working note');
  assert.equal(f.read().workspaceFingerprint, committed.workspaceFingerprint);
});

test('each accepted input class fails closed for additions, edits, staging, deletes, executable modes and links', t => {
  const f = fixture(t);
  for (const [file, expected] of [['app/game.js', 'runtime'], ['app/assets/README.md', 'runtime'],
    ['tests/game.test.mjs', 'tests'], ['config/game.json', 'environment'], ['unknown.input', 'runtime']]) {
    const before = f.read(); f.write(file, 'changed'); const unstaged = f.read();
    assert.equal(sameAcceptanceSource(before, unstaged), false, file);
    assert.notEqual(before.fingerprints[expected], unstaged.fingerprints[expected]);
    f.git(['add', file]); assert.equal(f.read().acceptanceFingerprint, unstaged.acceptanceFingerprint, 'staging does not change bytes');
    f.write(file, 'first'); assert.equal(f.read().acceptanceFingerprint, before.acceptanceFingerprint, 'worktree wins over staged content');
    f.git(['add', file]);
    rmSync(path.join(f.root, file)); assert.equal(sameAcceptanceSource(before, f.read()), false, 'deleted input');
    f.write(file, 'first');
  }
  const before = f.read(); f.write('future-plugin/data.bin', 'new runtime input');
  assert.equal(sameAcceptanceSource(before, f.read()), false);
  rmSync(path.join(f.root, 'future-plugin'), { recursive: true });
  f.git(['config', 'core.filemode', 'false']); chmodSync(path.join(f.root, 'app/game.js'), 0o755);
  assert.equal(sameAcceptanceSource(before, f.read()), false, 'executable bit even when Git ignores it');
  chmodSync(path.join(f.root, 'app/game.js'), 0o644);
  symlinkSync('../app/game.js', path.join(f.root, 'docs/link.md'));
  assert.equal(fingerprintClass('docs/link.md', '120000'), 'runtime');
  assert.equal(sameAcceptanceSource(before, f.read()), false);
  rmSync(path.join(f.root, 'docs/link.md'));
  f.git(['update-index', '--assume-unchanged', 'app/game.js']);
  assert.throws(f.read, /hide release inputs/);
});

test('execution environment identity changes with routing without printing environment or credential values', t => {
  const f = fixture(t), first = f.read(), old = process.env.GCLOUD_PROJECT;
  t.after(() => { if (old === undefined) delete process.env.GCLOUD_PROJECT; else process.env.GCLOUD_PROJECT = old; });
  process.env.GCLOUD_PROJECT = 'disposable-private-fixture';
  const changed = f.read();
  assert.notEqual(first.executionEnvironmentFingerprint, changed.executionEnvironmentFingerprint);
  assert.doesNotMatch(JSON.stringify(changed), /disposable-private-fixture/);
  assert.equal(sameAcceptanceSource(first, changed), true, 'executor context is independently checked by gate reuse');
});

test('Git ignores cannot hide bytes that the Hosting builder actually ships', t => {
  const f = fixture(t);
  f.write('.gitignore', 'output/\ndist/\nprogress.md\napp/assets/local.bin\n'); f.commit();
  const before = f.read(); f.write('app/assets/local.bin', 'ignored but shipped');
  const added = f.read();
  assert.equal(sameAcceptanceSource(before, added), false);
  assert.equal(added.untrackedShippedCount, 1);
  assert.equal(added.dirty, true);
  f.write('app/assets/local.bin', 'changed ignored bytes');
  assert.equal(sameAcceptanceSource(added, f.read()), false);
});
