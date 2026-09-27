// Experiment only: binary lookup for validated, finite, nondecreasing profiles.
// The general runtime sampler remains unchanged.
export function sampleSortedProfile(distances, values, distance) {
  if (!distances.length || !values.length) return NaN;
  if (distance <= 0) return Number.isFinite(values[0]) ? values[0] : NaN;
  const last = Math.min(distances.length, values.length) - 1;
  if (distance >= distances[last]) return Number.isFinite(values[last]) ? values[last] : NaN;
  if (last === 0) return Number.isFinite(values[last]) ? values[last] : NaN;
  let lo = 1, hi = last;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (distances[mid] < distance) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(0, lo - 1), start = distances[i], end = distances[i + 1];
  if (distance < start || distance > end) return Number.isFinite(values[last]) ? values[last] : NaN;
  const span = end - start, t = span > 1e-6 ? (distance - start) / span : 0;
  const from = Number.isFinite(values[i]) ? values[i] : 0;
  const to = Number.isFinite(values[i + 1]) ? values[i + 1] : from;
  return from + (to - from) * t;
}

export function validateSortedProfile(distances, values) {
  if (distances.length !== values.length || !distances.length) throw Error('Invalid profile lengths');
  let previous = -Infinity;
  for (const value of distances) {
    if (!Number.isFinite(value) || value < previous) throw Error('Profile must be finite and nondecreasing');
    previous = value;
  }
}
