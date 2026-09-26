// Lexical dependency evidence. Runtime ownership is reviewed in STREET_SYSTEM_AUDIT.md.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory()
  ? walk(resolve(dir, e.name)) : e.name.endsWith('.js') ? [resolve(dir, e.name)] : []);
const contracts = ['roads', 'roadMeshes', 'linearFeatures', 'linearFeatureMeshes', 'landuses',
  'surfaceFeatureHints', 'urbanSurfaceMeshes', 'buildings', 'buildingMeshes', 'dynamicBuildingColliders',
  'transportNetworkModel', 'transportSurfacePublication', 'GroundHeight', 'SurfaceQuery',
  'applyTransportTerrainCorridors', 'sampleFeatureSurfaceY', 'repositionBuildingsWithTerrain',
  'buildTraversalNetworks', 'invalidateTraversalNetworks', 'vegetationMeshes', 'streetFurnitureMeshes',
  'worldTraversalRadiusWorld', '_worldLoadSequence'];
const allFiles = walk(resolve(root, 'app/js')).sort();
const entries = allFiles.map(file => {
  const source = readFileSync(file, 'utf8');
  const mentions = [];
  source.split('\n').forEach((line, i) => {
    const names = contracts.filter(name => new RegExp(`\\b${name}\\b`).test(line));
    if (names.length) mentions.push({ line: i + 1, contracts: names });
  });
  return { file: relative(root, file), sha256: createHash('sha256').update(source).digest('hex'),
    imports: [...source.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)].map(m => m[1]), mentions };
});
const result = { schemaVersion: 1, baseline: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  method: 'All app/js JavaScript files scanned; entries retain lexical contract mentions and imports, including comments. Not a call graph or proof of live reachability.',
  scannedFiles: allFiles.length, contracts, entries: entries.filter(e => e.mentions.length) };
writeFileSync(resolve(root, 'docs/streets/street-system-inventory.json'), JSON.stringify(result, null, 2) + '\n');
console.log(`${result.scannedFiles} modules scanned; ${result.entries.length} modules reference audited contracts.`);
