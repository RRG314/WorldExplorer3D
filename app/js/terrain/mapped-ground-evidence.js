// One material interpretation for detailed and regional mapped land polygons.
// Land use describes purpose, not necessarily what covers the ground.
export function mappedGroundProfile(kind = '', tags = {}) {
  const surface = String(tags.surface || '').toLowerCase();
  const physical = {
    asphalt: ['urban', [0.52, 0.54, 0.56]], concrete: ['urban', [0.94, 0.94, 0.92]],
    paving_stones: ['urban', [0.91, 0.88, 0.83]], gravel: ['rock', [0.94, 0.92, 0.88]],
    fine_gravel: ['rock', [0.96, 0.94, 0.90]], sand: ['sand', [1, 0.98, 0.93]],
    grass: ['grass', [0.88, 1, 0.80]], dirt: ['soil', [1, 0.96, 0.90]],
    earth: ['soil', [1, 0.96, 0.90]], mud: ['soil', [0.68, 0.66, 0.61]]
  }[surface];
  if (physical) return { mode: physical[0], tint: physical[1], priority: 5, evidence: 'mapped-surface' };
  const normalized = String(tags.natural || tags.landuse || tags.leisure || kind || '').toLowerCase();
  let mode; let tint; let priority = 3;
  if (['forest', 'wood', 'mangrove'].includes(normalized)) {
    mode = 'forest'; tint = [0.80, 0.88, 0.74];
  } else if (['grass', 'grassland', 'meadow', 'village_green'].includes(normalized)) {
    mode = 'grass'; tint = normalized === 'meadow' ? [0.97, 0.98, 0.78] : [0.88, 1, 0.80];
  } else if (['sand', 'beach', 'dune'].includes(normalized)) {
    mode = 'sand'; tint = [1, 0.98, 0.93];
  } else if (['bare_rock', 'scree', 'shingle', 'quarry', 'barren'].includes(normalized)) {
    mode = 'rock'; tint = [0.94, 0.92, 0.88];
  } else if (['glacier', 'snow', 'ice'].includes(normalized)) {
    mode = 'snow'; tint = [1, 1, 1];
  } else if (['wetland', 'marsh', 'bog', 'swamp'].includes(normalized)) {
    mode = 'wetland'; tint = [0.82, 0.90, 0.74];
  } else if (['farmland', 'allotments', 'plant_nursery'].includes(normalized)) {
    // Crop identity/season is unknown: no invented plough lines or crop assets.
    mode = 'soil'; tint = [0.98, 0.96, 0.85]; priority = 2;
  } else {
    // Parks, farms, homes and commercial sites can contain several surfaces.
    // Their purpose alone must not overwrite measured land cover.
    return null;
  }
  return { mode, tint, priority, evidence: 'mapped-cover' };
}

function inside(x, z, ring) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]; const b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) result = !result;
  }
  return result;
}

// Built once per collection revision, not per frame/terrain vertex. Small
// polygons win equal-evidence overlaps; identity breaks ties deterministically.
export function indexMappedGround(features = [], cellSize = 128) {
  const cells = new Map();
  for (const feature of features) {
    const profile = mappedGroundProfile(feature.type, feature.tags);
    const b = feature.bounds;
    if (!profile || !b || ![b.minX, b.maxX, b.minZ, b.maxZ].every(Number.isFinite) || !feature.pts?.length) continue;
    const item = { ...feature, ...profile, area: (b.maxX - b.minX) * (b.maxZ - b.minZ) };
    const x0 = Math.floor(b.minX / cellSize); const x1 = Math.floor(b.maxX / cellSize);
    const z0 = Math.floor(b.minZ / cellSize); const z1 = Math.floor(b.maxZ / cellSize);
    // Source guards normally bound these. Reject malformed unbounded geometry.
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 65536) continue;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const key = `${x}/${z}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(item);
    }
  }
  for (const bucket of cells.values()) bucket.sort((a, b) => b.priority - a.priority || a.area - b.area ||
    String(a.sourceFeatureId || '').localeCompare(String(b.sourceFeatureId || '')));
  return { sample(x, z) {
    return (cells.get(`${Math.floor(x / cellSize)}/${Math.floor(z / cellSize)}`) || []).find((f) =>
      x >= f.bounds.minX && x <= f.bounds.maxX && z >= f.bounds.minZ && z <= f.bounds.maxZ &&
      inside(x, z, f.pts) && !(f.holeRings || []).some((hole) => inside(x, z, hole))) || null;
  } };
}
