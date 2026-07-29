#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = process.cwd();
const isWindows = process.platform === 'win32';
const executable = (base) => isWindows ? `${base}.cmd` : base;

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed` +
      (result.error ? `: ${result.error.message}` : ` with status ${result.status}`)
    );
  }
}

function resolvePython() {
  for (const candidate of isWindows ? ['py', 'python'] : ['python3', 'python']) {
    const args = candidate === 'py' ? ['-3', '--version'] : ['--version'];
    const result = spawnSync(candidate, args, { encoding: 'utf8' });
    if (!result.error && result.status === 0) {
      return {
        command: candidate,
        prefixArgs: candidate === 'py' ? ['-3'] : []
      };
    }
  }
  throw new Error('Python 3 is required to prepare the production test toolchain');
}

const packageLock = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package-lock.json'), 'utf8')
);
if (!packageLock.lockfileVersion) {
  throw new Error('package-lock.json is missing or invalid');
}

run(executable('npm'), ['ci']);

const venvDir = path.join(rootDir, '.datum-venv');
const python = resolvePython();
if (!fs.existsSync(venvDir)) {
  run(python.command, [
    ...python.prefixArgs,
    '-m',
    'venv',
    venvDir
  ]);
}

const venvPython = isWindows ?
  path.join(venvDir, 'Scripts', 'python.exe') :
  path.join(venvDir, 'bin', 'python');
run(venvPython, [
  '-m',
  'pip',
  'install',
  '--disable-pip-version-check',
  '--requirement',
  'scripts/ground-datum-requirements.txt'
]);
run(executable('npx'), ['playwright', 'install', 'chromium']);
run(executable('npm'), ['run', 'test:ground-datum']);
run(executable('npm'), ['run', 'test:production-readiness']);

console.log(JSON.stringify({
  ok: true,
  node: process.version,
  packageLockVersion: packageLock.lockfileVersion,
  datumPython: venvPython,
  playwrightBrowser: 'chromium',
  command: 'npm run test:production-setup'
}, null, 2));
