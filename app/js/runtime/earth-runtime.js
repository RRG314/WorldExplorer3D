// Earth location runtime boundary.
//
// Keep the title shell and planetary launch choices independent from the
// comparatively large local-world compiler. Import order preserves the
// initialization contract that previously lived in app-entry.js.
import '../ground.js?v=91';
import '../terrain.js?v=283';
import '../world.js?v=472';
import '../building-entry.js?v=9';
import { installCommunityRealityCaptureRuntime } from '../reality-capture/runtime.js?v=1';
import { ctx as appCtx } from '../shared-context.js?v=55';

installCommunityRealityCaptureRuntime(appCtx);

export const EARTH_RUNTIME_READY = true;
