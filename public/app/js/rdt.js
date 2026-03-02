// ============================================================================
// rdt.js - Recursive Division Tree (RDT) algorithm and seeded random utilities
// Provides deterministic, location-based complexity indexing and pseudo-random
// number generation for consistent procedural content across sessions.
//
// Research provenance:
// - Reid, S. (2025). Recursive Division Tree: A Log-Log Algorithm for Integer Depth.
//   https://doi.org/10.5281/zenodo.18012166
// - Reid, S. (2025). RGE-256: A New ARX-Based Pseudorandom Number Generator With
//   Structured Entropy and Empirical Validation.
//   https://doi.org/10.5281/zenodo.17982804
//
// Current runtime uses deterministic xorshift32 helpers for seeded randomness and
// keeps Math.random fallbacks in some modules for compatibility. The documented
// roadmap is to migrate those fallback paths to an optimized deterministic custom
// PRNG pipeline derived from RGE-256-oriented work.
// ============================================================================
import { ctx as appCtx } from "./shared-context.js?v=55";

// ===== RDT-noise constants (validated against github.com/RRG314/rdt-noise) =====
const RDT_NOISE_RPHI = 12.0;
const RDT_NOISE_RDELTA = 6.0 * Math.sqrt(6.0);
const RDT_NOISE_PHI = Number.parseFloat('1.6180339887498948');
const RDT_NOISE_GOLDEN_RATIO_INV = 0x9E3779B9 >>> 0;
const RDT_NOISE_INIT_STATE = new Uint32Array([
  0x243F6A88, 0x85A308D3, 0x13198A2E, 0x03707344,
  0xA4093822, 0x299F31D0, 0x082EFA98, 0xEC4E6C89,
  0x452821E6, 0x38D01377, 0xBE5466CF, 0x34E90C6C,
  0xC0AC29B7, 0xC97C50DD, 0x3F84D5B5, 0xB5470917
]);
const RDT_NOISE_VARIANTS = Object.freeze([
  'standard',
  'double',
  'split',
  'harmonic',
  'twisted',
  'resonant'
]);
const RDT_NOISE_DEFAULTS = Object.freeze({
  scale: 0.055,
  octaves: 2,
  lacunarity: 2,
  gain: 0.52,
  depth: 4,
  variant: 'standard',
  chaos: 0
});
const RDT_NOISE_CELL_CACHE_LIMIT = 220000;
const _rdtNoiseCellCache = new Map();
let rdtNoiseEnabled = true;
let rdtNoiseVariant = RDT_NOISE_DEFAULTS.variant;
let rdtNoiseChaos = RDT_NOISE_DEFAULTS.chaos;

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function smoothstep01(t) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function normalizeNoiseVariant(variant) {
  const value = String(variant || '').trim().toLowerCase();
  return RDT_NOISE_VARIANTS.includes(value) ? value : 'standard';
}

function normalizeNoiseChaos(v) {
  return clamp01(Number(v));
}

function rotl32(x, n) {
  const value = x >>> 0;
  const shift = n & 31;
  return (value << shift | value >>> 32 - shift) >>> 0;
}

function mix32(x) {
  let n = x >>> 0;
  n ^= n >>> 16;
  n = Math.imul(n, 0x7feb352d) >>> 0;
  n ^= n >>> 15;
  n = Math.imul(n, 0x846ca68b) >>> 0;
  n ^= n >>> 16;
  return n >>> 0;
}

function clearRdtNoiseCaches() {
  _rdtNoiseCellCache.clear();
}

function _setCellCache(key, value) {
  if (_rdtNoiseCellCache.size > RDT_NOISE_CELL_CACHE_LIMIT) {
    _rdtNoiseCellCache.clear();
  }
  _rdtNoiseCellCache.set(key, value);
}

