// The building provider covers a metric circle, independently of the smaller
// streets/land-use request. Its enclosing square is only a coarse geographic
// filter; the compiler still applies the exact circle in the same world frame.
export function detailedBuildingExclusionWindow(ctx) {
  const radius = Number(ctx.worldLoadRuntimeState?.buildingVisibleRadiusWorld);
  if (!Number.isFinite(radius) || radius <= 0) return null;
  return { minX: -radius, maxX: radius, minZ: -radius, maxZ: radius };
}
