import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const steps = [
  { name: 'Production readiness semantics', cmd: [process.execPath, 'scripts/test-production-readiness-contract.mjs'] },
  { name: 'Maintainability guard', cmd: [process.execPath, 'scripts/test-maintainability-guard.mjs'] },
  { name: 'Cloud Functions dependency install', cmd: [npmCommand, 'ci', '--prefix', 'functions', '--ignore-scripts'] },
  { name: 'Cloud Functions security audit', cmd: [npmCommand, 'audit', '--omit=dev', '--prefix', 'functions'] },
  { name: 'Cloud Functions runtime exports', cmd: [process.execPath, 'scripts/test-functions-runtime.mjs'] },
  { name: 'Build production hosting artifact', cmd: [process.execPath, 'scripts/hosting-artifact.mjs', 'build', '--firebase-env', 'production'] },
  { name: 'Hosting artifact parity', cmd: [process.execPath, 'scripts/hosting-artifact.mjs', 'verify'] },
  { name: 'Immutable release candidate identity', cmd: [process.execPath, 'scripts/test-release-candidate.mjs'] },
  { name: 'Hosted source reachability', cmd: [process.execPath, 'scripts/audit-hosting-reachability.mjs', '--strict'] },
  { name: 'CSS integrity', cmd: [process.execPath, 'scripts/test-css-integrity.mjs'] },
  { name: 'ES module URL identity', cmd: [process.execPath, 'scripts/test-module-version-consistency.mjs'] },
  { name: 'Terrain source contract', cmd: [process.execPath, 'scripts/test-terrain-source-contract.mjs'] },
  { name: 'Surface contract', cmd: [process.execPath, 'scripts/test-surface-contract.mjs'] },
  { name: 'Overture tile source', cmd: [process.execPath, 'scripts/test-overture-tile-source.mjs'] },
  { name: 'Inferred building coverage', cmd: [process.execPath, 'scripts/test-inferred-building-coverage.mjs'] },
  { name: 'Firestore rules', cmd: [process.execPath, 'scripts/test-rules.mjs'] },
  { name: 'Local data safety', cmd: [process.execPath, 'scripts/test-local-data-safety.mjs'] },
  { name: 'Runtime kernel', cmd: [process.execPath, 'scripts/test-runtime-kernel.mjs'] },
  { name: 'Transport controller registry', cmd: [process.execPath, 'scripts/test-transport-controller-registry.mjs'] },
  { name: 'Platform service registry', cmd: [process.execPath, 'scripts/test-platform-service-registry.mjs'] },
  { name: 'Account service', cmd: [process.execPath, 'scripts/test-account-service.mjs'] },
  { name: 'Gameplay plugin registry', cmd: [process.execPath, 'scripts/test-gameplay-plugin-registry.mjs'] },
  { name: 'Geospatial data fabric', cmd: [process.execPath, 'scripts/test-geospatial-data-fabric.mjs'] },
  { name: 'Mobile Chromium touch controls', cmd: [process.execPath, 'scripts/test-mobile-controls.mjs'] },
  {
    name: 'Mobile WebKit touch controls',
    cmd: [process.execPath, 'scripts/test-mobile-controls.mjs'],
    env: { MOBILE_BROWSER: 'webkit' }
  },
  { name: 'Plane and interior lifecycle', cmd: [process.execPath, 'scripts/test-plane-interior-lifecycle.mjs'] },
  { name: 'Environment session lifecycle', cmd: [process.execPath, 'scripts/test-session-lifecycle.mjs'] },
  { name: 'Runtime invariants', cmd: [process.execPath, 'scripts/test-runtime-invariants.mjs'] },
  { name: 'Editor and multiplayer transitions', cmd: [process.execPath, 'scripts/test-editor-multiplayer-surfaces.mjs'] },
  { name: 'Block builder contracts', cmd: [process.execPath, 'scripts/test-block-builder-contract.mjs'] },
  { name: 'Title planetary launches', cmd: [process.execPath, 'scripts/test-title-planetary-launches.mjs'] },
  { name: 'OSM smoke', cmd: [process.execPath, 'scripts/test-osm-smoke.mjs'] },
  {
    name: 'R7 provider-outage fallback',
    cmd: [process.execPath, 'scripts/test-world-matrix.mjs'],
    env: {
      WORLD_MATRIX_BLOCK_WORLDCOVER: '1',
      WORLD_MATRIX_EXERCISE_MODES: '0',
      WORLD_MATRIX_IDS: 'tokyo,monaco,miami_beach_custom',
      WORLD_MATRIX_REPORT_NAME: 'r7-provider-outage.json'
    }
  },
  { name: 'World matrix', cmd: [process.execPath, 'scripts/test-world-matrix.mjs'] },
  {
    name: 'Hardware real-input 10-minute drive',
    cmd: [process.execPath, 'scripts/test-player-input-drive.mjs'],
    env: {
      PLAYER_DRIVE_SECONDS: '600',
      PLAYER_DRIVE_HEADED: '1'
    }
  }
];

for (const step of steps) {
  console.log(`\n=== ${step.name} ===`);
  const res = spawnSync(step.cmd[0], step.cmd.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, ...(step.env || {}) },
    cwd: process.cwd()
  });
  if (res.status !== 0) {
    console.error(`\n[release-verify] Failed at step: ${step.name}`);
    process.exit(res.status || 1);
  }
}

console.log(
  '\n[release-verify] Automated candidate checks passed. ' +
  'Review the generated world-matrix screenshots, prepare a hash-bound review, ' +
  'then run npm run release:finalize.'
);
