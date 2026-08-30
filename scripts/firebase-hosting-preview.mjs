#!/usr/bin/env node

import {
  firstPositional,
  parseFlag,
  runFirebase,
  runChecked,
  runNodeScript
} from './firebase-hosting-utils.mjs';

const cwd = process.cwd();
const argv = process.argv.slice(2);
const channelId = firstPositional(argv) || process.env.FIREBASE_PREVIEW_CHANNEL_ID || '';
const projectId = parseFlag(argv, '--project', process.env.FIREBASE_PROJECT_ID || 'we3d-staging-20260712');
const expires = parseFlag(argv, '--expires', process.env.FIREBASE_PREVIEW_EXPIRES || '7d');
const configEnv = parseFlag(argv, '--config-env', process.env.WE3D_FIREBASE_ENV || (projectId === 'worldexplorer3d-d9b83' ? 'production' : 'staging'));
const skipChecks = argv.includes('--skip-checks');
const useExistingArtifact = argv.includes('--use-existing-artifact');

if (!channelId) {
  console.error(
    'Usage: npm run preview:deploy -- <channel-id> [--expires 7d] ' +
    '[--project PROJECT_ID] [--config-env production|staging] ' +
    '[--use-existing-artifact] [--skip-checks]'
  );
  process.exit(1);
}

try {
  if (!useExistingArtifact) {
    console.log(`[preview:deploy] Building immutable hosting artifact for Firebase environment "${configEnv}"`);
    runNodeScript('scripts/hosting-artifact.mjs', ['build', '--firebase-env', configEnv], cwd);
  } else {
    console.log('[preview:deploy] Reusing the existing immutable hosting artifact without rebuilding');
  }

  if (!skipChecks) {
    console.log('[preview:deploy] Verifying hosting artifact identity and source parity');
    runNodeScript('scripts/hosting-artifact.mjs', ['verify'], cwd);
    console.log('[preview:deploy] Running the current complete-world verification against the bundled artifact');
    runChecked(process.execPath, ['scripts/verification/world.mjs'], {
      cwd,
      env: { ...process.env, WE3D_VERIFY_ROOT: 'dist' }
    });
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
