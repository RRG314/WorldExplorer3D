import { ctx as appCtx } from '../shared-context.js?v=55';
import { marineService } from '../geospatial/marine.js?v=2';
import { resolveWaterOpticsEvidence } from './water-optics-evidence.js?v=2';
import { createWaterEnvironmentController } from './water-environment-controller.js?v=1';

const controller = createWaterEnvironmentController({appCtx, marineService, resolveEvidence:resolveWaterOpticsEvidence});
const refreshWaterEnvironmentEvidence = controller.refresh;
const cancelWaterEnvironmentEvidence = controller.cancel;
Object.assign(appCtx, { refreshWaterEnvironmentEvidence, cancelWaterEnvironmentEvidence });
export { refreshWaterEnvironmentEvidence };
