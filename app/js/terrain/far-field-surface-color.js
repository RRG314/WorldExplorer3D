function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

const FAR_BUILT_SURFACE_COLOR = Object.freeze([0.39, 0.41, 0.40]);
const FAR_SEMANTIC_FALLBACK_COLORS = Object.freeze({
  snow: Object.freeze([0.82, 0.85, 0.87]),
  snowRock: Object.freeze([0.68, 0.71, 0.74]),
  sand: Object.freeze([0.66, 0.58, 0.41])
});

function smoothstep(edge0, edge1, value) {
  const t = clamp01((Number(value) - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function multiplyColor(base, tint) {
  return [0, 1, 2].map((channel) =>
    clamp01(Number(base?.[channel] || 0) * Number(tint?.[channel] ?? 1))
  );
}

function mixColor(from, to, amount) {
  const t = clamp01(amount);
  return [0, 1, 2].map((channel) =>
    Number(from?.[channel] || 0) * (1 - t) + Number(to?.[channel] || 0) * t
  );
}

export function resolveFarFieldFallbackColor({
  meters = 0,
  latitude = 0,
  longitude = 0,
  locationMode = null
} = {}) {
  const semanticColor = FAR_SEMANTIC_FALLBACK_COLORS[String(locationMode || '')];
  if (semanticColor) return [...semanticColor];

  const broadVariation = Math.sin(latitude * 41.7 + longitude * 27.3) * 0.5 + 0.5;
  if (meters >= 2200) return [0.82, 0.85, 0.87];
  if (meters >= 900) return [0.43, 0.45, 0.43];
  if (meters >= 240) {
    return [0.27 + broadVariation * 0.05, 0.36 + broadVariation * 0.08, 0.24 + broadVariation * 0.04];
  }
  return [0.43 + broadVariation * 0.08, 0.47 + broadVariation * 0.07, 0.42 + broadVariation * 0.05];
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

export function sampleWorldCoverBuiltWeight(result, bounds, latitude, longitude) {
  const values = result?.surfaceBuiltWeights;
  const size = Number(result?.surfaceBuiltWeightSize || 0);
  const latN = Number(bounds?.latN);
  const latS = Number(bounds?.latS);
  const lonW = Number(bounds?.lonW);
  const lonE = Number(bounds?.lonE);
  if (!values || size < 2 ||
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
  const north = Number(values[y0 * size + x0] || 0) * (1 - tx) +
    Number(values[y0 * size + x1] || 0) * tx;
  const south = Number(values[y1 * size + x0] || 0) * (1 - tx) +
    Number(values[y1 * size + x1] || 0) * tx;
  return (north * (1 - ty) + south * ty) / 255;
}

export function sampleDetailedWorldCoverSurface(surfaces, latitude, longitude) {
  for (const surface of surfaces || []) {
    const bounds = surface?.bounds;
    if (!bounds || latitude > Number(bounds.latN) || latitude < Number(bounds.latS) ||
        longitude < Number(bounds.lonW) || longitude > Number(bounds.lonE)) continue;
    const tint = sampleWorldCoverSurfaceTint(surface.result, bounds, latitude, longitude);
    if (!tint) continue;
    return {
      tint,
      builtWeight: sampleWorldCoverBuiltWeight(
        surface.result,
        bounds,
        latitude,
        longitude
      )
    };
  }
  return null;
}

export function resolveFarFieldSurfaceColor({
  detailedWorldCoverSurface = null,
  mappedColor = null,
  worldCoverResult = null,
  worldCoverBounds = null,
  latitude,
  longitude,
  fallbackColor = null
} = {}) {
  const baseColor = mappedColor || fallbackColor;
  if (!baseColor) return null;
  const tint = detailedWorldCoverSurface?.tint ||
    sampleWorldCoverSurfaceTint(worldCoverResult, worldCoverBounds, latitude, longitude);
  if (!tint) return baseColor;

  // WorldCover surface tints are PBR multipliers, not display colors. Treating
  // them as absolute RGB made the far field pale while detailed city tiles used
  // gray built PBR, exposing the detailed terrain as a rectangular city square.
  const naturalColor = multiplyColor(baseColor, tint);
  const builtColor = multiplyColor(FAR_BUILT_SURFACE_COLOR, tint);
  const builtWeight = detailedWorldCoverSurface?.builtWeight != null &&
      Number.isFinite(Number(detailedWorldCoverSurface.builtWeight))
    ? Number(detailedWorldCoverSurface.builtWeight)
    : sampleWorldCoverBuiltWeight(
      worldCoverResult,
      worldCoverBounds,
      latitude,
      longitude
    );
  return mixColor(
    naturalColor,
    builtColor,
    smoothstep(0.18, 0.72, Number(builtWeight) || 0)
  );
}

export function sampleDetailedWorldCoverSurfaceTint(surfaces, latitude, longitude) {
  return sampleDetailedWorldCoverSurface(surfaces, latitude, longitude)?.tint || null;
}
