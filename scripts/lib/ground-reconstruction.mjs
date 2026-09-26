// Classification removes observations, not terrain. Reconstruct masked samples
// from their surrounding ground boundary instead of publishing the minimum of
// a large morphological window as an isolated replacement elevation.
export function reconstructClassifiedGround(values, removed, width, height, {
  tolerance = 1e-5,
  maximumIterations = 4000
} = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      values.length !== width * height || removed.length !== values.length) {
    throw new TypeError('complete ground grid and classification mask required');
  }
  const ground = Float64Array.from(values);
  if (ground.some(value => !Number.isFinite(value))) throw new TypeError('ground observations must be finite');
  const unknown = [];
  // Exterior observations lack a surrounding ground boundary. Keep them until
  // a build supplies its context halo; never extrapolate a valley at an edge.
  for (let row = 1; row < height - 1; row++) for (let column = 1; column < width - 1; column++) {
    const index = row * width + column;
    if (removed[index]) unknown.push(index);
  }
  let residual = 0;
  for (let iteration = 0; iteration < maximumIterations; iteration++) {
    residual = 0;
    for (let n = 0; n < unknown.length; n++) {
      const index = unknown[iteration % 2 ? unknown.length - 1 - n : n];
      const next = Math.min(values[index], (ground[index - 1] + ground[index + 1] + ground[index - width] + ground[index + width]) / 4);
      residual = Math.max(residual, Math.abs(next - ground[index]));
      ground[index] = next;
    }
    if (residual <= tolerance) return {ground, iterations: iteration + 1, residual, reconstructedCount: unknown.length};
  }
  throw new Error(`Ground reconstruction did not converge: residual ${residual} metres`);
}
