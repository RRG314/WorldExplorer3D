#!/usr/bin/env node

import {
  firstPositional,
  parseFlag,
  runFirebase
} from './firebase-hosting-utils.mjs';

const cwd = process.cwd();
const argv = process.argv.slice(2);
const channelId = firstPositional(argv) || process.env.FIREBASE_PREVIEW_CHANNEL_ID || '';
const sourceProjectId = parseFlag(argv, '--source-project', process.env.FIREBASE_SOURCE_PROJECT_ID || 'we3d-staging-20260712');
const targetProjectId = parseFlag(argv, '--target-project', process.env.FIREBASE_TARGET_PROJECT_ID || 'worldexplorer3d-d9b83');

if (!channelId) {
  console.error('Usage: npm run preview:promote -- <channel-id> [--source-project STAGING_PROJECT_ID] [--target-project PRODUCTION_PROJECT_ID]');
  process.exit(1);
}

try {
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
