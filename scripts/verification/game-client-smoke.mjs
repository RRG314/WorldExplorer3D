import { startStaticServer } from './static-server.mjs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// A small, real packaged world checks control/render integration without
// pretending to establish Earth coverage or physical-device performance.
const root = path.resolve(process.env.WE3D_VERIFY_ROOT || 'dist');
const out = 'output/verification/game-client-smoke';
await fs.mkdir(out, { recursive: true });
const manifest = JSON.parse(await fs.readFile(path.join(root, 'build-manifest.json')));
const server = await startStaticServer({ rootDir: root, ports: [4491, 4492] });
try {
  const child = spawn(process.execPath, [
    'scripts/verification/web-game-ready-current.mjs',
    '--url', `http://127.0.0.1:${server.port}/app/?launch=moon&gm=free`,
    '--actions-json', JSON.stringify({ steps: [{ buttons: ['up'], frames: 24 }, { buttons: [], frames: 6 }] }),
    '--click-selector', '#globeSelectorMoonBtn', '--iterations', '2', '--pause-ms', '500', '--screenshot-dir', out
  ], { stdio: 'inherit', env: { ...process.env, WE3D_REAL_GPU: '1', WE3D_TEST_MOBILE: '1', WE3D_TEST_PAUSE: '1', WE3D_EXPECT_ENVIRONMENT: 'MOON', WE3D_TEST_TITLE_AUTH:'1' } });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', value => resolve(value ?? 1));
  });
  assert.equal(code, 0, 'Prescribed game client must complete without browser errors');
  const runtime = JSON.parse(await fs.readFile(`${out}/runtime.json`));
  assert.equal(runtime.worldLoading, false);
  assert.equal(runtime.gameStarted, true);
  assert.equal(runtime.environment, 'MOON');
  const pause = JSON.parse(await fs.readFile(`${out}/pause.json`));
  assert.equal(pause.ok, true);
  const report = { ok: true, buildId: manifest.buildId, evidenceScope: 'packaged Moon gameplay and keyboard pause/resume; not Earth coverage or performance', pause, modes: runtime.modes };
  await fs.writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await server.close();
}
