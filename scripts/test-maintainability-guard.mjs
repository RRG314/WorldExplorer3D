import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const APP_JS = path.join(ROOT, 'app', 'js');
const PRODUCTION_ROOTS = [
  APP_JS,
  path.join(ROOT, 'functions'),
  path.join(ROOT, 'js')
];
const OWNERSHIP_REVIEW_LINES = 500;
const SHARED_CONTEXT_IMPORT_BUDGET = 155;
const APP_ENTRY_STATIC_IMPORT_BUDGET = 58;
const RUNTIME_DOMAIN_MODULES = new Set([
  'runtime/app-runtime.js',
  'runtime/destination-session.js',
  'runtime/kernel.js',
  'runtime/lifecycle-scope.js'
]);
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

function staticModuleSpecifiers(source) {
  return [...source.matchAll(/\b(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g)]
    .map((match) => match[1]);
}

function resolveAppModule(importer, specifier) {
  if (!specifier.startsWith('.')) return null;
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0];
  const unresolved = path.resolve(path.dirname(importer), cleanSpecifier);
  const candidates = [
    unresolved,
    `${unresolved}.js`,
    path.join(unresolved, 'index.js')
  ];
  return candidates.find((candidate) => (
    candidate.startsWith(`${APP_JS}${path.sep}`) &&
    fs.existsSync(candidate) &&
    fs.statSync(candidate).isFile()
  )) || null;
}

function findImportCycles(graph) {
  const cycles = [];
  const state = new Map();
  const stack = [];
  const stackIndex = new Map();

  function visit(file) {
    state.set(file, 'visiting');
    stackIndex.set(file, stack.length);
    stack.push(file);
    for (const dependency of graph.get(file) || []) {
      if (!state.has(dependency)) {
        visit(dependency);
      } else if (state.get(dependency) === 'visiting') {
        const start = stackIndex.get(dependency);
        cycles.push([...stack.slice(start), dependency]);
      }
    }
    stack.pop();
    stackIndex.delete(file);
    state.set(file, 'visited');
  }

  for (const file of graph.keys()) {
    if (!state.has(file)) visit(file);
  }
  return cycles;
}

const failures = [];
const files = PRODUCTION_ROOTS.flatMap((directory) => listJavaScriptFiles(directory));
const appFiles = files.filter((file) => file.startsWith(`${APP_JS}${path.sep}`));
const ownershipReview = [];
const importGraph = new Map();
let sharedContextImporters = 0;
let appEntryStaticImports = 0;

for (const file of files) {
  const relative = relativeFile(file);
  const appRelative = appRelativeFile(file);
  const source = fs.readFileSync(file, 'utf8');
  const lines = countLines(source);

  if (lines > OWNERSHIP_REVIEW_LINES) ownershipReview.push({ relative, lines });

  if (!appRelative) continue;

  const specifiers = staticModuleSpecifiers(source);
  importGraph.set(file, specifiers.map((specifier) => resolveAppModule(file, specifier)).filter(Boolean));
  if (specifiers.some((specifier) => /(?:^|\/)shared-context\.js(?:[?#]|$)/.test(specifier))) {
    sharedContextImporters++;
  }
  if (appRelative === 'app-entry.js') appEntryStaticImports = specifiers.length;

  if (RUNTIME_DOMAIN_MODULES.has(appRelative)) {
    const forbiddenImport = specifiers.find((specifier) => (
      /(?:^|\/)shared-context\.js(?:[?#]|$)/.test(specifier) ||
      /firebase|gstatic|https?:\/\//i.test(specifier)
    ));
    if (forbiddenImport) {
      failures.push(`${relative}: runtime domain imports forbidden adapter ${forbiddenImport}`);
    }
    if (specifiers.some((specifier) => /[?#]/.test(specifier))) {
      failures.push(`${relative}: runtime domain embeds a cache version in an import`);
    }
    if (/\b(?:document|window|fetch|XMLHttpRequest|localStorage|sessionStorage)\b/.test(source)) {
      failures.push(`${relative}: runtime domain accesses a browser or network adapter directly`);
    }
  }

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

if (sharedContextImporters > SHARED_CONTEXT_IMPORT_BUDGET) {
  failures.push(
    `app/js: ${sharedContextImporters} modules import shared-context.js; ` +
    `the recovery baseline is ${SHARED_CONTEXT_IMPORT_BUDGET} and must only decrease`
  );
}

if (appEntryStaticImports > APP_ENTRY_STATIC_IMPORT_BUDGET) {
  failures.push(
    `app/js/app-entry.js: ${appEntryStaticImports} static dependencies; ` +
    `the recovery baseline is ${APP_ENTRY_STATIC_IMPORT_BUDGET} and must only decrease`
  );
}

for (const cycle of findImportCycles(importGraph)) {
  failures.push(`app/js import cycle: ${cycle.map(relativeFile).join(' -> ')}`);
}

if (failures.length > 0) {
  console.error('[maintainability] Guard failed:');
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

ownershipReview.sort((left, right) => right.lines - left.lines);
const reviewPreview = ownershipReview.slice(0, 12).map(({ relative, lines }) => `${relative} (${lines})`).join(', ');
console.log(`[maintainability] ${files.length} production modules checked across app/js, functions, and js.`);
console.log(`[maintainability] ${appFiles.length} app modules form an acyclic static import graph.`);
console.log(`[maintainability] shared-context consumers: ${sharedContextImporters}/${SHARED_CONTEXT_IMPORT_BUDGET} recovery baseline.`);
console.log(`[maintainability] app-entry static dependencies: ${appEntryStaticImports}/${APP_ENTRY_STATIC_IMPORT_BUDGET} recovery baseline.`);
console.log(`[maintainability] ${ownershipReview.length} modules exceed the ${OWNERSHIP_REVIEW_LINES}-line ownership-review threshold (reported, not treated as an architectural failure).`);
if (reviewPreview) console.log(`[maintainability] Largest review targets: ${reviewPreview}`);
console.log('[maintainability] Environment, travel-state, and migrated surface-query ownership checks passed.');
