import { spawnSync } from 'node:child_process';

const steps = [
  ['Mirror parity', 'scripts/verify-mirror.mjs'],
  ['CSS integrity and browser boot', 'scripts/test-css-integrity.mjs'],
  ['ES module URL identity', 'scripts/test-module-version-consistency.mjs'],
  ['Inferred building coverage', 'scripts/test-inferred-building-coverage.mjs'],
  ['Local data safety', 'scripts/test-local-data-safety.mjs'],
  ['Block builder contracts', 'scripts/test-block-builder-contract.mjs']
];

for (const [name, script] of steps) {
  console.log(`\n=== ${name} ===`);
  const result = spawnSync(process.execPath, [script], {
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
