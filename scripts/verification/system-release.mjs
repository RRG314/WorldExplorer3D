import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { runLoggedStep } from './run-logged-step.mjs';
import { currentBaseline, evidencePath } from './execution-evidence.mjs';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const config = JSON.parse(readFileSync(path.join(root, 'config/system-release-gates.json'), 'utf8'));
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const shouldRun = process.argv.includes('--run');
const scopeArg = process.argv.find((arg) => arg.startsWith('--scope='));
const requestedScope = scopeArg ? scopeArg.slice('--scope='.length) : 'candidate';
const gateArg = process.argv.find((arg) => arg.startsWith('--gate='));
const requestedGates = new Set(gateArg ? gateArg.slice('--gate='.length).split(',').filter(Boolean) : []);
const freshExecution = process.argv.includes('--fresh');
const failures = [];

if (config.schemaVersion !== 1) failures.push('schemaVersion must be 1');
if (config.targetVersion !== packageJson.version) failures.push(`targetVersion must match package version ${packageJson.version}`);

const documentHeadings = new Set();
for (const [file, headings] of Object.entries(config.documents || {})) {
  const source = readFileSync(path.join(root, file), 'utf8');
  for (const heading of headings) {
    if (!new RegExp(`^##?\\s+${heading.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*$`, 'mi').test(source)) {
      failures.push(`${file} is missing heading: ${heading}`);
    }
    documentHeadings.add(heading);
  }
}

const coveredHeadings = new Set();
for (const system of config.systems || []) {
  if (!String(system.id || '').trim()) failures.push('system entry is missing id');
  if (!Array.isArray(system.assertions) || system.assertions.length === 0) failures.push(`${system.id} has no current assertions`);
  if (!Array.isArray(system.gates) || system.gates.length === 0) failures.push(`${system.id} has no executable gates`);
  for (const heading of system.documents || []) coveredHeadings.add(heading);
  for (const gateId of system.gates || []) {
    if (!config.gates?.[gateId]) failures.push(`${system.id} references missing gate ${gateId}`);
  }
}
for (const heading of documentHeadings) {
  if (!coveredHeadings.has(heading)) failures.push(`document heading has no system coverage: ${heading}`);
}

const selected = Object.entries(config.gates || {}).filter(([id, gate]) =>
  gate.scope === requestedScope && (requestedGates.size === 0 || requestedGates.has(id))
);
if (requestedGates.size > 0) {
  for (const id of requestedGates) if (!config.gates?.[id]) failures.push(`unknown requested gate: ${id}`);
}
if (selected.length === 0) failures.push(`no gates selected for scope ${requestedScope}`);

const artifactRoot = String(process.env.WE3D_VERIFY_ROOT || 'dist').trim() || 'dist';
if (shouldRun && selected.some(([, gate]) => gate.artifactRequired)) {
  for (const required of ['build-manifest.json', 'app/index.html']) {
    if (!existsSync(path.resolve(root, artifactRoot, required))) failures.push(`immutable artifact is missing ${artifactRoot}/${required}`);
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, contract: 'world-explorer-system-release-v1', failures }, null, 2));
  process.exit(1);
}

if (!shouldRun) {
  console.log(JSON.stringify({
    ok: true,
    contract: 'world-explorer-system-release-v1',
    targetVersion: config.targetVersion,
    scope: requestedScope,
    systemCount: config.systems.length,
    gateCount: selected.length,
    gates: selected.map(([id, gate]) => ({ id, artifactRequired: gate.artifactRequired, command: gate.command }))
  }, null, 2));
  process.exit(0);
}

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.join('/tmp', 'worldexplorer3d-verification', 'system-release', runId);
mkdirSync(outputDir, { recursive: true });
const results = [];
const startedAt = new Date().toISOString();
const baseline = currentBaseline(root);
const artifactServer = shouldRun && selected.some(([, gate]) => gate.artifactRequired)
  ? await startStaticServer({ rootDir: path.resolve(root, artifactRoot), ports: [4481, 4482, 4483] })
  : null;
const verificationEnvironment = {
  ...process.env,
  WE3D_VERIFY_ROOT: artifactRoot,
  ...(artifactServer ? { WE3D_VERIFY_BASE_URL: `http://127.0.0.1:${artifactServer.port}` } : {})
};

