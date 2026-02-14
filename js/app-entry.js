// ES module entrypoint with explicit application boot contract.
// Import order mirrors legacy runtime dependencies.
import './rdt.js?v=51';
import './config.js?v=51';
import './state.js?v=51';
import './perf.js?v=51';
import './env.js?v=51';
import './real-estate.js?v=51';
import './ground.js?v=51';
import './terrain.js?v=51';
import './world.js?v=51';
import { init, tryEnablePostProcessing } from './engine.js?v=51';
import './physics.js?v=51';
import './walking.js?v=51';
import './sky.js?v=51';
import './solar-system.js?v=51';
import './space.js?v=51';
import './game.js?v=51';
import './input.js?v=51';
import './hud.js?v=51';
import './map.js?v=51';
import { renderLoop } from './main.js?v=51';
import './memory.js?v=51';
import './blocks.js?v=51';
import { setupUI } from './ui.js?v=51';

let _booted = false;

function bootApp() {
    if (_booted) {
        return { tryEnablePostProcessing };
    }
    init();
    setupUI();
    renderLoop();
    _booted = true;
    return { tryEnablePostProcessing };
}

export { bootApp, tryEnablePostProcessing };
