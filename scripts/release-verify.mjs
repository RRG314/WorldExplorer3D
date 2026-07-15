import { spawnSync } from 'node:child_process';

const steps = [
  { name: 'Mirror parity', cmd: [process.execPath, 'scripts/verify-mirror.mjs'] },
  { name: 'CSS integrity', cmd: [process.execPath, 'scripts/test-css-integrity.mjs'] },
  { name: 'ES module URL identity', cmd: [process.execPath, 'scripts/test-module-version-consistency.mjs'] },
  { name: 'Inferred building coverage', cmd: [process.execPath, 'scripts/test-inferred-building-coverage.mjs'] },
  { name: 'Firestore rules', cmd: [process.execPath, 'scripts/test-rules.mjs'] },
  { name: 'Local data safety', cmd: [process.execPath, 'scripts/test-local-data-safety.mjs'] },
  { name: 'Mobile touch controls', cmd: [process.execPath, 'scripts/test-mobile-controls.mjs'] },
  { name: 'Plane and interior lifecycle', cmd: [process.execPath, 'scripts/test-plane-interior-lifecycle.mjs'] },
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
    env: { ...process.env, ...(step.env || {}) },
    cwd: process.cwd()
  });
  if (res.status !== 0) {
    console.error(`\n[release-verify] Failed at step: ${step.name}`);
    process.exit(res.status || 1);
  }
}

console.log('\n[release-verify] All checks passed.');
