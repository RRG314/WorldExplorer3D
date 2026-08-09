export function cellInsideHole(centerX, centerZ, innerBounds) {
  return centerX > innerBounds.minX && centerX < innerBounds.maxX &&
    centerZ > innerBounds.minZ && centerZ < innerBounds.maxZ;
}

export function cellInsideDetailedCoverage(centerX, centerZ, coverageRects = []) {
  return coverageRects.some((rect) => (
    centerX > rect.minX && centerX < rect.maxX &&
    centerZ > rect.minZ && centerZ < rect.maxZ
  ));
}

export function addCoverageEdges(axisValues, coverageRects, minKey, maxKey) {
  const values = axisValues.slice();
  for (const rect of coverageRects || []) {
    if (Number.isFinite(rect?.[minKey])) values.push(rect[minKey]);
    if (Number.isFinite(rect?.[maxKey])) values.push(rect[maxKey]);
  }
  values.sort((a, b) => a - b);
  return values.filter((value, index) => index === 0 || Math.abs(value - values[index - 1]) > 1e-6);
}
