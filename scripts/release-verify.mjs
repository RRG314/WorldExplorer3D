import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function releaseEnvironment() {
  const env = { ...process.env };
  if (process.platform !== 'darwin') return env;
  const configuredJava = env.JAVA_HOME && path.join(env.JAVA_HOME, 'bin', 'java');
  if (configuredJava && existsSync(configuredJava)) return env;
  const candidates = [
    '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
    '/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home'
  ];
  const javaHome = candidates.find((candidate) => existsSync(path.join(candidate, 'bin', 'java')));
  if (!javaHome) return env;
  env.JAVA_HOME = javaHome;
  env.PATH = `${path.join(javaHome, 'bin')}:${env.PATH || ''}`;
  return env;
}

const baseEnvironment = releaseEnvironment();

const steps = [
  { name: 'Maintainability guard', cmd: [process.execPath, 'scripts/test-maintainability-guard.mjs'] },
  { name: 'Hosting release contract', cmd: [process.execPath, 'scripts/test-hosting-release-contract.mjs'] },
  { name: 'Release version identity', cmd: [process.execPath, 'scripts/test-release-version.mjs'] },
  { name: 'Cloud Functions dependency install', cmd: [npmCommand, 'ci', '--prefix', 'functions', '--ignore-scripts'] },
  { name: 'Cloud Functions security audit', cmd: [npmCommand, 'audit', '--omit=dev', '--prefix', 'functions'] },
  { name: 'Cloud Functions runtime exports', cmd: [process.execPath, 'scripts/test-functions-runtime.mjs'] },
  { name: 'Open-source distribution', cmd: [process.execPath, 'scripts/test-open-source-distribution.mjs'] },
  { name: 'Build production hosting artifact', cmd: [process.execPath, 'scripts/hosting-artifact.mjs', 'build', '--firebase-env', 'production'] },
  { name: 'Hosting artifact parity', cmd: [process.execPath, 'scripts/hosting-artifact.mjs', 'verify'] },
  { name: 'Hosting and cold-title size budgets', cmd: [process.execPath, 'scripts/test-hosting-size-budget.mjs'] },
  { name: 'Hosted source reachability', cmd: [process.execPath, 'scripts/audit-hosting-reachability.mjs', '--strict'] },
  { name: 'CSS integrity', cmd: [process.execPath, 'scripts/test-css-integrity.mjs'] },
  { name: 'ES module URL identity', cmd: [process.execPath, 'scripts/test-module-version-consistency.mjs'] },
  { name: 'Surface contract', cmd: [process.execPath, 'scripts/test-surface-contract.mjs'] },
  { name: 'Shadow policy', cmd: [process.execPath, 'scripts/test-shadow-policy.mjs'] },
  { name: 'Inferred building coverage', cmd: [process.execPath, 'scripts/test-inferred-building-coverage.mjs'] },
  { name: 'Firestore rules', cmd: [process.execPath, 'scripts/test-rules.mjs'] },
  { name: 'Local data safety', cmd: [process.execPath, 'scripts/test-local-data-safety.mjs'] },
  { name: 'Analytics privacy contract', cmd: [process.execPath, '--test', 'scripts/test-analytics-contract.mjs'] },
  { name: 'Release harness privacy and cleanup', cmd: [process.execPath, 'scripts/test-release-harness-privacy.mjs'] },
  { name: 'Authoritative room load budget', cmd: [process.execPath, '--expose-gc', 'scripts/test-mmo-load.mjs'] },
  { name: 'Authoritative MMO contracts and server', cmd: [npmCommand, 'run', 'test:mmo'] },
  { name: 'Firestore-backed MMO compatibility', cmd: [npmCommand, 'run', 'test:mmo-firestore'] },
  { name: 'Authoritative room browser gameplay', cmd: [process.execPath, 'scripts/test-mmo-browser-acceptance.mjs'] },
  { name: 'Runtime kernel', cmd: [process.execPath, 'scripts/test-runtime-kernel.mjs'] },
  { name: 'Frame ownership registry', cmd: [process.execPath, 'scripts/test-frame-ownership.mjs'] },
  { name: 'Lifecycle scope cancellation', cmd: [process.execPath, 'scripts/test-lifecycle-scope.mjs'] },
  { name: 'Domain dependency boundaries', cmd: [process.execPath, 'scripts/test-domain-dependency-boundaries.mjs'] },
  { name: 'World load transaction authority', cmd: [process.execPath, 'scripts/test-world-load-transaction.mjs'] },
  { name: 'World load staged swap', cmd: [process.execPath, 'scripts/test-world-load-stage.mjs'] },
  { name: 'Navigation surface query', cmd: [process.execPath, 'scripts/test-navigation-surface-query.mjs'] },
  { name: 'Bridge guardrail contract', cmd: [process.execPath, 'scripts/test-bridge-guardrail-contract.mjs'] },
  { name: 'Tunnel camera corridor contract', cmd: [process.execPath, 'scripts/test-tunnel-camera-corridor.mjs'] },
  { name: 'Terrain/boat visibility ownership', cmd: [process.execPath, 'scripts/test-terrain-streaming-boat-suppression.mjs'] },
  { name: 'Boat prompt subgrade policy', cmd: [process.execPath, 'scripts/test-boat-prompt-policy.mjs'] },
  { name: 'HUD place-location authority', cmd: [process.execPath, 'scripts/test-place-location-authority.mjs'] },
  { name: 'World-load location authority', cmd: [process.execPath, 'scripts/test-world-load-location-authority.mjs'] },
  { name: 'Mapped water terrain validity', cmd: [process.execPath, 'scripts/test-water-surface-validity.mjs'] },
  { name: 'Structure visual sampling', cmd: [process.execPath, 'scripts/test-structure-visual-sampling.mjs'] },
  { name: 'Transport controller registry', cmd: [process.execPath, 'scripts/test-transport-controller-registry.mjs'] },
  { name: 'Platform service registry', cmd: [process.execPath, 'scripts/test-platform-service-registry.mjs'] },
  { name: 'Account service', cmd: [process.execPath, 'scripts/test-account-service.mjs'] },
  { name: 'Gameplay plugin registry', cmd: [process.execPath, 'scripts/test-gameplay-plugin-registry.mjs'] },
  { name: 'Activity platform', cmd: [process.execPath, 'scripts/test-activity-platform.mjs'] },
  { name: 'Geospatial data fabric', cmd: [process.execPath, 'scripts/test-geospatial-data-fabric.mjs'] },
  { name: 'Mobile touch controls', cmd: [process.execPath, 'scripts/test-mobile-controls.mjs'] },
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
  { name: 'Final hosting artifact parity', cmd: [process.execPath, 'scripts/hosting-artifact.mjs', 'verify'] }
];

for (const step of steps) {
  console.log(`\n=== ${step.name} ===`);
  const res = spawnSync(step.cmd[0], step.cmd.slice(1), {
    stdio: 'inherit',
    env: { ...baseEnvironment, ...(step.env || {}) },
    cwd: process.cwd()
  });
  if (res.status !== 0) {
    console.error(`\n[release-verify] Failed at step: ${step.name}`);
    process.exit(res.status || 1);
  }
}

console.log('\n[release-verify] All checks passed.');
