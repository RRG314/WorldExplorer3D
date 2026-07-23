const FIREBASE_PREVIEW_HOST_SUFFIX = '.web.app';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertProductionArtifact(manifest, options = {}) {
  const expectedProjectId = String(options.expectedProjectId || '').trim();
  const currentCommit = String(options.currentCommit || '').trim();
  assert(manifest && typeof manifest === 'object', 'Build manifest is missing or invalid.');
  assert(manifest.firebaseEnvironment === 'production', 'Production promotion requires a production-configured artifact.');
  assert(manifest.sourceDirty === false, 'Production promotion requires an artifact built from a clean working tree.');
  if (expectedProjectId) {
    assert(
      manifest.firebaseProjectId === expectedProjectId,
      `Artifact Firebase project "${manifest.firebaseProjectId || 'unknown'}" does not match target "${expectedProjectId}".`
    );
  }
  if (currentCommit) {
    assert(
      manifest.commit === currentCommit,
      `Artifact commit "${manifest.commit || 'unknown'}" does not match current commit "${currentCommit}".`
    );
  }
  assert(typeof manifest.buildId === 'string' && manifest.buildId.length > 0, 'Build manifest has no buildId.');
  assert(typeof manifest.contentHash === 'string' && manifest.contentHash.length === 64, 'Build manifest has no valid content hash.');
  assert(typeof manifest.hostingConfigHash === 'string' && manifest.hostingConfigHash.length === 64, 'Build manifest has no valid Hosting configuration hash.');
  assert(typeof manifest.releaseHash === 'string' && manifest.releaseHash.length === 64, 'Build manifest has no valid release hash.');
  return true;
}

function normalizePreviewUrl(value, channelId) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('A valid --preview-url is required for promotion.');
  }
  assert(url.protocol === 'https:', 'Promotion preview URL must use HTTPS.');
  assert(!url.username && !url.password, 'Promotion preview URL must not contain credentials.');
  const hostname = url.hostname.toLowerCase();
  const normalizedChannel = String(channelId || '').trim().toLowerCase();
  assert(hostname.endsWith(FIREBASE_PREVIEW_HOST_SUFFIX), 'Promotion source must be a Firebase preview-channel web.app URL.');
  assert(hostname.includes('--'), 'Promotion source must be a preview channel, not a live Hosting URL.');
  assert(
    normalizedChannel && hostname.includes(normalizedChannel),
    `Preview URL hostname does not identify channel "${channelId}".`
  );
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function assertMatchingArtifacts(localManifest, remoteManifest) {
  for (const field of ['buildId', 'commit', 'contentHash', 'hostingConfigHash', 'releaseHash', 'firebaseEnvironment', 'firebaseProjectId', 'version']) {
    assert(
      localManifest?.[field] === remoteManifest?.[field],
      `Preview artifact ${field} does not match the verified local artifact.`
    );
  }
  return true;
}

function assertPromotionContract(options = {}) {
  const {
    channelId,
    currentCommit,
    localManifest,
    previewUrl,
    remoteManifest,
    sourceProjectId,
    targetProjectId
  } = options;
  assert(channelId, 'A Firebase preview channel id is required.');
  assert(sourceProjectId === targetProjectId, 'Cross-project Hosting promotion is forbidden; preview the production-configured artifact in the production project.');
  const normalizedPreviewUrl = normalizePreviewUrl(previewUrl, channelId);
  assertProductionArtifact(localManifest, { expectedProjectId: targetProjectId, currentCommit });
  assertProductionArtifact(remoteManifest, { expectedProjectId: targetProjectId, currentCommit });
  assertMatchingArtifacts(localManifest, remoteManifest);
  return { normalizedPreviewUrl };
}

export {
  assertMatchingArtifacts,
  assertProductionArtifact,
  assertPromotionContract,
  normalizePreviewUrl
};
