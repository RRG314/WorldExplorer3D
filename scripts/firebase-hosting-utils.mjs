#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const FIREBASE_BIN = process.platform === 'win32' ? 'firebase.cmd' : 'firebase';
const NPX_BIN = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function readDefaultFirebaseProjectId(cwd = process.cwd()) {
  const rcPath = path.join(cwd, '.firebaserc');
  const raw = fs.readFileSync(rcPath, 'utf8');
  const parsed = JSON.parse(raw);
  const projectId = String(parsed?.projects?.default || '').trim();
  if (!projectId) {
    throw new Error(`No default Firebase project found in ${rcPath}`);
  }
  return projectId;
}

export function resolveFirebaseCli(cwd = process.cwd()) {
  const localBin = path.join(
    cwd,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'firebase.cmd' : 'firebase'
  );
  if (fileExists(localBin)) {
    return { cmd: localBin, prefixArgs: [] };
  }
  return { cmd: NPX_BIN, prefixArgs: ['--yes', 'firebase-tools'] };
}

export function runChecked(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env
  });
  if (res.error) {
    throw res.error;
  }
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with exit code ${res.status || 1}`);
  }
}

export function runNodeScript(scriptPath, extraArgs = [], cwd = process.cwd()) {
  runChecked(process.execPath, [scriptPath, ...extraArgs], { cwd });
}

export function runFirebase(firebaseArgs, cwd = process.cwd()) {
  const cli = resolveFirebaseCli(cwd);
  runChecked(cli.cmd, [...cli.prefixArgs, ...firebaseArgs], { cwd });
}

export function parseFlag(argv, name, fallback = null) {
  const exact = argv.find((arg) => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const idx = argv.indexOf(name);
  if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
  return fallback;
}

export function firstPositional(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('-')) return arg;
    if ((arg === '--project' || arg === '--expires') && i + 1 < argv.length) {
      i += 1;
    }
  }
  return null;
}

export { FIREBASE_BIN, NPX_BIN };
