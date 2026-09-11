import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(rootDir, 'app', 'data', 'featured-landmarks.json');
const API_ROOT = 'https://api.openstreetmap.org/api/0.6/map.json';

const PACKS = [
  { id: 'giza-pyramid-complex', center: { lat: 29.9792, lon: 31.1342 }, radiusDegrees: 0.011, queryRadius: 0.008 },
  { id: 'great-wall-mutianyu', center: { lat: 40.4319, lon: 116.5704 }, radiusDegrees: 0.011, queryRadius: 0.008 },
  {
    id: 'golden-gate-bridge',
    kind: 'suspension_bridge',
    center: { lat: 37.8202408, lon: -122.47857 },
    radiusDegrees: 0.026,
    queryRadius: 0.019
  }
];

function isLandmarkWay(element, spec = {}) {
  if (element?.type !== 'way' || !Array.isArray(element.nodes)) return false;
  const tags = element.tags || {};
  if (spec.kind === 'suspension_bridge') {
    return tags.wikidata === 'Q44440' ||
      tags['tower:type'] === 'bridge' ||
      tags['bridge:structure'] === 'suspension' && /golden gate/i.test(String(tags.name || tags['bridge:name'] || ''));
  }
  const roofShape = String(tags['roof:shape'] || '').toLowerCase();
  const barrier = String(tags.barrier || '').toLowerCase();
  const historic = String(tags.historic || '').toLowerCase();
  return tags.tomb === 'pyramid' || roofShape === 'pyramidal' || roofShape === 'pyramid' ||
    historic === 'citywalls' || barrier === 'city_wall' || (barrier === 'wall' && !!historic);
}

async function fetchPack(spec) {
  const { lat, lon } = spec.center;
  const radius = spec.queryRadius;
  const bbox = [lon - radius, lat - radius, lon + radius, lat + radius].join(',');
  const response = await fetch(`${API_ROOT}?bbox=${bbox}`, {
    headers: { 'User-Agent': 'WorldExplorer3D landmark pack updater (github.com/RRG314/WorldExplorer3D)' }
  });
  if (!response.ok) throw new Error(`${spec.id}: OSM API HTTP ${response.status}`);
  const data = await response.json();
  const ways = (data.elements || []).filter((element) => isLandmarkWay(element, spec));
  const nodeIds = new Set(ways.flatMap((way) => way.nodes));
  const nodes = (data.elements || []).filter((element) => element?.type === 'node' && nodeIds.has(element.id));
  return {
    id: spec.id,
    center: spec.center,
    radiusDegrees: spec.radiusDegrees,
    elements: [...nodes, ...ways]
  };
}

const packs = [];
for (const spec of PACKS) packs.push(await fetchPack(spec));
const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: 'https://www.openstreetmap.org/copyright',
  license: 'ODbL-1.0',
  packs
};
await fs.writeFile(outputPath, `${JSON.stringify(output)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, packs: packs.map((pack) => ({ id: pack.id, elements: pack.elements.length })) }, null, 2));
