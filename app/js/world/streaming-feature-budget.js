const VEHICLE_KINDS = /motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|service|road/i;
const CYCLE_KINDS = /cycle/i;

function stableId(feature, index) {
  return String(feature?.id ?? index);
}

function geometryCoordinates(geometry, output = []) {
  if (!geometry) return output;
  const coordinates = geometry.coordinates;
  if (!Array.isArray(coordinates)) return output;
  if (coordinates.length > 0 && Number.isFinite(Number(coordinates[0]))) {
    output.push(coordinates);
    return output;
  }
  coordinates.forEach((part) => geometryCoordinates({ coordinates: part }, output));
  return output;
}

function featureEntries(layer) {
  const count = Math.max(0, Number(layer?.length) || 0);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const feature = layer.feature(index);
    if (!feature || typeof feature.toGeoJSON !== 'function') continue;
    const geojson = feature.toGeoJSON();
    entries.push({
      feature: { id: feature.id, toGeoJSON: () => geojson },
      geojson,
      id: stableId(feature, index)
    });
  }
  return entries;
}

function adaptedLayer(entries) {
  return {
    length: entries.length,
    feature(index) {
      return entries[index]?.feature || null;
    }
  };
}

function lineImportance(entry) {
  const properties = entry.geojson.properties || {};
  const kind = String(properties.kind || '').toLowerCase();
  const rank = [
    ['motorway', 1000], ['trunk', 950], ['primary', 900], ['secondary', 820],
    ['tertiary', 740], ['residential', 650], ['unclassified', 590],
    ['living_street', 560], ['service', 470], ['cycle', 380],
    ['pedestrian', 330], ['footway', 300], ['path', 260], ['track', 220], ['steps', 160]
  ].find(([pattern]) => kind.includes(pattern))?.[1] || 400;
  const pointCount = geometryCoordinates(entry.geojson.geometry).reduce((sum, line) => sum + line.length, 0);
  return rank + Math.min(120, pointCount * 2) + (properties.name ? 35 : 0) +
    (properties.bridge || properties.tunnel ? 90 : 0);
}

function transportClass(entry) {
  const kind = String(entry.geojson.properties?.kind || '').toLowerCase();
  if (CYCLE_KINDS.test(kind)) return 'cycleway';
  if (VEHICLE_KINDS.test(kind)) return 'road';
  return 'pedestrian';
}

function prioritized(entries, score) {
  return entries.slice().sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
}

function takeBalanced(groups, limit, ratios) {
  const selected = [];
  const leftovers = [];
  Object.entries(groups).forEach(([name, entries]) => {
    const sorted = prioritized(entries, lineImportance);
    const quota = Math.max(1, Math.floor(limit * (ratios[name] || 0)));
    selected.push(...sorted.slice(0, quota));
    leftovers.push(...sorted.slice(quota));
  });
  const selectedIds = new Set(selected.map((entry) => entry.id));
  prioritized(leftovers, lineImportance).some((entry) => {
    if (selected.length >= limit) return true;
    if (!selectedIds.has(entry.id)) {
      selected.push(entry);
      selectedIds.add(entry.id);
    }
    return false;
  });
  return selected.slice(0, limit);
}

export function selectTransportationFeatures(layer, maxFeatures) {
  const entries = featureEntries(layer);
  const limit = Math.max(1, Math.round(Number(maxFeatures) || entries.length || 1));
  if (entries.length <= limit) return { layer: adaptedLayer(entries), requested: entries.length, selected: entries.length };
  const groups = { road: [], pedestrian: [], cycleway: [] };
  entries.forEach((entry) => groups[transportClass(entry)].push(entry));
  const selected = takeBalanced(groups, limit, { road: 0.72, pedestrian: 0.2, cycleway: 0.08 });
  return {
    layer: adaptedLayer(selected),
    requested: entries.length,
    selected: selected.length,
    classes: Object.fromEntries(Object.entries(groups).map(([name, group]) => [name, group.length]))
  };
}

function polygonStats(entry) {
  const points = geometryCoordinates(entry.geojson.geometry);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  points.forEach((point) => {
    const x = Number(point[0]);
    const y = Number(point[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  return {
    area: Number.isFinite(minX) ? Math.max(0, (maxX - minX) * (maxY - minY)) : 0,
    x: Number.isFinite(minX) ? (minX + maxX) * 0.5 : 0,
    y: Number.isFinite(minY) ? (minY + maxY) * 0.5 : 0
  };
}

function buildingImportance(entry) {
  const properties = entry.geojson.properties || {};
  const height = Number(properties.height) || Number(properties.levels) * 3.2 || 0;
  return Math.min(600, height * 3) + Math.min(240, Math.sqrt(entry.stats.area) * 1e6) +
    (properties.name ? 50 : 0) + (properties.is_part ? 20 : 0);
}

export function selectBuildingFeatures(layer, maxFeatures) {
  const entries = featureEntries(layer);
  const limit = Math.max(1, Math.round(Number(maxFeatures) || entries.length || 1));
  entries.forEach((entry) => { entry.stats = polygonStats(entry); });
  if (entries.length <= limit) return { layer: adaptedLayer(entries), requested: entries.length, selected: entries.length };

  const minX = Math.min(...entries.map((entry) => entry.stats.x));
  const maxX = Math.max(...entries.map((entry) => entry.stats.x));
  const minY = Math.min(...entries.map((entry) => entry.stats.y));
  const maxY = Math.max(...entries.map((entry) => entry.stats.y));
  const gridSize = 8;
  const groups = new Map();
  entries.forEach((entry) => {
    const gx = Math.min(gridSize - 1, Math.max(0, Math.floor((entry.stats.x - minX) / Math.max(1e-12, maxX - minX) * gridSize)));
    const gy = Math.min(gridSize - 1, Math.max(0, Math.floor((entry.stats.y - minY) / Math.max(1e-12, maxY - minY) * gridSize)));
    const key = `${gx}:${gy}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  });
  const cellQueues = [...groups.entries()]
    .map(([key, group]) => {
      const [x, y] = key.split(':').map(Number);
      return { key, x, y, entries: prioritized(group, buildingImportance) };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
  const selected = [];
  if (cellQueues.length > limit) {
    const remaining = cellQueues.slice();
    const selectedCells = [remaining.shift()];
    while (selectedCells.length < limit && remaining.length > 0) {
      let bestIndex = 0;
      let bestDistance = -1;
      remaining.forEach((candidate, index) => {
        const distance = Math.min(...selectedCells.map((cell) =>
          (cell.x - candidate.x) ** 2 + (cell.y - candidate.y) ** 2
        ));
        if (distance > bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });
      selectedCells.push(remaining.splice(bestIndex, 1)[0]);
    }
    selected.push(...selectedCells.map((cell) => cell.entries[0]));
    return { layer: adaptedLayer(selected), requested: entries.length, selected: selected.length, populatedCells: groups.size };
  }
  const queues = cellQueues.map((cell) => cell.entries);
  while (selected.length < limit && queues.length > 0) {
    for (let index = queues.length - 1; index >= 0 && selected.length < limit; index -= 1) {
      const entry = queues[index].shift();
      if (entry) selected.push(entry);
      if (queues[index].length === 0) queues.splice(index, 1);
    }
  }
  return { layer: adaptedLayer(selected), requested: entries.length, selected: selected.length, populatedCells: groups.size };
}
