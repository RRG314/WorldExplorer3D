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
  { name: 'Cloud Functions dependency install', cmd: [npmCommand, 'ci', '--prefix', 'functions', '--ignore-scripts'] },
  { name: 'Cloud Functions security audit', cmd: [npmCommand, 'audit', '--omit=dev', '--prefix', 'functions'] },
  { name: 'Cloud Functions runtime exports', cmd: [process.execPath, 'scripts/test-functions-runtime.mjs'] },
  { name: 'Open-source distribution', cmd: [process.execPath, 'scripts/test-open-source-distribution.mjs'] },
  { name: 'Build production hosting artifact', cmd: [process.execPath, 'scripts/hosting-artifact.mjs', 'build', '--firebase-env', 'production'] },
  { name: 'Hosting artifact parity', cmd: [process.execPath, 'scripts/hosting-artifact.mjs', 'verify'] },
  { name: 'Hosted source reachability', cmd: [process.execPath, 'scripts/audit-hosting-reachability.mjs', '--strict'] },
  { name: 'CSS integrity', cmd: [process.execPath, 'scripts/test-css-integrity.mjs'] },
  { name: 'ES module URL identity', cmd: [process.execPath, 'scripts/test-module-version-consistency.mjs'] },
  { name: 'Surface contract', cmd: [process.execPath, 'scripts/test-surface-contract.mjs'] },
  { name: 'Overture tile source', cmd: [process.execPath, 'scripts/test-overture-tile-source.mjs'] },
  { name: 'Overture streaming source', cmd: [process.execPath, 'scripts/test-overture-streaming-source.mjs'] },
  { name: 'Streaming feature budget', cmd: [process.execPath, 'scripts/test-streaming-feature-budget.mjs'] },
  { name: 'Renderer provenance', cmd: [process.execPath, 'scripts/test-render-provenance.mjs'] },
  { name: 'Continuous renderer', cmd: [process.execPath, 'scripts/test-continuous-renderer.mjs'] },
  { name: 'Inferred building coverage', cmd: [process.execPath, 'scripts/test-inferred-building-coverage.mjs'] },
  { name: 'Firestore rules', cmd: [process.execPath, 'scripts/test-rules.mjs'] },
  { name: 'Local data safety', cmd: [process.execPath, 'scripts/test-local-data-safety.mjs'] },
  { name: 'Analytics privacy contract', cmd: [process.execPath, '--test', 'scripts/test-analytics-contract.mjs'] },
  { name: 'Authoritative room load budget', cmd: [process.execPath, '--expose-gc', 'scripts/test-mmo-load.mjs'] },
  { name: 'Authoritative MMO contracts and server', cmd: [npmCommand, 'run', 'test:mmo'] },
  { name: 'Firestore-backed MMO compatibility', cmd: [npmCommand, 'run', 'test:mmo-firestore'] },
  { name: 'Authoritative room browser gameplay', cmd: [process.execPath, 'scripts/test-mmo-browser-acceptance.mjs'] },
  { name: 'Runtime kernel', cmd: [process.execPath, 'scripts/test-runtime-kernel.mjs'] },
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
  { name: 'World matrix', cmd: [process.execPath, 'scripts/test-world-matrix.mjs'] }
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
