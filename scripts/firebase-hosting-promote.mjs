#!/usr/bin/env node

import {
  firstPositional,
  parseFlag,
  runFirebase
} from './firebase-hosting-utils.mjs';

const cwd = process.cwd();
const argv = process.argv.slice(2);
const channelId = firstPositional(argv) || process.env.FIREBASE_PREVIEW_CHANNEL_ID || '';
const projectId = parseFlag(
  argv,
  '--project',
  process.env.FIREBASE_PROJECT_ID || 'worldexplorer3d-d9b83'
);

if (!channelId) {
  console.error('Usage: npm run preview:promote -- <channel-id> [--project PRODUCTION_PROJECT_ID]');
  process.exit(1);
}

try {
  console.log(
    `[preview:promote] Promoting Firebase Hosting channel "${channelId}" to "${projectId}:live" without rebuilding`
  );
  runFirebase([
    'hosting:clone',
    `${projectId}:${channelId}`,
    `${projectId}:live`,
    '--project',
    projectId
  ], cwd);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
