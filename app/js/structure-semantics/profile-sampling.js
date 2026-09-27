// @ts-check
// Numeric interpolation authority. No renderer, active-world or backend dependency.
// The general entry preserves legacy arbitrary-profile behavior. The sorted entry
// is reserved for finite nondecreasing distances owned by the transport compiler.
/**
 * @param {Float32Array | Float64Array} distances
 * @param {number[] | Float32Array | Float64Array} values
 * @param {number} distance
 * @returns {number}
 */
function sampleProfileAtDistance(distances, values, distance) {
  const numericDistances = distances instanceof Float32Array || distances instanceof Float64Array;
  const numericValues = Array.isArray(values) || values instanceof Float32Array || values instanceof Float64Array;
  if (!numericDistances || !numericValues) return NaN;
  if (distances.length === 0 || values.length === 0) return NaN;
  if (distance <= 0) {
    const first = Number(values[0]);
    return Number.isFinite(first) ? first : NaN;
  }
  const lastIndex = Math.min(distances.length, values.length) - 1;
  if (distance >= distances[lastIndex]) {
    const last = Number(values[lastIndex]);
    return Number.isFinite(last) ? last : NaN;
  }

  for (let i = 0; i < lastIndex; i++) {
    const start = distances[i];
    const end = distances[i + 1];
    if (distance < start || distance > end) continue;
    const span = end - start;
    const t = span > 1e-6 ? (distance - start) / span : 0;
    const rawFrom = Number(values[i]);
    const from = Number.isFinite(rawFrom) ? rawFrom : 0;
    const rawTo = Number(values[i + 1]);
    const to = Number.isFinite(rawTo) ? rawTo : from;
    return from + (to - from) * t;
  }
  const fallback = Number(values[lastIndex]);
  return Number.isFinite(fallback) ? fallback : NaN;
}


/**
 * @param {Float32Array | Float64Array} distances
 * @param {number[] | Float32Array | Float64Array} values
 * @param {number} distance
 * @returns {number}
 */
function sampleSortedProfileAtDistance(distances, values, distance) {
  if (!distances?.length || !values?.length) return NaN;
  const last = Math.min(distances.length, values.length) - 1;
  if (distance <= 0) return Number.isFinite(Number(values[0])) ? Number(values[0]) : NaN;
  if (distance >= distances[last] || last === 0) return Number.isFinite(Number(values[last])) ? Number(values[last]) : NaN;
  let lo = 1, hi = last;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (distances[mid] < distance) lo = mid + 1;
    else hi = mid;
  }
  const i = lo - 1, start = distances[i], end = distances[i + 1];
  if (distance < start || distance > end) return Number.isFinite(Number(values[last])) ? Number(values[last]) : NaN;
  const span = end - start, t = span > 1e-6 ? (distance - start) / span : 0;
  const rawFrom = Number(values[i]), from = Number.isFinite(rawFrom) ? rawFrom : 0;
  const rawTo = Number(values[i + 1]), to = Number.isFinite(rawTo) ? rawTo : from;
  return from + (to - from) * t;
}

export { sampleProfileAtDistance, sampleSortedProfileAtDistance };
