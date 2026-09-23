import assert from 'node:assert/strict';
export function hostingPromotionSource({ projectId, channelId, channel, after, local, remote }) {
  assert.match(projectId, /^[a-z0-9-]+$/);
  assert.match(channelId, /^[a-z0-9-]+$/);
  assert.notEqual(channelId, 'live', 'Select a reviewed preview channel');
  const suffix = `sites/${projectId}/channels/${channelId}`;
  assert.ok(channel?.name === suffix || channel?.name?.endsWith(`/${suffix}`), 'Preview belongs to another site/channel');
  assert.equal(after?.release?.version?.name, channel.release?.version?.name, 'Preview changed during verification');
  const version = channel.release?.version?.name;
  assert.match(version || '', new RegExp(`^(?:projects/[^/]+/)?sites/${projectId}/versions/[a-zA-Z0-9_-]+$`));
  for (const file of ['build-manifest.json', 'asset-manifest.json']) {
    assert.equal(remote[file], local[file], `Preview ${file} differs from the approved local artifact`);
  }
  const build = JSON.parse(local['build-manifest.json']);
  assert.equal(build.firebaseEnvironment, 'production');
  assert.equal(build.firebaseProjectId, projectId, 'Cannot promote to another Firebase project');
  return `${projectId}@${version.split('/').pop()}`;
}
