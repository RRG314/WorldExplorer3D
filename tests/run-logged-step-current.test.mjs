import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runLoggedStep } from '../scripts/verification/run-logged-step.mjs';

test('logged steps retain successful output and exit status', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'we3d-runner-'));
  try {
    const logPath = path.join(dir, 'output.log');
    const result = await runLoggedStep([process.execPath, '-e', "console.log('completed')"], { logPath });
    assert.equal(result.ok, true);
    assert.equal(result.timedOut, false);
    assert.match(readFileSync(logPath, 'utf8'), /completed/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('timeout kills an owned detached child holding the output pipe', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'we3d-runner-'));
  const pidPath = path.join(dir, 'child.pid');
  let detachedPid;
  try {
    const descendant = `process.on('SIGTERM',()=>{}); require('node:fs').writeFileSync(${JSON.stringify(pidPath)}, String(process.pid)); setInterval(()=>{},1000);`;
    const parent = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{detached:true,stdio:'inherit'}); setInterval(()=>{},1000);`;
    const result = await runLoggedStep([process.execPath, '-e', parent], { logPath: path.join(dir, 'timeout.log'), timeoutMs: 1000 });
    detachedPid = Number(readFileSync(pidPath, 'utf8'));
    assert.equal(result.ok, false);
    assert.equal(result.timedOut, true);
    assert.ok(result.durationMs < 6000, `deadline escaped: ${result.durationMs}ms`);
    // SIGKILL delivery and OS reaping can finish just after the runner resolves.
    let alive = true;
    for (let attempt = 0; attempt < 40 && alive; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 25));
      try { process.kill(detachedPid, 0); } catch { alive = false; }
    }
    assert.equal(alive, false, 'owned detached descendant survived timeout cleanup');
  } finally {
    if (detachedPid) { try { process.kill(detachedPid, 'SIGKILL'); } catch {} }
    rmSync(dir, { recursive: true, force: true });
  }
});
