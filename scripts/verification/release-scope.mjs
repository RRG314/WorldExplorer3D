import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import {
  compareEvidenceToBaseline,
  currentBaseline,
  readExecutionEvidence
} from './execution-evidence.mjs';

const root = process.cwd();
const [program, packageJson] = await Promise.all([
  readFile(`${root}/config/production-program-gates.json`, 'utf8').then(JSON.parse),
  readFile(`${root}/package.json`, 'utf8').then(JSON.parse)
]);

const requireReady = process.argv.includes('--require-ready');
const failures = [];
const expectedIds = Array.from({ length: 12 }, (_, index) => `CP${index}`);
const checkpointIds = Object.keys(program.checkpoints || {});

if (program.schemaVersion !== 4) failures.push('schemaVersion must be 4');
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

const missingCommands = [];
for (const id of expectedIds) {
  const checkpoint = program.checkpoints?.[id];
  if (!checkpoint) continue;
  if (Object.hasOwn(checkpoint, 'status')) failures.push(`${id} must not declare its own completion status`);
  if (!String(checkpoint.minimumDecision || '').trim()) failures.push(`${id} has no release decision`);
  if (!Array.isArray(checkpoint.requiredCommands) || checkpoint.requiredCommands.length === 0) failures.push(`${id} has no required commands`);
  for (const command of checkpoint.requiredCommands || []) {
    if (!Object.hasOwn(packageJson.scripts || {}, command)) missingCommands.push(`${id}:${command}`);
  }
}
if (missingCommands.length) failures.push(`missing package commands: ${missingCommands.join(', ')}`);

if (program.statusAuthority !== 'current-execution-evidence') failures.push('statusAuthority must be current-execution-evidence');
const scopes = Array.isArray(program.requiredExecutionScopes) ? program.requiredExecutionScopes : [];
if (JSON.stringify(scopes) !== JSON.stringify(['candidate', 'backend'])) failures.push('candidate and backend execution scopes are required');
const current = currentBaseline(root);
const evidenceByScope = Object.fromEntries(scopes.map((scope) => [scope, readExecutionEvidence(root, scope)]));
const evidenceFailures = Object.fromEntries(scopes.map((scope) => [
  scope,
  compareEvidenceToBaseline(evidenceByScope[scope], current, scope)
]));
const passedGateIds = new Set(scopes.flatMap((scope) =>
  (evidenceByScope[scope]?.results || []).filter((result) => result.ok).map((result) => result.id)
));
const missingExecutionGates = {};
for (const id of expectedIds) {
  const required = program.executionGateRequirements?.[id];
  if (!Array.isArray(required) || required.length === 0) {
    failures.push(`${id} has no execution gate requirements`);
    missingExecutionGates[id] = [];
    continue;
  }
  missingExecutionGates[id] = required.filter((gateId) => !passedGateIds.has(gateId));
}
const complete = expectedIds.filter((id) => missingExecutionGates[id]?.length === 0);
const evidenceCurrent = Object.values(evidenceFailures).every((entries) => entries.length === 0);
const releaseReady = failures.length === 0 && evidenceCurrent && complete.length === expectedIds.length;
const report = {
  ok: failures.length === 0 && (!requireReady || releaseReady),
  contract: 'world-explorer-release-scope-v1',
  targetVersion: program.targetVersion,
  productionBaseline: program.productionBaseline,
  structurallyValid: failures.length === 0,
  releaseReady,
  currentBaseline: current,
  evidenceCurrent,
  evidenceFailures,
  evidenceRuns: Object.fromEntries(scopes.map((scope) => [scope, evidenceByScope[scope] ? {
    ok: evidenceByScope[scope].ok,
    completedAt: evidenceByScope[scope].completedAt,
    outputDir: evidenceByScope[scope].outputDir
  } : null])),
  completeCheckpoints: complete,
  incompleteCheckpoints: expectedIds.filter((id) => !complete.includes(id)).map((id) => ({
    id,
    status: 'execution-required',
    missingExecutionGates: missingExecutionGates[id] || [],
    openItems: program.checkpoints?.[id]?.openItems || []
  })),
  failures
};

console.log(JSON.stringify(report, null, 2));
assert.equal(report.ok, true, requireReady ? `World Explorer ${program.targetVersion} is not release-ready.` : 'World Explorer release scope contract is invalid.');
