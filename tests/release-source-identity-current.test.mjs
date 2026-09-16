import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readReleaseSourceIdentity, assertReleaseSourceIdentity } from '../scripts/lib/release-source-identity.mjs';

function fixture(t, { committed = true } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'we3d-source-identity-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init');
  git('config', 'user.name', 'Release identity test');
  git('config', 'user.email', 'release-test@example.invalid');
  writeFileSync(path.join(root, '.gitignore'), 'dist/\n');
  writeFileSync(path.join(root, 'source.txt'), 'original\n');
  if (committed) {
    git('add', '.');
    git('-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture');
  }
  return { root, git };
}

test('missing Git metadata and an unborn repository cannot be reported clean', (t) => {
  const { root } = fixture(t, { committed: false });
  assert.throws(() => readReleaseSourceIdentity(root), /Cannot establish/);
  rmSync(path.join(root, '.git'), { recursive: true });
  assert.throws(() => readReleaseSourceIdentity(root), /Cannot establish/);
});

test('identity follows real committed, modified, staged and untracked source state', (t) => {
  const { root, git } = fixture(t);
  const clean = readReleaseSourceIdentity(root);
  assert.equal(clean.commit, git('rev-parse', 'HEAD'));
  assert.equal(clean.sourceDirty, false);
  mkdirSync(path.join(root, 'dist'));
  writeFileSync(path.join(root, 'dist/generated.txt'), 'artifact');
  assert.deepEqual(readReleaseSourceIdentity(root), clean);
  writeFileSync(path.join(root, 'source.txt'), 'modified\n');
  assert.equal(readReleaseSourceIdentity(root).sourceDirty, true);
  git('add', 'source.txt');
  assert.equal(readReleaseSourceIdentity(root).sourceDirty, true);
  git('-c', 'commit.gpgsign=false', 'commit', '-m', 'change');
  assert.equal(readReleaseSourceIdentity(root).sourceDirty, false);
  writeFileSync(path.join(root, 'new.txt'), 'untracked');
  assert.equal(readReleaseSourceIdentity(root).sourceDirty, true);
});

test('a source copy inside another repository cannot borrow its parent identity', (t) => {
  const { root } = fixture(t);
  const child = path.join(root, 'copy');
  mkdirSync(child);
  assert.throws(() => readReleaseSourceIdentity(child), /Cannot establish/);
});

test('verification rejects falsely clean, missing or altered source identity', (t) => {
  const { root } = fixture(t);
  const source = readReleaseSourceIdentity(root);
  const manifest = { ...source, buildTimestamp: source.commitTime };
  assert.doesNotThrow(() => assertReleaseSourceIdentity(manifest, source));
  for (const invalid of [
    { ...manifest, commit: 'unknown' },
    { ...manifest, sourceDirty: undefined },
    { ...manifest, commitTime: '2020-01-01T00:00:00Z' },
    { ...manifest, buildTimestamp: 'unknown' }
  ]) assert.throws(() => assertReleaseSourceIdentity(invalid, source), /does not match/);
  writeFileSync(path.join(root, 'source.txt'), 'dirty\n');
  assert.throws(() => assertReleaseSourceIdentity(manifest, readReleaseSourceIdentity(root)), /does not match/);
});
