function sampleDiscoverySurfaceY(appCtx, x, z) {
  const walkSurface = Number(appCtx?.SurfaceQuery?.walkAt?.(x, z)?.position?.y);
  if (Number.isFinite(walkSurface)) return walkSurface;
  const terrainSurface = Number(appCtx?.terrainYAtWorld?.(x, z));
  return Number.isFinite(terrainSurface) ? terrainSurface : NaN;
}

export { sampleDiscoverySurfaceY };
