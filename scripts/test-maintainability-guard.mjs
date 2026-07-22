import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const APP_JS = path.join(ROOT, 'app', 'js');
const PRODUCTION_ROOTS = [
  APP_JS,
  path.join(ROOT, 'functions'),
  path.join(ROOT, 'js')
];
const DEFAULT_MAX_LINES = 700;
const ABSOLUTE_MAX_LINES = 1000;
const OWNERSHIP_REVIEW_LINES = 500;
const WORLD_COLLECTIONS = [
  'roads', 'roadMeshes', 'urbanSurfaceMeshes', 'buildings', 'buildingMeshes',
  'dynamicBuildingColliders', 'landuses', 'surfaceFeatureHints', 'landuseMeshes',
  'waterAreas', 'waterways', 'waterWaveVisuals', 'linearFeatures', 'linearFeatureMeshes',
  'structureVisualMeshes', 'pois', 'poiMeshes', 'historicSites', 'historicMarkers',
  'streetFurnitureMeshes', 'vegetationFeatures', 'vegetationMeshes'
];
const SURFACE_CONTRACT_CONSUMERS = new Set([
  'activity-editor/environment.js',
  'blocks.js',
  'editor/geometry.js',
  'flower-challenge/marker-runtime.js',
  'game/navigation-ui.js',
  'game/paint-town/claims.js',
  'game/paint-town/projectiles.js',
  'hud.js',
  'interiors/core.js',
  'memory.js',
  'physics.js',
  'physics/drone-flight.js',
  'plane-mode.js',
  'travel-mode.js',
  'walking/physics.js',
  'walking/terrain.js',
  'world/spawn-surface.js'
]);

const LEGACY_LINE_BUDGETS = Object.freeze({
  'functions/admin-dashboard.js': 1061,
  'functions/index.js': 1878,
  'functions/overlay.js': 721,
  'js/admin-dashboard.js': 1920
});

function listJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && (entry.name === 'node_modules' || entry.name === 'vendor')) return [];
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.js') ? [absolute] : [];
  });
}

