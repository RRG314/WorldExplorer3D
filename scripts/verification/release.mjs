import { spawnSync } from 'node:child_process';

const steps = [
  {
    name: 'Validate release scope structure',
    command: [process.execPath, 'scripts/verification/release-scope.mjs']
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
    name: 'Build the staging-configured verification artifact',
    command: [process.execPath, 'scripts/hosting-artifact.mjs', 'build', '--firebase-env', 'staging']
  },
  {
    name: 'Run the complete candidate system matrix against the artifact',
    command: [process.execPath, 'scripts/verification/system-release.mjs', '--run', '--scope=candidate'],
    environment: { WE3D_VERIFY_ROOT: 'dist' }
  },
  {
    name: 'Run the complete backend authority matrix',
    command: [process.execPath, 'scripts/verification/system-release.mjs', '--run', '--scope=backend'],
    environment: { WE3D_VERIFY_ROOT: 'dist' }
  },
  {
    name: 'Require current execution-backed release readiness',
    command: [process.execPath, 'scripts/verification/release-scope.mjs', '--require-ready']
  },
  {
    name: 'Require current execution-backed public claims',
    command: [process.execPath, 'scripts/verification/public-feature-claims.mjs', '--require-ready']
  },
  { name: 'Prepare production configuration from the completely verified artifact',
    command: [process.execPath, 'scripts/prepare-production-artifact.mjs'] }
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

console.log('\n[release] Automated release boundaries passed on staging; production packaging is linked by an exact configuration-only promotion receipt. Desktop and phone owner approval are still required before deployment.');
