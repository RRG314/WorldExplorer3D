// Local swept-disc avoidance on the mapped path, never a force pushing walkers
// into roads or buildings. A spatial hash bounds neighbor work per simulation step.
export function createPedestrianSpacing(agents, poseAt, { clearance = .72, cellSize = 2 } = {}) {
  const cells = new Map(), records = new Map();
  const key = (x, z) => `${Math.floor(x / cellSize)}:${Math.floor(z / cellSize)}`;
  function update(agent, pose) {
    const old = records.get(agent);
    if (old) cells.get(old.key)?.delete(old);
    if (!pose) return;
    const record = { agent, ...pose, key: key(pose.x, pose.z) };
    records.set(agent, record);
    if (!cells.has(record.key)) cells.set(record.key, new Set());
    cells.get(record.key).add(record);
  }
  for (const agent of agents) update(agent, poseAt(agent));
  function limit(agent, dx, dz) {
    const p = records.get(agent), a = dx * dx + dz * dz;
    if (!p || a < 1e-12) return 1;
    let fraction = 1;
    const minX = Math.floor((Math.min(p.x, p.x + dx) - clearance) / cellSize);
    const maxX = Math.floor((Math.max(p.x, p.x + dx) + clearance) / cellSize);
    const minZ = Math.floor((Math.min(p.z, p.z + dz) - clearance) / cellSize);
    const maxZ = Math.floor((Math.max(p.z, p.z + dz) + clearance) / cellSize);
    for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
      for (const q of cells.get(`${x}:${z}`) || []) {
        if (q.agent === agent || Math.abs((q.y || 0) - (p.y || 0)) > 2) continue;
        const ox = p.x - q.x, oz = p.z - q.z;
        const c = ox * ox + oz * oz - clearance * clearance;
        const b = 2 * (ox * dx + oz * dz);
        if (c <= 0) { if (b < 0) fraction = 0; continue; }
        const discriminant = b * b - 4 * a * c;
        if (b >= 0 || discriminant < 0) continue;
        const contact = (-b - Math.sqrt(discriminant)) / (2 * a);
        if (contact >= 0 && contact < fraction) fraction = Math.max(0, contact - .001);
      }
    }
    return fraction;
  }
  return { limit, update };
}
