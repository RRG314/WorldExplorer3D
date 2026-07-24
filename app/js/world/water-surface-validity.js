function assessMappedWaterTerrain(options = {}) {
  const heights = (Array.isArray(options.sampledHeights) ? options.sampledHeights : [])
    .map(Number)
    .filter(Number.isFinite);
  const surfaceY = Number(options.surfaceY);
  const span = Math.max(1, Number(options.span) || 1);
  const layer = String(options.layer || '').toLowerCase();
  const ambientY = Number(options.ambientY);
  const minY = heights.length > 0 ? Math.min(...heights) : NaN;
  const maxY = heights.length > 0 ? Math.max(...heights) : NaN;
  const relief = Number.isFinite(minY) && Number.isFinite(maxY) ? maxY - minY : 0;
  const reliefLimit = Math.max(18, Math.min(60, span * 0.08));
  const unknownTerrain = heights.length === 0 || heights.every((height) => Math.abs(height) < 1);
  // Streamed DEM boundaries can temporarily contribute a zero placeholder.
  // Preserve the alpine classification when the center or any real sample is high.
  const highElevation =
    (Number.isFinite(surfaceY) && surfaceY > 300) ||
    (Number.isFinite(maxY) && maxY > 300) ||
    (Number.isFinite(ambientY) && ambientY > 300);
  const missingAlpineTerrain = layer !== 'ocean' && unknownTerrain && highElevation;
  const valid = layer === 'ocean' || (!missingAlpineTerrain && (!highElevation || relief <= reliefLimit));
  return {
    valid,
    reason: valid ? 'accepted' : missingAlpineTerrain ? 'alpine_terrain_missing' : 'high_elevation_relief',
    highElevation,
    unknownTerrain,
    ambientY,
    minY,
    maxY,
    relief,
    reliefLimit,
    span
  };
}

export { assessMappedWaterTerrain };
