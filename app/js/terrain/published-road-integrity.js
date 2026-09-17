// Inspect the uploaded Float32 positions, not the higher-precision construction
// arrays: quantization can collapse the horizontal footprint of a valid top.
// A zero footprint can still have vertical area; this metric is not 3D area.
export function measurePublishedRoadTriangles(positions, indices) {
  const result = { surfaceTriangles: 0, downwardFacingTriangles: 0, zeroFootprintTriangles: 0, invalidTriangles: 0 };
  if (!positions || !indices) return result;
  const validIndex = index => Number.isInteger(index) && index >= 0 && index * 3 + 2 < positions.length;
  for (let i = 0; i < indices.length; i += 3) {
    result.surfaceTriangles++;
    const ia=indices[i], ib=indices[i+1], ic=indices[i+2];
    if (!validIndex(ia) || !validIndex(ib) || !validIndex(ic)) {
      result.invalidTriangles++; continue;
    }
    const a=ia*3,b=ib*3,c=ic*3;
    const ax=positions[a],ay=positions[a+1],az=positions[a+2];
    const bx=positions[b],by=positions[b+1],bz=positions[b+2];
    const cx=positions[c],cy=positions[c+1],cz=positions[c+2];
    if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az) || !Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz) || !Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz)) { result.invalidTriangles++; continue; }
    const upwardArea = (bz-az)*(cx-ax) - (bx-ax)*(cz-az);
    if (upwardArea === 0) result.zeroFootprintTriangles++;
    else if (upwardArea < 0) result.downwardFacingTriangles++;
  }
  return result;
}

// Normalize only horizontal road tops. This preserves every nonzero triangle's
// footprint; it does not repair or claim to detect overlapping/folded ribbons.
// Compact in place, retaining each surface mode's exact index range.
export function normalizePublishedRoadIndices(positions, indices, ranges) {
  if (indices.length % 3) throw new Error('Incomplete road triangle');
  let expectedStart = 0;
  for (const range of ranges) {
    if (range.start !== expectedStart || !Number.isInteger(range.count) || range.count < 0 || range.count % 3) {
      throw new Error('Invalid road surface range');
    }
    expectedStart += range.count;
  }
  if (expectedStart !== indices.length) throw new Error('Road ranges do not cover geometry');
  const measured = measurePublishedRoadTriangles(positions, indices);
  if (measured.invalidTriangles) throw new Error('Invalid published road geometry');
  let write = 0;
  const surfaceRanges = [];
  for (const range of ranges) {
    const start = write;
    for (let read = range.start; read < range.start + range.count; read += 3) {
      const ia = indices[read], ib = indices[read+1], ic = indices[read+2];
      const a = ia*3, b = ib*3, c = ic*3;
      const area = (positions[b+2]-positions[a+2])*(positions[c]-positions[a]) -
        (positions[b]-positions[a])*(positions[c+2]-positions[a+2]);
      if (area === 0) continue;
      indices[write++] = ia;
      indices[write++] = area < 0 ? ic : ib;
      indices[write++] = area < 0 ? ib : ic;
    }
    surfaceRanges.push({ ...range, start, count: write-start });
  }
  return { indices: indices.subarray(0, write), surfaceRanges,
    removedZeroFootprintTriangles: measured.zeroFootprintTriangles,
    correctedDownwardTriangles: measured.downwardFacingTriangles };
}

// The polygon kernel rounds input coordinates and computed intersections to
// its integer grid (two half-step roundings), then publication rounds to
// Float32. Include both grid roundings rather than treating overlay output as
// a single input snap. The extra unit covers a neighbouring Float32 binade.
export function roadSourceCoordinateTolerance(x, z, grid) {
  if (![x,z,grid].every(Number.isFinite) || grid <= 0) throw new RangeError('Invalid road precision input');
  const roundingBound = value => 2 ** (Math.floor(Math.log2(Math.abs(value)+1))-24);
  return Math.hypot(grid+roundingBound(x), grid+roundingBound(z));
}
