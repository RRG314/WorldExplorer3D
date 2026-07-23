import { ctx as appCtx } from "../shared-context.js?v=55";

export function wayCenterDistanceSq(way, nodeMap) {
  if (way?._coordinates?.length >= 2) {
    let latSum = 0;
    let lonSum = 0;
    const sampleCount = Math.min(Math.floor(way._coordinates.length / 2), 8);
    for (let i = 0; i < sampleCount; i++) {
      lonSum += way._coordinates[i * 2];
      latSum += way._coordinates[i * 2 + 1];
    }
    const lat = latSum / sampleCount;
    const lon = lonSum / sampleCount;
    const dLat = lat - appCtx.LOC.lat;
    const dLon = (lon - appCtx.LOC.lon) * Math.cos(appCtx.LOC.lat * Math.PI / 180);
    return dLat * dLat + dLon * dLon;
  }
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
  const dLat = lat - appCtx.LOC.lat;
  const dLon = (lon - appCtx.LOC.lon) * Math.cos(appCtx.LOC.lat * Math.PI / 180);
  return dLat * dLat + dLon * dLon;
}

export function nodeDistanceSq(node) {
  if (!node) return Infinity;
  const dLat = node.lat - appCtx.LOC.lat;
  const dLon = (node.lon - appCtx.LOC.lon) * Math.cos(appCtx.LOC.lat * Math.PI / 180);
  return dLat * dLat + dLon * dLon;
}

export function limitWaysByDistance(ways, nodeMap, limit, compareFn, options = {}) {
  if (ways.length <= limit) return ways;

  const sorted = ways
    .slice()
    .sort((a, b) => {
      const cmp = compareFn ? compareFn(a, b) : 0;
      if (cmp !== 0) return cmp;
      return wayCenterDistanceSq(a, nodeMap) - wayCenterDistanceSq(b, nodeMap);
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

export function limitNodesByDistance(nodes, limit) {
  if (nodes.length <= limit) return nodes;
  return nodes.slice().sort((a, b) => nodeDistanceSq(a) - nodeDistanceSq(b)).slice(0, limit);
}