function relativeFile(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function appRelativeFile(file) {
  if (!file.startsWith(`${APP_JS}${path.sep}`)) return null;
  return path.relative(APP_JS, file).split(path.sep).join('/');
}

function countLines(source) {
  return source.length === 0 ? 0 : source.split(/\r?\n/).length - (source.endsWith('\n') ? 1 : 0);
}

const failures = [];
const files = PRODUCTION_ROOTS.flatMap((directory) => listJavaScriptFiles(directory));
const ownershipReview = [];

for (const file of files) {
  const relative = relativeFile(file);
  const appRelative = appRelativeFile(file);
  const source = fs.readFileSync(file, 'utf8');
  const lines = countLines(source);
  const budget = LEGACY_LINE_BUDGETS[relative] ?? DEFAULT_MAX_LINES;

  if (lines > OWNERSHIP_REVIEW_LINES) ownershipReview.push({ relative, lines });

  if (lines > ABSOLUTE_MAX_LINES && !Object.hasOwn(LEGACY_LINE_BUDGETS, relative)) {
    failures.push(`${relative}: ${lines} lines exceeds the absolute ${ABSOLUTE_MAX_LINES}-line ceiling`);
  } else if (lines > budget) {
    failures.push(`${relative}: ${lines} lines exceeds its ${budget}-line growth budget`);
  }

  if (!appRelative) continue;

  if (appRelative !== 'env.js' && /appCtx\.(?:onMoon|onMars)\s*=/.test(source)) {
    failures.push(`${relative}: writes environment surface flags owned by env.js`);
  }

  if (appRelative !== 'env.js' && appRelative !== 'session-coordinator.js' && /(?:appCtx\.)?switchEnv\s*\(/.test(source)) {
    failures.push(`${relative}: commits environment state outside session-coordinator.js`);
  }

  if (appRelative !== 'space.js' && /(?:appCtx\.)?exitSpaceFlight\s*\(/.test(source)) {
    failures.push(`${relative}: tears down Space outside its lifecycle adapter`);
  }

  if (appRelative !== 'ocean.js' && /(?:appCtx\.)?stopOceanMode\s*\(/.test(source)) {
    failures.push(`${relative}: tears down Ocean outside its lifecycle adapter`);
  }

  if (appRelative !== 'pause-state.js' && /appCtx\.paused\s*=/.test(source)) {
    failures.push(`${relative}: writes pause state instead of using pause-state.js`);
  }

  if (appRelative !== 'camera-mode.js' && /(?:appCtx|ctx\.appCtx)\.camMode\s*=(?!=)/.test(source)) {
    failures.push(`${relative}: writes camera mode instead of using camera-mode.js`);
  }

  if (appRelative !== 'travel-mode.js' && /appCtx\.droneMode\s*=(?!=)/.test(source)) {
    failures.push(`${relative}: writes drone mode instead of using travel-mode.js`);
  }

  if (appRelative !== 'env.js' && /appCtx\.travelingToMoon\s*=(?!=)/.test(source)) {
    failures.push(`${relative}: writes environment transition state instead of using env.js`);
  }

  if (appRelative !== 'location-session.js' && /appCtx\.(?:selLoc|customLoc|customLocTransient)\s*=(?!=)/.test(source)) {
    failures.push(`${relative}: writes location selection instead of using location-session.js`);
  }

  const worldCollectionPattern = new RegExp(`appCtx\\.(?:${WORLD_COLLECTIONS.join('|')})\\s*=(?!=)`);
  if (appRelative !== 'world/collection-registry.js' && worldCollectionPattern.test(source)) {
    failures.push(`${relative}: replaces a world collection instead of using world/collection-registry.js`);
  }

  if ((appRelative === 'input.js' || appRelative === 'ui.js' || appRelative.startsWith('ui/')) && /appCtx\.droneMode\s*=/.test(source)) {
    failures.push(`${relative}: UI/input code writes travel state instead of using travel-mode.js`);
  }

  if (
    (appRelative === 'input.js' || appRelative === 'ui.js' || appRelative.startsWith('ui/')) &&
    /appCtx\.Walk\.(?:setModeDrive|setModeWalk|toggleWalk)\s*\(/.test(source)
  ) {
    failures.push(`${relative}: UI/input code calls a walking-mode implementation instead of travel-mode.js`);
  }

  if (
    SURFACE_CONTRACT_CONSUMERS.has(appRelative) &&
    /appCtx\.(?:GroundHeight|terrainMeshHeightAt|elevationWorldYAtWorldXZ|sampleInteriorWalkSurface|sampleDynamicWaterAt)/.test(source)
  ) {
    failures.push(`${relative}: bypasses SurfaceQuery from a migrated runtime consumer`);
  }
}

for (const legacyFile of Object.keys(LEGACY_LINE_BUDGETS)) {
  if (!fs.existsSync(path.join(ROOT, legacyFile))) {
    failures.push(`${legacyFile}: stale legacy line-budget entry; remove it`);
  }
}

if (failures.length > 0) {
  console.error('[maintainability] Guard failed:');
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

const legacyCount = Object.keys(LEGACY_LINE_BUDGETS).length;
ownershipReview.sort((left, right) => right.lines - left.lines);
const reviewPreview = ownershipReview.slice(0, 12).map(({ relative, lines }) => `${relative} (${lines})`).join(', ');
console.log(`[maintainability] ${files.length} production modules checked across app/js, functions, and js.`);
console.log(`[maintainability] New modules are capped at ${DEFAULT_MAX_LINES} lines; ${legacyCount} oversized legacy modules cannot grow.`);
console.log(`[maintainability] ${ownershipReview.length} modules exceed the ${OWNERSHIP_REVIEW_LINES}-line ownership-review threshold.`);
if (reviewPreview) console.log(`[maintainability] Largest review targets: ${reviewPreview}`);
console.log('[maintainability] Environment, travel-state, and migrated surface-query ownership checks passed.');
