// Callers outside a compilation keep ordinary, independently owned arrays.
export const copyNumericArray = (Type, input) => new Type(input);

// A synchronous compiler may borrow scratch pages, then copy its accepted
// result into independently owned publication storage. No page or scratch
// view may escape that callback. Nested compilations borrow different pages.
export function createNumericScratchPool({ pageBytes = 256 * 1024, maxRetainedBytes = 1024 * 1024 } = {}) {
  if (!Number.isSafeInteger(pageBytes) || pageBytes < 8 || pageBytes % 8 ||
      !Number.isSafeInteger(maxRetainedBytes) || maxRetainedBytes < 0) {
    throw new RangeError('Invalid numeric scratch capacity');
  }
  const available = [];
  let retainedBytes = 0, activeScopes = 0, createdBuffers = 0;
  return {
    withScratch(run) {
      const pages = [];
      let current = null, closed = false;
      activeScopes++;
      const allocate = (Type, input) => {
        if (closed) throw new Error('Numeric scratch scope has ended');
        if (Type !== Float32Array && Type !== Float64Array) throw new TypeError('Unsupported scratch type');
        const length = typeof input === 'number' ? input : input.length;
        if (!Number.isSafeInteger(length) || length < 0) throw new RangeError('Invalid scratch length');
        const bytes = length * Type.BYTES_PER_ELEMENT;
        if (!Number.isSafeInteger(bytes)) throw new RangeError('Invalid scratch byte length');
        const offset = current ? Math.ceil(current.used / 8) * 8 : 0;
        if (!current || offset + bytes > current.buffer.byteLength) {
          let buffer;
          if (bytes <= pageBytes && available.length) {
            buffer = available.pop(); retainedBytes -= buffer.byteLength;
          } else {
            buffer = new ArrayBuffer(Math.max(pageBytes, bytes)); createdBuffers++;
          }
          current = { buffer, used: 0 }; pages.push(current);
        }
        const start = Math.ceil(current.used / 8) * 8;
        const view = new Type(current.buffer, start, length);
        current.used = start + bytes;
        // Reused pages must have constructor-equivalent initialization.
        if (typeof input === 'number') view.fill(0); else view.set(input);
        return view;
      };
      try {
        const result = run(allocate);
        if (result && typeof result.then === 'function') throw new TypeError('Numeric scratch must be synchronous');
        return result;
      } finally {
        closed = true; activeScopes--;
        for (const { buffer } of pages) {
          if (buffer.byteLength === pageBytes && retainedBytes + pageBytes <= maxRetainedBytes) {
            available.push(buffer); retainedBytes += pageBytes;
          }
        }
      }
    },
    snapshot() { return { retainedBytes, retainedPages: available.length, activeScopes, createdBuffers }; }
  };
}
