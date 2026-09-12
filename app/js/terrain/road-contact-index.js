// Published alongside the road meshes. Queries visit only triangles in one
// 16-unit cell, including on the walking/vehicle paths that avoid raycasting.
export function createRoadContactIndex(meshes, cellSize = 16) {
  const cells = new Map();
  for (const mesh of meshes) {
    if (mesh.userData?.isRoadSkirt || mesh.userData?.isRoadMarking) continue;
    const positions = mesh.geometry?.getAttribute('position')?.array;
    const indices = mesh.geometry?.getIndex()?.array;
    if (!positions || !indices) continue;
    // Road batches are authored in world coordinates with identity transforms.
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
      const ax = positions[a], az = positions[a + 2];
      const bx = positions[b], bz = positions[b + 2];
      const cx = positions[c], cz = positions[c + 2];
      const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-9) continue;
      const triangle = { positions, a, b, c, denominator };
      for (let x = Math.floor(Math.min(ax, bx, cx) / cellSize); x <= Math.floor(Math.max(ax, bx, cx) / cellSize); x++) {
        for (let z = Math.floor(Math.min(az, bz, cz) / cellSize); z <= Math.floor(Math.max(az, bz, cz) / cellSize); z++) {
          const key = `${x}:${z}`;
          let bucket = cells.get(key);
          if (!bucket) cells.set(key, bucket = []);
          bucket.push(triangle);
        }
      }
    }
  }
  return {
    sampleAt(x, z, referenceY = NaN) {
      const bucket = cells.get(`${Math.floor(x / cellSize)}:${Math.floor(z / cellSize)}`);
      let best = null;
      for (const { positions: p, a, b, c, denominator } of bucket || []) {
        const u = ((p[b + 2] - p[c + 2]) * (x - p[c]) + (p[c] - p[b]) * (z - p[c + 2])) / denominator;
        const v = ((p[c + 2] - p[a + 2]) * (x - p[c]) + (p[a] - p[c]) * (z - p[c + 2])) / denominator;
        if (u < -1e-6 || v < -1e-6 || u + v > 1.000001) continue;
        const y = u * p[a + 1] + v * p[b + 1] + (1 - u - v) * p[c + 1];
        if (!Number.isFinite(y)) continue;
        if (best === null || (Number.isFinite(referenceY) ? Math.abs(y - referenceY) < Math.abs(best - referenceY) : y > best)) best = y;
      }
      return best;
    }
  };
}
