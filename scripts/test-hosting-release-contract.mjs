import assert from 'node:assert/strict';
import {
  assertProductionArtifact,
  assertPromotionContract,
  normalizePreviewUrl
} from './hosting-release-contract.mjs';

const commit = 'a'.repeat(40);
const contentHash = 'b'.repeat(64);
const hostingConfigHash = 'c'.repeat(64);
const releaseHash = 'd'.repeat(64);
const projectId = 'worldexplorer3d-d9b83';
const manifest = Object.freeze({
  buildId: `4.0.0+${commit.slice(0, 12)}.${releaseHash.slice(0, 16)}.production`,
  commit,
  contentHash,
  hostingConfigHash,
  releaseHash,
  firebaseEnvironment: 'production',
  firebaseProjectId: projectId,
  sourceDirty: false,
  version: '4.0.0'
});

assert.equal(
  normalizePreviewUrl('https://worldexplorer3d-d9b83--release-400-ab12.web.app/app/?x=1', 'release-400'),
  'https://worldexplorer3d-d9b83--release-400-ab12.web.app'
);
assert.equal(assertProductionArtifact(manifest, { expectedProjectId: projectId, currentCommit: commit }), true);
assert.deepEqual(
  assertPromotionContract({
    channelId: 'release-400',
    currentCommit: commit,
    localManifest: manifest,
    previewUrl: 'https://worldexplorer3d-d9b83--release-400-ab12.web.app',
    remoteManifest: { ...manifest },
    sourceProjectId: projectId,
    targetProjectId: projectId
  }),
  { normalizedPreviewUrl: 'https://worldexplorer3d-d9b83--release-400-ab12.web.app' }
);

assert.throws(
  () => assertProductionArtifact({ ...manifest, sourceDirty: true }, { expectedProjectId: projectId }),
  /clean working tree/
);
assert.throws(
  () => assertProductionArtifact({ ...manifest, firebaseEnvironment: 'staging' }, { expectedProjectId: projectId }),
  /production-configured/
);
assert.throws(
  () => normalizePreviewUrl('https://worldexplorer3d.io', 'release-400'),
  /preview-channel/
);
assert.throws(
  () => assertPromotionContract({
    channelId: 'release-400',
    currentCommit: commit,
    localManifest: manifest,
    previewUrl: 'https://worldexplorer3d-d9b83--release-400-ab12.web.app',
    remoteManifest: manifest,
    sourceProjectId: 'we3d-staging-20260712',
    targetProjectId: projectId
  }),
  /Cross-project/
);
assert.throws(
  () => assertPromotionContract({
    channelId: 'release-400',
    currentCommit: commit,
    localManifest: manifest,
    previewUrl: 'https://worldexplorer3d-d9b83--release-400-ab12.web.app',
    remoteManifest: { ...manifest, contentHash: 'e'.repeat(64) },
    sourceProjectId: projectId,
    targetProjectId: projectId
  }),
  /contentHash/
);

console.log(JSON.stringify({ ok: true, projectId, buildId: manifest.buildId }, null, 2));
