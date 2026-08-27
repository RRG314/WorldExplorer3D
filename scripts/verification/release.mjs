import { spawnSync } from 'node:child_process';

const steps = [
  {
    name: 'Current source and entry graph',
    command: [process.execPath, 'scripts/verification/source.mjs']
  },
  {
    name: 'Pinned external provider release is current and reachable',
    command: [process.execPath, 'scripts/verification/provider-release.mjs']
  },
  {
    name: 'Firebase Functions syntax',
    command: [process.execPath, '--check', 'functions/index.js']
  },
  {
    name: 'Root dependency vulnerability audit',
    command: ['npm', 'audit', '--audit-level=low']
  },
  {
    name: 'Production Functions dependency vulnerability audit',
    command: ['npm', 'audit', '--omit=dev', '--audit-level=low'],
    cwd: 'functions'
  },
  {
    name: 'Firestore authorization and legacy-account compatibility',
    command: ['npm', 'run', 'verify:firestore-rules']
  },
  {
    name: 'Two authenticated multiplayer clients converge in one bounded room',
    command: ['npm', 'run', 'verify:multiplayer'],
    environment: { WE3D_VERIFY_ROOT: 'dist' }
  },
  {
    name: 'Build the production hosting artifact',
    command: [process.execPath, 'scripts/hosting-artifact.mjs', 'build', '--firebase-env', 'production']
  },
  {
    name: 'Verify artifact hashes and source parity',
    command: [process.execPath, 'scripts/hosting-artifact.mjs', 'verify']
  },
  {
    name: 'Verify one 5.0 version, commit, artifact, and displayed identity',
    command: [process.execPath, 'scripts/verification/release-identity.mjs']
  },
  {
    name: 'Verify reachable hosting sources',
    command: [process.execPath, 'scripts/audit-hosting-reachability.mjs', '--strict']
  },
  {
    name: 'Verify reachable hosting assets',
    command: [process.execPath, 'scripts/audit-hosting-assets.mjs', '--strict']
  },
  {
    name: 'Run the complete player journey against the artifact',
    command: [process.execPath, 'scripts/verification/world.mjs'],
    environment: { WE3D_VERIFY_ROOT: 'dist' }
  },
  {
    name: 'Verify the shared Backpack and equipment through normal player input',
    command: [process.execPath, 'scripts/verification/urban-equipment.mjs'],
    environment: { WE3D_VERIFY_ROOT: 'dist' }
  },
  {
    name: 'Verify the final visible player owns the Jones Falls elevated deck',
    command: [process.execPath, 'scripts/verification/jfx-player-surface.mjs'],
    environment: { WE3D_VERIFY_ROOT: 'dist' }
  },
  {
    name: 'Verify Moon, Mars, Space, and Ocean environment ownership',
    command: [process.execPath, 'scripts/verification/environments.mjs'],
    environment: { WE3D_VERIFY_ROOT: 'dist' }
  },
  {
    name: 'Verify live GPS walk/drive selection and behind-actor camera return',
    command: [process.execPath, 'scripts/verification/live-gps.mjs'],
    environment: { WE3D_VERIFY_ROOT: 'dist' }
  },
  {
    name: 'Verify representative complete assembled Earth locations',
    command: [process.execPath, 'scripts/verification/assembled-locations.mjs'],
    environment: { WE3D_VERIFY_ROOT: 'dist', WE3D_CAPTURE_RELEASE_EVIDENCE: '1' }
  }
];

for (const step of steps) {
  console.log(`\n[release] ${step.name}`);
  const result = spawnSync(step.command[0], step.command.slice(1), {
    cwd: step.cwd ? `${process.cwd()}/${step.cwd}` : process.cwd(),
    env: { ...process.env, ...(step.environment || {}) },
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(`Release verification stopped at: ${step.name}`);
  }
}

console.log('\n[release] Current automated release boundaries passed. Visual evidence still requires an explicit clean-artifact capture and human approval.');
