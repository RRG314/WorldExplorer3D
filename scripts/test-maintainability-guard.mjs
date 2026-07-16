import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const APP_JS = path.join(ROOT, 'app', 'js');
const DEFAULT_MAX_LINES = 700;
const ABSOLUTE_MAX_LINES = 1000;

// Cohesive legacy modules may stay above the preferred ceiling, but may not grow.
// Remove entries as ownership-driven extractions bring each module below 700 lines.
const LEGACY_LINE_BUDGETS = Object.freeze({
  'activity-editor/session.js': 852,
  'blocks.js': 900,
  'boat-mode.js': 830,
  'boat-mode/surface-effects.js': 787,
  'boat-mode/water-query.js': 879,
  'editor/config.js': 885,
  'flower-challenge.js': 956,
  'hud.js': 721,
  'multiplayer/rooms.js': 999,
  'multiplayer/ui-room.js': 880,
  'ocean.js': 749,
  'physics.js': 828,
  'sky.js': 799,
  'solar-system.js': 977,
  'structure-semantics.js': 903,
  'tutorial/tutorial.js': 802,
  'ui.js': 860,
  'ui/globe-selector.js': 995,
  'weather.js': 849,
  'world/load-roads.js': 703,
  'world/streaming-vector-chunks.js': 900
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
