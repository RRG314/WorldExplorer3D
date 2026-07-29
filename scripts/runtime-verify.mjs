import { spawnSync } from 'node:child_process';

const steps = [
  ['Production readiness semantics', 'scripts/test-production-readiness-contract.mjs'],
  ['Build hosting artifact', 'scripts/hosting-artifact.mjs', ['build', '--firebase-env', 'staging']],
  ['Hosting artifact parity', 'scripts/hosting-artifact.mjs', ['verify']],
  ['Hosting source reachability', 'scripts/audit-hosting-reachability.mjs', ['--strict']],
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
  ['Local data safety', 'scripts/test-local-data-safety.mjs'],
  ['Block builder contracts', 'scripts/test-block-builder-contract.mjs']
];

for (const [name, script, args = []] of steps) {
  console.log(`\n=== ${name} ===`);
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    console.error(`\n[runtime-verify] Failed at step: ${name}`);
    process.exit(result.status || 1);
  }
}

console.log('\n[runtime-verify] All checks passed.');
