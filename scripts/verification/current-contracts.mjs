import { spawnSync } from 'node:child_process';
import process from 'node:process';

// This is an explicit current-authority list, not a wildcard over inherited
// tests. Every file corresponds to a retained System Inventory capability or
// an Architecture Map ownership boundary.
const tests = [
  'tests/astronomy-body-catalog-current.test.mjs',
  'tests/astronomy-frames-world-address-current.test.mjs',
  'tests/baltimore-regional-ecology.test.mjs',
  'tests/block-local-store-current.test.mjs',
  'tests/boat-surface-visibility-current.test.mjs',
  'tests/celestial-collision-current.test.mjs',
  'tests/character-progression-current.test.mjs',
  'tests/combat-backpack-current.test.mjs',
  'tests/companion-progression-current.test.mjs',
  'tests/convenience-commerce-current.test.mjs',
  'tests/crash-physics-current.test.mjs',
  'tests/creature-quality.test.mjs',
  'tests/deflock-data-contract.test.mjs',
  'tests/discovery-field-progression.test.mjs',
  'tests/earth-traversal-current.test.mjs',
  'tests/explorer-coherence-current.test.mjs',
  'tests/field-evidence-contracts.test.mjs',
  'tests/field-retention.test.mjs',
  'tests/fish-population-authority.test.mjs',
  'tests/game-facing-language.test.mjs',
  'tests/interior-stair-authority-current.test.mjs',
  'tests/live-gps-field-session.test.mjs',
  'tests/mobile-touch-authority.test.mjs',
  'tests/planetary-build-surface-current.test.mjs',
  'tests/planetary-physical-environment-current.test.mjs',
  'tests/planetary-surface-authority-current.test.mjs',
  'tests/planetary-surface-safety-current.test.mjs',
  'tests/player-state-migration.test.mjs',
  'tests/regional-ecology-expansion.test.mjs',
  'tests/shore-fishing-authority.test.mjs',
  'tests/space-atmospheric-exploration-current.test.mjs',
  'tests/space-destination-completeness-current.test.mjs',
  'tests/space-journey-authority-current.test.mjs',
  'tests/space-landing-target-current.test.mjs',
  'tests/spacecraft-authority-current.test.mjs',
  'tests/vehicle-handling-current.test.mjs',
  'tests/walking-encounter-director.test.mjs',
  'tests/weapon-reticle-current.test.mjs'
];

const result = spawnSync(process.execPath, ['--test', ...tests], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit'
});

if (result.error) throw result.error;
process.exitCode = Number(result.status || 0);
