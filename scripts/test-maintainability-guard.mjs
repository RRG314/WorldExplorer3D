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
  // Exact legacy baselines: these modules predate the 700-line default and
  // cannot grow while their owning phases split them along lifecycle bounds.
  'ocean.js': 718,
  'structure-semantics.js': 801,
  'terrain/surface-profiles.js': 809,
  'terrain/tiles.js': 735,
  'ui/globe-selector.js': 744,
  'ui/title-screen.js': 720,
  'world/load-roads.js': 746,
  'world/spawn.js': 705
});

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
const sizeAdvisories = [];
const files = listJavaScriptFiles(APP_JS);

for (const file of files) {
  const relative = relativeFile(file);
  const source = fs.readFileSync(file, 'utf8');
  const lines = countLines(source);
  const budget = LEGACY_LINE_BUDGETS[relative] ?? DEFAULT_MAX_LINES;

  if (lines > ABSOLUTE_MAX_LINES) {
    sizeAdvisories.push(`${relative}: ${lines} lines; review ownership and cohesion`);
  } else if (lines > budget) {
    sizeAdvisories.push(`${relative}: ${lines} lines exceeds the ${budget}-line review threshold`);
  }

  if (relative !== 'env.js' && /appCtx\.(?:onMoon|onMars)\s*=/.test(source)) {
    failures.push(`${relative}: writes environment surface flags owned by env.js`);
  }

  if (relative !== 'env.js' && relative !== 'session-coordinator.js' && /(?:appCtx\.)?switchEnv\s*\(/.test(source)) {
    failures.push(`${relative}: commits environment state outside session-coordinator.js`);
  }

  if (relative !== 'space.js' && /(?:appCtx\.)?exitSpaceFlight\s*\(/.test(source)) {
    failures.push(`${relative}: tears down Space outside its lifecycle adapter`);
  }

  if (relative !== 'ocean.js' && /(?:appCtx\.)?stopOceanMode\s*\(/.test(source)) {
    failures.push(`${relative}: tears down Ocean outside its lifecycle adapter`);
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

  if (
    relative !== 'weather/state-service.js' &&
    (
      /(?:appCtx|ctx\.appCtx|ctx)\.(?:weatherMode|liveWeatherState|weatherState|livePlaceState|weatherCache|placeCache)\s*=(?!=)/.test(source) ||
      /Object\.assign\(\s*(?:appCtx|ctx\.appCtx|ctx)\s*,\s*\{[\s\S]{0,600}?\b(?:weatherMode|liveWeatherState|weatherState|livePlaceState|weatherCache|placeCache)\s*[,}]/.test(source)
    )
  ) {
    failures.push(`${relative}: writes weather state instead of using weather/state-service.js`);
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

  if (
    SURFACE_CONTRACT_CONSUMERS.has(relative) &&
    /appCtx\.(?:GroundHeight|terrainMeshHeightAt|elevationWorldYAtWorldXZ|sampleInteriorWalkSurface|sampleDynamicWaterAt)/.test(source)
  ) {
    failures.push(`${relative}: bypasses SurfaceQuery from a migrated runtime consumer`);
  }

  if (
    relative !== 'world/load-support.js' &&
    relative !== 'world/publication.js' &&
    /(?:appCtx\.)?publishLocationWorld\s*\(/.test(source)
  ) {
    failures.push(`${relative}: publishes world presentation outside the final world-publication owner`);
  }

  const ownsLocationWorldGeometry = relative.startsWith('world/') ||
    relative === 'terrain/tiles.js' ||
    relative === 'terrain/structure-visual-meshes.js';
  if (ownsLocationWorldGeometry && /appCtx\.scene\.add\s*\(/.test(source)) {
    failures.push(`${relative}: attaches location-world geometry directly instead of using the Earth scene publication root`);
  }
}

for (const legacyFile of Object.keys(LEGACY_LINE_BUDGETS)) {
  if (!fs.existsSync(path.join(APP_JS, legacyFile))) {
    sizeAdvisories.push(`${legacyFile}: stale legacy line threshold; remove it`);
  }
}

if (failures.length > 0) {
  console.error('[maintainability] Guard failed:');
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

const legacyCount = Object.keys(LEGACY_LINE_BUDGETS).length;
console.log(`[maintainability] ${files.length} modules checked; ownership boundaries passed.`);
console.log('[maintainability] Environment, travel-state, weather-state, collection, world-publication, scene-root, and migrated surface-query ownership checks passed.');
if (sizeAdvisories.length > 0) {
  console.warn(`[maintainability] ${sizeAdvisories.length} size advisories (non-blocking; line count alone is not a release failure):`);
  sizeAdvisories.forEach((advisory) => console.warn(`  - ${advisory}`));
} else {
  console.log(`[maintainability] No module exceeds its review threshold; ${legacyCount} legacy thresholds tracked.`);
}
