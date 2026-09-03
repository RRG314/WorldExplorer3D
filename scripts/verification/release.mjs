import { spawnSync } from 'node:child_process';

const steps = [
  {
    name: 'Current release scope and public claims',
    command: [process.execPath, 'scripts/verification/release-scope.mjs', '--require-ready']
  },
  {
    name: 'Firebase Functions syntax',
    command: [process.execPath, '--check', 'functions/index.js']
  },
  {
    name: 'Root dependency vulnerability audit',
    command: ['npm', 'audit', '--audit-level=low']
  },
  {
    name: 'Production Functions dependency vulnerability audit',
    command: ['npm', 'audit', '--omit=dev', '--audit-level=low'],
    cwd: 'functions'
  },
  {
    name: 'Build the production hosting artifact',
    command: [process.execPath, 'scripts/hosting-artifact.mjs', 'build', '--firebase-env', 'production']
  },
  {
    name: 'Run the complete candidate system matrix against the artifact',
    command: [process.execPath, 'scripts/verification/system-release.mjs', '--run', '--scope=candidate'],
    environment: { WE3D_VERIFY_ROOT: 'dist' }
  },
  {
    name: 'Run the complete backend authority matrix',
    command: ['npm', 'run', 'verify:backend-release'],
    environment: { WE3D_VERIFY_ROOT: 'dist' }
  }
];

for (const step of steps) {
  console.log(`\n[release] ${step.name}`);
  const result = spawnSync(step.command[0], step.command.slice(1), {
    cwd: step.cwd ? `${process.cwd()}/${step.cwd}` : process.cwd(),
    env: { ...process.env, ...(step.environment || {}) },
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(`Release verification stopped at: ${step.name}`);
  }
}

console.log('\n[release] Automated release boundaries passed on the production artifact. Desktop and phone owner approval are still required before deployment.');
