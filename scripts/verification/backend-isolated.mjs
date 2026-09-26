import { prepareBackendEmulatorParameters } from './backend-emulator-parameters.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { selectBackendGroups, backendGroupTimeoutMs } from './backend-steps.mjs';
import { runLoggedStep } from './run-logged-step.mjs';
import { prepareBillingEmulatorFixture } from './billing-emulator-fixture.mjs';

const stageArgument = process.argv.slice(2).find(value => value.startsWith('--stages='));
const selection = selectBackendGroups(stageArgument ? stageArgument.slice('--stages='.length) : null);

// Functions emulators retain a worker for each invoked function. Release those
// workers before each independent browser journey; preserve concurrency within
// the journey, including simultaneous clients and transaction admission tests.
const outputDir = path.join('/tmp', 'worldexplorer3d-verification', 'backend-isolated',
  new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(outputDir, { recursive: true });
const results = [];
const cleanupParameters = prepareBackendEmulatorParameters();
let billingFixture;
const onTermination = () => { billingFixture?.cleanup(); cleanupParameters(); process.exit(143); };
process.once('SIGTERM', onTermination);
try {
for (const group of selection.groups) {
  const ids = group.map(step => step.id);
  console.log(`[backend-isolated] START ${ids.join(', ')}`);
  const timeoutMs = backendGroupTimeoutMs(group);
  billingFixture = ids.includes('account-backend') ? prepareBillingEmulatorFixture() : null;
  const result = await runLoggedStep([
    'firebase', 'emulators:exec', '--non-interactive',
    '--only', 'auth,firestore,storage,functions', '--project', 'we3d-staging-20260712',
    `node scripts/verification/backend-release.mjs --stages=${ids.join(',')}`
  ], { cwd: process.cwd(), env: { ...process.env, ...billingFixture?.env },
    logPath: path.join(outputDir, `${ids[0]}.log`), timeoutMs });
  billingFixture?.cleanup();
  billingFixture = null;
  results.push({ stages: ids, timeoutMs, ...result });
  // Groups own isolated emulators; retain later independent evidence on failure.
}
} finally {
  billingFixture?.cleanup();
  process.removeListener('SIGTERM', onTermination);
  cleanupParameters();
}
const report = {
  ok: results.length === selection.groups.length && results.every(result => result.ok),
  completeGate: selection.completeGate,
  selectedStages: selection.selectedStages,
  contract: 'world-explorer-backend-release-v2',
  stageCount: selection.groups.flat().length, outputDir, results
};
writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
