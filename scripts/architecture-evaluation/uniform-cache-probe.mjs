// Isolated locked-renderer cache experiment. Fake GL isolates JS storage;
// this does not measure browser/WebGL bridge costs or game performance.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Session } from 'node:inspector/promises';
assert.equal(typeof globalThis.gc, 'function', 'Run with --expose-gc for this isolated diagnostic');
const source = await readFile('app/vendor/three/build/three.min.js', 'utf8');
const marker = 't.WebGLRenderer=';
assert.equal(source.split(marker).length, 2);
const exported = {};
vm.runInNewContext(source.replace(marker, 't.__UniformProbe=Cr,' + marker), { exports: exported, module: { exports: exported }, console });
assert.equal(exported.REVISION, '128');
const inspector = new Session(); inspector.connect();
const results = [];
try {
  for (const typed of [false, true, false, true]) {
    let uploads = 0;
    const gl = { getProgramParameter: () => 2,
      getActiveUniform: (_, index) => ({ name: index ? 'matrix' : 'direction', type: index ? 35676 : 35665, size: 1 }),
      getUniformLocation: (_, name) => name, uniform3f() { uploads++; }, uniformMatrix4fv() { uploads++; } };
    const uniforms = new exported.__UniformProbe(gl, {}), vector = { x: 0, y: 0, z: 0 }, matrix = new exported.Matrix4();
    const update = i => {
      vector.x = i * .0123; vector.y = i * -.456; vector.z = i * .0029;
      matrix.elements[12] = i * .032; matrix.elements[13] = i * -.009;
      uniforms.map.direction.setValue(gl, vector); uniforms.map.matrix.setValue(gl, matrix);
    };
    update(0);
    if (typed) for (const uniform of uniforms.seq) uniform.cache = Float64Array.from(uniform.cache);
    for (let i = 1; i < 20000; i++) update(i);
    globalThis.gc();
    await inspector.post('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    const started = performance.now();
    for (let i = 20000; i < 520000; i++) update(i);
    const elapsedMs = performance.now() - started;
    const { profile } = await inspector.post('HeapProfiler.stopSampling');
    const nodes = []; let total = 0;
    function visit(node) { total += node.selfSize; nodes.push({ name: node.callFrame.functionName, selfMiB: node.selfSize / 1048576 }); for (const child of node.children) visit(child); }
    visit(profile.head);
    assert.equal(uploads, 1040000);
    results.push({ typed, elapsedMs, uploads, totalMiB: total / 1048576,
      cache: uniforms.seq.map(uniform => ({ name: uniform.id, elements: uniform.cache.length })),
      topSelf: nodes.sort((a, b) => b.selfMiB - a.selfMiB).slice(0, 5) });
  }
} finally { inspector.disconnect(); }
const report = { scope: 'Isolated JS cache probe with fake GL and heap sampling; not active-game acceptance', results };
await writeFile(process.argv[2], JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
