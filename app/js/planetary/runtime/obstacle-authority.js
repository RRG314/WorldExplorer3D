let activeBodyId = null;
let activeObstacles = Object.freeze([]);

function normalizedObstacle(value = {}) {
  const radius = Math.max(0.1, Number(value.radius) || 0);
  return Object.freeze({
    id: String(value.id || 'planetary-obstacle'),
    bodyId: String(value.bodyId || activeBodyId || ''),
    x: Number(value.x) || 0,
    z: Number(value.z) || 0,
    radius,
    kind: String(value.kind || 'solid')
  });
}

function setActivePlanetaryObstacles(bodyId, obstacles = []) {
  activeBodyId = String(bodyId || '') || null;
  activeObstacles = Object.freeze((Array.isArray(obstacles) ? obstacles : [])
    .map((entry) => normalizedObstacle({ ...entry, bodyId: entry?.bodyId || activeBodyId }))
    .filter((entry) => entry.bodyId === activeBodyId));
  return snapshotPlanetaryObstacles();
}

function clearActivePlanetaryObstacles(bodyId = null) {
  if (bodyId && String(bodyId) !== activeBodyId) return false;
  activeBodyId = null;
  activeObstacles = Object.freeze([]);
  return true;
}

function queryPlanetaryObstacle(x, z, radius = 0, bodyId = activeBodyId) {
  if (!activeBodyId || String(bodyId || '') !== activeBodyId) return null;
  const px = Number(x);
  const pz = Number(z);
  const actorRadius = Math.max(0, Number(radius) || 0);
  if (!Number.isFinite(px) || !Number.isFinite(pz)) return null;
  const obstacle = activeObstacles.find((entry) => Math.hypot(px - entry.x, pz - entry.z) < entry.radius + actorRadius);
  return obstacle ? Object.freeze({ collision: true, obstacle }) : null;
}

function snapshotPlanetaryObstacles() {
  return Object.freeze({ bodyId: activeBodyId, obstacles: activeObstacles });
}

export {
  clearActivePlanetaryObstacles,
  queryPlanetaryObstacle,
  setActivePlanetaryObstacles,
  snapshotPlanetaryObstacles
};
