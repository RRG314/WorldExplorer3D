#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  firstPositional,
  parseFlag,
  runFirebase,
  runNodeScript
} from './firebase-hosting-utils.mjs';
import { assertPromotionContract, normalizePreviewUrl } from './hosting-release-contract.mjs';

const cwd = process.cwd();
const argv = process.argv.slice(2);
const channelId = firstPositional(argv) || process.env.FIREBASE_PREVIEW_CHANNEL_ID || '';
const targetProjectId = parseFlag(argv, '--target-project', process.env.FIREBASE_TARGET_PROJECT_ID || 'worldexplorer3d-d9b83');
const sourceProjectId = parseFlag(argv, '--source-project', process.env.FIREBASE_SOURCE_PROJECT_ID || targetProjectId);
const previewUrl = parseFlag(argv, '--preview-url', process.env.FIREBASE_PREVIEW_URL || '');
const dryRun = argv.includes('--dry-run');

if (!channelId || !previewUrl) {
  console.error('Usage: npm run preview:promote -- <channel-id> --preview-url https://PROJECT--CHANNEL.web.app [--source-project PROJECT_ID] [--target-project PROJECT_ID] [--dry-run]');
  process.exit(1);
}

try {
  runNodeScript('scripts/hosting-artifact.mjs', ['verify'], cwd);
  const localManifest = JSON.parse(await fs.readFile(path.join(cwd, 'dist', 'build-manifest.json'), 'utf8'));
  const currentCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  const normalizedPreviewUrl = normalizePreviewUrl(previewUrl, channelId);
  const manifestUrl = `${normalizedPreviewUrl}/build-manifest.json`;
  const response = await fetch(manifestUrl, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    throw new Error(`Unable to read preview build manifest (${response.status} ${response.statusText}).`);
  }
  const remoteManifest = await response.json();
  const contract = assertPromotionContract({
    channelId,
    currentCommit,
    localManifest,
    previewUrl: normalizedPreviewUrl,
    remoteManifest,
    sourceProjectId,
    targetProjectId
  });
  console.log(JSON.stringify({
    ok: true,
    dryRun,
    buildId: localManifest.buildId,
    channelId,
    previewUrl: contract.normalizedPreviewUrl,
    projectId: targetProjectId
  }, null, 2));
  if (dryRun) process.exit(0);

  console.log(
    `[preview:promote] Promoting Firebase Hosting channel "${channelId}" from "${sourceProjectId}" to "${targetProjectId}:live"`
  );
  runFirebase([
    'hosting:clone',
    `${sourceProjectId}:${channelId}`,
    `${targetProjectId}:live`
  ], cwd);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
