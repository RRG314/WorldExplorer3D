// ES module entrypoint with explicit application boot contract.
// Import order mirrors legacy runtime dependencies.
import './rdt.js?v=54';
import './config.js?v=54';
import './state.js?v=54';
import './perf.js?v=54';
import './env.js?v=54';
import './real-estate.js?v=54';
import './ground.js?v=54';
import './terrain.js?v=54';
import './world.js?v=54';
import { init, tryEnablePostProcessing } from './engine.js?v=54';
import './physics.js?v=54';
import './walking.js?v=54';
import './sky.js?v=54';
import './solar-system.js?v=54';
import './space.js?v=54';
import './game.js?v=54';
import './input.js?v=54';
import './hud.js?v=54';
import './map.js?v=54';
import { renderLoop } from './main.js?v=54';
import './memory.js?v=54';
import './blocks.js?v=54';
import './flower-challenge.js?v=54';
import { setupUI } from './ui.js?v=54';

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
