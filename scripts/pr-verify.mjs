import { spawnSync } from 'node:child_process';

// Pull-request verification is deliberately bounded to deterministic contracts
// plus one measured browser boot. Provider matrices, hosting artifacts, visual
// review, and hardware performance belong to release:verify.
const steps = [
  ['Release evidence identity', 'scripts/test-release-evidence-identity.mjs'],
  ['Earth-core ownership boundaries', 'scripts/test-earth-core-boundaries.mjs'],
  ['Immutable world-load request', 'scripts/test-world-load-request.mjs'],
  ['Published world location identity', 'scripts/test-world-location-identity.mjs'],
  ['World-load session state machine', 'scripts/test-world-load-session.mjs'],
  ['World-load coordinator', 'scripts/test-world-load-coordinator.mjs'],
  ['Immutable WorldSnapshot store', 'scripts/test-world-snapshot.mjs'],
  ['WorldSnapshot publication adapter', 'scripts/test-world-publication-snapshot.mjs'],
  ['Provider cancellation', 'scripts/test-provider-cancellation.mjs'],
  ['Provider outage circuit', 'scripts/test-provider-outage-circuit.mjs'],
  ['Bounded movement road query', 'scripts/test-movement-query-bounds.mjs'],
  ['Disposable lifecycle resources', 'scripts/test-lifecycle-scope.mjs'],
  ['Weather state one-writer service', 'scripts/test-weather-state-service.mjs'],
  ['Runtime kernel and deterministic stepping', 'scripts/test-runtime-kernel.mjs'],
  ['Terrain source behavior', 'scripts/test-terrain-source-contract.mjs'],
  ['Fixed-location terrain material ownership', 'scripts/test-fixed-location-terrain-material.mjs'],
  ['WorldCover detail behavior', 'scripts/test-worldcover-detail-mode.mjs'],
  ['WorldCover outage fan-out', 'scripts/test-worldcover-provider-outage-browser.mjs'],
  ['Terrain generation cancellation', 'scripts/test-terrain-tile-cancellation.mjs'],
  ['Surface query contract', 'scripts/test-surface-contract.mjs'],
  ['Mapped hydrology integration', 'scripts/test-hydrology-integration.mjs'],
  ['City surface ownership', 'scripts/test-city-surface-semantics.mjs'],
  ['Building publication coverage', 'scripts/test-building-publication-coverage.mjs'],
  ['Building geometry quality', 'scripts/test-building-geometry-quality.mjs'],
  ['Mapped-only roof policy', 'scripts/test-roof-inference-policy.mjs'],
  ['Road junction envelopes', 'scripts/test-road-junction-envelopes.mjs'],
  ['Indexed bridge-road conflict queries', 'scripts/test-bridge-road-conflict-index.mjs'],
  ['Globe selector contract', 'scripts/test-globe-selector-contract.mjs'],
  ['Loading transition contract', 'scripts/test-loading-transition-contract.mjs'],
  ['Fixed-world horizon ownership', 'scripts/test-fixed-world-horizon-architecture.mjs'],
  ['Space controls', 'scripts/test-space-flight-controls.mjs'],
  ['Space visual ownership', 'scripts/test-space-physics-and-visuals.mjs'],
  ['Initial Earth quality policy', 'scripts/test-initial-play-workload-policy.mjs'],
  ['Maintainability ownership boundaries', 'scripts/test-maintainability-guard.mjs'],
  ['ES module URL identity', 'scripts/test-module-version-consistency.mjs'],
  ['Hosting asset reachability', 'scripts/audit-hosting-assets.mjs', ['--strict']],
  ['Measured title startup workload', 'scripts/test-startup-workload-browser.mjs']
];

const startedAt = performance.now();
const results = [];

for (const [name, script, args = []] of steps) {
  console.log(`\n=== ${name} ===`);
  const stepStartedAt = performance.now();
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit'
  });
  const durationMs = Math.round(performance.now() - stepStartedAt);
  results.push({ name, script, durationMs, passed: result.status === 0 });
  if (result.status !== 0) {
    console.error(`\n[verify:pr] Failed at step: ${name}`);
    console.error(JSON.stringify({ durationMs, completed: results }, null, 2));
    process.exit(result.status || 1);
  }
}

console.log(JSON.stringify({
  ok: true,
  tier: 'pull-request',
  durationMs: Math.round(performance.now() - startedAt),
  steps: results
}, null, 2));
