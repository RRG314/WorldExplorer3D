import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const rootDir = process.cwd();

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // Server startup is bounded below.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Preview server did not become ready: ${url}`);
}

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'we3d-candidate-'));
const candidateId = '4.1.4+0123456789ab.abcdef0123456789.staging';
await fs.mkdir(path.join(temporaryRoot, 'app'), { recursive: true });
await fs.writeFile(path.join(temporaryRoot, 'app', 'index.html'), '<!doctype html><title>candidate</title>', 'utf8');
await fs.writeFile(path.join(temporaryRoot, 'app', 'runtime.js'), 'globalThis.candidateRuntime = true;\n', 'utf8');
await fs.writeFile(path.join(temporaryRoot, 'build-manifest.json'), JSON.stringify({
  schemaVersion: 2,
  buildId: candidateId,
  candidateId
}), 'utf8');

const port = await availablePort();
const child = spawn(process.execPath, ['scripts/serve-local-preview.mjs'], {
  cwd: rootDir,
  env: { ...process.env, PORT: String(port), WE3D_PREVIEW_ROOT: temporaryRoot },
  stdio: ['ignore', 'pipe', 'pipe']
});

try {
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(`${baseUrl}/app/`);
  const accepted = await fetch(`${baseUrl}/app/?candidate=${encodeURIComponent(candidateId)}`);
  const mismatched = await fetch(`${baseUrl}/app/?candidate=stale-label`);
  const runtime = await fetch(`${baseUrl}/app/runtime.js?candidate=${encodeURIComponent(candidateId)}`);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers.get('x-worldexplorer-candidate'), candidateId);
  assert.equal(mismatched.status, 409);
  assert.equal(runtime.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  console.log(JSON.stringify({
    ok: true,
    contract: 'immutable-local-candidate-identity',
    candidateId,
    mismatchedCandidateRejected: true,
    immutableAssets: true
  }, null, 2));
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
