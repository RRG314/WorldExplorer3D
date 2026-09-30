// Frozen numerical reference from 8940b944.
import {clamp,finiteNumber,DEFAULT_VERTICAL_FIT_RADIUS,DEFAULT_MAX_GRADE} from '../../app/js/world/compiler/transport-surface-profile.js';
export function smoothSignedCutFillProfile(
  terrainEnvelope,
  lowerBounds,
  upperBounds,
  distances,
  maximumGrade,
  fitRadius
) {
  const radius = Math.max(4, finiteNumber(fitRadius, DEFAULT_VERTICAL_FIT_RADIUS));
  const heights = new Float64Array(terrainEnvelope.length);
  for (let index = 0; index < terrainEnvelope.length; index += 1) {
    let weightedSum = 0;
    let weightTotal = 0;
    for (let candidate = 0; candidate < terrainEnvelope.length; candidate += 1) {
      const delta = Math.abs(distances[candidate] - distances[index]);
      if (delta > radius) continue;
      const weight = 1 - delta / radius;
      weightedSum += terrainEnvelope[candidate] * weight;
      weightTotal += weight;
    }
    const target = weightTotal > 0
      ? weightedSum / weightTotal
      : terrainEnvelope[index];
    heights[index] = clamp(target, lowerBounds[index], upperBounds[index]);
  }

  const grade = Math.max(0.01, finiteNumber(maximumGrade, DEFAULT_MAX_GRADE));
  for (let pass = 0; pass < 8; pass += 1) {
    for (let index = 1; index < heights.length; index += 1) {
      const run = Math.max(1e-6, distances[index] - distances[index - 1]);
      heights[index] = clamp(
        heights[index],
        Math.max(lowerBounds[index], heights[index - 1] - grade * run),
        Math.min(upperBounds[index], heights[index - 1] + grade * run)
      );
    }
    for (let index = heights.length - 2; index >= 0; index -= 1) {
      const run = Math.max(1e-6, distances[index + 1] - distances[index]);
      heights[index] = clamp(
        heights[index],
        Math.max(lowerBounds[index], heights[index + 1] - grade * run),
        Math.min(upperBounds[index], heights[index + 1] + grade * run)
      );
    }
    const next = new Float64Array(heights);
    for (let index = 1; index < heights.length - 1; index += 1) {
      next[index] = clamp(
        heights[index] * 0.45 + (heights[index - 1] + heights[index + 1]) * 0.275,
        lowerBounds[index],
        upperBounds[index]
      );
    }
    heights.set(next);
  }
  return new Float32Array(heights);
}