function _noiseCoupling(variant, left, right, prevWord, i) {
  switch (variant) {
    case 'double': {
      const c1 = left[i] ^ right[i];
      const c2 = left[i + 4 & 7] ^ right[i + 4 & 7];
      return (c1 + c2) >>> 0;
    }
    case 'split':
      return i % 2 === 0 ? (left[i] + right[i]) >>> 0 : (left[i] ^ right[i]) >>> 0;
    case 'harmonic':
      return (left[i] ^ right[i]) % 65521 >>> 0;
    case 'twisted':
      return (left[i] ^ right[7 - i & 7]) >>> 0;
    case 'resonant':
      return (left[i] ^ right[i] ^ prevWord) >>> 0;
    case 'standard':
    default:
      return (left[i] ^ right[i]) >>> 0;
  }
}

function _initializeRdtNoiseState(seed, cellX, cellZ, channel = 0) {
  const state = new Uint32Array(16);
  const sx = cellX | 0;
  const sz = cellZ | 0;
  const sc = channel | 0;
  const base = seed >>> 0;
  for (let i = 0; i < 16; i++) {
    const mixed = mix32(base ^
    Math.imul(sx + i * 17, 0x9e3779b1) ^
    Math.imul(sz - i * 29, 0x85ebca6b) ^
    Math.imul(sc + i * 7, 0xc2b2ae35));
    state[i] = (RDT_NOISE_INIT_STATE[i] ^ mixed) >>> 0;
  }
  return state;
}

function _runRdtNoiseRounds(seed, state, depth, variant, chaos) {
  const rounds = Math.max(1, Math.min(8, Math.floor(depth || 4)));
  let F = new Uint32Array(state);
  let Fprev = new Uint32Array(state);

  const left = new Uint32Array(8);
  const right = new Uint32Array(8);
  const delta = new Uint32Array(16);
  const energy = new Uint32Array(16);
  const phase = new Uint32Array(16);
  const next = new Uint32Array(16);
  const rphiInt = Math.floor(RDT_NOISE_RPHI);
  const rdeltaInt = Math.floor(RDT_NOISE_RDELTA);
  const chaosMask = Math.floor(clamp01(chaos) * 255) & 0xFF;

  for (let n = 0; n < rounds; n++) {
    for (let i = 0; i < 8; i++) {
      left[i] = F[i];
      right[i] = F[i + 8];
    }

    for (let i = 0; i < 16; i++) {
      const diff = (F[i] - Fprev[i]) >>> 0;
      const grad = (Fprev[i + 1 & 15] - Fprev[i]) >>> 0;
      const phiTerm = Math.floor(grad / RDT_NOISE_PHI) >>> 0;
      delta[i] = (diff + phiTerm) >>> 0;
    }

    for (let i = 0; i < 8; i++) {
      const coupling = _noiseCoupling(variant, left, right, Fprev[i], i);
      energy[i] = (Math.imul(rphiInt, Fprev[i]) + Math.imul(rdeltaInt, delta[i]) + coupling) >>> 0;
      energy[i + 8] = (Math.imul(rphiInt, Fprev[i + 8]) + Math.imul(rdeltaInt, delta[i + 8]) + coupling) >>> 0;
    }

    for (let i = 0; i < 16; i++) {
      const sinTerm = Math.sin(energy[i] / RDT_NOISE_RDELTA);
      const cosTerm = Math.cos(energy[i] / RDT_NOISE_RPHI);
      const phaseValue = sinTerm + cosTerm;
      phase[i] = (Math.floor((phaseValue + 2) * 0.25 * 31) & 31) >>> 0;
    }

    for (let i = 0; i < 16; i++) {
      const rot = (phase[i] + n * 17 + i * 23) & 31;
      const rotated = rotl32(energy[i], rot);
      next[i] = (Fprev[i] ^ rotated) >>> 0;
    }

    if (chaosMask > 0) {
      for (let i = 0; i < 16; i++) {
        const noiseByte = mix32(seed ^ n ^ i ^ next[i]) & 0xFF;
        next[i] = (next[i] ^ (noiseByte & chaosMask)) >>> 0;
      }
    }

    for (let i = 0; i < 16; i++) {
      // Keep in-place behavior to match the reference algorithm's ordering.
      next[i] = (next[i + 1 & 15] ^ RDT_NOISE_GOLDEN_RATIO_INV) >>> 0;
    }

    Fprev = F;
    F = new Uint32Array(next);
  }

  return F;
}

