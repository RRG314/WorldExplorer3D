// ES module entrypoint with explicit application boot contract.
// Import order mirrors legacy runtime dependencies.
import './rdt.js?v=52';
import './config.js?v=52';
import './state.js?v=52';
import './perf.js?v=52';
import './env.js?v=52';
import './real-estate.js?v=52';
import './ground.js?v=52';
import './terrain.js?v=52';
import './world.js?v=52';
import { init, tryEnablePostProcessing } from './engine.js?v=52';
import './physics.js?v=52';
import './walking.js?v=52';
import './sky.js?v=52';
import './solar-system.js?v=52';
import './space.js?v=52';
import './game.js?v=52';
import './input.js?v=52';
import './hud.js?v=52';
import './map.js?v=52';
import { renderLoop } from './main.js?v=52';
import './memory.js?v=52';
import './blocks.js?v=52';
import { setupUI } from './ui.js?v=52';

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
