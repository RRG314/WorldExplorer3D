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
import { ctx as appCtx } from "./shared-context.js?v=54";

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

function exposeMutableGlobal(name, getter, setter) {
  Object.defineProperty(appCtx, name, {
    configurable: true,
    enumerable: true,
    get: getter,
    set: setter
  });
}

exposeMutableGlobal('rdtSeed', () => rdtSeed, (v) => {rdtSeed = v;});
exposeMutableGlobal('rdtComplexity', () => rdtComplexity, (v) => {rdtComplexity = v;});
Object.assign(appCtx, { rdtDepth, hashGeoToInt, rand01FromInt, seededRandom });

export {
  hashGeoToInt,
  rand01FromInt,
  rdtComplexity,
  rdtDepth,
  rdtSeed,
  seededRandom };