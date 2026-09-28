import { sampleProfileAtDistance } from '../../app/js/structure-semantics/geometry.js';
import { sampleSortedProfile, validateSortedProfile } from './transport-profile-prototype.js';

export function prepare(records) {
  const profiles = [], queries = [];
  let elements = 0;
  for (const row of records) {
    const distances = Float64Array.from(row.distances), values = Float64Array.from(row.centerHeights);
    validateSortedProfile(distances, values);
    const offset = elements;
    profiles.push({ distances, values, offset });
    elements += distances.length * 2;
    const last = distances.at(-1);
    // Deterministic coverage replay, not a captured player query-frequency distribution.
    for (const fraction of [-.01, 0, .001, .1, .25, .5, .75, .99, 1, 1.01]) {
      queries.push([profiles.length - 1, last * fraction]);
    }
  }
  const data = new Float64Array(elements), packedQueries = new Float64Array(queries.length * 4);
  for (const p of profiles) { data.set(p.distances, p.offset); data.set(p.values, p.offset + p.distances.length); }
  queries.forEach(([index, distance], i) => {
    const p = profiles[index]; packedQueries.set([p.offset, p.offset + p.distances.length, p.distances.length, distance], i * 4);
  });
  return { profiles, queries, data, packedQueries };
}

export function runJs(input, optimized = false) {
  const out = new Float64Array(input.queries.length), sample = optimized ? sampleSortedProfile : sampleProfileAtDistance;
  for (let i = 0; i < out.length; i++) {
    const [index, distance] = input.queries[i], p = input.profiles[index];
    out[i] = sample(p.distances, p.values, distance);
  }
  return out;
}

export function preparePacked(data, packedQueries) {
  const profiles=[], queries=[], byOffset=new Map();
  for(let i=0;i<packedQueries.length;i+=4){
    const offset=packedQueries[i], valuesOffset=packedQueries[i+1], length=packedQueries[i+2];
    if(!byOffset.has(offset)){
      byOffset.set(offset,profiles.length);
      profiles.push({offset,distances:data.subarray(offset,offset+length),values:data.subarray(valuesOffset,valuesOffset+length)});
    }
    queries.push([byOffset.get(offset),packedQueries[i+3]]);
  }
  return {profiles,queries,data,packedQueries};
}

export async function createWasm(input, url) {
  const start = performance.now();
  const response = await fetch(url); const bytes = await response.arrayBuffer();
  const fetched = performance.now();
  const { instance } = await WebAssembly.instantiate(bytes);
  const compiled = performance.now(), e = instance.exports;
  const dataPtr = e.allocate(input.data.length), queryPtr = e.allocate(input.packedQueries.length), outPtr = e.allocate(input.queries.length);
  // Allocate first: any memory.grow invalidates earlier JS views.
  new Float64Array(e.memory.buffer, dataPtr, input.data.length).set(input.data);
  new Float64Array(e.memory.buffer, queryPtr, input.packedQueries.length).set(input.packedQueries);
  const ready = performance.now();
  return {
    cold: { fetchMs: fetched - start, compileInstantiateMs: compiled - fetched, allocateCopyMs: ready - compiled, totalMs: ready - start, wasmBytes: bytes.byteLength, linearMemoryBytes: e.memory.buffer.byteLength, residentInputBytes: input.data.byteLength + input.packedQueries.byteLength },
    run(scalar = false, recopy = false) {
      if (recopy) {
        new Float64Array(e.memory.buffer, dataPtr, input.data.length).set(input.data);
        new Float64Array(e.memory.buffer, queryPtr, input.packedQueries.length).set(input.packedQueries);
      }
      if (scalar) {
        const out = new Float64Array(input.queries.length);
        input.queries.forEach(([index, distance], i) => {
          const p = input.profiles[index];out[i] = e.sample(dataPtr + p.offset * 8, dataPtr + (p.offset + p.distances.length) * 8, p.distances.length, distance);
        });return out;
      }
      e.batch(dataPtr, queryPtr, outPtr, input.queries.length);
      return new Float64Array(e.memory.buffer, outPtr, input.queries.length).slice();
    },
    dispose() { e.release(dataPtr, input.data.length);e.release(queryPtr, input.packedQueries.length);e.release(outPtr, input.queries.length); }
  };
}

export function compare(expected, actual) {
  if (expected.length !== actual.length) throw Error('Length mismatch');
  let maxAbsoluteError = 0;
  for (let i = 0; i < expected.length; i++) {
    if (Number.isNaN(expected[i]) && Number.isNaN(actual[i])) continue;
    const error = Math.abs(expected[i] - actual[i]);
    if (!Number.isFinite(error) || error > 1e-9) throw Error(`Mismatch at query ${i}: ${expected[i]} versus ${actual[i]}`);
    maxAbsoluteError = Math.max(maxAbsoluteError, error);
  }
  return { matches: true, count: expected.length, maxAbsoluteError };
}
