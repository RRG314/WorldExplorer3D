import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const root = process.cwd();
const [program, packageJson] = await Promise.all([
  readFile(`${root}/config/production-program-gates.json`, 'utf8').then(JSON.parse),
  readFile(`${root}/package.json`, 'utf8').then(JSON.parse)
]);

const requireReady = process.argv.includes('--require-ready');
const failures = [];
const expectedIds = Array.from({ length: 12 }, (_, index) => `CP${index}`);
const checkpointIds = Object.keys(program.checkpoints || {});

if (program.schemaVersion !== 3) failures.push('schemaVersion must be 3');
if (program.targetVersion !== packageJson.version) failures.push(`targetVersion must match package version ${packageJson.version}`);
if (!/^\d+\.\d+\.\d+$/.test(program.productionBaseline?.version || '')) failures.push('production baseline version must use semantic versioning');
if (!/^[0-9a-f]{40}$/.test(program.productionBaseline?.releaseCommit || '')) failures.push('production baseline release commit must be a full Git commit');
if (!String(program.acceptanceContract || '').trim()) {
  failures.push('acceptance contract is required');
} else {
  try {
    await access(`${root}/${program.acceptanceContract}`);
  } catch {
    failures.push(`acceptance contract is missing: ${program.acceptanceContract}`);
  }
}
if (JSON.stringify(checkpointIds) !== JSON.stringify(expectedIds)) failures.push(`checkpoint IDs must be exactly ${expectedIds.join(', ')}`);

const allowedStatuses = new Set(program.statusDefinitions || []);
const missingCommands = [];
const contradictoryComplete = [];
for (const id of expectedIds) {
  const checkpoint = program.checkpoints?.[id];
  if (!checkpoint) continue;
  if (!allowedStatuses.has(checkpoint.status)) failures.push(`${id} has unknown status ${checkpoint.status}`);
  if (!String(checkpoint.minimumDecision || '').trim()) failures.push(`${id} has no release decision`);
  if (!Array.isArray(checkpoint.requiredCommands) || checkpoint.requiredCommands.length === 0) failures.push(`${id} has no required commands`);
  for (const command of checkpoint.requiredCommands || []) {
    if (!Object.hasOwn(packageJson.scripts || {}, command)) missingCommands.push(`${id}:${command}`);
  }
  if (checkpoint.status === program.requiredCompleteStatus && (checkpoint.openItems || []).length > 0) contradictoryComplete.push(id);
}
if (missingCommands.length) failures.push(`missing package commands: ${missingCommands.join(', ')}`);
if (contradictoryComplete.length) failures.push(`complete checkpoints still have open items: ${contradictoryComplete.join(', ')}`);

const complete = expectedIds.filter((id) => program.checkpoints?.[id]?.status === program.requiredCompleteStatus);
const releaseReady = failures.length === 0 && complete.length === expectedIds.length;
const report = {
  ok: failures.length === 0 && (!requireReady || releaseReady),
  contract: 'world-explorer-release-scope-v1',
  targetVersion: program.targetVersion,
  productionBaseline: program.productionBaseline,
  structurallyValid: failures.length === 0,
  releaseReady,
  completeCheckpoints: complete,
  incompleteCheckpoints: expectedIds.filter((id) => !complete.includes(id)).map((id) => ({
    id,
    status: program.checkpoints?.[id]?.status || 'missing',
    openItems: program.checkpoints?.[id]?.openItems || []
  })),
  failures
};

console.log(JSON.stringify(report, null, 2));
assert.equal(report.ok, true, requireReady ? `World Explorer ${program.targetVersion} is not release-ready.` : 'World Explorer release scope contract is invalid.');
