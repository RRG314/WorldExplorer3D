// Wheel contact changes height/attitude, never the path's X/Z. Filter on the
// simulation position before constructing expensive four-wheel snapshots.
export function nearbyVehicleSnapshots(agents, graph, origin, radius, snapshot) {
  if (!origin) return Object.freeze([]);
  const safeRadius = Math.max(1, Math.min(220, Number(radius) || 8));
  const result = [];
  for (const agent of agents) {
    if (agent.promoted === true || !(agent.detailPromoted === true || agent.visibility > .08)) continue;
    const edge = agent.bridge || graph.edges[agent.edgeIndex];
    if (!edge) continue;
    const progress = agent.bridge ? agent.bridge.progress : agent.progress;
    const t = Math.max(0, Math.min(1, progress / Math.max(.01, edge.length)));
    const x = edge.p1.x + (edge.p2.x - edge.p1.x) * t;
    const z = edge.p1.z + (edge.p2.z - edge.p1.z) * t;
    if (!(Math.hypot(x - origin.x, z - origin.z) <= safeRadius)) continue;
    const entry = snapshot(agent);
    if (entry) result.push(entry);
  }
  result.sort((a, b) => Math.hypot(a.x - origin.x, a.z - origin.z) - Math.hypot(b.x - origin.x, b.z - origin.z));
  return Object.freeze(result);
}
