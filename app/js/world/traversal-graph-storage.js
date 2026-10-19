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

const SEGMENT_STORAGE = 'packed-traversal-segments-v1';
const isNodeId = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;

// The regional graph outlives compilation. Keep numeric facts in exact doubles
// and IDs in integer columns rather than retaining a record and boxed numbers
// for every edge. Endpoints and features remain the original authoritative
// objects: surface updates and road identity must remain visible to consumers.
export function packTraversalSegments(segments) {
  const length = segments.length;
  const ids = new Uint32Array(length * 3);
  const values = new Float64Array(length * 4);
  const features = new Array(length);
  const firstPoints = new Array(length);
  const lastPoints = new Array(length);
  const directions = new Array(length);
  for (let index = 0; index < length; index++) {
    const segment = segments[index];
    if (!isNodeId(segment.fromId) || !isNodeId(segment.toId) || !isNodeId(segment.segIndex) ||
        !Number.isFinite(segment.sourceTStart) || !Number.isFinite(segment.sourceTEnd) ||
        !Number.isFinite(segment.length) || !Number.isFinite(segment.penalty) || !segment.p1 || !segment.p2) {
      throw new TypeError('Cannot publish an invalid traversal segment.');
    }
    ids[index * 3] = segment.fromId;
    ids[index * 3 + 1] = segment.toId;
    ids[index * 3 + 2] = segment.segIndex;
    values[index * 4] = segment.sourceTStart;
    values[index * 4 + 1] = segment.sourceTEnd;
    values[index * 4 + 2] = segment.length;
    values[index * 4 + 3] = segment.penalty;
    features[index] = segment.feature;
    firstPoints[index] = segment.p1;
    lastPoints[index] = segment.p2;
    directions[index] = segment.direction;
  }
  return {kind: SEGMENT_STORAGE, length, ids, values, features, firstPoints, lastPoints, directions};
}

export function traversalSegmentCount(segments) {
  return Array.isArray(segments) || segments?.kind === SEGMENT_STORAGE ? segments.length : 0;
}

// Local queries reuse their own result object. Callers retaining several edges
// omit `target`; they receive independent records with shared source references.
export function readTraversalSegment(segments, index, target = {}) {
  if (Array.isArray(segments)) return segments[index];
  if (segments?.kind !== SEGMENT_STORAGE || !Number.isInteger(index) || index < 0 || index >= segments.length) return undefined;
  const idOffset = index * 3, valueOffset = index * 4;
  target.feature = segments.features[index];
  target.direction = segments.directions[index];
  target.segIndex = segments.ids[idOffset + 2];
  target.sourceTStart = segments.values[valueOffset];
  target.sourceTEnd = segments.values[valueOffset + 1];
  target.fromId = segments.ids[idOffset];
  target.toId = segments.ids[idOffset + 1];
  target.p1 = segments.firstPoints[index];
  target.p2 = segments.lastPoints[index];
  target.length = segments.values[valueOffset + 2];
  target.penalty = segments.values[valueOffset + 3];
  return target;
}

// Pedestrian/traffic compilation sorts temporary candidates while the loading
// cover is present. Its outputs retain only selected features, not these rows.
export function materializeTraversalSegments(segments) {
  if (Array.isArray(segments)) return segments;
  return Array.from({length: traversalSegmentCount(segments)}, (_, index) => readTraversalSegment(segments, index));
}

export function packTraversalNodes(nodes) {
  const coordinates = new Float64Array(nodes.length * 2);
  for (let index = 0; index < nodes.length; index++) {
    coordinates[index * 2] = nodes[index].x;
    coordinates[index * 2 + 1] = nodes[index].z;
  }
  return coordinates;
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
