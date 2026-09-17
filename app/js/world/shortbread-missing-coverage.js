// A missing provider tile invalidates only road fragments touching that hole.
// Keep known-good geometry elsewhere usable without claiming complete coverage.
export function markRoadsAtMissingTiles(elements, missingTiles) {
  if (!missingTiles.length) return 0;
  const holes = missingTiles.map(({ x, y, z }) => {
    const size = 2 ** z;
    const latitude = row => Math.atan(Math.sinh(Math.PI * (1 - 2 * row / size))) * 180 / Math.PI;
    return { minLon: x / size * 360 - 180, maxLon: (x + 1) / size * 360 - 180,
      minLat: latitude(y + 1), maxLat: latitude(y) };
  });
  const nodes = new Map();
  for (const element of elements) if (element.type === 'node') nodes.set(element.id, element);
  // Node deduplication uses seven decimal places; include that rounding envelope
  // so a fragment ending exactly on a missing tile edge remains incomplete.
  const epsilon = 1e-7;
  let affected = 0;
  for (const element of elements) {
    if (element.type !== 'way' || !element.tags?.highway) continue;
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const id of element.nodes || []) {
      const node = nodes.get(id);
      if (!node) continue;
      minLat = Math.min(minLat, node.lat); maxLat = Math.max(maxLat, node.lat);
      minLon = Math.min(minLon, node.lon); maxLon = Math.max(maxLon, node.lon);
    }
    if (holes.some(hole => minLat <= hole.maxLat + epsilon && maxLat >= hole.minLat - epsilon &&
      minLon <= hole.maxLon + epsilon && maxLon >= hole.minLon - epsilon)) {
      element.tags._sourceTruncated = 'yes';
      affected++;
    }
  }
  return affected;
}
