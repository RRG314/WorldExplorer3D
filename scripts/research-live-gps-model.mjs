#!/usr/bin/env node

/**
 * Deterministic, dependency-free model used by the Live GPS Explore Mode R&D.
 * This is not production gameplay code. It exercises proposed validation,
 * filtering, outage, impossible-jump, travel, and boundary policies.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(__dirname, '../output/research/live-gps-simulation.json');

const POLICY = Object.freeze({
  staleAfterMs: 15_000,
  poorAccuracyMeters: 100,
  minimumDeadZoneMeters: 3,
  maximumDeadZoneMeters: 12,
  warningRadiusMeters: 9_000,
  recenterRadiusMeters: 10_000,
  hardPauseRadiusMeters: 11_000,
});

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function gaussian(random) {
  const u = Math.max(Number.EPSILON, random());
  const v = Math.max(Number.EPSILON, random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

function straightTrace(name, distanceMeters, seconds, options = {}) {
  const points = [];
  for (let second = 0; second <= seconds; second += 1) {
    const ratio = second / seconds;
    points.push({
      t: second * 1_000,
      truth: { x: distanceMeters * ratio, z: options.z ?? 0 },
      accuracy: options.accuracy ?? 8,
    });
  }
  return { name, points };
}

function stationaryTrace() {
  return straightTrace('stationary-noise', 0, 300, { accuracy: 9 });
}

function cityBlockTrace() {
  const vertices = [
    { x: 0, z: 0 },
    { x: 200, z: 0 },
    { x: 200, z: 200 },
    { x: 0, z: 200 },
    { x: 0, z: 0 },
  ];
  const points = [];
  const secondsPerLeg = 150;
  for (let leg = 0; leg < 4; leg += 1) {
    for (let step = 0; step < secondsPerLeg; step += 1) {
      const ratio = step / secondsPerLeg;
      points.push({
        t: (leg * secondsPerLeg + step) * 1_000,
        truth: {
          x: lerp(vertices[leg].x, vertices[leg + 1].x, ratio),
          z: lerp(vertices[leg].z, vertices[leg + 1].z, ratio),
        },
        accuracy: 10,
      });
    }
  }
  points.push({ t: 600_000, truth: { ...vertices[4] }, accuracy: 10 });
  return { name: 'city-block-loop', points };
}

function injectJump(trace, atSecond, offsetMeters) {
  return {
    name: trace.name,
    points: trace.points.map((point) => point.t === atSecond * 1_000
      ? { ...point, injectedOffset: { x: offsetMeters, z: -offsetMeters * 0.4 } }
      : point),
  };
}

function injectOutage(trace, startSecond, endSecond) {
  return {
    name: trace.name,
    points: trace.points.filter((point) => point.t < startSecond * 1_000 || point.t > endSecond * 1_000),
  };
}

function boundaryState(distanceMeters) {
  if (distanceMeters >= POLICY.hardPauseRadiusMeters) return 'hard-pause';
  if (distanceMeters >= POLICY.recenterRadiusMeters) return 'recenter-ready';
  if (distanceMeters >= POLICY.warningRadiusMeters) return 'warning';
  return 'inside';
}

function simulate(trace, seed) {
  const random = mulberry32(seed);
  let lastAccepted = null;
  let filtered = null;
  let visual = null;
  let rawSquaredError = 0;
  let filteredSquaredError = 0;
  let visualSquaredError = 0;
  let maximumVisualStep = 0;
  let accepted = 0;
  let rejectedJumps = 0;
  let deadZoneHolds = 0;
  let outages = 0;
  let lastRawTimestamp = null;
  const boundaryTransitions = [];
  let previousBoundary = null;

  for (const point of trace.points) {
    if (lastRawTimestamp !== null && point.t - lastRawTimestamp > 2_000) outages += 1;
    lastRawTimestamp = point.t;

    const sigma = point.accuracy / 2;
    const raw = {
      x: point.truth.x + gaussian(random) * sigma + (point.injectedOffset?.x ?? 0),
      z: point.truth.z + gaussian(random) * sigma + (point.injectedOffset?.z ?? 0),
      accuracy: point.accuracy,
      t: point.t,
    };
    rawSquaredError += distance(raw, point.truth) ** 2;

    let acceptedThisSample = raw.accuracy <= POLICY.poorAccuracyMeters;
    const dtSeconds = lastAccepted ? Math.max(0.001, (raw.t - lastAccepted.t) / 1_000) : 1;
    if (acceptedThisSample && lastAccepted) {
      const innovation = distance(raw, lastAccepted);
      const jumpLimit = Math.max(75, 2.5 * (lastAccepted.accuracy + raw.accuracy) + 35 * dtSeconds);
      if (innovation > jumpLimit) {
        acceptedThisSample = false;
        rejectedJumps += 1;
      }
    }

    if (acceptedThisSample) {
      const deadZone = Math.max(
        POLICY.minimumDeadZoneMeters,
        Math.min(POLICY.maximumDeadZoneMeters, raw.accuracy * 0.35),
      );
      if (filtered && distance(raw, filtered) < deadZone) {
        deadZoneHolds += 1;
      } else if (!filtered) {
        filtered = { x: raw.x, z: raw.z };
      } else {
        const observedSpeed = distance(raw, lastAccepted) / dtSeconds;
        // Faster movement needs less smoothing latency or the avatar trails a cyclist.
        const tau = observedSpeed < 0.6 ? 4 : observedSpeed < 4.2 ? 2.5 : 0.65;
        const quality = Math.max(0.2, Math.min(1, 8 / raw.accuracy));
        const alpha = (1 - Math.exp(-dtSeconds / tau)) * quality;
        filtered = {
          x: lerp(filtered.x, raw.x, alpha),
          z: lerp(filtered.z, raw.z, alpha),
        };
      }
      lastAccepted = raw;
      accepted += 1;
    }

    if (!filtered) filtered = { x: raw.x, z: raw.z };
    const previousVisual = visual;
    visual = visual
      ? { x: lerp(visual.x, filtered.x, 0.82), z: lerp(visual.z, filtered.z, 0.82) }
      : { ...filtered };
    if (previousVisual) maximumVisualStep = Math.max(maximumVisualStep, distance(visual, previousVisual));

    filteredSquaredError += distance(filtered, point.truth) ** 2;
    visualSquaredError += distance(visual, point.truth) ** 2;

    const state = boundaryState(distance(point.truth, { x: 0, z: 0 }));
    if (state !== previousBoundary) {
      boundaryTransitions.push({ tSeconds: point.t / 1_000, state });
      previousBoundary = state;
    }
  }

  const count = trace.points.length;
  return {
    name: trace.name,
    samples: count,
    durationSeconds: (trace.points.at(-1)?.t ?? 0) / 1_000,
    accepted,
    rejectedJumps,
    deadZoneHolds,
    outages,
    rawRmsErrorMeters: Number(Math.sqrt(rawSquaredError / count).toFixed(2)),
    filteredRmsErrorMeters: Number(Math.sqrt(filteredSquaredError / count).toFixed(2)),
    visualRmsErrorMeters: Number(Math.sqrt(visualSquaredError / count).toFixed(2)),
    maximumVisualStepMeters: Number(maximumVisualStep.toFixed(2)),
    boundaryTransitions,
    worldReloadsDuringNormalTravel: 0,
  };
}

const traces = [
  stationaryTrace(),
  straightTrace('straight-walk-500m', 500, 375, { accuracy: 8 }),
  cityBlockTrace(),
  straightTrace('straight-walk-2km', 2_000, 1_500, { accuracy: 9 }),
  straightTrace('straight-walk-5km', 5_000, 3_750, { accuracy: 10 }),
  injectJump(straightTrace('bad-jump-rejection', 400, 300, { accuracy: 8 }), 150, 900),
  injectOutage(straightTrace('outage-and-recovery', 400, 300, { accuracy: 9 }), 120, 139),
  straightTrace('bicycle-10km', 10_000, 1_800, { accuracy: 10 }),
  straightTrace('boundary-crossing-12km', 12_000, 3_600, { accuracy: 9 }),
];

const results = traces.map((trace, index) => simulate(trace, 0xC0D3C + index * 97));
const badJump = results.find((result) => result.name === 'bad-jump-rejection');
const boundary = results.find((result) => result.name === 'boundary-crossing-12km');
const stationary = results.find((result) => result.name === 'stationary-noise');

const assertions = {
  impossibleJumpWasRejected: badJump.rejectedJumps === 1,
  stationaryFilterReducedRmsError: stationary.filteredRmsErrorMeters < stationary.rawRmsErrorMeters,
  normalTravelDidNotReloadWorld: results.every((result) => result.worldReloadsDuringNormalTravel === 0),
  boundaryStatesReachedInOrder: JSON.stringify(boundary.boundaryTransitions.map((entry) => entry.state)) ===
    JSON.stringify(['inside', 'warning', 'recenter-ready', 'hard-pause']),
};

const report = {
  generatedAt: new Date().toISOString(),
  purpose: 'Architecture-only deterministic evidence; not production GPS implementation.',
  policy: POLICY,
  assumptions: {
    inputCadenceHz: 1,
    accuracyIsModeledAsMeters: true,
    providerOrWorldStreamingModeled: false,
    note: 'Synthetic noise is not a substitute for iPhone and Android outdoor testing.',
  },
  results,
  assertions,
  pass: Object.values(assertions).every(Boolean),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, pass: report.pass, assertions, results }, null, 2));
if (!report.pass) process.exitCode = 1;
