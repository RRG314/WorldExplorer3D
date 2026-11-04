// Decoration borrows the published transport connections. It never creates a
// junction, changes a driving lane or edits collision coverage.
const cache = new WeakMap();

export function roadMarkingJunctionClearance(road) {
  const graph = road.transportGraphRef;
  const unit = Number(road.metersPerWorldUnit) || 1;
  const mode = road.structureSemantics?.terrainMode || 'at_grade';
  const signature = `${road.width}:${unit}:${mode}:${Number(road.structureSemantics?.layer) || 0}`;
  const cached = cache.get(road);
  if (
    cached &&
    cached.graph === graph &&
    cached.points === road.pts &&
    cached.connections === road.transportConnections &&
    cached.signature === signature
  )
    return cached.intervals;
  const stations = new Map((graph?.stations || []).map((station) => [station.nodeId, station]));
  const intervals = [];
  for (const link of road.transportConnections || []) {
    const station = stations.get(link.graphConnectionId),
      other = link.feature;
    if (
      !station ||
      !other ||
      other === road ||
      other.driveable === false ||
      (other.structureSemantics?.terrainMode || 'at_grade') !== mode ||
      (Number(other.structureSemantics?.layer) || 0) !==
        (Number(road.structureSemantics?.layer) || 0)
    )
      continue;
    const a = road.pts?.[station.segmentIndex],
      b = road.pts?.[station.segmentIndex + 1];
    const c = other.pts?.[link.segmentIndex],
      d = other.pts?.[link.segmentIndex + 1];
    if (!a || !b || !c || !d || !Number.isFinite(station.distanceAlong)) continue;
    const ax = b.x - a.x,
      az = b.z - a.z,
      bx = d.x - c.x,
      bz = d.z - c.z;
    const lengths = Math.hypot(ax, az) * Math.hypot(bx, bz);
    if (!(lengths > 1e-8)) continue;
    const sine = Math.abs(ax * bz - az * bx) / lengths;
    // Straight continuations retain uninterrupted paint. Connected crossing
    // and branching roads get a clear intersection, including oblique forks.
    if (sine < 0.2) continue;
    const halfSpan =
      ((Number(other.width) || 0) * 0.5) / sine + (Number(road.width) || 0) * 0.5 + 0.5 / unit;
    if (!(halfSpan > 0)) continue;
    intervals.push([
      Math.max(0, station.distanceAlong - halfSpan),
      station.distanceAlong + halfSpan,
    ]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  const result = Object.freeze(merged.map((interval) => Object.freeze(interval)));
  cache.set(road, {
    graph,
    points: road.pts,
    connections: road.transportConnections,
    signature,
    intervals: result,
  });
  return result;
}

export function markingSpansOutsideJunctions(from, to, exclusions) {
  if (!exclusions.length) return [[from, to]];
  const result = [];
  let start = from;
  for (const [left, right] of exclusions) {
    if (right <= start) continue;
    if (left >= to) break;
    if (left > start) result.push([start, Math.min(left, to)]);
    start = Math.max(start, right);
    if (start >= to) return result;
  }
  if (start < to) result.push([start, to]);
  return result;
}
