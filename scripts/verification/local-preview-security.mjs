import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {startStaticServer} from './static-server.mjs';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'we3d-preview-security-'));
const root = path.join(temp, 'site');
const checks = [];
let child, server;
const get = (port, pathname, headers = {}) => new Promise((resolve, reject) => {
  const request = http.get({hostname:'127.0.0.1', port, path:pathname, headers}, response => {
    let body = ''; response.setEncoding('utf8'); response.on('data', chunk => body += chunk);
    response.on('end', () => resolve({status:response.statusCode, body, headers:response.headers}));
  });
  request.on('error', reject); request.setTimeout(5000, () => request.destroy(Error('Probe timeout')));
});
async function verify(port, name) {
  for (const [url, headers, expected] of [
    ['/', {}, 200], ['/app/asset.js', {}, 200], ['/missing.txt', {}, 404],
    ['/.env', {}, 403], ['/functions/.env', {}, 403], ['/.git/HEAD', {}, 403],
    ['/output/private.json', {}, 403], ['/external.txt', {}, 403], ['/alias.txt', {}, 403],
    ['/%2e%2e%2foutside.txt', {}, 403], ['/%00', {}, 400], ['/%XX', {}, 400],
    ['/', {Host:`attacker.invalid:${port}`}, 403], ['/', {Origin:'https://attacker.invalid'}, 403],
    ['/', {'Sec-Fetch-Site':'cross-site'}, 403], ['/', {Origin:`http://localhost:${port}`}, 200]
  ]) {
    const result = await get(port, url, headers);
    assert.equal(result.status, expected, `${name}: ${url} status`);
    assert.ok(!result.body.includes('PRIVATE_TEST_CONTENT'), `${name}: private content leaked`);
    assert.ok(!result.body.includes(temp), `${name}: local path leaked`);
    if (expected === 200) assert.equal(result.headers['x-content-type-options'], 'nosniff');
    checks.push({server:name, path:url, expected, passed:true});
  }
}
try {
  await fs.mkdir(path.join(root, 'app'), {recursive:true});
  await fs.mkdir(path.join(root, 'functions')); await fs.mkdir(path.join(root, '.git')); await fs.mkdir(path.join(root, 'output'));
  for (const file of ['.env','functions/.env','.git/HEAD','output/private.json']) await fs.writeFile(path.join(root,file),'PRIVATE_TEST_CONTENT');
  await fs.writeFile(path.join(temp, 'outside.txt'), 'PRIVATE_TEST_CONTENT');
  await fs.symlink(path.join(temp, 'outside.txt'), path.join(root, 'external.txt'));
  await fs.symlink(path.join(root, '.env'), path.join(root, 'alias.txt'));
  await fs.writeFile(path.join(root, 'index.html'), '<!doctype html><title>Public test fixture</title>');
  await fs.writeFile(path.join(root, 'app/asset.js'), 'export const publicAsset = true;');
  await fs.writeFile(path.join(root, 'build-manifest.json'), JSON.stringify({candidateId:'security-test',buildId:'security-test'}));
  server = await startStaticServer({rootDir:root, ports:[0]});
  await verify(server.port, 'verification'); await server.close(); server = null;
  child = spawn(process.execPath, ['scripts/serve-local-preview.mjs'], {env:{...process.env, PORT:'0', WE3D_PREVIEW_ROOT:root}, stdio:['ignore','pipe','pipe']});
  const port = await new Promise((resolve,reject) => {
    const timer=setTimeout(()=>reject(Error('Owned preview startup timeout')),10000);let log='';
    child.stdout.on('data', data => {log+=data; const match=log.match(/http:\/\/127\.0\.0\.1:(\d+)\//);if(match){clearTimeout(timer);resolve(Number(match[1]));}});
    child.once('exit', () => {clearTimeout(timer);reject(Error('Owned preview exited before ready'));});
  });
  await verify(port, 'local-preview');
  await fs.mkdir('output/verification/security', {recursive:true});
  await fs.writeFile('output/verification/security/local-preview.json', JSON.stringify({passed:true,checks},null,2));
  console.log(JSON.stringify({passed:true,checks:checks.length,scope:'Both actual HTTP servers; synthetic files, no player data or external services'}));
} finally {
  if (server) await server.close();
  if (child && child.exitCode === null) {const exited=once(child,'exit');child.kill('SIGTERM');await exited;}
  await fs.rm(temp, {recursive:true,force:true});
}
