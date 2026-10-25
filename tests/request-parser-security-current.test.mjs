import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
test('the installed production request parser includes the compressed-body security fix', () => {
  const [major, minor, patch] = require('body-parser/package.json').version.split('.').map(Number);
  assert.ok(major === 1 && (minor > 20 || minor === 20 && patch >= 9) || major === 2 && minor >= 4 || major > 2);
});
for (const mode of ['normal', 'tail', 'charset']) {
  test(`request parser ${mode} preserves process health and HTTP behavior`, () => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./fixtures/request-parser-child.cjs', import.meta.url)), mode], { encoding: 'utf8', timeout: 6000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const response = JSON.parse(result.stdout.trim());
    assert.equal(response.status, mode === 'charset' ? 415 : 200);
    assert.equal(response.body, mode === 'charset' ? '{"rejected":true}' : '{"parsed":true}');
    assert.equal(response.healthStatus, 200);
    assert.equal(response.healthBody, 'healthy');
  });
}
