import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';
import {fingerprintClass} from './source-fingerprint.mjs';

// Use the release fingerprint's fail-closed classification, including unknown
// runtime/config inputs and symlinks. Do not restrict review to save filenames.
// Assets can exceed execFileSync's output buffer. Hash the complete Git blob
// incrementally so screenshot/model size cannot truncate a compatibility check
// or require another asset-sized allocation on the verification host.
function blobHash(root, revision, file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const child = spawn('git', ['show', `${revision}:${file}`], {cwd: root, stdio: ['ignore', 'pipe', 'ignore']});
    child.stdout.on('data', bytes => hash.update(bytes));
    child.stdout.once('error', error => { child.kill(); reject(error); });
    child.once('error', reject);
    child.once('close', code => {
      if (code !== 0) reject(new Error(`Cannot read reviewed Git blob: ${file}`));
      else resolve(hash.digest('hex'));
    });
  });
}

export async function assertReviewedRollbackRuntime(root, fallbackCommit, candidateCommit, contract) {
  const git = args => execFileSync('git', args, {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
  assert.equal(contract.schema, 'we3d-reviewed-rollback-runtime-v1');
  assert.equal(fallbackCommit, contract.fallbackCommit, 'Fallback is outside the reviewed compatibility pair');
  const entries = new Map();
  const entry = (revision, file) => {
    const key = `${revision}:${file}`;
    if (!entries.has(key)) entries.set(key, git(['ls-tree', revision, '--', file]).toString().split(' ')[0] || null);
    return entries.get(key);
  };
  const changed = git(['diff', '--no-renames', '--name-only', '-z', fallbackCommit, candidateCommit])
    .toString().split('\0').filter(file => file && [fallbackCommit, candidateCommit].some(revision =>
      ['runtime', 'environment'].includes(fingerprintClass(file, entry(revision, file) || '100644')))).sort();
  assert.deepEqual(changed, Object.keys(contract.files).sort(), 'Unreviewed runtime differences');
  for (const file of changed) {
    for (const [side, revision] of [['before', fallbackCommit], ['after', candidateCommit]]) {
      const mode = entry(revision, file);
      assert.equal(mode, contract.files[file][`${side}Mode`], `${side} mode was not reviewed: ${file}`);
      const actual = mode ? await blobHash(root, revision, file) : null;
      assert.equal(actual, contract.files[file][side], `${side} bytes were not reviewed: ${file}`);
    }
  }
  return changed;
}
