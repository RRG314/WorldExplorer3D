import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

test('the tunnel worker builds for browsers without Node polyfills and retains local WASM delivery', async () => {
  const result = await build({entryPoints:['app/js/world/compiler/tunnel-solid-worker.js'],
    bundle:true,platform:'browser',format:'esm',write:false,
    external:['/app/vendor/manifold/manifold.js'],logLevel:'silent'});
  const source=result.outputFiles[0].text;
  assert.ok(source.includes('/app/vendor/manifold/manifold.js'));
  assert.ok(source.includes('/app/vendor/manifold/manifold.wasm'));
  assert.equal(source.includes('node:module'),false);
  const binary=await readFile('app/vendor/manifold/manifold.wasm');
  assert.equal(binary.subarray(0,4).toString('hex'),'0061736d');
});
