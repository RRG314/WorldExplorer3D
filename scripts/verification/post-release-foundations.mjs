import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { runLoggedStep } from './run-logged-step.mjs';

// Focused source/component journeys supplement the separate immutable campaign
// and ocean gates. One browser process at a time; no synthetic full-game claim.
const scripts = [
  'local-possessions', 'personal-workspace', 'creative-storage-current',
  'coastal-departure-current', 'journey-journal-current',
  'ocean-cetaceans-current', 'facility-world-integration-current'
];
const out = 'output/verification/post-release-foundations';
await mkdir(out, { recursive: true });
const report = { ok: false, scope: 'Current source components and controlled browser journeys; immutable full-game acceptance is recorded separately.', results: [] };
const env = { ...process.env };
delete env.WE3D_VERIFY_ROOT;
delete env.WE3D_VERIFY_BASE_URL;
try {
  for (const name of scripts) {
    const result = await runLoggedStep([process.execPath, `scripts/verification/${name}.mjs`], {
      cwd: process.cwd(), env, logPath: `${out}/${name}.log`, timeoutMs: 240000
    });
    report.results.push({ name, ...result });
    assert.ok(result.ok, `${name} failed; inspect its bounded evidence before retrying`);
  }
  report.ok = true;
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n');
}
