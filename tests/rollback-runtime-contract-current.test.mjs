import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {assertReviewedRollbackRuntime} from '../scripts/verification/rollback-runtime-contract.mjs';

test('rollback review checks exact runtime bytes and unchanged protocol roots in real commits', async t => {
  const root = mkdtempSync(path.join(tmpdir(), 'we3d-rollback-contract-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const git = (...args) => execFileSync('git', args, {cwd: root, stdio: ['ignore', 'pipe', 'pipe']}).toString().trim();
  const put = (file, text) => {mkdirSync(path.dirname(path.join(root, file)), {recursive: true}); writeFileSync(path.join(root, file), text);};
  const commit = () => {git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD');};
  const hash = text => createHash('sha256').update(text).digest('hex');
  git('init', '-q'); put('app/owner.js', 'old-owner'); put('functions/save.js', 'protocol');
  const before = commit();
  put('app/owner.js', 'reviewed-owner'); put('app/readiness.js', 'new-helper');
  const after = commit();
  const review = {schema: 'we3d-reviewed-rollback-runtime-v1', fallbackCommit: before, files: {
    'app/owner.js': {before: hash('old-owner'), after: hash('reviewed-owner'), beforeMode: '100644', afterMode: '100644'},
    'app/readiness.js': {before: null, after: hash('new-helper'), beforeMode: null, afterMode: '100644'}
  }};
  assert.deepEqual(await assertReviewedRollbackRuntime(root, before, after, review), ['app/owner.js', 'app/readiness.js']);
  const alteredBaseline = structuredClone(review); alteredBaseline.files['app/owner.js'].before = hash('something-else');
  await assert.rejects(() => assertReviewedRollbackRuntime(root, before, after, alteredBaseline), /before bytes/);
  await assert.rejects(() => assertReviewedRollbackRuntime(root, after, after, review), /Fallback/);
  put('app/owner.js', 'unreviewed-change-in-allowed-path');
  await assert.rejects(() => assertReviewedRollbackRuntime(root, before, commit(), review), /after bytes/);
  put('app/owner.js', 'reviewed-owner'); put('functions/save.js', 'changed-protocol');
  await assert.rejects(() => assertReviewedRollbackRuntime(root, before, commit(), review), /Unreviewed runtime/);
  put('functions/save.js', 'protocol'); rmSync(path.join(root, 'app/readiness.js'));
  await assert.rejects(() => assertReviewedRollbackRuntime(root, before, commit(), review), /Unreviewed runtime/);
  put('app/readiness.js', 'new-helper'); put('config/backend.json', 'changed-configuration');
  await assert.rejects(() => assertReviewedRollbackRuntime(root, before, commit(), review), /Unreviewed runtime/);
});

test('rollback review streams multi-megabyte assets and rejects a change beyond the old buffer limit', async t => {
  const root = mkdtempSync(path.join(tmpdir(), 'we3d-rollback-asset-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const git = (...args) => execFileSync('git', args, {cwd: root, stdio: ['ignore', 'pipe', 'pipe']}).toString().trim();
  const commit = () => { git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
  git('init', '-q'); mkdirSync(path.join(root, 'assets'));
  writeFileSync(path.join(root, 'README.md'), 'fixture');
  const before = commit(), file = 'assets/large.bin', bytes = Buffer.alloc(3 * 1024 * 1024, 0x5a);
  writeFileSync(path.join(root, file), bytes);
  const after = commit(), review = {schema: 'we3d-reviewed-rollback-runtime-v1', fallbackCommit: before, files: {
    [file]: {before: null, after: createHash('sha256').update(bytes).digest('hex'), beforeMode: null, afterMode: '100644'}
  }};
  assert.deepEqual(await assertReviewedRollbackRuntime(root, before, after, review), [file]);
  bytes[bytes.length - 1] ^= 1; writeFileSync(path.join(root, file), bytes);
  await assert.rejects(() => assertReviewedRollbackRuntime(root, before, commit(), review), /after bytes/);
});
