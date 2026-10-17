const privateBuildingGeometries = new WeakMap();

function retireChunk(chunk) {
  if (!chunk.sealed || chunk.users || !chunk.buffer.byteLength || typeof chunk.buffer.transfer !== 'function') return 0;
  const bytes = chunk.buffer.byteLength;
  chunk.buffer.transfer(0);
  return bytes;
}

// Only unpublished building construction opts in. Small pages prevent one
// retained singleton from keeping a whole city's temporary attributes alive.
// Ranges never overlap or get reused. A page retires only after every geometry
// using it has copied its data into final render/edit storage.
export function createBuildingConstructionArena(pageBytes = 64 * 1024) {
  if (!Number.isSafeInteger(pageBytes) || pageBytes < 8 || pageBytes % 8) throw new RangeError('Invalid building page size');
  let current = null, closed = false, buffers = 0, bytes = 0;
  return {
    get closed() { return closed; },
    allocate(owner, byteLength) {
      if (closed) throw new Error('Building construction arena is closed');
      if (!Number.isSafeInteger(byteLength) || byteLength < 0) throw new RangeError('Invalid building allocation');
      const offset = current ? Math.ceil(current.used / 8) * 8 : 0;
      if (!current || offset + byteLength > current.buffer.byteLength) {
        if (current) { current.sealed = true; retireChunk(current); }
        current = { buffer: new ArrayBuffer(Math.max(pageBytes, byteLength)), used: 0, users: 0, sealed: false };
        buffers++; bytes += current.buffer.byteLength;
      }
      const byteOffset = Math.ceil(current.used / 8) * 8;
      current.used = byteOffset + byteLength;
      if (!owner.chunks.includes(current)) { owner.chunks.push(current); current.users++; }
      return { buffer: current.buffer, byteOffset };
    },
    close() {
      if (closed) return;
      closed = true;
      if (current) { current.sealed = true; retireChunk(current); current = null; }
    },
    snapshot() { return { buffers, allocatedBytes: bytes, closed }; }
  };
}

export function allocatePrivateBuildingStorage(geometry, byteLength) {
  const owner = privateBuildingGeometries.get(geometry);
  return owner?.arena && !owner.arena.closed ? owner.arena.allocate(owner, byteLength) : { buffer: new ArrayBuffer(byteLength), byteOffset: 0 };
}

// Unbatched buildings become standalone published geometry. Copy their small
// surviving ranges out of construction pages, otherwise scattered singletons
// could pin nearly every page containing their already-retired neighbors.
export function finishPrivateBuildingStorage(geometry) {
  const owner = privateBuildingGeometries.get(geometry);
  if (!owner?.arena) return false;
  const buffers = new Set(owner.chunks.map(chunk => chunk.buffer));
  const attributes = new Set([...Object.values(geometry.attributes), geometry.index].filter(Boolean));
  const copies = new Map();
  let bytes = 0;
  for (const attribute of attributes) {
    const source = attribute.array;
    if (!source || !buffers.has(source.buffer) || copies.has(source)) continue;
    bytes = Math.ceil(bytes / 8) * 8;
    copies.set(source, {offset: bytes}); bytes += source.byteLength;
  }
  const storage = new ArrayBuffer(bytes);
  for (const [source, copy] of copies) {
    copy.array = new source.constructor(storage, copy.offset, source.length);
    new Uint8Array(storage, copy.offset, source.byteLength).set(new Uint8Array(source.buffer, source.byteOffset, source.byteLength));
  }
  for (const attribute of attributes) {
    const copy = copies.get(attribute.array);
    if (copy) { attribute.array = copy.array; attribute.needsUpdate = true; }
  }
  privateBuildingGeometries.set(geometry, null);
  for (const chunk of owner.chunks) { chunk.users--; retireChunk(chunk); }
  return true;
}

// Only generated building geometry whose attributes are exclusively owned may
// opt in. Shared/imported geometry and final render batches must never opt in.
export function markPrivateBuildingGeometry(geometry, arena = null) {
  if (privateBuildingGeometries.has(geometry)) return geometry;
  privateBuildingGeometries.set(geometry, arena ? {arena, chunks: []} : null);
  return geometry;
}

// Call after copying all render/edit data into the final batch and disposing
// the source GPU geometry. Dispose alone leaves thousands of native backing
// stores for a later stop-the-world ArrayBuffer sweep during travel.
export function releaseRetiredBuildingCpuBuffers(geometry) {
  if (!privateBuildingGeometries.has(geometry)) return 0;
  const owner = privateBuildingGeometries.get(geometry);
  privateBuildingGeometries.delete(geometry);
  const buffers = new Set();
  for (const attribute of Object.values(geometry.attributes)) {
    buffers.add((attribute.array || attribute.data?.array)?.buffer);
  }
  buffers.add(geometry.index?.array?.buffer);
  let releasedBytes = 0;
  for (const chunk of owner?.chunks || []) {
    buffers.delete(chunk.buffer);
    chunk.users--;
    releasedBytes += retireChunk(chunk);
  }
  for (const buffer of buffers) {
    // Older browsers retain their ordinary GC behavior. This never forces GC.
    if (!buffer?.byteLength || typeof buffer.transfer !== 'function') continue;
    const byteLength = buffer.byteLength;
    buffer.transfer(0);
    releasedBytes += byteLength;
  }
  return releasedBytes;
}
