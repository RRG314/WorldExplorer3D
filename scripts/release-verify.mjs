import { spawnSync } from 'node:child_process';

const steps = [
  { name: 'Mirror parity', cmd: [process.execPath, 'scripts/verify-mirror.mjs'] },
  { name: 'Firestore rules', cmd: [process.execPath, 'scripts/test-rules.mjs'] },
  { name: 'Runtime invariants', cmd: [process.execPath, 'scripts/test-runtime-invariants.mjs'] }
];

for (const step of steps) {
  console.log(`\n=== ${step.name} ===`);
  const res = spawnSync(step.cmd[0], step.cmd.slice(1), {
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd()
  });
  if (res.status !== 0) {
    console.error(`\n[release-verify] Failed at step: ${step.name}`);
    process.exit(res.status || 1);
  }
}

console.log('\n[release-verify] All checks passed.');
