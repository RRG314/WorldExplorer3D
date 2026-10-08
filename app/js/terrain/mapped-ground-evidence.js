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

export function mappedAreaContains(feature, x, z) {
  const b = feature?.bounds;
  return !!(b && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ &&
    feature.pts?.length >= 3 && inside(x, z, feature.pts) &&
    !(feature.holeRings || []).some(hole => inside(x, z, hole)));
}

// Terrain and vegetation share the same physical-cover winner. The context
// reset drops the cache as well as the collection, so retired polygons cannot
// survive through an otherwise idle sampler after leaving Earth.
const contextIndexes = new WeakMap();
export function resetMappedGroundIndex(ctx) { contextIndexes.delete(ctx); }
export function currentMappedGroundIndex(ctx) {
  const collection = ctx.landuses;
  const count = collection?.length || 0;
  const lat = ctx.LOC?.lat, lon = ctx.LOC?.lon, generation = ctx._worldLoadSequence;
  let state = contextIndexes.get(ctx);
  if (!state || state.collection !== collection || state.count !== count ||
      state.lat !== lat || state.lon !== lon || state.generation !== generation) {
    state = { collection, count, lat, lon, generation, index: indexMappedGround(collection || []) };
    contextIndexes.set(ctx, state);
  }
  return state.index;
}

// A balanced bounds tree retains each polygon once, including large national
// forests. A grid duplicated every feature into every covered cell and silently
// dropped sufficiently large polygons. Index memory is now O(feature count),
// independent of geographic extent, overlap and query history.
export function indexMappedGround(features = []) {
  const items = [];
  for (const feature of features) {
    const profile = mappedGroundProfile(feature?.type, feature?.tags);
    const b = feature?.bounds;
    if (!profile || !b || ![b.minX, b.maxX, b.minZ, b.maxZ].every(Number.isFinite) ||
        b.minX > b.maxX || b.minZ > b.maxZ || !(feature.pts?.length >= 3)) continue;
    items.push({ ...feature, ...profile, area: (b.maxX - b.minX) * (b.maxZ - b.minZ) });
  }
  const capacity = Math.max(1, items.length * 2);
  const bounds = new Float64Array(capacity * 4);
  const ranges = new Uint32Array(capacity * 2);
  const children = new Int32Array(capacity * 2).fill(-1);
  let nodes = 0;
  const center = (item, axis) => axis === 0
    ? item.bounds.minX / 2 + item.bounds.maxX / 2
    : item.bounds.minZ / 2 + item.bounds.maxZ / 2;
  function partition(begin, end, median, axis) {
    let lo = begin, hi = end - 1;
    while (lo < hi) {
      const pivot = center(items[(lo + hi) >>> 1], axis);
      let left = lo, right = hi;
      while (left <= right) {
        while (center(items[left], axis) < pivot) left++;
        while (center(items[right], axis) > pivot) right--;
        if (left <= right) {
          const item = items[left]; items[left++] = items[right]; items[right--] = item;
        }
      }
      if (median <= right) hi = right;
      else if (median >= left) lo = left;
      else return;
    }
  }
  function build(begin, end) {
    const node = nodes++, offset = node * 4;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let i = begin; i < end; i++) {
      const b = items[i].bounds;
      minX = Math.min(minX, b.minX); minZ = Math.min(minZ, b.minZ);
      maxX = Math.max(maxX, b.maxX); maxZ = Math.max(maxZ, b.maxZ);
    }
    bounds.set([minX, minZ, maxX, maxZ], offset);
    ranges[node * 2] = begin; ranges[node * 2 + 1] = end;
    if (end - begin > 8) {
      const median = (begin + end) >>> 1;
      partition(begin, end, median, maxX - minX >= maxZ - minZ ? 0 : 1);
      children[node * 2] = build(begin, median);
      children[node * 2 + 1] = build(median, end);
    }
    return node;
  }
  if (items.length) build(0, items.length);
  const stack = [];
  return {
    stats: Object.freeze({ features: items.length, nodes, featureReferences: items.length,
      indexBytes: bounds.byteLength + ranges.byteLength + children.byteLength }),
    sample(x, z) {
      if (!items.length || !Number.isFinite(x) || !Number.isFinite(z)) return null;
      let best = null;
      stack.length = 0; stack.push(0);
      while (stack.length) {
        const node = stack.pop(), offset = node * 4;
        if (x < bounds[offset] || z < bounds[offset + 1] || x > bounds[offset + 2] || z > bounds[offset + 3]) continue;
        if (children[node * 2] >= 0) {
          stack.push(children[node * 2], children[node * 2 + 1]);
          continue;
        }
        for (let i = ranges[node * 2]; i < ranges[node * 2 + 1]; i++) {
          const candidate = items[i];
          if (best && (candidate.priority < best.priority ||
              (candidate.priority === best.priority && (candidate.area > best.area ||
                (candidate.area === best.area && String(candidate.sourceFeatureId || '').localeCompare(String(best.sourceFeatureId || '')) >= 0))))) continue;
          if (mappedAreaContains(candidate, x, z)) best = candidate;
        }
      }
      return best;
    }
  };
}
