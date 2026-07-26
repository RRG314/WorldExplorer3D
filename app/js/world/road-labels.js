const LABEL_CELL_METERS = 220;
const MAX_LABEL_DISTANCE_METERS = 34;

function cellKey(x, z) {
  return `${Math.floor(x / LABEL_CELL_METERS)},${Math.floor(z / LABEL_CELL_METERS)}`;
}

function lineParts(geometry) {
  if (geometry?.type === 'LineString') return [geometry.coordinates];
  if (geometry?.type === 'MultiLineString') return geometry.coordinates || [];
  return [];
}

function pointSegmentDistanceSq(point, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= 0.0001) return (point.x - a.x) ** 2 + (point.z - a.z) ** 2;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSq));
  const x = a.x + dx * t;
  const z = a.z + dz * t;
  return (point.x - x) ** 2 + (point.z - z) ** 2;
}

function distanceToLineSq(point, line) {
  let nearest = Infinity;
  for (let index = 1; index < line.length; index += 1) {
    nearest = Math.min(nearest, pointSegmentDistanceSq(point, line[index - 1], line[index]));
  }
  return nearest;
}

function sampledRoadPoints(points) {
  const last = points.length - 1;
  return [...new Set([0, Math.floor(last * 0.25), Math.floor(last * 0.5), Math.floor(last * 0.75), last])]
    .map((index) => points[index])
    .filter(Boolean);
}

export function createRoadNameResolver(tileRecord, cleanLine) {
  const layer = tileRecord?.tile?.layers?.street_labels;
  if (!layer || !Number.isFinite(layer.length)) return () => '';

  const labels = [];
  const grid = new Map();
  for (let featureIndex = 0; featureIndex < layer.length; featureIndex += 1) {
    const feature = layer.feature(featureIndex);
    if (!feature || typeof feature.toGeoJSON !== 'function') continue;
    const geojson = feature.toGeoJSON(tileRecord.x, tileRecord.y, tileRecord.z);
    const properties = geojson.properties || {};
    const name = String(properties.name || properties.name_en || properties.ref || '').trim();
    if (!name) continue;
    lineParts(geojson.geometry).forEach((coordinates) => {
      const points = cleanLine(coordinates);
      if (points.length < 2) return;
      const label = {
        kind: String(properties.kind || '').toLowerCase(),
        name,
        points
      };
      const labelIndex = labels.push(label) - 1;
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      points.forEach((point) => {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minZ = Math.min(minZ, point.z);
        maxZ = Math.max(maxZ, point.z);
      });
      const minCellX = Math.floor((minX - MAX_LABEL_DISTANCE_METERS) / LABEL_CELL_METERS);
      const maxCellX = Math.floor((maxX + MAX_LABEL_DISTANCE_METERS) / LABEL_CELL_METERS);
      const minCellZ = Math.floor((minZ - MAX_LABEL_DISTANCE_METERS) / LABEL_CELL_METERS);
      const maxCellZ = Math.floor((maxZ + MAX_LABEL_DISTANCE_METERS) / LABEL_CELL_METERS);
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
          const key = `${cellX},${cellZ}`;
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(labelIndex);
        }
      }
    });
  }

  return (roadPoints, roadKind = '') => {
    if (!Array.isArray(roadPoints) || roadPoints.length < 2) return '';
    const samples = sampledRoadPoints(roadPoints);
    const candidateIndexes = new Set();
    samples.forEach((point) => (grid.get(cellKey(point.x, point.z)) || []).forEach((index) => candidateIndexes.add(index)));
    let bestName = '';
    let bestScore = MAX_LABEL_DISTANCE_METERS ** 2;
    const normalizedKind = String(roadKind || '').toLowerCase();
    candidateIndexes.forEach((index) => {
      const label = labels[index];
      if (!label) return;
      let score = Infinity;
      samples.forEach((point) => { score = Math.min(score, distanceToLineSq(point, label.points)); });
      if (normalizedKind && label.kind && normalizedKind !== label.kind) score += 12 ** 2;
      if (score < bestScore) {
        bestScore = score;
        bestName = label.name;
      }
    });
    return bestName;
  };
}
