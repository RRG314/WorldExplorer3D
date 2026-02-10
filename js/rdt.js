// ============================================================================
// rdt.js - Recursive Division Tree (RDT) algorithm and RGE256ctr PRNG
// Provides deterministic, location-based complexity indexing and pseudo-random
// number generation for consistent procedural content across sessions.
//
// PRNG: RGE256ctr — 256-bit ARX-based counter PRNG (non-cryptographic).
// Ported from the C reference implementation (rge256ctr.c / rge256ctr.h).
// ============================================================================

// ===== RGE256ctr PRNG (JavaScript port) =====
// 256-bit key, 64-bit counter, 64-bit nonce, 16-word (64-byte) output block.
// Uses 12 ARX rounds (6 double-rounds) with ChaCha-style quarter-round.

const RGE256ctr = (function() {
    // 32-bit left rotate
    function rotl32(x, r) {
        return ((x << r) | (x >>> (32 - r))) >>> 0;
    }

    // ChaCha-style quarter-round on a 16-word state array
    function qr(x, a, b, c, d) {
        x[a] = (x[a] + x[b]) >>> 0;  x[d] ^= x[a];  x[d] = rotl32(x[d], 16);
        x[c] = (x[c] + x[d]) >>> 0;  x[b] ^= x[c];  x[b] = rotl32(x[b], 12);
        x[a] = (x[a] + x[b]) >>> 0;  x[d] ^= x[a];  x[d] = rotl32(x[d],  8);
        x[c] = (x[c] + x[d]) >>> 0;  x[b] ^= x[c];  x[b] = rotl32(x[b],  7);
    }

    // "expand 32-byte k" constants
    const CONSTANTS = [0x61707865, 0x3320646E, 0x79622D32, 0x6B206574];

    function createState(seed, nonce) {
        seed  = (seed  | 0) >>> 0;
        nonce = (nonce | 0) >>> 0;  // JS port: nonce is 32-bit (low word)

        return {
            key: new Uint32Array([
                seed,
                0x9E3779B9,
                0x243F6A88,
                0xB7E15162,
                0xC6EF3720,
                0xDEADBEEF,
                0xA5A5A5A5,
                0x01234567
            ]),
            counterLo: 0,
            counterHi: 0,
            nonceLo: nonce,
            nonceHi: 0,
            buf: new Uint32Array(16),
            bufUsed: 16   // force refill on first use
        };
    }

    function refill(s) {
        const st = new Uint32Array(16);
        const w  = new Uint32Array(16);

        // Set constants
        st[0] = CONSTANTS[0];
        st[1] = CONSTANTS[1];
        st[2] = CONSTANTS[2];
        st[3] = CONSTANTS[3];

        // Set key
        for (let i = 0; i < 8; i++) st[4 + i] = s.key[i];

        // Set counter (64-bit)
        st[12] = s.counterLo;
        st[13] = s.counterHi;

        // Increment counter
        s.counterLo = (s.counterLo + 1) >>> 0;
        if (s.counterLo === 0) s.counterHi = (s.counterHi + 1) >>> 0;

        // Set nonce (64-bit)
        st[14] = s.nonceLo;
        st[15] = s.nonceHi;

        // Copy initial state
        for (let i = 0; i < 16; i++) w[i] = st[i];

        // 12 ARX rounds (6 double-rounds)
        for (let i = 0; i < 6; i++) {
            // Column rounds
            qr(w, 0, 4,  8, 12);
            qr(w, 1, 5,  9, 13);
            qr(w, 2, 6, 10, 14);
            qr(w, 3, 7, 11, 15);
            // Diagonal rounds
            qr(w, 0, 5, 10, 15);
            qr(w, 1, 6, 11, 12);
            qr(w, 2, 7,  8, 13);
            qr(w, 3, 4,  9, 14);
        }

        // Final addition
        for (let i = 0; i < 16; i++) {
            s.buf[i] = (w[i] + st[i]) >>> 0;
        }

        s.bufUsed = 0;
    }

    function nextU32(s) {
        if (s.bufUsed >= 16) refill(s);
        return s.buf[s.bufUsed++];
    }

    // Return [0, 1)
    function nextFloat(s) {
        return (nextU32(s) >>> 0) / 4294967296;
    }

    return { createState, nextU32, nextFloat };
})();


