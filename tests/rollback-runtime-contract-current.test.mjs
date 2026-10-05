import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {assertReviewedRollbackRuntime} from '../scripts/verification/rollback-runtime-contract.mjs';

test('rollback review checks exact runtime bytes and unchanged protocol roots in real commits', t => {
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
  assert.deepEqual(assertReviewedRollbackRuntime(root, before, after, review), ['app/owner.js', 'app/readiness.js']);
  const alteredBaseline = structuredClone(review); alteredBaseline.files['app/owner.js'].before = hash('something-else');
  assert.throws(() => assertReviewedRollbackRuntime(root, before, after, alteredBaseline), /before bytes/);
  assert.throws(() => assertReviewedRollbackRuntime(root, after, after, review), /Fallback/);
  put('app/owner.js', 'unreviewed-change-in-allowed-path');
  assert.throws(() => assertReviewedRollbackRuntime(root, before, commit(), review), /after bytes/);
  put('app/owner.js', 'reviewed-owner'); put('functions/save.js', 'changed-protocol');
  assert.throws(() => assertReviewedRollbackRuntime(root, before, commit(), review), /Unreviewed runtime/);
  put('functions/save.js', 'protocol'); rmSync(path.join(root, 'app/readiness.js'));
  assert.throws(() => assertReviewedRollbackRuntime(root, before, commit(), review), /Unreviewed runtime/);
  put('app/readiness.js', 'new-helper'); put('config/backend.json', 'changed-configuration');
  assert.throws(() => assertReviewedRollbackRuntime(root, before, commit(), review), /Unreviewed runtime/);
});
