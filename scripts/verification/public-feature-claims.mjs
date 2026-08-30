import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = process.cwd();
const requireReady = process.argv.includes('--require-ready');
const packageJson = await readFile(`${root}/package.json`, 'utf8').then(JSON.parse);
const manifestPath = `${root}/config/public-feature-claims.json`;
const manifest = await readFile(manifestPath, 'utf8').then(JSON.parse);
const files = new Map(await Promise.all((manifest.publicFiles || []).map(async (file) => [
  file,
  await readFile(`${root}/${file}`, 'utf8')
])));
const failures = [];
const forbiddenMatches = [];
const missingClaimSources = [];
const missingEvidenceCommands = [];

if (manifest.schemaVersion !== 1) failures.push('schemaVersion must be 1');
if (manifest.targetVersion !== packageJson.version) failures.push(`targetVersion must match package version ${packageJson.version}`);
if ((manifest.claims || []).length === 0) failures.push('at least one public feature claim is required');

for (const rule of manifest.forbiddenPublicPatterns || []) {
  const expression = new RegExp(rule.pattern, 'i');
  for (const [file, source] of files) {
    if (expression.test(source)) forbiddenMatches.push({ file, pattern: rule.pattern, reason: rule.reason });
  }
}
for (const claim of manifest.claims || []) {
  if (!(manifest.allowedStatuses || []).includes(claim.status)) failures.push(`${claim.id} has invalid status ${claim.status}`);
  const source = files.get(claim.source?.file);
  if (!source || !new RegExp(claim.source?.pattern || '$a').test(source)) missingClaimSources.push(claim.id);
  for (const command of claim.evidenceCommands || []) {
    if (!Object.hasOwn(packageJson.scripts || {}, command)) missingEvidenceCommands.push(`${claim.id}:${command}`);
  }
}
if (forbiddenMatches.length) failures.push('forbidden public claims remain');
if (missingClaimSources.length) failures.push(`claim sources missing: ${missingClaimSources.join(', ')}`);
const candidateVerified = (manifest.claims || []).filter((claim) => claim.status === 'candidate-verified');
const releaseReady = failures.length === 0 && missingEvidenceCommands.length === 0 &&
  candidateVerified.length === (manifest.claims || []).length;
const report = {
  ok: failures.length === 0 && (!requireReady || releaseReady),
  contract: `world-explorer-${manifest.targetVersion}-public-feature-claims-v1`,
  structurallyValid: failures.length === 0,
  releaseReady,
  claimCount: (manifest.claims || []).length,
  statusCounts: Object.fromEntries((manifest.allowedStatuses || []).map((status) => [
    status,
    (manifest.claims || []).filter((claim) => claim.status === status).length
  ])),
  forbiddenMatches,
  missingClaimSources,
  missingEvidenceCommands,
  candidatePending: (manifest.claims || []).filter((claim) => claim.status !== 'candidate-verified').map((claim) => claim.id),
  failures
};

console.log(JSON.stringify(report, null, 2));
assert.equal(report.ok, true, requireReady ? `Public feature claims are not ${manifest.targetVersion} candidate-ready.` : 'Public feature claim inventory is invalid.');
