import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
if (program.targetVersion !== '5.0.0') failures.push('targetVersion must be 5.0.0');
if (program.productionBaseline?.releaseCommit !== '1611d666f8c469c573ad184128b019a7f1e3f961') {
  failures.push('production baseline must remain the deployed 1611d66 commit');
}
if (JSON.stringify(checkpointIds) !== JSON.stringify(expectedIds)) failures.push(`checkpoint IDs must be exactly ${expectedIds.join(', ')}`);

const allowedStatuses = new Set(program.statusDefinitions || []);
const missingCommands = [];
const contradictoryComplete = [];
for (const id of expectedIds) {
  const checkpoint = program.checkpoints?.[id];
  if (!checkpoint) continue;
  if (!allowedStatuses.has(checkpoint.status)) failures.push(`${id} has unknown status ${checkpoint.status}`);
  if (!String(checkpoint.minimumDecision || '').trim()) failures.push(`${id} has no minimum release decision`);
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
  contract: 'world-explorer-5.0-minimum-scope-v1',
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
assert.equal(report.ok, true, requireReady ? 'World Explorer 5.0 is not release-ready.' : 'World Explorer 5.0 scope contract is invalid.');
