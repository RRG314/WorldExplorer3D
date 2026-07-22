const NATURAL_FALLBACK_MODES = new Set(['forest', 'sand', 'snow', 'snowRock', 'rock']);

export function applyWorldCoverNeighborFallback(terrainGroup, applyProfile) {
  const meshes = (terrainGroup?.children || []).filter((mesh) => mesh?.userData?.isTerrainMesh);
  const resolved = meshes.filter((mesh) => mesh.userData?.worldCoverResult && mesh.userData?.worldCoverSurfaceMode);
  if (resolved.length < 3) return;

  const counts = new Map();
  resolved.forEach((mesh) => {
    const mode = String(mesh.userData.worldCoverSurfaceMode || '');
    counts.set(mode, (counts.get(mode) || 0) + 1);
  });
  const [mode, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  const agreement = count / resolved.length;
  if (!NATURAL_FALLBACK_MODES.has(mode) || agreement < 0.72) return;

  meshes.forEach((mesh) => {
    if (mesh.userData?.worldCoverStatus !== 'unavailable') return;
    mesh.userData.worldCoverStatus = 'neighbor-fallback';
    mesh.userData.worldCoverSurfaceMode = mode;
    mesh.userData.terrainDetailProvenance = {
      kind: 'semantic-neighbor-fallback',
      source: 'esa-worldcover-neighborhood',
      mode,
      resolvedTiles: resolved.length,
      agreement
    };
    applyProfile(mesh, {
      mode,
      visualMode: mode,
      reason: `worldcover_neighbor_${mode}`,
      confidence: agreement
    });
  });
}
