// Earth location runtime boundary.
//
// Keep the title shell and planetary launch choices independent from the
// comparatively large local-world compiler. Import order preserves the
// initialization contract that previously lived in app-entry.js.
import '../ground.js?v=85';
import '../terrain.js?v=255';
import '../world.js?v=358';
import '../building-entry.js?v=7';

export const EARTH_RUNTIME_READY = true;
