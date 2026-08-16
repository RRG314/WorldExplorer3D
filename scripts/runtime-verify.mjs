import { runNodeVerificationSteps } from './lib/verification-runner.mjs';

const steps = [
  ['Earth-core isolation boundary', 'scripts/test-earth-core-boundaries.mjs'],
  ['Immutable world-load request', 'scripts/test-world-load-request.mjs'],
  ['Published world location identity', 'scripts/test-world-location-identity.mjs'],
  ['World-load session state machine', 'scripts/test-world-load-session.mjs'],
  ['World-load coordinator', 'scripts/test-world-load-coordinator.mjs'],
  ['Immutable WorldSnapshot and atomic store', 'scripts/test-world-snapshot.mjs'],
  ['Live WorldSnapshot publication adapter', 'scripts/test-world-publication-snapshot.mjs'],
  ['Provider session cancellation', 'scripts/test-provider-cancellation.mjs'],
  ['Far-terrain elevation request budget', 'scripts/test-far-field-elevation-loader.mjs'],
  ['Fixed-location shared terrain material', 'scripts/test-fixed-location-terrain-material.mjs'],
  ['WorldCover mixed-tile material authority', 'scripts/test-worldcover-detail-mode.mjs'],
  ['Terrain-tile generation cancellation', 'scripts/test-terrain-tile-cancellation.mjs'],
  ['World-load cancellation browser', 'scripts/test-world-load-cancellation-browser.mjs'],
  ['City-surface structural ownership', 'scripts/test-city-surface-semantics.mjs'],
  ['Production readiness semantics', 'scripts/test-production-readiness-contract.mjs'],
  ['Build hosting artifact', 'scripts/hosting-artifact.mjs', ['build', '--firebase-env', 'staging']],
  ['Hosting artifact parity', 'scripts/hosting-artifact.mjs', ['verify']],
  ['Bundled hosting artifact browser boot', 'scripts/test-hosting-artifact-browser.mjs'],
  ['Hosting source reachability', 'scripts/audit-hosting-reachability.mjs', ['--strict']],
  ['Hosting asset reachability', 'scripts/audit-hosting-assets.mjs', ['--strict']],
  ['CSS integrity and browser boot', 'scripts/test-css-integrity.mjs'],
  ['ES module URL identity', 'scripts/test-module-version-consistency.mjs'],
  ['Terrain source contract', 'scripts/test-terrain-source-contract.mjs'],
  ['Ground provider registry', 'scripts/test-ground-provider-registry.mjs'],
  ['Ground artifact integrity', 'scripts/test-ground-artifact.mjs'],
  ['Ground artifact builder', 'scripts/test-ground-artifact-builder.mjs'],
  ['Ground datum normalizer', 'scripts/run-ground-datum-normalizer.mjs', ['self-test']],
  ['District compiler contract', 'scripts/test-district-compiler-contract.mjs'],
  ['Surface contract', 'scripts/test-surface-contract.mjs'],
  ['Overture building fallback source', 'scripts/test-overture-tile-source.mjs'],
  ['Inferred building coverage', 'scripts/test-inferred-building-coverage.mjs'],
  ['Multi-axis space-flight controls', 'scripts/test-space-flight-controls.mjs'],
  ['Space physics and visual ownership', 'scripts/test-space-physics-and-visuals.mjs'],
  ['Local data safety', 'scripts/test-local-data-safety.mjs'],
  ['Block builder contracts', 'scripts/test-block-builder-contract.mjs']
];

runNodeVerificationSteps(steps, { label: 'runtime-verify' });

console.log('\n[runtime-verify] All checks passed.');
