// ES module entrypoint with explicit application boot contract.
// Import order mirrors legacy runtime dependencies.
import { observeAuth } from '../../js/auth-ui.js';
import './rdt.js?v=55';
import './config.js?v=55';
import { ctx as appCtx } from './shared-context.js?v=55';
import './state.js?v=55';
import './perf.js?v=55';
import './env.js?v=55';
import './real-estate.js?v=55';
import './ground.js?v=55';
import './terrain.js?v=55';
import './world.js?v=55';
import { init, tryEnablePostProcessing } from './engine.js?v=55';
import './physics.js?v=55';
import './walking.js?v=55';
import './sky.js?v=55';
import './solar-system.js?v=55';
import './space.js?v=55';
import './game.js?v=55';
import './input.js?v=55';
import './hud.js?v=55';
import './map.js?v=55';
import { renderLoop } from './main.js?v=55';
import './memory.js?v=55';
import './blocks.js?v=55';
import './flower-challenge.js?v=55';
import { initMultiplayerPlatform } from './multiplayer/ui-room.js?v=55';
import { setupUI } from './ui.js?v=55';

let _booted = false;
let _multiplayerObserverReady = false;
let _multiplayerApi = null;

function startMultiplayerAfterAuthReady() {
    if (_multiplayerObserverReady) return;
    _multiplayerObserverReady = true;

    observeAuth((user) => {
        globalThis.__WE3D_AUTH_UID__ = user && user.uid ? user.uid : '';
        if (!_multiplayerApi) {
            _multiplayerApi = initMultiplayerPlatform({
                getScene: () => appCtx.scene
            });
        }
        if (typeof _multiplayerApi?.setAuthUser === 'function') {
            _multiplayerApi.setAuthUser(user || null);
        }
    });
}

function bootApp() {
    if (_booted) {
        return { tryEnablePostProcessing };
    }
    init();
    setupUI();
    startMultiplayerAfterAuthReady();
    renderLoop();
    _booted = true;
    return { tryEnablePostProcessing };
}

export { bootApp, tryEnablePostProcessing };
