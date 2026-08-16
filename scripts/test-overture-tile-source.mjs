import assert from 'node:assert/strict';
import {
  OVERTURE_RELEASE,
  OVERTURE_THEME_ZOOM,
  overtureThemeArchiveUrl,
  overtureThemeTileCoordinates
} from '../app/js/world/overture-tile-source.js';

assert.match(OVERTURE_RELEASE, /^\d{4}-\d{2}-\d{2}\.0$/);
assert.deepEqual(OVERTURE_THEME_ZOOM, { base: 13, buildings: 14, transportation: 14 });
assert.match(overtureThemeArchiveUrl('transportation'), /\/transportation\.pmtiles$/);
assert.match(overtureThemeArchiveUrl('base'), /\/base\.pmtiles$/);
assert.match(overtureThemeArchiveUrl('buildings'), /\/buildings\.pmtiles$/);
assert.deepEqual(
  overtureThemeTileCoordinates('base', 14, 4705, 6244),
  { z: 13, x: 2352, y: 3122 }
);
assert.deepEqual(
  overtureThemeTileCoordinates('transportation', 14, 4705, 6244),
  { z: 14, x: 4705, y: 6244 }
);
assert.throws(() => overtureThemeArchiveUrl('unknown'), /Unsupported Overture theme/);

console.log(JSON.stringify({
  ok: true,
  release: OVERTURE_RELEASE,
  themes: OVERTURE_THEME_ZOOM
}, null, 2));
