// Published alongside the road meshes. Queries visit only triangles in one
// 16-unit cell, including on the walking/vehicle paths that avoid raycasting.
export function createRoadContactIndex(meshes, cellSize = 16) {
  const cells = new Map();
  for (const mesh of meshes) {
    if (mesh.userData?.isRoadSkirt || mesh.userData?.isRoadMarking) continue;
    const positions = (mesh.geometry?.getAttribute?.('position') || mesh.geometry?.attributes?.position)?.array;
    const indices = mesh.geometry?.getIndex?.()?.array;
    if (!positions) continue;
    const ranges=mesh.userData?.surfaceRanges || [];
    let rangeIndex=0;
    // Road batches are authored in world coordinates with identity transforms.
    for (let i = 0; i < (indices?.length ?? positions.length / 3); i += 3) {
      const a = indices ? indices[i] * 3 : i * 3;
      const b = indices ? indices[i + 1] * 3 : a + 3;
      const c = indices ? indices[i + 2] * 3 : a + 6;
      const ax = positions[a], az = positions[a + 2];
      const bx = positions[b], bz = positions[b + 2];
      const cx = positions[c], cz = positions[c + 2];
      const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-9) continue;
      while(rangeIndex+1<ranges.length && i>=ranges[rangeIndex].start+ranges[rangeIndex].count)rangeIndex++;
      const range=ranges[rangeIndex];
      const terrainMode=range && i>=range.start && i<range.start+range.count ? range.terrainMode : mesh.userData?.terrainMode;
      const triangle = { positions, a, b, c, denominator, terrainMode };
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
    dispose() { cells.clear(); },
    sampleAt(x, z, referenceY = NaN, requiredTerrainMode = null) {
      const bucket = cells.get(`${Math.floor(x / cellSize)}:${Math.floor(z / cellSize)}`);
      let best = null;
      for (const { positions: p, a, b, c, denominator, terrainMode } of bucket || []) {
        if(requiredTerrainMode && terrainMode!==requiredTerrainMode)continue;
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
