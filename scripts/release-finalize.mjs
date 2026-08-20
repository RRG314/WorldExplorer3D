import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const approvalPath = String(process.env.WE3D_RELEASE_APPROVAL_FILE || '').trim();
if (!approvalPath) {
  throw new Error('WE3D_RELEASE_APPROVAL_FILE is required; production cannot be finalized without the user-reviewed current evidence manifest.');
}

function run(script, args = [], environment = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env: { ...process.env, ...environment },
    stdio: 'inherit'
  });
  if (result.status !== 0) throw new Error(`Finalization prerequisite failed: ${script}`);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

run('scripts/verification/source.mjs');
run('scripts/hosting-artifact.mjs', ['verify']);
run('scripts/verification/world.mjs', [], { WE3D_VERIFY_ROOT: 'dist' });

const build = JSON.parse(await fs.readFile(path.join(root, 'dist', 'build-manifest.json'), 'utf8'));
const approval = JSON.parse(await fs.readFile(path.resolve(root, approvalPath), 'utf8'));
if (build.sourceDirty !== false) throw new Error('Finalization requires an artifact built from clean source.');
if (approval.approved !== true) throw new Error('The current evidence manifest is not approved.');
if (String(approval.buildId || '') !== String(build.buildId || '')) throw new Error('Approval buildId does not match the current artifact.');
if (String(approval.contentHash || '') !== String(build.contentHash || '')) throw new Error('Approval contentHash does not match the current artifact.');
if (!String(approval.reviewer || '').trim()) throw new Error('Approval must identify the human reviewer.');
if (!Array.isArray(approval.images) || approval.images.length === 0) throw new Error('Approval contains no reviewed complete-world images.');

for (const image of approval.images) {
  const relative = String(image.path || '');
  if (!relative.startsWith('output/release-evidence/current/')) throw new Error(`Evidence is outside the current release directory: ${relative}`);
  const bytes = await fs.readFile(path.join(root, relative));
  if (sha256(bytes) !== String(image.sha256 || '')) throw new Error(`Evidence hash mismatch: ${relative}`);
}

console.log(JSON.stringify({
  ok: true,
  buildId: build.buildId,
  contentHash: build.contentHash,
  reviewer: approval.reviewer,
  reviewedImages: approval.images.length,
  next: 'Promote the already-verified preview channel; do not rebuild.'
}, null, 2));
