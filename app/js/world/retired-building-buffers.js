const privateBuildingGeometries = new WeakSet();

// Only generated building geometry whose attributes are exclusively owned may
// opt in. Shared/imported geometry and final render batches must never opt in.
export function markPrivateBuildingGeometry(geometry) {
  privateBuildingGeometries.add(geometry);
  return geometry;
}

// Call after copying all render/edit data into the final batch and disposing
// the source GPU geometry. Dispose alone leaves thousands of native backing
// stores for a later stop-the-world ArrayBuffer sweep during travel.
export function releaseRetiredBuildingCpuBuffers(geometry) {
  if (!privateBuildingGeometries.delete(geometry)) return 0;
  const buffers = new Set();
  for (const attribute of Object.values(geometry.attributes)) {
    buffers.add((attribute.array || attribute.data?.array)?.buffer);
  }
  buffers.add(geometry.index?.array?.buffer);
  let releasedBytes = 0;
  for (const buffer of buffers) {
    // Older browsers retain their ordinary GC behavior. This never forces GC.
    if (!buffer?.byteLength || typeof buffer.transfer !== 'function') continue;
    const byteLength = buffer.byteLength;
    buffer.transfer(0);
    releasedBytes += byteLength;
  }
  return releasedBytes;
}
