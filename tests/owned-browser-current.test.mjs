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

test('successful browser-parent close also reaps its detached owned descendant', async () => {
  const nested = "process.on('SIGTERM',()=>{}); process.stdout.write(String(process.pid)); setInterval(()=>{},1000)";
  const source = `const c=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(nested)}],{detached:true,stdio:['ignore','pipe','ignore']}); c.stdout.once('data',d=>process.stdout.write(d)); process.on('SIGTERM',()=>process.exit(0)); setInterval(()=>{},1000);`;
  const parent = spawn(process.execPath, ['-e', source], { stdio: ['ignore', 'pipe', 'ignore'] });
  let descendant;
  try {
    descendant = Number((await once(parent.stdout, 'data'))[0].toString());
    await closeOwnedBrowser({ process: () => parent, close: async () => {
      const exited = once(parent, 'exit'); parent.kill('SIGTERM'); await exited;
    } }, 1000, 30);
    let alive = true;
    for (let attempt = 0; attempt < 40 && alive; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 25));
      try { process.kill(descendant, 0); } catch { alive = false; }
    }
    assert.equal(alive, false, 'owned descendant survived a successful parent close');
    assert.doesNotThrow(() => process.kill(process.pid, 0), 'unrelated test process must remain alive');
  } finally {
    if (descendant) { try { process.kill(descendant, 'SIGKILL'); } catch {} }
    if (parent.exitCode === null && !parent.signalCode) parent.kill('SIGKILL');
  }
});
