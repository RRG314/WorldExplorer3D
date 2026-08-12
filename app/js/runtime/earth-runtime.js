// Earth location runtime boundary.
//
// Keep the title shell and planetary launch choices independent from the
// comparatively large local-world compiler. Import order preserves the
// initialization contract that previously lived in app-entry.js.
import '../ground.js?v=80';
import '../terrain.js?v=210';
import '../world.js?v=306';
import '../building-entry.js?v=5';

export const EARTH_RUNTIME_READY = true;
