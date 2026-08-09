function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function sampleWorldCoverSurfaceTint(result, bounds, latitude, longitude) {
  const values = result?.surfaceTints;
  const size = Number(result?.surfaceTintSize || 0);
  const encodingScale = Number(result?.surfaceTintEncodingScale || 170);
  const latN = Number(bounds?.latN);
  const latS = Number(bounds?.latS);
  const lonW = Number(bounds?.lonW);
  const lonE = Number(bounds?.lonE);
  if (!values || size < 2 || encodingScale <= 0 ||
      ![latN, latS, lonW, lonE, latitude, longitude].every(Number.isFinite) ||
      latN === latS || lonE === lonW) return null;

  const sourceX = clamp01((longitude - lonW) / (lonE - lonW)) * (size - 1);
  const sourceY = clamp01((latN - latitude) / (latN - latS)) * (size - 1);
  const x0 = Math.floor(sourceX);
  const y0 = Math.floor(sourceY);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = sourceX - x0;
  const ty = sourceY - y0;
  const sample = (x, y, channel) => Number(values[(y * size + x) * 3 + channel] || 0) / encodingScale;
  return [0, 1, 2].map((channel) => {
    const north = sample(x0, y0, channel) * (1 - tx) + sample(x1, y0, channel) * tx;
    const south = sample(x0, y1, channel) * (1 - tx) + sample(x1, y1, channel) * tx;
    return north * (1 - ty) + south * ty;
  });
}

export function resolveFarFieldSurfaceColor({
  detailedWorldCoverColor = null,
  mappedColor = null,
  worldCoverResult = null,
  worldCoverBounds = null,
  latitude,
  longitude,
  fallbackColor = null
} = {}) {
  return detailedWorldCoverColor ||
    sampleWorldCoverSurfaceTint(worldCoverResult, worldCoverBounds, latitude, longitude) ||
    mappedColor ||
    fallbackColor;
}

export function sampleDetailedWorldCoverSurfaceTint(surfaces, latitude, longitude) {
  for (const surface of surfaces || []) {
    const bounds = surface?.bounds;
    if (!bounds || latitude > Number(bounds.latN) || latitude < Number(bounds.latS) ||
        longitude < Number(bounds.lonW) || longitude > Number(bounds.lonE)) continue;
    const color = sampleWorldCoverSurfaceTint(surface.result, bounds, latitude, longitude);
    if (color) return color;
  }
  return null;
}
