import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { closeOwnedBrowser, withinDeadline } from '../scripts/verification/owned-browser.mjs';

test('a stalled diagnostic times out and a real error is preserved', async () => {
  await assert.rejects(withinDeadline(() => new Promise(() => {}), 10, 'diagnostic'), /diagnostic exceeded/);
  const original = Error('real browser error');
  await assert.rejects(withinDeadline(() => { throw original; }, 100, 'diagnostic'), error => error === original);
  assert.equal(await withinDeadline(() => 42, 100, 'diagnostic'), 42);
});

test('stuck browser cleanup terminates only its owned child, including when SIGTERM is ignored', async () => {
  const child = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{}); process.stdout.write('ready'); setInterval(()=>{},1000)"], { stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    await once(child.stdout, 'data');
    await closeOwnedBrowser({ process: () => child, close: () => new Promise(() => {}) }, 10, 20);
    assert.equal(child.signalCode, 'SIGKILL');
    assert.ok(process.pid !== child.pid);
  } finally { if (child.exitCode === null && !child.signalCode) child.kill('SIGKILL'); }
});
