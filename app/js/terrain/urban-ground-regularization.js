const DEFAULT_GRID_SPACING = 180;
const DEFAULT_SAMPLE_RADIUS = 120;
const DEFAULT_SAMPLE_DIVISIONS = 4;

export function denseSettlementNeedsTerrainRegularization(profile = null) {
  return profile?.settlement?.dense === true;
}

function solveLinear3(matrix, vector) {
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let pivot = 0; pivot < 3; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < 3; row += 1) {
      if (Math.abs(rows[row][pivot]) > Math.abs(rows[best][pivot])) best = row;
    }
    if (Math.abs(rows[best][pivot]) < 1e-9) return null;
    [rows[pivot], rows[best]] = [rows[best], rows[pivot]];
    const divisor = rows[pivot][pivot];
    for (let column = pivot; column < 4; column += 1) rows[pivot][column] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === pivot) continue;
      const factor = rows[row][pivot];
      for (let column = pivot; column < 4; column += 1) rows[row][column] -= factor * rows[pivot][column];
    }
  }
  return rows.map((row) => row[3]);
}

function fitPlane(samples) {
  if (!Array.isArray(samples) || samples.length < 3) return null;
  let xx = 0; let xz = 0; let x = 0; let zz = 0; let z = 0;
  let xy = 0; let zy = 0; let y = 0;
  for (const sample of samples) {
    xx += sample.x * sample.x; xz += sample.x * sample.z; x += sample.x;
    zz += sample.z * sample.z; z += sample.z;
    xy += sample.x * sample.y; zy += sample.z * sample.y; y += sample.y;
  }
  const coefficients = solveLinear3(
    [[xx, xz, x], [xz, zz, z], [x, z, samples.length]],
    [xy, zy, y]
  );
  return coefficients
    ? { slopeX: coefficients[0], slopeZ: coefficients[1], centerY: coefficients[2] }
    : null;
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio)))];
}

export function fitDenseSettlementGroundPlane(samples = []) {
  const valid = samples
    .map((sample) => ({ x: Number(sample.x), z: Number(sample.z), y: Number(sample.y) }))
    .filter((sample) => Number.isFinite(sample.x) && Number.isFinite(sample.z) && Number.isFinite(sample.y));
  let retained = valid;
  if (retained.length < 9) return null;
  let plane = fitPlane(retained);
  for (let pass = 0; pass < 4 && plane; pass += 1) {
    const withResidual = retained.map((sample) => ({
      ...sample,
      residual: sample.y - (plane.centerY + plane.slopeX * sample.x + plane.slopeZ * sample.z)
    }));
    const ceiling = percentile(withResidual.map((sample) => sample.residual), 0.62);
    const next = withResidual.filter((sample) => sample.residual <= ceiling + 0.05);
    if (next.length < 9 || next.length === retained.length) break;
    retained = next;
    plane = fitPlane(retained);
  }
  if (!plane) return null;
  // Iterative lower-envelope rejection can leave samples on only one side of
  // a steep coastal cell. An unconstrained plane then extrapolates at the
  // lattice node and can exceed every observed elevation by kilometres.
  // Keep the node inside the robust observed vertical envelope.
  const observedY = valid.map((sample) => sample.y);
  return {
    ...plane,
    centerY: Math.max(
      percentile(observedY, 0.1),
      Math.min(percentile(observedY, 0.75), plane.centerY)
    ),
    retainedSamples: retained.length
  };
}

export function createDenseSettlementGroundModel(sampleWorldY, options = {}) {
  const gridSpacing = Math.max(60, Number(options.gridSpacing) || DEFAULT_GRID_SPACING);
  const sampleRadius = Math.max(30, Number(options.sampleRadius) || DEFAULT_SAMPLE_RADIUS);
  const divisions = Math.max(2, Math.round(Number(options.sampleDivisions) || DEFAULT_SAMPLE_DIVISIONS));
  const nodeCache = new Map();
  let unavailableNodes = 0;
  let minimumNodeY = Infinity;
  let maximumNodeY = -Infinity;

  function sampleNode(indexX, indexZ) {
    const key = `${indexX},${indexZ}`;
    if (nodeCache.has(key)) return nodeCache.get(key);
    const centerX = indexX * gridSpacing;
    const centerZ = indexZ * gridSpacing;
    let samples = [];
    // Coastal and tile-edge nodes can have only partial source coverage. A
    // null grid corner used to make the sampler fall back to the raw value at
    // one point, producing metre-high steps over sub-metre road segments.
    // Expand once and keep the result on the same fixed lattice instead.
    for (const radius of [sampleRadius, sampleRadius * 2]) {
      samples = [];
      for (let row = 0; row <= divisions; row += 1) {
        const dz = -radius + radius * 2 * row / divisions;
        for (let column = 0; column <= divisions; column += 1) {
          const dx = -radius + radius * 2 * column / divisions;
          const y = Number(sampleWorldY(centerX + dx, centerZ + dz));
          if (Number.isFinite(y)) samples.push({ x: dx, z: dz, y });
        }
      }
      if (samples.length >= 9) break;
    }
    const plane = fitDenseSettlementGroundPlane(samples);
    const fallbackNodeY = percentile(samples.map((sample) => sample.y), 0.35);
    const nodeY = Number.isFinite(plane?.centerY) ? plane.centerY : fallbackNodeY;
    if (!Number.isFinite(nodeY)) {
      unavailableNodes += 1;
      nodeCache.set(key, null);
      return null;
    }
    const node = Object.freeze({ x: centerX, z: centerZ, y: nodeY });
    minimumNodeY = Math.min(minimumNodeY, nodeY);
    maximumNodeY = Math.max(maximumNodeY, nodeY);
    nodeCache.set(key, node);
    return node;
  }

  function sample(x, z, fallbackY = null) {
    const worldX = Number(x); const worldZ = Number(z);
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return fallbackY;
    const left = Math.floor(worldX / gridSpacing);
    const top = Math.floor(worldZ / gridSpacing);
    const nodes = [sampleNode(left, top), sampleNode(left + 1, top), sampleNode(left, top + 1), sampleNode(left + 1, top + 1)];
    const tx = worldX / gridSpacing - left;
    const tz = worldZ / gridSpacing - top;
    const weights = [(1 - tx) * (1 - tz), tx * (1 - tz), (1 - tx) * tz, tx * tz];
    let weightedY = 0;
    let totalWeight = 0;
    for (let index = 0; index < nodes.length; index += 1) {
      if (!nodes[index]) continue;
      weightedY += nodes[index].y * weights[index];
      totalWeight += weights[index];
    }
    return totalWeight > 1e-6 ? weightedY / totalWeight : fallbackY;
  }

  return Object.freeze({
    authority: 'dense-settlement-lower-surface-grid',
    sample,
    clear: () => nodeCache.clear(),
    snapshot: () => ({
      authority: 'dense-settlement-lower-surface-grid',
      cachedNodes: nodeCache.size,
      unavailableNodes,
      minimumNodeY: Number.isFinite(minimumNodeY) ? minimumNodeY : null,
      maximumNodeY: Number.isFinite(maximumNodeY) ? maximumNodeY : null
    })
  });
}
