#!/usr/bin/env node

import {
  firstPositional,
  parseFlag,
  readDefaultFirebaseProjectId,
  runFirebase,
  runNodeScript
} from './firebase-hosting-utils.mjs';

const cwd = process.cwd();
const argv = process.argv.slice(2);
const channelId = firstPositional(argv) || process.env.FIREBASE_PREVIEW_CHANNEL_ID || '';
const projectId = parseFlag(argv, '--project', process.env.FIREBASE_PROJECT_ID || 'we3d-staging-20260712');
const expires = parseFlag(argv, '--expires', process.env.FIREBASE_PREVIEW_EXPIRES || '7d');
const configEnv = parseFlag(argv, '--config-env', process.env.WE3D_FIREBASE_ENV || (projectId === 'worldexplorer3d-d9b83' ? 'production' : 'staging'));
const skipChecks = argv.includes('--skip-checks');

if (!channelId) {
  console.error('Usage: npm run preview:deploy -- <channel-id> [--expires 7d] [--project PROJECT_ID] [--config-env staging] [--skip-checks]');
  process.exit(1);
}

try {
  console.log(`[preview:deploy] Applying Firebase config environment "${configEnv}"`);
  runNodeScript('scripts/apply-firebase-config.mjs', [configEnv], cwd);

  if (!skipChecks) {
    console.log(`[preview:deploy] Syncing canonical app files into public/`);
    runNodeScript('scripts/sync-public-app.mjs', [], cwd);
    console.log(`[preview:deploy] Verifying mirror parity`);
    runNodeScript('scripts/verify-mirror.mjs', [], cwd);
  }

  console.log(`[preview:deploy] Deploying Firebase Hosting preview channel "${channelId}" for project "${projectId}"`);
  runFirebase([
    'hosting:channel:deploy',
    channelId,
    '--project',
    projectId,
    '--expires',
    expires
  ], cwd);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
