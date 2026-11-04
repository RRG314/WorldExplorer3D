// @ts-check
// Accommodate ordinary 20–60 Hz display intervals while limiting catch-up to
// three fixed updates. Longer stalls still discard debt on the current frame.
export const WORLD_SIMULATION_CLOCK = Object.freeze({
  fixedDelta: 1 / 60,
  maxDelta: 0.1,
  maxFixedSteps: 3,
});

// Accept a bounded interval. Backlog beyond this frame's simulation capacity is
// deliberately discarded; presentation and network leases have separate clocks.
/** @param {number} elapsed @param {number} capacity */
export function acceptedSimulationDelta(elapsed, capacity = 1 / 30) {
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;
  // The fixed accumulator retains less than one fixed step, not additional
  // catch-up debt. Subtracting it here shortened normal 30 Hz frames following
  // a 60 Hz frame, making variable-step actors visibly alternate their pace.
  return Math.max(0, Math.min(elapsed, capacity));
}

/** Keep the original 60 Hz response while making it independent of cadence.
 * @param {number} blendAt60Hz @param {number} seconds */
export function frameDamping(blendAt60Hz, seconds) {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, blendAt60Hz)), Math.max(0, seconds) * 60);
}
