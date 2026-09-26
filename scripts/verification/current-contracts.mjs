import { spawnSync } from 'node:child_process';
import process from 'node:process';

// This is an explicit current-authority list, not a wildcard over inherited
// tests. Every file corresponds to a retained System Inventory capability or
// an Architecture Map ownership boundary.
import { currentContractTests as tests } from './current-contract-list.mjs';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

if (new Set(tests).size !== tests.length) throw new Error('Duplicate contract test files');
mkdirSync('output/verification/current-contracts', { recursive: true });
rmSync('output/verification/current-contracts/report.json', { force: true });
console.log('[contracts] Component/source checks only; this command does not certify browser journeys, deployed services, visuals, or performance.');


const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--test', '--test-concurrency=1', '--test-reporter=spec', '--test-reporter-destination=stdout',
  '--test-reporter=./scripts/verification/contract-reporter.mjs',
  '--test-reporter-destination=output/verification/current-contracts/report.json', ...tests], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit'
});

if (result.error) throw result.error;
if (result.status === 0) {
  const report = JSON.parse(readFileSync('output/verification/current-contracts/report.json', 'utf8'));
  assert.equal(report.summary?.success, true, 'The test reporter did not record a completed successful run');
  assert.equal(report.executedFiles, tests.length, 'Every selected file must execute');
  assert.equal(report.summary.counts.skipped, 0, 'Skipped cases cannot count as complete verification');
  assert.equal(report.summary.counts.todo, 0, 'TODO cases cannot count as complete verification');
}
process.exitCode = result.signal ? 1 : Number(result.status ?? 1);