// ===== RDT (Recursive Division Tree) depth =====
// Iterative log-based division depth measure of an integer magnitude.
// Returns a stable "complexity level" integer for any positive input.
// alpha controls the divisor growth rate (default 1.5).
function rdtDepth(n, alpha = 1.5) {
    n = Math.floor(Math.abs(n));
    if (!Number.isFinite(n) || n < 2) return 0;
    let x = n, k = 0;

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
    let h = (a ^ (b * 2654435761) ^ (extra * 97531)) >>> 0;
    // Murmur-style mix
    h ^= h >>> 16; h = Math.imul(h, 2246822507) >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
}

// ===== RGE256ctr-backed single-value hash [0,1) from integer =====
// Drop-in replacement for the old xorshift32 rand01FromInt.
// Runs one full ARX block to produce a high-quality output from any input.
function rand01FromInt(x) {
    const s = RGE256ctr.createState((x | 0) >>> 0, 0);
    return RGE256ctr.nextFloat(s);
}

// ===== RGE256ctr-backed seeded random sequence generator =====
// Drop-in replacement for the old xorshift32 seededRandom.
// Creates a function that returns successive pseudo-random [0,1) values.
function seededRandom(seed) {
    const s = RGE256ctr.createState((seed | 0) >>> 0, 0);
    return function() {
        return RGE256ctr.nextFloat(s);
    };
}

// ===== Global RDT state =====
// Updated each time loadRoads() runs; available to all modules.
let rdtSeed = 0;       // hashGeoToInt result for current location
let rdtComplexity = 0;  // rdtDepth result for current location

// ===== Self-test: canonical test vectors from the RDT paper =====
// These run once on load and log a warning if the math is wrong.
(function rdtSelfTest() {
    const tests = [
        { n: 1260, expected: 5 },  // chain: 1260→66→8→4→2→1, divisors: [19,8,2,2,2]
        { n: 2,    expected: 1 },  // 2→1
        { n: 4,    expected: 2 },  // 4→2→1
        { n: 1,    expected: 0 },  // below threshold
        { n: 0,    expected: 0 },  // below threshold
    ];
    for (const t of tests) {
        const got = rdtDepth(t.n, 1.5);
        if (got !== t.expected) {
            console.error('[RDT] Self-test FAILED: rdtDepth(' + t.n + ') = ' + got + ', expected ' + t.expected);
        }
    }
})();

// ===== RGE256ctr self-test =====
// Verify the JS port produces deterministic output for a known seed.
(function rge256ctrSelfTest() {
    const s1 = RGE256ctr.createState(123456789, 0);
    const v1 = RGE256ctr.nextU32(s1);
    const v2 = RGE256ctr.nextU32(s1);

    // Same seed must give same sequence
    const s2 = RGE256ctr.createState(123456789, 0);
    const w1 = RGE256ctr.nextU32(s2);
    const w2 = RGE256ctr.nextU32(s2);

    if (v1 !== w1 || v2 !== w2) {
        console.error('[RGE256ctr] Self-test FAILED: non-deterministic output');
    }
    // Different seeds must differ
    const s3 = RGE256ctr.createState(987654321, 0);
    const x1 = RGE256ctr.nextU32(s3);
    if (x1 === v1) {
        console.error('[RGE256ctr] Self-test WARNING: different seeds produced same first output');
    }

    // seededRandom wrapper must work
    const rng = seededRandom(42);
    const a = rng(), b = rng();
    if (a === b || a < 0 || a >= 1 || b < 0 || b >= 1) {
        console.error('[RGE256ctr] Self-test FAILED: seededRandom out of range or stuck');
    }
})();
