import { generatedFirebaseFiles } from '../lib/firebase-artifact-config.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { currentArtifactIdentity, currentBaseline, sameArtifactIdentity } from './execution-evidence.mjs';

export const PROMOTION_RECEIPT = 'output/release-evidence/current/production-promotion.json';
export const ENVIRONMENT_ASSETS = Object.freeze([
  '__/firebase/init.js', '__/firebase/init.json', 'js/firebase-project-config.js'
]);
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Promotion changes backend configuration only. It does not manufacture new
// browser evidence or permit changed gameplay to borrow another build's pass.
export function validatePromotion({ receipt, baseline, productionIdentity, productionBuild,
  productionAssets, stagingConfig, productionConfig }) {
  assert.equal(receipt?.contract, 'world-explorer-production-promotion-v1');
  assert.equal(baseline.dirty, false, 'Promotion requires clean source');
  assert.equal(receipt.baseline?.headCommit, baseline.headCommit, 'Promotion source commit changed');
  assert.equal(receipt.baseline?.workspaceFingerprint, baseline.workspaceFingerprint, 'Promotion source changed');
  assert.ok(sameArtifactIdentity(receipt.productionIdentity, productionIdentity), 'Production artifact changed');
  assert.equal(hash(receipt.stagingBuildJson), receipt.stagingIdentity?.buildManifestSha256, 'Staging build receipt changed');
  assert.equal(hash(receipt.stagingAssetsJson), receipt.stagingIdentity?.assetManifestSha256, 'Staging asset receipt changed');
  const stagingBuild = JSON.parse(receipt.stagingBuildJson);
  const stagingAssets = JSON.parse(receipt.stagingAssetsJson);
  assert.equal(stagingBuild.firebaseEnvironment, 'staging');
  assert.equal(stagingBuild.firebaseProjectId, stagingConfig.projectId);
  assert.equal(productionBuild.firebaseEnvironment, 'production');
  assert.equal(productionBuild.firebaseProjectId, productionConfig.projectId);
  assert.notEqual(stagingConfig.projectId, productionConfig.projectId);
  assert.equal(stagingBuild.sourceDirty, false);
  assert.equal(productionBuild.sourceDirty, false);
  assert.equal(stagingBuild.commit, baseline.headCommit);
  assert.equal(productionBuild.commit, baseline.headCommit);
  for (const key of ['version', 'sourceReleaseManifestSha256', 'dependencyLockSha256']) {
    assert.ok(stagingBuild[key], `Missing ${key}`);
    assert.equal(productionBuild[key], stagingBuild[key], `${key} changed during promotion`);
  }
  for (const [environment, config, assets] of [['staging', stagingConfig, stagingAssets], ['production', productionConfig, productionAssets]]) {
    for (const [file, contents] of Object.entries(generatedFirebaseFiles(environment, config))) {
      assert.equal(assets.files?.[file], hash(contents), `Wrong ${environment} configuration asset: ${file}`);
    }
  }
  const names = Object.keys(stagingAssets.files || {}).sort();
  assert.ok(names.length > ENVIRONMENT_ASSETS.length);
  assert.deepEqual(Object.keys(productionAssets.files || {}).sort(), names, 'Artifact file set changed');
  for (const file of ENVIRONMENT_ASSETS) assert.ok(names.includes(file), `Missing environment asset ${file}`);
  for (const file of names) {
    if (!ENVIRONMENT_ASSETS.includes(file)) {
      assert.equal(productionAssets.files[file], stagingAssets.files[file], `Untested asset changed: ${file}`);
    }
  }
  return receipt.stagingIdentity;
}

export function promotedEvidenceIdentity(root = process.cwd()) {
  const read = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
  const receipt = read(PROMOTION_RECEIPT);
  const productionAssets = read('dist/asset-manifest.json');
  for (const [file, expected] of Object.entries(productionAssets.files || {})) {
    assert.ok(!path.isAbsolute(file) && !file.split('/').includes('..'), 'Invalid artifact path');
    assert.equal(hash(readFileSync(path.join(root, 'dist', file))), expected, `Production bytes changed: ${file}`);
  }
  return validatePromotion({ receipt, baseline: currentBaseline(root),
    productionIdentity: currentArtifactIdentity(root, 'dist'),
    productionBuild: read('dist/build-manifest.json'), productionAssets,
    stagingConfig: read('config/firebase.staging.json'), productionConfig: read('config/firebase.production.json') });
}
