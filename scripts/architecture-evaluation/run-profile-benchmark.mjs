import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { startStaticServer } from '../verification/static-server.mjs';
const root = process.cwd(), out = 'output/architecture-evaluation/profile-benchmark';
await mkdir(out, { recursive: true });
const inputPath = 'output/architecture-evaluation/transport-input-capture/transport-profiles.json';
const inputHash = createHash('sha256').update(await readFile(inputPath)).digest('hex');
const server = await startStaticServer({ rootDir: root, ports: [4493, 4494] });
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: false });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}/scripts/architecture-evaluation/service-lifecycle.html`);
  const result = await page.evaluate(async (inputPath) => {
    const { prepare, runJs, createWasm, compare } = await import('/scripts/architecture-evaluation/profile-benchmark.js');
    const source = await (await fetch(`/${inputPath}`)).json();
    const prepareStart = performance.now(), input = prepare(source.records), prepareMs = performance.now() - prepareStart;
    const wasmUrl = new URL('/output/architecture-evaluation/rust-build/wasm32-unknown-unknown/release/we3d_profile_experiment.wasm', location.href).href;
    const wasm = await createWasm(input, wasmUrl), expected = runJs(input);
    const checks = { optimizedJs: compare(expected, runJs(input, true)), wasmScalar: compare(expected, wasm.run(true)), wasmBatch: compare(expected, wasm.run()) };
    const cases = {
      currentJs: () => runJs(input), optimizedJs: () => runJs(input, true),
      wasmScalarResident: () => wasm.run(true), wasmBatchResident: () => wasm.run(), wasmBatchCopyInputs: () => wasm.run(false, true)
    };
    const timings = Object.fromEntries(Object.keys(cases).map(k => [k, []]));
    let checksum = 0;
    for (let round = 0; round < 35; round++) {
      // Rotate case order; discard five warm-up rounds, retain output reads.
      const keys = Object.keys(cases), offset = round % keys.length;
      for (let i = 0; i < keys.length; i++) {
        const key = keys[(i + offset) % keys.length], start = performance.now(), values = cases[key]();
        const elapsed = performance.now() - start;checksum += values[round % values.length];
        if (round >= 5) timings[key].push(elapsed);
      }
    }
    const workers = {};
    for (const variant of ['js', 'wasm', 'js-packed-transfer', 'wasm-packed-transfer']) {
      const type=variant.startsWith('wasm')?'wasm':'js', packed=variant.includes('packed');
      const start = performance.now(), worker = new Worker('/scripts/architecture-evaluation/profile-benchmark-worker.js', { type: 'module' });
      const send = (message,transfer=[]) => new Promise((resolve, reject) => {
        worker.onmessage = ({ data }) => data.error ? reject(Error(data.error)) : resolve(data);
        worker.onerror = event => reject(Error(event.message));worker.postMessage(message,transfer);
      });
      try {
        // Main still owns its input. Count the copies required to retain it before transferring.
        const dataCopy=packed?input.data.slice():null,queryCopy=packed?input.packedQueries.slice():null;
        const init = await send(packed ? { type:'initPacked', data:dataCopy, packedQueries:queryCopy, wasmUrl:type==='wasm'?wasmUrl:null } : { type: 'init', records: source.records, wasmUrl: type === 'wasm' ? wasmUrl : null },packed?[dataCopy.buffer,queryCopy.buffer]:[]);
        const coldMs = performance.now() - start, roundTrips = [], compute = [];
        for (let round = 0; round < 35; round++) {
          const before = performance.now(), reply = await send({ type }), elapsed = performance.now() - before;
          if (round === 0) checks[`${variant}Worker`] = compare(expected, reply.output);
          if (round >= 5) { roundTrips.push(elapsed);compute.push(reply.workerComputeMs); }
        }
        workers[variant] = { coldMs, wasmCold: init.wasmCold, roundTrips, compute, transport: packed?'initial copy of used numeric buffers plus transfer; resident input; transferred output':'initial cloned full source records; resident input; transferred output', outputBytes: expected.byteLength };
      } finally { worker.terminate(); }
    }
    const lengths = input.profiles.map(p => p.distances.length).sort((a,b) => a-b);
    const result = { userAgent: navigator.userAgent, prepareMs, profiles: input.profiles.length, samples: input.data.length / 2,
      queries: input.queries.length, profileLengths: { median: lengths[lengths.length >> 1], p95: lengths[Math.floor(lengths.length * .95)], max: lengths.at(-1) },
      inputBytes: input.data.byteLength, queryBytes: input.packedQueries.byteLength, outputBytes: expected.byteLength,
      wasmCold: wasm.cold, timings, workers, checks, checksum,
      scope: 'Component replay on compiled Baltimore records. Ten deterministic distances per road, not observed player call frequency. Timings include output allocation/copy and JS/Wasm calls. Resident queries intentionally isolate throughput; copy-input variant includes copying prepacked buffers, not rebuilding profiles. Worker cold includes source cloning, preparation and Wasm startup. No FPS conclusion.' };
    wasm.dispose();return result;
  }, inputPath);
  result.inputSha256 = inputHash; result.source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  await writeFile(`${out}/report.json`, JSON.stringify(result, null, 2) + '\n');
  const median = a => [...a].sort((a,b)=>a-b)[a.length >> 1];
  console.log(JSON.stringify({ checks: result.checks, queries: result.queries, cold: result.wasmCold, mediansMs: Object.fromEntries(Object.entries(result.timings).map(([k,v])=>[k,median(v)])), workers: Object.fromEntries(Object.entries(result.workers).map(([k,v])=>[k,{coldMs:v.coldMs,medianRoundTripMs:median(v.roundTrips)}])) }, null, 2));
} finally { await browser?.close(); await server.close(); }
