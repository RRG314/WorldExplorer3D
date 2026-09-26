import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { currentBaseline, currentArtifactIdentity } from './verification/execution-evidence.mjs';
import { PROMOTION_RECEIPT, promotedEvidenceIdentity } from './verification/production-promotion.mjs';

function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit',
    env: { ...process.env, WE3D_VERIFY_ROOT: 'dist' } });
  assert.equal(result.status, 0, `Production preparation failed: ${script}`);
}
const baseline = currentBaseline();
assert.equal(baseline.dirty, false, 'Production preparation requires clean source');
const stagingBuildJson = fs.readFileSync('dist/build-manifest.json', 'utf8');
assert.equal(JSON.parse(stagingBuildJson).firebaseEnvironment, 'staging', 'Verify the staging-configured package first');
run('scripts/hosting-artifact.mjs', ['verify']);
run('scripts/verification/release-scope.mjs', ['--require-ready']);
run('scripts/verification/public-feature-claims.mjs', ['--require-ready']);
const stagingAssetsJson = fs.readFileSync('dist/asset-manifest.json', 'utf8');
const stagingIdentity = currentArtifactIdentity(process.cwd(), 'dist');
// Retain the tested manifests/evidence, not another full project or world copy.
fs.rmSync(PROMOTION_RECEIPT, { force: true });
run('scripts/hosting-artifact.mjs', ['build', '--firebase-env', 'production']);
const receipt = { contract: 'world-explorer-production-promotion-v1', baseline,
  stagingIdentity, stagingBuildJson, stagingAssetsJson, productionIdentity: currentArtifactIdentity(process.cwd(), 'dist'),
  createdAt: new Date().toISOString(), evidenceScope: 'Staging-tested product assets with separately verified production configuration; no production browser journey claimed' };
fs.writeFileSync(PROMOTION_RECEIPT, JSON.stringify(receipt, null, 2) + '\n');
try { promotedEvidenceIdentity(); }
catch (error) { fs.rmSync(PROMOTION_RECEIPT, { force: true }); throw error; }
console.log('[production] Configuration-only artifact prepared. Human acceptance and deployment are separate.');
