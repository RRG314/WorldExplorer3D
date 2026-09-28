// Preserve edge order and Float64 route costs without one object per edge and
// one array per node. Node offsets delimit contiguous adjacency ranges.
export function packTraversalAdjacency(nodeCount, segments) {
  const offsets = new Uint32Array(nodeCount + 1);
  for (const edge of segments) {
    if (edge.direction !== 'reverse') offsets[edge.fromId + 1]++;
    if (edge.direction !== 'forward') offsets[edge.toId + 1]++;
  }
  for (let i = 1; i < offsets.length; i++) offsets[i] += offsets[i - 1];
  const targets = new Uint32Array(offsets[nodeCount]);
  const weights = new Float64Array(targets.length);
  const cursors = offsets.slice();
  function append(from, to, weight) {
    const index = cursors[from]++;
    targets[index] = to;
    weights[index] = weight;
  }
  for (const edge of segments) {
    const weight = edge.length * edge.penalty;
    if (edge.direction !== 'reverse') append(edge.fromId, edge.toId, weight);
    if (edge.direction !== 'forward') append(edge.toId, edge.fromId, weight);
  }
  return {offsets, targets, weights};
}

export function traversalSourceInterval(points, distances, startDistance, endDistance) {
  const midpoint = (startDistance + endDistance) * 0.5;
  let low = 0, high = points.length - 2;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (midpoint <= distances[middle + 1] + 1e-6) high = middle;
    else low = middle + 1;
  }
  const a = points[low], b = points[low + 1];
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  return {
    segmentIndex: low,
    startT: Math.max(0, Math.min(1, (startDistance - distances[low]) / Math.max(1e-6, length))),
    endT: Math.max(0, Math.min(1, (endDistance - distances[low]) / Math.max(1e-6, length)))
  };
}
