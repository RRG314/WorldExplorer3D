import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { backendGroups, backendSteps } from './backend-steps.mjs';
import { runLoggedStep } from './run-logged-step.mjs';

// Functions emulators retain a worker for each invoked function. Release those
// workers before each independent browser journey; preserve concurrency within
// the journey, including simultaneous clients and transaction admission tests.
const outputDir = path.join('/tmp', 'worldexplorer3d-verification', 'backend-isolated',
  new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(outputDir, { recursive: true });
const results = [];
for (const group of backendGroups) {
  const ids = group.map(step => step.id);
  console.log(`[backend-isolated] START ${ids.join(', ')}`);
  const result = await runLoggedStep([
    'firebase', 'emulators:exec', '--non-interactive',
    '--only', 'auth,firestore,storage,functions', '--project', 'we3d-staging-20260712',
    `node scripts/verification/backend-release.mjs --stages=${ids.join(',')}`
  ], { cwd: process.cwd(), env: process.env,
    logPath: path.join(outputDir, `${ids[0]}.log`), timeoutMs: 600_000 });
  results.push({ stages: ids, ...result });
  if (!result.ok) break;
}
const report = {
  ok: results.length === backendGroups.length && results.every(result => result.ok),
  completeGate: true,
  contract: 'world-explorer-backend-release-v2',
  stageCount: backendSteps.length, outputDir, results
};
writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
