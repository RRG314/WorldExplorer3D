// @ts-check
// Accept a bounded interval. Backlog beyond this frame's simulation capacity is
// deliberately discarded; presentation and network leases have separate clocks.
/** @param {number} elapsed @param {number} capacity @param {number} [remainder] */
export function acceptedSimulationDelta(elapsed, capacity = 1 / 30, remainder = 0) {
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;
  return Math.max(0, Math.min(elapsed, capacity - Math.max(0, remainder)));
}

/** Keep the original 60 Hz response while making it independent of cadence.
 * @param {number} blendAt60Hz @param {number} seconds */
export function frameDamping(blendAt60Hz, seconds) {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, blendAt60Hz)), Math.max(0, seconds) * 60);
}
