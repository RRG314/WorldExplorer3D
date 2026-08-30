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
  { id: 'multiplayer', command: [process.execPath, 'scripts/verification/multiplayer.mjs'] },
  { id: 'creator-flow', command: [process.execPath, 'scripts/verification/creator-flow.mjs'] },
  ...['desktop', 'mobile', 'vehicle', 'room'].map((scope) => ({
    id: `world-editor-blocks-${scope}`,
    command: [process.execPath, 'scripts/verification/world-editor-blocks.mjs'],
    environment: { WE3D_BLOCKS_SCOPE: scope, WE3D_REQUIRE_IMMUTABLE: '1' }
  }))
];

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.join('/tmp', 'worldexplorer3d-verification', 'backend-release', runId);
mkdirSync(outputDir, { recursive: true });
const results = [];

for (const step of steps) {
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
  ok: results.length === steps.length && results.every((entry) => entry.ok),
  contract: 'world-explorer-backend-release-v1',
  artifactRoot: String(process.env.WE3D_VERIFY_ROOT || ''),
  outputDir,
  results
};
writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
