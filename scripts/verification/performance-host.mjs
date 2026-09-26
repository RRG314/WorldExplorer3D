import assert from 'node:assert/strict';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function readPerformanceHost() {
  let model = '';
  if (process.platform === 'darwin') {
    model = execFileSync('sysctl', ['-n', 'hw.model'], { encoding: 'utf8' }).trim();
  }
  return {
    platform: process.platform, architecture: process.arch, model,
    cpu: os.cpus()[0]?.model || '', memoryBytes: os.totalmem(),
    ci: Boolean(process.env.CI || process.env.GITHUB_ACTIONS || process.env.RUNNER_ENVIRONMENT)
  };
}

export function assessPerformanceHost(host) {
  const checks = {
    physicalRun: host.ci === false,
    macOS: host.platform === 'darwin',
    nativeArm: host.architecture === 'arm64',
    declaredMacMini: host.model === 'Macmini9,1',
    declaredChip: host.cpu === 'Apple M1',
    declaredMemory: host.memoryBytes === 8 * 1024 ** 3
  };
  return { ok: Object.values(checks).every(Boolean), host, checks,
    evidenceScope: 'Host eligibility only; this is not a performance measurement.' };
}

export function requirePerformanceHost(host = readPerformanceHost()) {
  const report = assessPerformanceHost(host);
  assert.ok(report.ok, `Performance budgets require the declared physical M1 8 GiB Mac mini, outside CI: ${JSON.stringify(report)}`);
  return report;
}

export function requireHardwareGraphics(renderer) {
  assert.ok(typeof renderer === 'string' && /Apple M1\b/.test(renderer) &&
    !/SwiftShader|llvmpipe|software|virtual/i.test(renderer),
  `Physical performance requires the M1 hardware renderer: ${renderer}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = assessPerformanceHost(readPerformanceHost());
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
