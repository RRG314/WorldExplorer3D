// @ts-check
/** @typedef {{lat:number, lon:number}} GeographicPoint */
/** @typedef {{nodes?: Array<string | number>}} SourceWay */
/** @typedef {Record<string, GeographicPoint | undefined>} NodeLookup */
// Geographic selection rules; the caller supplies the location frame.
/** @param {SourceWay | null | undefined} way @param {NodeLookup} nodeMap @param {GeographicPoint} location */
export function wayCenterDistanceSq(way, nodeMap, location) {
  if (!way?.nodes?.length) return Infinity;

  let latSum = 0;
  let lonSum = 0;
  let count = 0;
  const sampleCount = Math.min(way.nodes.length, 8);

  for (let i = 0; i < sampleCount; i++) {
    const node = nodeMap[way.nodes[i]];
    if (!node) continue;
    latSum += node.lat;
    lonSum += node.lon;
    count += 1;
  }
  if (count === 0) return Infinity;

  const lat = latSum / count;
  const lon = lonSum / count;
  const dLat = lat - location.lat;
  const dLon = (lon - location.lon) * Math.cos(location.lat * Math.PI / 180);
  return dLat * dLat + dLon * dLon;
}

/** @param {GeographicPoint | null | undefined} node @param {GeographicPoint} location */
export function nodeDistanceSq(node, location) {
  if (!node) return Infinity;
  const dLat = node.lat - location.lat;
  const dLon = (node.lon - location.lon) * Math.cos(location.lat * Math.PI / 180);
  return dLat * dLat + dLon * dLon;
}

/**
 * @template {SourceWay} T
 * @param {T[]} ways
 * @param {NodeLookup} nodeMap
 * @param {number} limit
 * @param {((a:T,b:T)=>number) | null | undefined} compareFn
 * @param {{spreadAcrossArea?:boolean, coreRatio?:number}} options
 * @param {GeographicPoint} location
 */
export function limitWaysByDistance(ways, nodeMap, limit, compareFn, options = {}, location) {
  if (ways.length <= limit) return ways;

  // Selection is synchronous within one immutable location frame. Compute a
  // source centroid once, rather than once for each sort comparison.
  const distances = new Map();
  /** @param {T} way */
  const distance = (way) => {
    if (!distances.has(way)) distances.set(way, wayCenterDistanceSq(way, nodeMap, location));
    return distances.get(way);
  };
  const sorted = ways
    .slice()
    .sort((a, b) => {
      const cmp = compareFn ? compareFn(a, b) : 0;
      if (cmp !== 0) return cmp;
      return distance(a) - distance(b);
    });

  if (options?.spreadAcrossArea) {
    const coreRatio = Math.max(0.1, Math.min(0.9, options.coreRatio ?? 0.5));
    const coreKeep = Math.max(1, Math.min(limit, Math.floor(limit * coreRatio)));
    const selected = sorted.slice(0, coreKeep);
    const tail = sorted.slice(coreKeep);
    const remaining = limit - selected.length;

    if (remaining > 0 && tail.length > 0) {
      if (tail.length <= remaining) {
        selected.push(...tail);
      } else {
        const picked = new Set();
        for (let i = 0; i < remaining; i++) {
          let idx = Math.floor(i * tail.length / remaining);
          while (idx < tail.length - 1 && picked.has(idx)) idx++;
          if (picked.has(idx)) {
            while (idx > 0 && picked.has(idx)) idx--;
          }
          if (!picked.has(idx)) {
            picked.add(idx);
            selected.push(tail[idx]);
          }
        }
      }
    }
    return selected.slice(0, limit);
  }

  return sorted.slice(0, limit);
}

/** @template {GeographicPoint} T @param {T[]} nodes @param {number} limit @param {GeographicPoint} location */
export function limitNodesByDistance(nodes, limit, location) {
  if (nodes.length <= limit) return nodes;
  return nodes.slice().sort((a, b) => nodeDistanceSq(a, location) - nodeDistanceSq(b, location)).slice(0, limit);
}
