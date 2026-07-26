import { earthDestinationAdapter } from './earth-session.js?v=20';
import { ENV } from './env.js?v=57';
import {
  createSharedSceneScheduler,
  earthFrameOwnerDefinition,
  renderLoop
} from './main.js?v=78';
import {
  initOceanModeUI,
  oceanDestinationAdapter,
  oceanFrameOwnerDefinition
} from './ocean.js?v=7';
import { marsDestinationAdapter } from './planetary/mars-world.js?v=17';
import { registerDestinationScheduler } from './runtime/destination-schedulers.js';
import { registerFrameOwner } from './runtime/frame-ownership.js?v=1';
import { registerEnvironmentLifecycle } from './session-coordinator.js?v=2';
import { moonDestinationAdapter } from './sky.js?v=83';
import {
  initSpaceFlightModule,
  spaceDestinationAdapter,
  spaceFrameOwnerDefinition
} from './space.js?v=94';

let composed = false;

function composeRuntimeOwnership() {
  if (composed) return false;

  [
    earthFrameOwnerDefinition,
    spaceFrameOwnerDefinition,
    oceanFrameOwnerDefinition
  ].forEach(registerFrameOwner);

  [
    ENV.EARTH,
    ENV.MOON,
    ENV.MARS
  ].filter(Boolean).forEach((destination) => {
    registerDestinationScheduler(destination, createSharedSceneScheduler);
  });

  [
    [ENV.EARTH, earthDestinationAdapter],
    [ENV.MOON, moonDestinationAdapter],
    [ENV.MARS, marsDestinationAdapter],
    [ENV.SPACE_FLIGHT, spaceDestinationAdapter],
    [ENV.OCEAN, oceanDestinationAdapter]
  ].forEach(([destination, adapter]) => {
    registerEnvironmentLifecycle(destination, adapter);
  });

  initSpaceFlightModule();
  initOceanModeUI();
  composed = true;
  return true;
}

export { composeRuntimeOwnership, renderLoop };
