const URBAN_LANDUSE_TYPES = new Set([
  "residential",
  "commercial",
  "industrial",
  "retail",
  "construction",
  "brownfield",
  "garages",
  "railway",
  "harbour",
  "port",
  "military"
]);

const GREEN_LANDUSE_TYPES = new Set([
  "forest",
  "wood",
  "park",
  "garden",
  "grass",
  "meadow",
  "orchard",
  "vineyard",
  "allotments",
  "farmland",
  "recreation_ground",
  "village_green",
  "cemetery"
]);

function boundsIntersectLocal(a, b, padding = 0) {
  if (!a || !b) return false;
  return !(
    a.maxX < b.minX - padding ||
    a.minX > b.maxX + padding ||
    a.maxZ < b.minZ - padding ||
    a.minZ > b.maxZ + padding
  );
}

function expandBoundsLocal(bounds, padding = 0) {
  if (!bounds) return null;
  const pad = Number.isFinite(padding) ? Math.max(0, padding) : 0;
  return {
    minX: bounds.minX - pad,
    maxX: bounds.maxX + pad,
    minZ: bounds.minZ - pad,
    maxZ: bounds.maxZ + pad
  };
}

function pointsBoundsLocal(points = [], padding = 0) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return null;
  }
  return expandBoundsLocal({ minX, maxX, minZ, maxZ }, padding);
}

function isUrbanLanduseType(type = "") {
  return URBAN_LANDUSE_TYPES.has(type);
}

function isGreenLanduseType(type = "") {
  return GREEN_LANDUSE_TYPES.has(type);
}

export {
  boundsIntersectLocal,
  expandBoundsLocal,
  isGreenLanduseType,
  isUrbanLanduseType,
  pointsBoundsLocal
};
