// Append-only storage for one compilation. Published views never overlap and
// are never recycled or detached. Only the current bounded page is retained
// here; older pages live exactly as long as their published views.
export function createNumericPublicationStore({pageBytes = 256 * 1024} = {}) {
  if (!Number.isSafeInteger(pageBytes) || pageBytes < 8 || pageBytes % 8) {
    throw new RangeError('Invalid numeric publication capacity');
  }
  let page = null, used = 0;
  return {
    allocate(bytes) {
      if (!Number.isSafeInteger(bytes) || bytes < 0) throw new RangeError('Invalid publication byte length');
      const offset = Math.ceil(used / 8) * 8;
      if (bytes > pageBytes) return {buffer: new ArrayBuffer(bytes), byteOffset: 0};
      if (!page || offset + bytes > page.byteLength) {
        page = new ArrayBuffer(pageBytes);
        used = 0;
      } else used = offset;
      const result = {buffer: page, byteOffset: used};
      used += bytes;
      return result;
    },
    // Dropping the allocator's last reference cannot invalidate published data.
    release() { page = null; used = 0; }
  };
}
