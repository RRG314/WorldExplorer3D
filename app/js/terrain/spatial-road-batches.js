// Keep each incoming surface intact while grouping nearby geometry for view
// culling. Render batches do not define physical coverage or collision ownership.
export function createSpatialRoadBatches({ cellSize = 1024, maxVertices = 60000 } = {}) {
  if (!(cellSize > 0) || !Number.isFinite(cellSize) || !(maxVertices > 0)) throw new TypeError('Invalid road batch limits');
  const active = new Map();
  const batches = [];
  function append(verts, indices, terrainMode) {
    if (!verts?.length || !indices?.length) return;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < verts.length; i += 3) {
      minX = Math.min(minX, verts[i]); maxX = Math.max(maxX, verts[i]);
      minZ = Math.min(minZ, verts[i + 2]); maxZ = Math.max(maxZ, verts[i + 2]);
    }
    const key = `${Math.floor((minX + maxX) / (2 * cellSize))}:${Math.floor((minZ + maxZ) / (2 * cellSize))}`;
    let batch = active.get(key);
    if (!batch || (batch.verts.length + verts.length) / 3 > maxVertices) {
      batch = { verts: [], indices: [], ranges: [], spatialKey: key };
      active.set(key, batch);
      batches.push(batch);
    }
    const offset = batch.verts.length / 3;
    batch.ranges.push({ start: batch.indices.length, count: indices.length, terrainMode: terrainMode || 'unknown' });
    for (const value of verts) batch.verts.push(value);
    for (const index of indices) batch.indices.push(index + offset);
  }
  return { batches, append, finish: () => active.clear() };
}