function _stateToUnitValue(state, byteOffset = 0) {
  const idx = byteOffset & 63;
  const wordIndex = idx >>> 2 & 15;
  const byteShift = (idx & 3) * 8;
  const byteValue = state[wordIndex] >>> byteShift & 0xFF;
  return byteValue / 255;
}

function sampleRdtCellValue(cellX, cellZ, options = {}) {
  const seed = Number.isFinite(options.seed) ? options.seed >>> 0 : (rdtSeed >>> 0) ^ 0x5a11c0de;
  const depth = Number.isFinite(options.depth) ? options.depth : RDT_NOISE_DEFAULTS.depth;
  const variant = normalizeNoiseVariant(options.variant || rdtNoiseVariant);
  const chaos = normalizeNoiseChaos(options.chaos ?? rdtNoiseChaos);
  const channel = Number.isFinite(options.channel) ? options.channel | 0 : 0;
  const cx = cellX | 0;
  const cz = cellZ | 0;
  const key = `${seed}|${depth}|${variant}|${chaos.toFixed(4)}|${channel}|${cx}|${cz}`;
  const cached = _rdtNoiseCellCache.get(key);
  if (cached != null) return cached;

  const state0 = _initializeRdtNoiseState(seed, cx, cz, channel);
  const state = _runRdtNoiseRounds(seed, state0, depth, variant, chaos);
  const mixed = (
  _stateToUnitValue(state, 0) +
  _stateToUnitValue(state, 11) +
  _stateToUnitValue(state, 37) +
  _stateToUnitValue(state, 53)) * 0.25;
  _setCellCache(key, mixed);
  return mixed;
}

