// Only admitted nearby agents need a public immutable snapshot. Most actors
// are distant or hidden; allocating their full appearance/reaction snapshot
// on every collision/interaction query creates avoidable garbage each frame.
const EMPTY = Object.freeze([]);
export function nearbyPedestrianSnapshots(agents, graph, origin, radius, snapshot) {
  if (!origin) return EMPTY;
  const safeRadius = Math.max(1, Math.min(180, Number(radius) || 8));
  const result = [];
  for (const agent of agents) {
    if (agent.promoted === true || !(agent.visibility > .08)) continue;
    const edge = agent.bridge || graph.edges[agent.edgeIndex];
    if (!edge) continue;
    const progress = agent.bridge ? agent.bridge.progress : agent.progress;
    const t = Math.max(0, Math.min(1, progress / Math.max(.01, edge.length)));
    const dx = edge.p2.x - edge.p1.x, dz = edge.p2.z - edge.p1.z;
    const length = Math.max(.01, Math.hypot(dx, dz));
    const offset = agent.variant ? 0 : Number(agent.pathOffset || 0);
    const x = edge.p1.x + dx * t - dz / length * offset;
    const z = edge.p1.z + dz * t + dx / length * offset;
    if (!(Math.hypot(x - origin.x, z - origin.z) <= safeRadius)) continue;
    const entry = snapshot(agent);
    if (entry) result.push(entry);
  }
  result.sort((a, b) => Math.hypot(a.x-origin.x, a.z-origin.z) - Math.hypot(b.x-origin.x, b.z-origin.z));
  return Object.freeze(result);
}
