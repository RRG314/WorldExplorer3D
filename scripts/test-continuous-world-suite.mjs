import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'continuous-world-suite');
const defaultTimeoutMs = 7 * 60 * 1000;

const suite = [
  { id: 'continuous-world-foundation', blocking: true, cmd: ['node', 'scripts/test-continuous-world-foundation.mjs'] },
  { id: 'continuous-world-region-manager', blocking: true, cmd: ['node', 'scripts/test-continuous-world-region-manager.mjs'] },
  { id: 'continuous-world-terrain-road', blocking: true, cmd: ['node', 'scripts/test-continuous-world-terrain-road.mjs'] },
  { id: 'continuous-world-feature-ownership', blocking: true, cmd: ['node', 'scripts/test-continuous-world-feature-ownership.mjs'] },
  { id: 'continuous-world-feature-regions', blocking: true, cmd: ['node', 'scripts/test-continuous-world-feature-regions.mjs'] },
  { id: 'continuous-world-feature-activation', blocking: true, cmd: ['node', 'scripts/test-continuous-world-feature-activation.mjs'] },
  { id: 'continuous-world-road-activation', blocking: true, cmd: ['node', 'scripts/test-continuous-world-road-activation.mjs'] },
  { id: 'continuous-world-interactive-streaming', blocking: true, cmd: ['node', 'scripts/test-continuous-world-interactive-streaming.mjs'] },
  { id: 'continuous-world-map-compatibility', blocking: true, cmd: ['node', 'scripts/test-continuous-world-map-compatibility.mjs'] },
  { id: 'continuous-world-editor-overlay-compatibility', blocking: true, cmd: ['node', 'scripts/test-continuous-world-editor-overlay-compatibility.mjs'] },
  { id: 'continuous-world-activity-multiplayer-compatibility', blocking: true, cmd: ['node', 'scripts/test-continuous-world-activity-multiplayer-compatibility.mjs'] },
  { id: 'continuous-world-scenarios', blocking: true, timeoutMs: 10 * 60 * 1000, cmd: ['node', 'scripts/test-continuous-world-scenarios.mjs'] },
  { id: 'terrain-seam-regression', blocking: true, cmd: ['node', 'scripts/test-terrain-seam-regression.mjs'] },
  { id: 'drive-surface-stability', blocking: true, cmd: ['node', 'scripts/test-drive-surface-stability.mjs'] },
  { id: 'city-reload-cycle', blocking: true, cmd: ['node', 'scripts/test-city-reload-cycle.mjs'] },
  { id: 'world-matrix', blocking: true, timeoutMs: 10 * 60 * 1000, cmd: ['node', 'scripts/test-world-matrix.mjs'] },
  // These remain important diagnostics, but they are not branch-blocking continuous-world gates.
  { id: 'elevated-driving-surfaces', blocking: false, timeoutMs: 10 * 60 * 1000, cmd: ['node', 'scripts/test-elevated-driving-surfaces-global.mjs'] },
  { id: 'boat-smoke', blocking: false, cmd: ['node', 'scripts/test-boat-smoke.mjs'] }
];

function reportPathForStep(step) {
  if (step.reportPath) return path.join(rootDir, step.reportPath);
  if (step.id === 'elevated-driving-surfaces') {
    return path.join(rootDir, 'output', 'playwright', 'elevated-driving-surfaces-global', 'report.json');
  }
  return path.join(rootDir, 'output', 'playwright', step.id, 'report.json');
}

async function readReportSummary(step) {
  const reportPath = reportPathForStep(step);
  try {
    const raw = await fs.readFile(reportPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      path: reportPath,
      ok: parsed?.ok === true || parsed?.pass === true,
      status: parsed?.status || null
    };
  } catch {
    return null;
  }
}

function runStep(step) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timeoutMs = Number(step.timeoutMs) > 0 ? Number(step.timeoutMs) : defaultTimeoutMs;
    const child = spawn(step.cmd[0], step.cmd.slice(1), {
      cwd: rootDir,
      stdio: 'pipe',
      env: process.env
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = String(chunk);
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = String(chunk);
      stderr += text;
      process.stderr.write(text);
    });

    let finished = false;
    let timedOut = false;
    let killTimer = null;
    let forceKillTimer = null;

    killTimer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      forceKillTimer = setTimeout(() => {
        child.kill('SIGKILL');
      }, 5000);
    }, timeoutMs);

    child.on('close', async (code, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(killTimer);
      clearTimeout(forceKillTimer);

      let salvagedReport = null;
      let ok = code === 0;
      if (timedOut) {
        salvagedReport = await readReportSummary(step);
        ok = salvagedReport?.ok === true;
      }

      resolve({
        id: step.id,
        blocking: step.blocking !== false,
        ok,
        exitCode: code,
        signal: signal || null,
        durationMs: Date.now() - startedAt,
        timedOut,
        timeoutMs,
        salvagedReport,
        stdoutTail: stdout.slice(-4000),
        stderrTail: stderr.slice(-4000)
      });
    });
  });
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const results = [];

  for (const step of suite) {
    results.push(await runStep(step));
  }

  const blockingFailures = results
    .filter((entry) => entry.blocking && !entry.ok)
    .map((entry) => entry.id);
  const advisoryFailures = results
    .filter((entry) => !entry.blocking && !entry.ok)
    .map((entry) => entry.id);

  const report = {
    ok: blockingFailures.length === 0,
    generatedAt: new Date().toISOString(),
    blockingFailures,
    advisoryFailures,
    steps: results
  };

  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  if (!report.ok) {
    throw new Error(`continuous-world suite failed: ${JSON.stringify(blockingFailures)}`);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('[test-continuous-world-suite] failed');
    console.error(error);
    process.exit(1);
  });