function sampleRdtField2D(worldX, worldZ, options = {}) {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return 0.5;
  const seed = Number.isFinite(options.seed) ? options.seed >>> 0 : rdtSeed >>> 0;
  const scale = Number.isFinite(options.scale) ? Math.max(1e-6, Math.abs(options.scale)) : RDT_NOISE_DEFAULTS.scale;
  const octaves = Number.isFinite(options.octaves) ? Math.max(1, Math.min(6, Math.floor(options.octaves))) : RDT_NOISE_DEFAULTS.octaves;
  const lacunarity = Number.isFinite(options.lacunarity) ? Math.max(1.05, options.lacunarity) : RDT_NOISE_DEFAULTS.lacunarity;
  const gain = Number.isFinite(options.gain) ? Math.max(0.05, Math.min(0.98, options.gain)) : RDT_NOISE_DEFAULTS.gain;
  const depth = Number.isFinite(options.depth) ? options.depth : RDT_NOISE_DEFAULTS.depth;
  const variant = normalizeNoiseVariant(options.variant || rdtNoiseVariant);
  const chaos = normalizeNoiseChaos(options.chaos ?? rdtNoiseChaos);
  const channel = Number.isFinite(options.channel) ? options.channel | 0 : 0;

  let frequency = 1;
  let amplitude = 1;
  let sum = 0;
  let weight = 0;

  for (let octave = 0; octave < octaves; octave++) {
    const sx = worldX * scale * frequency + octave * 73.123;
    const sz = worldZ * scale * frequency - octave * 39.417;
    const x0 = Math.floor(sx);
    const z0 = Math.floor(sz);
    const tx = sx - x0;
    const tz = sz - z0;

    const v00 = sampleRdtCellValue(x0, z0, { seed, depth, variant, chaos, channel: channel + octave * 11 });
    const v10 = sampleRdtCellValue(x0 + 1, z0, { seed, depth, variant, chaos, channel: channel + octave * 11 });
    const v01 = sampleRdtCellValue(x0, z0 + 1, { seed, depth, variant, chaos, channel: channel + octave * 11 });
    const v11 = sampleRdtCellValue(x0 + 1, z0 + 1, { seed, depth, variant, chaos, channel: channel + octave * 11 });

    const ix0 = v00 + (v10 - v00) * smoothstep01(tx);
    const ix1 = v01 + (v11 - v01) * smoothstep01(tx);
    const v = ix0 + (ix1 - ix0) * smoothstep01(tz);
    sum += v * amplitude;
    weight += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  if (weight <= 1e-8) return 0.5;
  return sum / weight;
}

function sampleRdtRoadEdgeOffset(worldX, worldZ, halfWidth, roadSeed = 0, options = {}) {
  if (!rdtNoiseEnabled) return 0;
  const seed = Number.isFinite(options.seed) ? options.seed >>> 0 : (rdtSeed ^ (roadSeed >>> 0)) >>> 0;
  const variant = normalizeNoiseVariant(options.variant || rdtNoiseVariant);
  const edgeA = sampleRdtField2D(worldX, worldZ, {
    seed,
    variant,
    scale: Number.isFinite(options.scaleA) ? options.scaleA : 0.065,
    octaves: Number.isFinite(options.octavesA) ? options.octavesA : 2,
    depth: Number.isFinite(options.depth) ? options.depth : 4,
    channel: 17
  });
  const edgeB = sampleRdtField2D(worldX + 13.73, worldZ - 7.31, {
    seed: seed ^ 0x6a09e667,
    variant,
    scale: Number.isFinite(options.scaleB) ? options.scaleB : 0.21,
    octaves: 1,
    depth: Number.isFinite(options.depth) ? options.depth : 3,
    channel: 71
  });
  const signed = (edgeA * 0.72 + edgeB * 0.28) * 2 - 1;
  const maxOffset = Number.isFinite(options.maxOffset) ?
  Math.abs(options.maxOffset) :
  Math.min(0.9, Math.max(0.06, Math.abs(halfWidth || 0) * 0.18));
  return signed * maxOffset;
}

function sampleRoadGrassExclusionMask(worldX, worldZ, options = {}) {
  if (!rdtNoiseEnabled) {
    return { mask: 1, distanceMask: 1, detail: 0.5, roadDist: Infinity, roadHalfWidth: 0 };
  }
  const nearestRoad = typeof appCtx.findNearestRoad === 'function' ?
  appCtx.findNearestRoad(worldX, worldZ) :
  { road: null, dist: Infinity };
  if (!nearestRoad || !nearestRoad.road || !Number.isFinite(nearestRoad.dist)) {
    return { mask: 1, distanceMask: 1, detail: 0.5, roadDist: Infinity, roadHalfWidth: 0 };
  }

  const roadPadding = Number.isFinite(options.roadPadding) ? Math.max(0, options.roadPadding) : 0.8;
  const fadeWidth = Number.isFinite(options.fadeWidth) ? Math.max(0.2, options.fadeWidth) : 8;
  const roadHalfWidth = (Number.isFinite(nearestRoad.road.width) ? nearestRoad.road.width * 0.5 : 4) + roadPadding;
  const distanceFromRoadEdge = nearestRoad.dist - roadHalfWidth;
  const distanceMask = smoothstep01(distanceFromRoadEdge / fadeWidth);

  const variant = normalizeNoiseVariant(options.variant || rdtNoiseVariant);
  const roadSeed = Number.isFinite(options.roadSeed) ? options.roadSeed >>> 0 : mix32(rdtSeed ^ Math.floor(roadHalfWidth * 100));
  const detail = sampleRdtField2D(worldX, worldZ, {
    seed: roadSeed,
    variant,
    scale: Number.isFinite(options.scale) ? options.scale : 0.09,
    octaves: Number.isFinite(options.octaves) ? options.octaves : 2,
    depth: Number.isFinite(options.depth) ? options.depth : 4,
    channel: 103
  });
  const detailScale = Number.isFinite(options.detailScale) ? options.detailScale : 0.56;
  const detailGain = 1 - detailScale * 0.5 + detail * detailScale;
  const mask = clamp01(distanceMask * detailGain);
  return {
    mask,
    distanceMask,
    detail,
    roadDist: nearestRoad.dist,
    roadHalfWidth
  };
}

function setRdtNoiseEnabled(enabled) {
  rdtNoiseEnabled = !!enabled;
  return rdtNoiseEnabled;
}

function setRdtNoiseVariant(variant) {
  const normalized = normalizeNoiseVariant(variant);
  if (normalized !== rdtNoiseVariant) {
    rdtNoiseVariant = normalized;
    clearRdtNoiseCaches();
  }
  return rdtNoiseVariant;
}

function setRdtNoiseChaos(chaos) {
  const normalized = normalizeNoiseChaos(chaos);
  if (Math.abs(normalized - rdtNoiseChaos) > 1e-9) {
    rdtNoiseChaos = normalized;
    clearRdtNoiseCaches();
  }
  return rdtNoiseChaos;
}

function getRdtNoiseConfig() {
  return {
    enabled: rdtNoiseEnabled,
    variant: rdtNoiseVariant,
    chaos: rdtNoiseChaos,
    constants: {
      Rphi: RDT_NOISE_RPHI,
      Rdelta: RDT_NOISE_RDELTA
    }
  };
}

// ===== RDT (Recursive Division Tree) depth =====
// Iterative log-based division depth measure of an integer magnitude.
// Returns a stable "complexity level" integer for any positive input.
// alpha controls the divisor growth rate (default 1.5).
function rdtDepth(n, alpha = 1.5) {
  n = Math.floor(Math.abs(n));
  if (!Number.isFinite(n) || n < 2) return 0;
  let x = n,k = 0;

  while (x > 1) {
    const ln = Math.log(x);
    let d = Math.floor(Math.pow(ln, alpha));
    if (d < 2) d = 2;

    const nx = Math.floor(x / d);
    if (nx <= 0 || nx === x) break;
    x = nx;
    k++;
    if (k > 1000) break;
  }
  return k;
}

// ===== Stable geo hash =====
// Converts lat/lon (and optional extra discriminator) into a 32-bit positive int.
// Suitable as input to rdtDepth or as a seed for deterministic random.
function hashGeoToInt(lat, lon, extra = 0) {
  const a = Math.floor((lat + 90) * 1e6);
  const b = Math.floor((lon + 180) * 1e6);
  let h = (a ^ b * 2654435761 ^ extra * 97531) >>> 0;
  // Murmur-style mix
  h ^= h >>> 16;h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

// ===== Seeded pseudo-random [0,1) from integer =====
// xorshift32-based, fast and deterministic. Same input always yields same output.
function rand01FromInt(x) {
  x = (x | 0) >>> 0;
  x ^= x << 13;x >>>= 0;
  x ^= x >>> 17;x >>>= 0;
  x ^= x << 5;x >>>= 0;
  return (x >>> 0) / 4294967296;
}

// ===== Seeded random sequence generator =====
// Creates a function that returns successive pseudo-random [0,1) values
// from a given seed. Each call advances the internal state.
function seededRandom(seed) {
  let s = (seed | 0) >>> 0;
  if (s === 0) s = 1;
  return function () {
    s ^= s << 13;s >>>= 0;
    s ^= s >>> 17;s >>>= 0;
    s ^= s << 5;s >>>= 0;
    return (s >>> 0) / 4294967296;
  };
}

// ===== Global RDT state =====
// Updated each time loadRoads() runs; available to all modules.
let rdtSeed = 0; // hashGeoToInt result for current location
let rdtComplexity = 0; // rdtDepth result for current location

// ===== Self-test: canonical test vectors from the RDT paper =====
// These run once on load and log a warning if the math is wrong.
(function rdtSelfTest() {
  const tests = [
  { n: 1260, expected: 5 }, // chain: 1260→66→8→4→2→1, divisors: [19,8,2,2,2]
  { n: 2, expected: 1 }, // 2→1
  { n: 4, expected: 2 }, // 4→2→1
  { n: 1, expected: 0 }, // below threshold
  { n: 0, expected: 0 } // below threshold
  ];
  for (const t of tests) {
    const got = rdtDepth(t.n, 1.5);
    if (got !== t.expected) {
      console.error('[RDT] Self-test FAILED: rdtDepth(' + t.n + ') = ' + got + ', expected ' + t.expected);
    }
  }
})();

// ===== Self-test: RDT-noise constants + determinism =====
(function rdtNoiseSelfTest() {
  if (Math.abs(RDT_NOISE_RPHI - 12) > 1e-12) {
    console.error('[RDT] Noise constant mismatch for RPHI:', RDT_NOISE_RPHI);
  }
  const expectedRdelta = 6 * Math.sqrt(6);
  if (Math.abs(RDT_NOISE_RDELTA - expectedRdelta) > 1e-12) {
    console.error('[RDT] Noise constant mismatch for RDELTA:', RDT_NOISE_RDELTA, 'expected', expectedRdelta);
  }
  const a = sampleRdtCellValue(10, 20, { seed: 123456789, depth: 4, variant: 'standard', chaos: 0 });
  const b = sampleRdtCellValue(10, 20, { seed: 123456789, depth: 4, variant: 'standard', chaos: 0 });
  if (Math.abs(a - b) > 1e-12) {
    console.error('[RDT] Noise determinism self-test FAILED: repeated sample differs', a, b);
  }
  const c = sampleRdtCellValue(10, 20, { seed: 123456789, depth: 4, variant: 'twisted', chaos: 0 });
  if (Math.abs(a - c) < 1e-7) {
    console.warn('[RDT] Noise variant self-test warning: standard and twisted sampled too similarly at probe point');
  }
})();

function exposeMutableGlobal(name, getter, setter) {
  Object.defineProperty(appCtx, name, {
    configurable: true,
    enumerable: true,
    get: getter,
    set: setter
  });
}

exposeMutableGlobal('rdtSeed', () => rdtSeed, (v) => {
  const next = Number.isFinite(Number(v)) ? Math.floor(Number(v)) >>> 0 : 0;
  if (next !== rdtSeed) {
    rdtSeed = next;
    clearRdtNoiseCaches();
  }
});
exposeMutableGlobal('rdtComplexity', () => rdtComplexity, (v) => {rdtComplexity = v;});
exposeMutableGlobal('rdtNoiseEnabled', () => rdtNoiseEnabled, (v) => {setRdtNoiseEnabled(v);});
exposeMutableGlobal('rdtNoiseVariant', () => rdtNoiseVariant, (v) => {setRdtNoiseVariant(v);});
exposeMutableGlobal('rdtNoiseChaos', () => rdtNoiseChaos, (v) => {setRdtNoiseChaos(v);});
Object.assign(appCtx, {
  RDT_NOISE_DEFAULTS,
  RDT_NOISE_VARIANTS,
  clearRdtNoiseCaches,
  getRdtNoiseConfig,
  hashGeoToInt,
  rand01FromInt,
  rdtDepth,
  sampleRdtCellValue,
  sampleRdtField2D,
  sampleRdtRoadEdgeOffset,
  sampleRoadGrassExclusionMask,
  seededRandom,
  setRdtNoiseChaos,
  setRdtNoiseEnabled,
  setRdtNoiseVariant
});

export {
  hashGeoToInt,
  rand01FromInt,
  rdtNoiseEnabled,
  rdtNoiseVariant,
  rdtComplexity,
  rdtDepth,
  rdtSeed,
  sampleRdtField2D,
  sampleRdtRoadEdgeOffset,
  sampleRoadGrassExclusionMask,
  setRdtNoiseChaos,
  setRdtNoiseEnabled,
  setRdtNoiseVariant,
  seededRandom };