function gateEvidencePath(id) {
  return path.join(root, 'output', 'release-evidence', 'current', 'gates', requestedScope, `${id}.json`);
}

function reusableGateEvidence(id, gate) {
  if (freshExecution) return null;
  const target = gateEvidencePath(id);
  if (!existsSync(target)) return null;
  try {
    const prior = JSON.parse(readFileSync(target, 'utf8'));
    if (prior.contract !== 'world-explorer-gate-evidence-v1' || prior.ok !== true) return null;
    if (prior.baseline?.headCommit !== baseline.headCommit ||
      prior.baseline?.workspaceFingerprint !== baseline.workspaceFingerprint) return null;
    if (JSON.stringify(prior.command) !== JSON.stringify(gate.command)) return null;
    return prior;
  } catch {
    return null;
  }
}

function writeGateEvidence(id, gate, record) {
  const target = gateEvidencePath(id);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify({
    schemaVersion: 1,
    contract: 'world-explorer-gate-evidence-v1',
    targetVersion: config.targetVersion,
    scope: requestedScope,
    id,
    command: gate.command,
    baseline,
    completedAt: new Date().toISOString(),
    ...record,
    reused: false
  }, null, 2)}\n`, 'utf8');
}

try {
  for (const [id, gate] of selected) {
    const prior = reusableGateEvidence(id, gate);
    if (prior) {
      const record = {
        id,
        ok: true,
        durationMs: Number(prior.durationMs || 0),
        status: 0,
        signal: '',
        error: '',
        reused: true,
        completedAt: prior.completedAt
      };
      results.push(record);
      console.log(`[system-release] REUSE ${id} (current baseline, ${record.durationMs} ms)`);
      continue;
    }
    console.log(`[system-release] START ${id} (${results.length + 1}/${selected.length})`);
    const result = await runLoggedStep(gate.command, {
      cwd: root,
      env: verificationEnvironment,
      logPath: path.join(outputDir, `${id}.log`),
      timeoutMs: gate.timeoutMs
    });
    const record = {
      id,
      ok: result.ok,
      durationMs: result.durationMs,
      status: result.status,
      signal: result.signal,
      error: result.error,
      timedOut: result.timedOut,
      reused: false
    };
    results.push(record);
    writeGateEvidence(id, gate, record);
    console.log(`[system-release] ${record.ok ? 'PASS' : 'FAIL'} ${id} (${record.durationMs} ms)`);
    if (!record.ok) break;
  }
} finally {
  await artifactServer?.close?.();
}

const report = {
  ok: results.length === selected.length && results.every((entry) => entry.ok),
  contract: 'world-explorer-system-release-v1',
  targetVersion: config.targetVersion,
  scope: requestedScope,
  artifactRoot,
  artifactBaseUrl: artifactServer ? `http://127.0.0.1:${artifactServer.port}` : null,
  outputDir,
  startedAt,
  completedAt: new Date().toISOString(),
  baseline,
  results
};
const isCompleteScope = requestedGates.size === 0;
if (isCompleteScope) {
  const completedBaseline = currentBaseline(root);
  const stableBaseline = completedBaseline.headCommit === baseline.headCommit &&
    completedBaseline.workspaceFingerprint === baseline.workspaceFingerprint;
  const executionEvidence = {
    schemaVersion: 1,
    contract: 'world-explorer-execution-evidence-v1',
    targetVersion: config.targetVersion,
    scope: requestedScope,
    ok: report.ok && stableBaseline,
    baseline,
    completedBaseline,
    artifactRoot,
    startedAt,
    completedAt: report.completedAt,
    outputDir,
    results,
    failures: stableBaseline ? [] : ['the source working tree changed while the matrix was running']
  };
  const currentEvidencePath = evidencePath(root, requestedScope);
  mkdirSync(path.dirname(currentEvidencePath), { recursive: true });
  writeFileSync(currentEvidencePath, `${JSON.stringify(executionEvidence, null, 2)}\n`, 'utf8');
  if (!stableBaseline) report.ok = false;
}
// Write the human-readable run report after the baseline stability decision.
// Previously a tree mutation could correctly fail execution evidence while the
// adjacent report.json still said the run passed.
writeFileSync(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
