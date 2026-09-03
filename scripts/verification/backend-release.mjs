import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { runLoggedStep } from './run-logged-step.mjs';

for (const variable of ['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST']) {
  if (!String(process.env[variable] || '').trim()) {
    throw new Error(`backend-release must run inside Firebase emulators: missing ${variable}`);
  }
}

const steps = [
  { id: 'firestore-rules', command: [process.execPath, '--test', 'tests/firestore.rules.security.test.mjs'] },
  { id: 'discovery-receipts', command: [process.execPath, '--test', 'tests/discovery-receipt-endpoint-current.test.mjs'] },
  { id: 'public-user-count', command: [process.execPath, 'scripts/verification/public-user-count-backend-current.mjs'] },
  { id: 'connected-property-backend', command: [process.execPath, 'scripts/verification/connected-property-backend-current.mjs'] },
  { id: 'urban-civic-backend', command: [process.execPath, 'scripts/verification/urban-civic-backend-current.mjs'] },
  { id: 'shared-expedition', command: [process.execPath, 'scripts/verification/interstellar-shared.mjs'] },
  { id: 'connected-property-multiplayer', command: [process.execPath, 'scripts/verification/connected-property-multiplayer-current.mjs'] },
  { id: 'multiplayer', command: [process.execPath, 'scripts/verification/multiplayer.mjs'] },
  { id: 'account-backend', command: [process.execPath, 'scripts/verification/account-backend-current.mjs'] },
];

const requestedStart = String(process.env.WE3D_BACKEND_FROM || '').trim();
const requestedIndex = requestedStart ? steps.findIndex((step) => step.id === requestedStart) : 0;
if (requestedStart && requestedIndex < 0) {
  throw new Error(`Unknown backend resume step: ${requestedStart}`);
}
const selectedSteps = steps.slice(Math.max(0, requestedIndex));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.join('/tmp', 'worldexplorer3d-verification', 'backend-release', runId);
mkdirSync(outputDir, { recursive: true });
const results = [];

for (const step of selectedSteps) {
  console.log(`[backend-release] START ${step.id}`);
  const result = await runLoggedStep(step.command, {
    cwd: process.cwd(),
    env: { ...process.env, ...(step.environment || {}) },
    logPath: path.join(outputDir, `${step.id}.log`)
  });
  const record = {
    id: step.id,
    ok: result.ok,
    durationMs: result.durationMs,
    status: result.status,
    signal: result.signal,
    error: result.error
  };
  results.push(record);
  console.log(`[backend-release] ${record.ok ? 'PASS' : 'FAIL'} ${step.id} (${record.durationMs} ms)`);
  if (!record.ok) break;
}

const report = {
  ok: results.length === selectedSteps.length && results.every((entry) => entry.ok),
  contract: 'world-explorer-backend-release-v1',
  resumedFrom: requestedStart || null,
  completeGate: requestedStart === '',
  artifactRoot: String(process.env.WE3D_VERIFY_ROOT || ''),
  outputDir,
  results
};
writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
