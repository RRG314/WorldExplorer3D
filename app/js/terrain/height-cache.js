// Exact double-coordinate memoization. No quantization and no coordinate-string
// allocation on the millions of queries made during a city compilation.
export function createHeightCache(limit = 65536) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1048576) throw new RangeError('Invalid height cache capacity');
  let capacity = 2;
  while (capacity < limit * 2) capacity *= 2;
  const mask = capacity - 1;
  let keys = null, values = null, occupied = null, size = 0;
  const bits = new Float64Array(2), words = new Uint32Array(bits.buffer);
  function slot(x, z) {
    bits[0] = x === 0 ? 0 : x; bits[1] = z === 0 ? 0 : z;
    let hash = Math.imul(words[0] ^ words[1], 0x45d9f3b) ^ Math.imul(words[2] ^ words[3], 0x119de1f3);
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
    let index = (hash ^ (hash >>> 16)) & mask;
    while (occupied[index] && (keys[index * 2] !== x || keys[index * 2 + 1] !== z)) index = (index + 1) & mask;
    return index;
  }
  return {
    get size() { return size; },
    get(x, z) {
      if (!occupied || !Number.isFinite(x) || !Number.isFinite(z)) return undefined;
      const index = slot(x, z);
      return occupied[index] ? values[index] : undefined;
    },
    set(x, z, value) {
      if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(value)) return value;
      if (!occupied) { keys = new Float64Array(capacity * 2); values = new Float64Array(capacity); occupied = new Uint8Array(capacity); }
      let index = slot(x, z);
      if (!occupied[index] && size === limit) { occupied.fill(0); size = 0; index = slot(x, z); }
      if (!occupied[index]) { occupied[index] = 1; size++; keys[index * 2] = x; keys[index * 2 + 1] = z; }
      values[index] = value;
      return value;
    },
    clear() { keys = null; values = null; occupied = null; size = 0; }
  };
}
