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

import path from 'node:path';
import { canonicalBundledModule, rewritePackagedModuleReference } from '../scripts/lib/runtime-module-identity.mjs';

test('immutable bundles share one module instance across entry and versioned imports', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { pathToFileURL } = await import('node:url');
  const root = await mkdtemp(path.join(tmpdir(), 'we3d-module-identity-'));
  try {
    await writeFile(path.join(root, 'shared.js'), 'export const state = { value: 0 };');
    await writeFile(path.join(root, 'consumer.js'), "export { state } from './shared.js?v=9';");
    const result = await build({absWorkingDir:root,entryPoints:{shared:'shared.js',consumer:'consumer.js'},
      outdir:path.join(root,'dist'),bundle:true,splitting:true,format:'esm',outExtension:{'.js':'.mjs'},metafile:true,
      plugins:[{name:'canonical-version-query',setup(build){build.onResolve({filter:/^\./},args=>{
        const resolved=canonicalBundledModule(args.path,args.resolveDir);return resolved?{path:resolved}:null;
      });}}]});
    const shared = await import(pathToFileURL(path.join(root,'dist/shared.mjs')));
    const consumer = await import(pathToFileURL(path.join(root,'dist/consumer.mjs')));
    shared.state.value=7;
    assert.equal(consumer.state.value,7);
    assert.equal(consumer.state,shared.state);
    assert.equal(Object.keys(result.metafile.inputs).filter(key=>key.split('?')[0]==='shared.js').length,1);
    assert.equal(canonicalBundledModule('./worker.js?worker',root),null);
    assert.equal(canonicalBundledModule('./image.png?v=1',root),null);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('packaged public-page imports follow source versions and reject missing or duplicate owners', () => {
  const sourcePath='../app/js/reality-capture/result-viewer.js';
  for(const suffix of ['', '?v=1', '?v=2', '?v=900']) {
    assert.equal(rewritePackagedModuleReference(`await import('${sourcePath}${suffix}');`,sourcePath,'../app/chunk.js'),
      "await import('../app/chunk.js');");
  }
  assert.throws(()=>rewritePackagedModuleReference('nothing',sourcePath,'chunk'),/found 0/);
  assert.throws(()=>rewritePackagedModuleReference(`import '${sourcePath}'; import '${sourcePath}?v=2';`,sourcePath,'chunk'),/found 2/);
});
