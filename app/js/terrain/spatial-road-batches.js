// Keep each incoming surface intact while grouping nearby geometry for view
// culling. Render batches do not define physical coverage or collision ownership.
export function createSpatialRoadBatches({ cellSize = 1024, maxVertices = 60000 } = {}) {
  if (!(cellSize > 0) || !Number.isFinite(cellSize) || !(maxVertices > 0)) throw new TypeError('Invalid road batch limits');
  const active = new Map();
  const batches = [];
  function append(verts, indices, terrainMode, {material,colors} = {}) {
    if(material!==undefined&&material!=='edge-band'||material==='edge-band'&&(!colors||colors.length!==verts?.length||!colors.every(n=>Number.isInteger(n)&&n>=0&&n<=255))||colors!==undefined&&material!=='edge-band')throw Error('invalid_road_batch_material');
    if (!verts?.length || !indices?.length) return;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < verts.length; i += 3) {
      minX = Math.min(minX, verts[i]); maxX = Math.max(maxX, verts[i]);
      minZ = Math.min(minZ, verts[i + 2]); maxZ = Math.max(maxZ, verts[i + 2]);
    }
    const key = `${Math.floor((minX + maxX) / (2 * cellSize))}:${Math.floor((minZ + maxZ) / (2 * cellSize))}`;
    const group=material?key+':'+material:key;
    let batch = active.get(group);
    if (!batch || (batch.verts.length + verts.length) / 3 > maxVertices) {
      batch = { verts: [], indices: [], ranges: [], spatialKey: key,...(material?{material,colors:[]}: {}) };
      active.set(group, batch);
      batches.push(batch);
    }
    const offset = batch.verts.length / 3;
    batch.ranges.push({ start: batch.indices.length, count: indices.length, terrainMode: terrainMode || 'unknown' });
    for (const value of verts) batch.verts.push(value);
    for (const index of indices) batch.indices.push(index + offset);
    if(colors)for(const value of colors)batch.colors.push(value);
  }
  return { batches, append, finish: () => active.clear() };
}
