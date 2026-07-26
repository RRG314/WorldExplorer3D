import { spawnSync } from 'node:child_process';

const steps = [
  ['Build hosting artifact', 'scripts/hosting-artifact.mjs', ['build', '--firebase-env', 'staging']],
  ['Hosting artifact parity', 'scripts/hosting-artifact.mjs', ['verify']],
  ['Hosting and cold-title size budgets', 'scripts/test-hosting-size-budget.mjs'],
  ['Hosting source reachability', 'scripts/audit-hosting-reachability.mjs', ['--strict']],
  ['CSS integrity and browser boot', 'scripts/test-css-integrity.mjs'],
  ['ES module URL identity', 'scripts/test-module-version-consistency.mjs'],
  ['Release version identity', 'scripts/test-release-version.mjs'],
  ['Surface contract', 'scripts/test-surface-contract.mjs'],
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
