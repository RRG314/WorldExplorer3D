import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(rootDir, 'app', 'data', 'buildings');
const API_ROOT = 'https://api.openstreetmap.org/api/0.6/map.json';
const QUERY_RADIUS = 0.004;
const TAG_KEYS = new Set([
  'building', 'building:levels', 'building:min_level', 'height', 'min_height',
  'roof:shape', 'roof:height', 'roof:levels', 'name', 'amenity', 'tourism',
  'shop', 'historic', 'office', 'addr:housename'
]);
const LOCATIONS = [
  ['baltimore', 39.2904, -76.6122], ['hollywood', 34.0928, -118.3287],
  ['newyork', 40.7580, -73.9855], ['miami', 25.7617, -80.1918],
  ['tokyo', 35.6762, 139.6503], ['monaco', 43.7384, 7.4246],
  ['nurburgring', 50.3356, 6.9475], ['lasvegas', 36.1699, -115.1398],
  ['london', 51.5074, -0.1278], ['paris', 48.8566, 2.3522],
  ['dubai', 25.2048, 55.2708], ['sanfrancisco', 37.7749, -122.4194],
  ['losangeles', 34.0522, -118.2437], ['chicago', 41.8781, -87.6298],
  ['seattle', 47.6062, -122.3321]
].map(([id, lat, lon]) => ({ id, center: { lat, lon } }));

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compactTags(tags = {}) {
  return Object.fromEntries(Object.entries(tags).filter(([key, value]) => TAG_KEYS.has(key) && String(value).trim() !== ''));
}

async function fetchJsonWithRetry(url, id) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'WorldExplorer3D preset building metadata updater (github.com/RRG314/WorldExplorer3D)' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await delay(attempt * 1800);
    }
  }
  throw new Error(`${id}: OSM API ${lastError?.message || lastError}`);
}

async function buildPack(spec) {
  const { lat, lon } = spec.center;
  const bbox = [lon - QUERY_RADIUS, lat - QUERY_RADIUS, lon + QUERY_RADIUS, lat + QUERY_RADIUS].join(',');
  const data = await fetchJsonWithRetry(`${API_ROOT}?bbox=${bbox}`, spec.id);
  const nodes = new Map((data.elements || []).filter((element) => element?.type === 'node').map((node) => [node.id, node]));
  const elements = [];
  for (const way of data.elements || []) {
    if (way?.type !== 'way' || !way.tags?.building || way.tags.building === 'no') continue;
    const points = (way.nodes || []).map((id) => nodes.get(id)).filter(Boolean);
    if (points.length < 3) continue;
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    points.forEach((point) => {
      minLat = Math.min(minLat, Number(point.lat));
      maxLat = Math.max(maxLat, Number(point.lat));
      minLon = Math.min(minLon, Number(point.lon));
      maxLon = Math.max(maxLon, Number(point.lon));
    });
    elements.push({
      type: 'way',
      id: way.id,
      center: { lat: (minLat + maxLat) * 0.5, lon: (minLon + maxLon) * 0.5 },
      tags: compactTags(way.tags)
    });
  }
  return {
    schemaVersion: 1,
    id: spec.id,
    center: spec.center,
    queryRadiusDegrees: QUERY_RADIUS,
    matchRadiusDegrees: 0.006,
    generatedAt: new Date().toISOString(),
    source: 'https://www.openstreetmap.org/copyright',
    license: 'ODbL-1.0',
    elements
  };
}

await fs.mkdir(outputDir, { recursive: true });
const indexRecords = [];
for (let i = 0; i < LOCATIONS.length; i++) {
  const pack = await buildPack(LOCATIONS[i]);
  await fs.writeFile(path.join(outputDir, `${pack.id}.json`), `${JSON.stringify(pack)}\n`, 'utf8');
  indexRecords.push({
    id: pack.id,
    center: pack.center,
    matchRadiusDegrees: pack.matchRadiusDegrees,
    elements: pack.elements.length
  });
  console.log(`[building-metadata] ${pack.id}: ${pack.elements.length}`);
  if (i < LOCATIONS.length - 1) await delay(700);
}
await fs.writeFile(path.join(outputDir, 'index.json'), `${JSON.stringify({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: 'https://www.openstreetmap.org/copyright',
  license: 'ODbL-1.0',
  packs: indexRecords
})}\n`, 'utf8');
