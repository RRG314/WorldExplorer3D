import { prepare, preparePacked, runJs, createWasm } from './profile-benchmark.js';
let input, wasm;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init' || data.type === 'initPacked') {
      input = data.type === 'initPacked' ? preparePacked(data.data,data.packedQueries) : prepare(data.records);
      if (data.wasmUrl) wasm = await createWasm(input, data.wasmUrl);
      postMessage({ ready: true, wasmCold: wasm?.cold });return;
    }
    const start = performance.now();
    const output = data.type === 'wasm' ? wasm.run(false, data.recopy) : runJs(input, true);
    postMessage({ output, workerComputeMs: performance.now() - start }, [output.buffer]);
  } catch (error) { postMessage({ error: error.message }); }
};
