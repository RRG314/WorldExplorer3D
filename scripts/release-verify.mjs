import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const steps = [
  { name: 'Release evidence identity', cmd: [process.execPath, 'scripts/test-release-evidence-identity.mjs'] },
  { name: 'Production readiness semantics', cmd: [process.execPath, 'scripts/test-production-readiness-contract.mjs'] },
  { name: 'Earth-core isolation boundary', cmd: [process.execPath, 'scripts/test-earth-core-boundaries.mjs'] },
  { name: 'Immutable world-load request', cmd: [process.execPath, 'scripts/test-world-load-request.mjs'] },
  { name: 'Published world location identity', cmd: [process.execPath, 'scripts/test-world-location-identity.mjs'] },
  { name: 'World-load session state machine', cmd: [process.execPath, 'scripts/test-world-load-session.mjs'] },
  { name: 'World-load coordinator', cmd: [process.execPath, 'scripts/test-world-load-coordinator.mjs'] },
  { name: 'Immutable WorldSnapshot and atomic store', cmd: [process.execPath, 'scripts/test-world-snapshot.mjs'] },
  { name: 'Live WorldSnapshot publication adapter', cmd: [process.execPath, 'scripts/test-world-publication-snapshot.mjs'] },
  { name: 'Provider session cancellation', cmd: [process.execPath, 'scripts/test-provider-cancellation.mjs'] },
  { name: 'Far-terrain elevation request budget', cmd: [process.execPath, 'scripts/test-far-field-elevation-loader.mjs'] },
  { name: 'Fixed-location shared terrain material', cmd: [process.execPath, 'scripts/test-fixed-location-terrain-material.mjs'] },
  { name: 'WorldCover mixed-tile material authority', cmd: [process.execPath, 'scripts/test-worldcover-detail-mode.mjs'] },
  { name: 'Terrain-tile generation cancellation', cmd: [process.execPath, 'scripts/test-terrain-tile-cancellation.mjs'] },
  { name: 'World-load cancellation browser', cmd: [process.execPath, 'scripts/test-world-load-cancellation-browser.mjs'] },
  { name: 'Fixed-world sustained travel and Space return', cmd: [process.execPath, 'scripts/test-fixed-world-travel-browser.mjs'] },
  { name: 'Previous-production cold/warm load performance comparison', cmd: [process.execPath, 'scripts/test-load-performance-comparison.mjs'] },
  { name: 'City-surface structural ownership', cmd: [process.execPath, 'scripts/test-city-surface-semantics.mjs'] },
  { name: 'Measured title startup workload', cmd: [process.execPath, 'scripts/test-startup-workload-browser.mjs'] },
  { name: 'Building publication coverage', cmd: [process.execPath, 'scripts/test-building-publication-coverage.mjs'] },
  { name: 'Building geometry quality', cmd: [process.execPath, 'scripts/test-building-geometry-quality.mjs'] },
  { name: 'Mapped-only roof policy', cmd: [process.execPath, 'scripts/test-roof-inference-policy.mjs'] },
  { name: 'Mapped hydrology integration', cmd: [process.execPath, 'scripts/test-hydrology-integration.mjs'] },
  { name: 'Road junction envelopes', cmd: [process.execPath, 'scripts/test-road-junction-envelopes.mjs'] },
  { name: 'Indexed bridge-road conflict queries', cmd: [process.execPath, 'scripts/test-bridge-road-conflict-index.mjs'] },
  { name: 'Tunnel-system model', cmd: [process.execPath, 'scripts/test-tunnel-system-model.mjs'] },
  { name: 'Fixed-world horizon ownership', cmd: [process.execPath, 'scripts/test-fixed-world-horizon-architecture.mjs'] },
  { name: 'Global far-world provider matrix', cmd: [process.execPath, 'scripts/test-far-world-global-contract.mjs'] },
  { name: 'Globe selector browser journey', cmd: [process.execPath, 'scripts/test-globe-selector-browser.mjs'] },
  { name: 'Loading transition browser journey', cmd: [process.execPath, 'scripts/test-loading-transition-browser.mjs'] },
  { name: 'Global ocean bathymetry', cmd: [process.execPath, 'scripts/test-ocean-global-bathymetry.mjs'] },
  { name: 'Maintainability guard', cmd: [process.execPath, 'scripts/test-maintainability-guard.mjs'] },
  { name: 'Cloud Functions dependency install', cmd: [npmCommand, 'ci', '--prefix', 'functions', '--ignore-scripts'] },
  { name: 'Cloud Functions security audit', cmd: [npmCommand, 'audit', '--omit=dev', '--prefix', 'functions'] },
  { name: 'Cloud Functions runtime exports', cmd: [process.execPath, 'scripts/test-functions-runtime.mjs'] },
  { name: 'Build production hosting artifact', cmd: [process.execPath, 'scripts/hosting-artifact.mjs', 'build', '--firebase-env', 'production'] },
  { name: 'Hosting artifact parity', cmd: [process.execPath, 'scripts/hosting-artifact.mjs', 'verify'] },
  { name: 'Bundled hosting artifact browser boot', cmd: [process.execPath, 'scripts/test-hosting-artifact-browser.mjs'] },
  { name: 'Immutable release candidate identity', cmd: [process.execPath, 'scripts/test-release-candidate.mjs'] },
  { name: 'Hosted source reachability', cmd: [process.execPath, 'scripts/audit-hosting-reachability.mjs', '--strict'] },
  { name: 'Hosted asset reachability', cmd: [process.execPath, 'scripts/audit-hosting-assets.mjs', '--strict'] },
  { name: 'CSS integrity', cmd: [process.execPath, 'scripts/test-css-integrity.mjs'] },
  { name: 'ES module URL identity', cmd: [process.execPath, 'scripts/test-module-version-consistency.mjs'] },
  { name: 'Terrain source contract', cmd: [process.execPath, 'scripts/test-terrain-source-contract.mjs'] },
  { name: 'Provider outage circuit', cmd: [process.execPath, 'scripts/test-provider-outage-circuit.mjs'] },
  { name: 'WorldCover outage fan-out', cmd: [process.execPath, 'scripts/test-worldcover-provider-outage-browser.mjs'] },
  { name: 'Surface contract', cmd: [process.execPath, 'scripts/test-surface-contract.mjs'] },
  { name: 'Overture tile source', cmd: [process.execPath, 'scripts/test-overture-tile-source.mjs'] },
  { name: 'Inferred building coverage', cmd: [process.execPath, 'scripts/test-inferred-building-coverage.mjs'] },
  { name: 'Firestore rules', cmd: [process.execPath, 'scripts/test-rules.mjs'] },
  { name: 'Local data safety', cmd: [process.execPath, 'scripts/test-local-data-safety.mjs'] },
  { name: 'Disposable lifecycle resources', cmd: [process.execPath, 'scripts/test-lifecycle-scope.mjs'] },
  { name: 'Weather state one-writer service', cmd: [process.execPath, 'scripts/test-weather-state-service.mjs'] },
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
  { name: 'Multi-axis space-flight controls', cmd: [process.execPath, 'scripts/test-space-flight-controls.mjs'] },
  { name: 'Space physics and visual ownership', cmd: [process.execPath, 'scripts/test-space-physics-and-visuals.mjs'] },
  { name: 'Traversal vehicle visual budgets', cmd: [process.execPath, 'scripts/test-vehicle-visual-budgets.mjs'] },
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
  {
    name: 'World matrix with elevated terrain-boundary evidence',
    cmd: [process.execPath, 'scripts/test-world-matrix.mjs'],
    env: {
      WORLD_MATRIX_CAPTURE_DRONE: '1',
      WORLD_MATRIX_FORCE_DAYLIGHT: '1'
    }
  },
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
