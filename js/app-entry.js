// ES module entrypoint with explicit application boot contract.
// Import order mirrors legacy runtime dependencies.
import './rdt.js?v=53';
import './config.js?v=53';
import './state.js?v=53';
import './perf.js?v=53';
import './env.js?v=53';
import './real-estate.js?v=53';
import './ground.js?v=53';
import './terrain.js?v=53';
import './world.js?v=53';
import { init, tryEnablePostProcessing } from './engine.js?v=53';
import './physics.js?v=53';
import './walking.js?v=53';
import './sky.js?v=53';
import './solar-system.js?v=53';
import './space.js?v=53';
import './game.js?v=53';
import './input.js?v=53';
import './hud.js?v=53';
import './map.js?v=53';
import { renderLoop } from './main.js?v=53';
import './memory.js?v=53';
import './blocks.js?v=53';
import { setupUI } from './ui.js?v=53';

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
