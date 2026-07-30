function findGradeSeparatedRoad(roads, sampleFeatureSurfaceY, x, z) {
  let best = null;
  let nearest = null;
  for (const road of roads || []) {
    if (road?.structureSemantics?.terrainMode === "at_grade" || !Array.isArray(road?.pts)) continue;
    for (let i = 0; i < road.pts.length - 1; i++) {
      const p1 = road.pts[i];
      const p2 = road.pts[i + 1];
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const t = Math.max(0, Math.min(1, ((x - p1.x) * dx + (z - p1.z) * dz) / (dx * dx + dz * dz || 1)));
      const projectedX = p1.x + dx * t;
      const projectedZ = p1.z + dz * t;
      const dist = Math.hypot(x - projectedX, z - projectedZ);
      if (!nearest || dist < nearest.dist) nearest = { road, dist };
      const snapDistance = road.structureSemantics?.structureKind === "bridge" ? 42 : 18;
      if (dist > snapDistance || (best && dist >= best.dist)) continue;
      const y = sampleFeatureSurfaceY(road, x, z, { segIndex: i, t });
      if (Number.isFinite(y)) best = { road, dist, y, x: projectedX, z: projectedZ };
    }
  }
  return {
    best,
    diagnostic: nearest ? {
      distance: nearest.dist,
      kind: nearest.road?.structureSemantics?.structureKind || null,
      width: Number(nearest.road?.width || 0)
    } : null
  };
}

export { findGradeSeparatedRoad };
