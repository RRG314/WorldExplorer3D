#!/usr/bin/env node

import {
  parseFlag,
  runFirebase
} from './firebase-hosting-utils.mjs';
import {
  assertChannelId,
  assertRollbackContract,
  normalizePreviewUrl
} from './hosting-release-contract.mjs';

const cwd = process.cwd();
const argv = process.argv.slice(2);
const channelId = parseFlag(argv, '--channel', process.env.FIREBASE_ROLLBACK_CHANNEL || 'rollback');
const targetProjectId = parseFlag(
  argv,
  '--target-project',
  process.env.FIREBASE_TARGET_PROJECT_ID || 'worldexplorer3d-d9b83'
);
const expectedBuildId = parseFlag(argv, '--expected-build-id', process.env.FIREBASE_ROLLBACK_BUILD_ID || '');
const rollbackUrl = parseFlag(
  argv,
  '--rollback-url',
  process.env.FIREBASE_ROLLBACK_URL || ''
);
const dryRun = argv.includes('--dry-run');

if (!expectedBuildId || !rollbackUrl) {
  console.error('Usage: npm run preview:rollback -- --expected-build-id BUILD_ID [--channel rollback] [--rollback-url URL] [--target-project PROJECT_ID] [--dry-run]');
  process.exit(1);
}

try {
  assertChannelId(channelId, 'Rollback');
  const normalizedRollbackUrl = normalizePreviewUrl(rollbackUrl, channelId);
  const response = await fetch(`${normalizedRollbackUrl}/build-manifest.json`, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    throw new Error(`Unable to read rollback build manifest (${response.status} ${response.statusText}).`);
  }
  const rollbackManifest = await response.json();
  assertRollbackContract({
    expectedBuildId,
    rollbackManifest,
    targetProjectId
  });
  console.log(JSON.stringify({
    ok: true,
    dryRun,
    buildId: rollbackManifest.buildId,
    channelId,
    projectId: targetProjectId,
    rollbackUrl: normalizedRollbackUrl
  }, null, 2));
  if (dryRun) process.exit(0);

  console.log(
    `[preview:rollback] Restoring verified build "${rollbackManifest.buildId}" from "${channelId}" to "${targetProjectId}:live"`
  );
  runFirebase([
    'hosting:clone',
    `${targetProjectId}:${channelId}`,
    `${targetProjectId}:live`
  ], cwd);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
