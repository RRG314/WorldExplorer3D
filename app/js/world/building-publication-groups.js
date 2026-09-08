// Provider-declared membership only: never infer ownership from proximity.
function groupKey(way) {
  const tags = way?.tags || {};
  const parent = tags._overtureParentBuildingId || tags._overtureBuildingId;
  return parent ? `overture:${parent}` : way;
}

export function completeBuildingPublicationGroups(requested, selected, cap) {
  const groups = new Map();
  for (const way of requested) {
    const key = groupKey(way);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(way);
  }
  const result = [], visited = new Set();
  let restoredParts = 0, deferredGroups = 0;
  const selectedSet = new Set(selected);
  for (const way of selected) {
    const key = groupKey(way);
    if (visited.has(key)) continue;
    visited.add(key);
    const members = groups.get(key);
    if (!members) continue;
    // Budget groups atomically: a roof is not a cheaper substitute for a body.
    if (result.length + members.length > cap) { deferredGroups += 1; continue; }
    for (const member of members) {
      result.push(member);
      if (!selectedSet.has(member)) restoredParts += 1;
    }
  }
  return {ways: result, restoredParts, deferredGroups};
}
