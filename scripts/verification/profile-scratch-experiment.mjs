// Temporary compiler profiles share small backing pages. This is an append-only
// allocator: no range is reused while an earlier view can still reference it.
// Only the current page is retained here; older pages follow their views' lifetime.
export function createFloat64ScratchAllocator(pageElements = 8192) {
  let page = null, offset = 0;
  return function allocate(input, map = null) {
    const isLength = typeof input === 'number';
    const length = isLength ? input : input.length;
    if (!Number.isSafeInteger(length) || length < 0) throw new RangeError('Invalid profile scratch length');
    let result;
    if (length > pageElements) {
      result = new Float64Array(length);
    } else {
      if (!page || offset + length > page.length) {
        page = new Float64Array(pageElements);
        offset = 0;
      }
      result = new Float64Array(page.buffer, offset * 8, length);
      offset += length;
    }
    if (!isLength) {
      if (map) for (let i = 0; i < length; i++) result[i] = map(input[i], i);
      else result.set(input);
    }
    return result;
  };
}

export const profileScratchFloat64 = createFloat64ScratchAllocator();
