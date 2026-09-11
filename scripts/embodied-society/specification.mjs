import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
export function validateSpecification(config) {
  const failures = [];
  const require = (condition, message) => { if (!condition) failures.push(message); };
  require(config?.schemaVersion === 1, 'Unsupported specification schema.');
  require(config?.stage === 'G0_SPECIFICATION', 'This validator covers specification-only G0, not executable run configurations.');
  require(config?.enabled === false, 'Experiment must remain disabled at G0.');
  const env = config?.environment;
  require(env?.kind === 'unprovisioned-research' && env.firebaseProjectId === null, 'No cloud environment is provisioned by this specification.');
  require(env?.productionAccess === false && env?.playerDataAccess === false && env?.networkAccess === false, 'Production, player-data and network access must be disabled.');
  require(config?.population?.initial === 1 && config?.population?.localMaximum === 1, 'Begin with one local resident.');
  require(Array.isArray(config?.population?.assignedOccupations) && config.population.assignedOccupations.length === 0, 'The neutral pilot must not assign occupations.');
  require(config?.population?.sharedHiddenContext === false, 'Residents cannot share hidden context.');
  require(config?.world?.physicsRate === 1 && config?.world?.strategicRate === 1, 'Acceleration is unverified; initial clocks must be 1x.');
  require(config?.model?.credentialConfigured === false && config?.model?.maxConcurrentCalls === 1, 'No model is configured; planned concurrency is one.');
  const budget = config?.budget;
  require(budget?.modelSpendUsd === 0 && budget?.modelCalls === 0, 'G0 permits no paid/model dispatch.');
  require(budget?.maxEngineeringWorkers === 0 && budget?.maxPatchWorktrees === 0, 'Engineering workers and patch worktrees are disabled.');
  require(budget?.maxRenderers === 1 && Number.isFinite(budget?.wallMinutes) && budget.wallMinutes > 0 && budget.wallMinutes <= 15, 'Local smoke envelope must be bounded to one renderer and 15 minutes.');
  require(Number.isFinite(budget?.newArtifactMiB) && budget.newArtifactMiB > 0 && budget.newArtifactMiB <= 256, 'New artifact allowance must be at most 256 MiB.');
  require(Number.isFinite(budget?.minimumFreeDiskGiB) && budget.minimumFreeDiskGiB >= 10, 'Minimum free-disk policy must be at least 10 GiB.');
  const engineering = config?.engineering;
  require(engineering?.enabled === false && engineering?.baselineAutoAccept === false && engineering?.productionDeploy === false && engineering?.editEvaluator === false && engineering?.sandboxAttestation === null, 'Engineering must be off; no sandbox attestation is established.');
  require(config?.observer?.publicEnabled === false && config?.observer?.visitorMode === 'disabled' && config?.observer?.browserReceivesCredentials === false, 'Public/visitor access and browser credentials must be disabled.');
  for (const key of ['bodyAdapterVerified','actorIsolationVerified','baselineJourneyVerified','worldDataPinned','sandboxVerified','canLaunch']) {
    require(config?.acceptance?.[key] === false, `G0 cannot claim ${key}.`);
  }
  return failures;
}
export function launchBlockers() {
  return [
    'G1: mapped-world host is implemented; actual mapped browser acceptance and private-space journey remain unverified.',
    'G2: live provider and actual-world controls implemented; real model-driven needs journey remains unverified.',
    'Research world inputs and environment are not provisioned/pinned.',
    'No model/provider credentials or execution budget configured.',
    'Engineering sandbox is not implemented or attested; engineering stays disabled.'
  ];
}
export async function checkSourceCoverage(base = root) {
  const manifest = JSON.parse(await readFile(path.join(base, 'research/embodied-society/requirements.json'), 'utf8'));
  const failures = [], expected = new Set();
  for (const [prefix, count] of [['M',35], ['S',144]]) for (let n=1;n<=count;n++) expected.add(`${prefix}${String(n).padStart(3,'0')}`);
  const seen = new Set();
  for (const section of manifest.sections || []) {
    if (!expected.has(section.id) || seen.has(section.id)) failures.push(`Unexpected or repeated section: ${section.id}`);
    seen.add(section.id);
    if (!section.disposition || !section.implementationStage) failures.push(`Unmapped section: ${section.id}`);
  }
  for (const id of expected) if (!seen.has(id)) failures.push(`Missing source section: ${id}`);
  for (const source of manifest.sources || []) {
    const file = path.resolve(base, source.path);
    const allowed = path.resolve(base, 'research/embodied-society/source-prompts') + path.sep;
    if (!file.startsWith(allowed)) { failures.push('Source archive path outside expected directory.'); continue; }
    const hash = createHash('sha256').update(await readFile(file)).digest('hex');
    if (hash !== source.sha256) failures.push(`Source archive hash mismatch: ${source.id}`);
  }
  if (manifest.sources?.length !== 4) failures.push('Expected four archived source proposals.');
  return failures;
}
async function main() {
  const mode = process.argv[2] || 'check';
  if (!['check','preflight'].includes(mode)) throw new Error('Use check or preflight. Neither command launches a run.');
  const config = JSON.parse(await readFile(path.join(root, 'research/embodied-society/pilot.config.json'), 'utf8'));
  const failures = [...validateSpecification(config), ...await checkSourceCoverage()];
  console.log(JSON.stringify({
    check: 'research-specification-only', specificationValid: failures.length === 0,
    sourceSections: 179, launchable: false, sandboxVerified: false,
    failures, ...(mode === 'preflight' ? { status: 'NOT LAUNCHABLE', blockers: launchBlockers() } : {})
  }, null, 2));
  process.exitCode = failures.length || mode === 'preflight' ? 1 : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
