import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const visualReviewFile = String(
  process.env.WORLD_MATRIX_VISUAL_REVIEW_FILE || ''
).trim();

if (!visualReviewFile) {
  console.error(
    'WORLD_MATRIX_VISUAL_REVIEW_FILE is required. Review the existing ' +
    'world-matrix screenshots before finalizing the candidate.'
  );
  process.exit(1);
}

const steps = [
  {
    name: 'Production hosting artifact parity',
    cmd: [process.execPath, 'scripts/hosting-artifact.mjs', 'verify']
  },
  {
    name: 'Immutable release candidate identity',
    cmd: [process.execPath, 'scripts/test-release-candidate.mjs']
  },
  {
    name: 'Hash-bound world-matrix visual review',
    cmd: [process.execPath, 'scripts/verify-world-matrix-visual-review.mjs']
  },
  {
    name: 'Production evidence gate',
    cmd: [process.execPath, 'scripts/verify-production-gate.mjs']
  }
];

for (const step of steps) {
  console.log(`\n=== ${step.name} ===`);
  const result = spawnSync(step.cmd[0], step.cmd.slice(1), {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      WORLD_MATRIX_VISUAL_REVIEW_FILE: visualReviewFile
    }
  });
  if (result.status !== 0) {
    console.error(`\n[release-finalize] Failed at step: ${step.name}`);
    process.exit(result.status || 1);
  }
}

console.log(
  '\n[release-finalize] Candidate artifact and reviewed evidence are approved. ' +
  `Promotion command: ${npmCommand} run preview:promote -- <channel-id> ` +
  '--project worldexplorer3d-d9b83'
);
