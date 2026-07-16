import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const APP_JS = path.join(ROOT, 'app', 'js');
const DEFAULT_MAX_LINES = 700;
const ABSOLUTE_MAX_LINES = 1000;
const WORLD_COLLECTIONS = [
  'roads', 'roadMeshes', 'urbanSurfaceMeshes', 'buildings', 'buildingMeshes',
  'dynamicBuildingColliders', 'landuses', 'surfaceFeatureHints', 'landuseMeshes',
  'waterAreas', 'waterways', 'waterWaveVisuals', 'linearFeatures', 'linearFeatureMeshes',
  'structureVisualMeshes', 'pois', 'poiMeshes', 'historicSites', 'historicMarkers',
  'streetFurnitureMeshes', 'vegetationFeatures', 'vegetationMeshes'
];

const LEGACY_LINE_BUDGETS = Object.freeze({});

function listJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.js') ? [absolute] : [];
  });
}

function relativeFile(file) {
  return path.relative(APP_JS, file).split(path.sep).join('/');
}

function countLines(source) {
  return source.length === 0 ? 0 : source.split(/\r?\n/).length - (source.endsWith('\n') ? 1 : 0);
}

const failures = [];
const files = listJavaScriptFiles(APP_JS);

for (const file of files) {
  const relative = relativeFile(file);
  const source = fs.readFileSync(file, 'utf8');
  const lines = countLines(source);
  const budget = LEGACY_LINE_BUDGETS[relative] ?? DEFAULT_MAX_LINES;

  if (lines > ABSOLUTE_MAX_LINES) {
    failures.push(`${relative}: ${lines} lines exceeds the absolute ${ABSOLUTE_MAX_LINES}-line ceiling`);
  } else if (lines > budget) {
    failures.push(`${relative}: ${lines} lines exceeds its ${budget}-line growth budget`);
  }

  if (relative !== 'env.js' && /appCtx\.(?:onMoon|onMars)\s*=/.test(source)) {
    failures.push(`${relative}: writes environment surface flags owned by env.js`);
  }

  if (relative !== 'pause-state.js' && /appCtx\.paused\s*=/.test(source)) {
    failures.push(`${relative}: writes pause state instead of using pause-state.js`);
  }

  if (relative !== 'camera-mode.js' && /(?:appCtx|ctx\.appCtx)\.camMode\s*=(?!=)/.test(source)) {
    failures.push(`${relative}: writes camera mode instead of using camera-mode.js`);
  }

  if (relative !== 'travel-mode.js' && /appCtx\.droneMode\s*=(?!=)/.test(source)) {
    failures.push(`${relative}: writes drone mode instead of using travel-mode.js`);
  }

  if (relative !== 'env.js' && /appCtx\.travelingToMoon\s*=(?!=)/.test(source)) {
    failures.push(`${relative}: writes environment transition state instead of using env.js`);
  }

  if (relative !== 'location-session.js' && /appCtx\.(?:selLoc|customLoc|customLocTransient)\s*=(?!=)/.test(source)) {
    failures.push(`${relative}: writes location selection instead of using location-session.js`);
  }

  const worldCollectionPattern = new RegExp(`appCtx\\.(?:${WORLD_COLLECTIONS.join('|')})\\s*=(?!=)`);
  if (relative !== 'world/collection-registry.js' && worldCollectionPattern.test(source)) {
    failures.push(`${relative}: replaces a world collection instead of using world/collection-registry.js`);
  }

  if ((relative === 'input.js' || relative === 'ui.js' || relative.startsWith('ui/')) && /appCtx\.droneMode\s*=/.test(source)) {
    failures.push(`${relative}: UI/input code writes travel state instead of using travel-mode.js`);
  }

  if (
    (relative === 'input.js' || relative === 'ui.js' || relative.startsWith('ui/')) &&
    /appCtx\.Walk\.(?:setModeDrive|setModeWalk|toggleWalk)\s*\(/.test(source)
  ) {
    failures.push(`${relative}: UI/input code calls a walking-mode implementation instead of travel-mode.js`);
  }
}

for (const legacyFile of Object.keys(LEGACY_LINE_BUDGETS)) {
  if (!fs.existsSync(path.join(APP_JS, legacyFile))) {
    failures.push(`${legacyFile}: stale legacy line-budget entry; remove it`);
  }
}

if (failures.length > 0) {
  console.error('[maintainability] Guard failed:');
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

const legacyCount = Object.keys(LEGACY_LINE_BUDGETS).length;
console.log(`[maintainability] ${files.length} modules checked; no file exceeds ${ABSOLUTE_MAX_LINES} lines.`);
console.log(`[maintainability] New modules are capped at ${DEFAULT_MAX_LINES} lines; ${legacyCount} legacy modules cannot grow.`);
console.log('[maintainability] Environment and UI travel-state ownership checks passed.');
