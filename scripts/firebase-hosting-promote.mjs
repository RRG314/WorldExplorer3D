#!/usr/bin/env node

import {
  firstPositional,
  parseFlag,
  runFirebase,
  runNodeScript,
  resolveFirebaseCli
} from './firebase-hosting-utils.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { hostingPromotionSource } from './lib/hosting-promotion-plan.mjs';

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
  // Direct invocation must enforce the same readiness and human acceptance as
  // the release workflow. Never clone an arbitrary preview straight to live.
  runNodeScript('scripts/release-finalize.mjs', [], cwd);
  const cli = resolveFirebaseCli(cwd);
  const readChannel = () => {
    const result = JSON.parse(execFileSync(cli.cmd, [...cli.prefixArgs, 'hosting:channel:list',
      '--project', projectId, '--site', projectId, '--json', '--non-interactive'], { cwd, encoding: 'utf8', timeout: 60000 }));
    return result.result?.channels?.find(channel => channel.name.split('/').pop() === channelId);
  };
  const channel = readChannel();
  if (!channel?.url) throw new Error('The requested preview channel has no URL');
  const url = new URL(channel.url);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.web.app') || url.username || url.password) {
    throw new Error('Unexpected Firebase preview URL');
  }
  const local = {}, remote = {};
  for (const file of ['build-manifest.json', 'asset-manifest.json']) {
    local[file] = fs.readFileSync(`dist/${file}`, 'utf8');
    const response = await fetch(new URL(file, `${url.origin}/`), {
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`Cannot verify preview ${file}: HTTP ${response.status}`);
    remote[file] = await response.text();
  }
  const source = hostingPromotionSource({ projectId, channelId, channel, after: readChannel(), local, remote });
  console.log(
    `[preview:promote] Promoting Firebase Hosting channel "${channelId}" to "${projectId}:live" without rebuilding`
  );
  runFirebase([
    'hosting:clone',
    source,
    `${projectId}:live`,
    '--project',
    projectId
  ], cwd);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
