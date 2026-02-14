// ============================================================================
// main.js - Main game loop, render loop, loading helpers
// ============================================================================

let _hudTimer = 0;
let _mapTimer = 0;
let _lodTimer = 0;
let _perfPanelTimer = 0;
const DEFAULT_LOADING_BG = 'loading-bg.jpg';
const TRANSITION_LOADING = {
    space: { background: 'space-transition.png', text: 'Preparing Space Flight...' },
    moon: { background: 'moon-transition.png', text: 'Approaching The Moon...' }
};
const LOADING_BG_BY_MODE = {
    earth: DEFAULT_LOADING_BG,
    moon: 'moon-transition.png',
    space: 'space-transition.png'
};

function renderLoop(t = 0) {
    requestAnimationFrame(renderLoop);

    // Skip main rendering entirely during space flight (huge perf save)
    if (isEnv(ENV.SPACE_FLIGHT) || (window.spaceFlight && window.spaceFlight.active)) {
        lastTime = t;
        return;
    }

    const dt = Math.min((t - lastTime) / 1000, 0.1);
    lastTime = t;
    if (typeof recordPerfFrame === 'function') recordPerfFrame(dt);
    if (renderer?.info?.autoReset === false && typeof renderer.info.reset === 'function') {
        renderer.info.reset();
    }

    if (gameStarted) {
        update(dt);
        updateCamera();

        // Throttle HUD DOM writes to ~15fps (every ~66ms)
        _hudTimer += dt;
        if (_hudTimer > 0.066) {
            _hudTimer = 0;
            updateHUD();
        }

        // Throttle minimap to ~10fps (every ~100ms)
        _mapTimer += dt;
        if (_mapTimer > 0.1) {
            _mapTimer = 0;
            drawMinimap();
            if (showLargeMap) drawLargeMap();
        }

        // LOD visibility updates run at low frequency to avoid per-frame overhead.
        _lodTimer += dt;
        if (_lodTimer > 0.2) {
            _lodTimer = 0;
            if (typeof updateWorldLod === 'function') updateWorldLod(false);
        }
    }

    // Animate Apollo 11 beacon pulse (only on moon, throttled)
    if (window.apollo11Beacon && isEnv(ENV.MOON) && _hudTimer === 0) {
        const pulseTime = t / 1000;
        const pulse = 0.5 + 0.5 * Math.sin(pulseTime * 2);

        const beam = window.apollo11Beacon.children[0];
        const glow = window.apollo11Beacon.children[1];

        if (beam && beam.material) {
            beam.material.opacity = 0.3 + pulse * 0.2;
        }
        if (glow && glow.material) {
            glow.material.opacity = 0.6 + pulse * 0.3;
        }
    }

    // Debug overlay update (throttled to HUD rate)
    if (window._debugMode && gameStarted && !droneMode && _hudTimer === 0) {
        const overlay = document.getElementById('debugOverlay');
        if (overlay) {
            const onRd = car.onRoad ? 'YES' : 'no';
            const tY = elevationWorldYAtWorldXZ(car.x, car.z).toFixed(2);
            const carYVal = car.y !== undefined ? car.y.toFixed(2) : '?';
            const roadName = car.road ? car.road.name : '-';
            const nr = findNearestRoad(car.x, car.z);
            const rdist = nr.dist !== undefined ? nr.dist.toFixed(1) : '?';
            overlay.textContent =
                `Car Y: ${carYVal}  Terrain Y: ${tY}\n` +
                `On road: ${onRd}  dist: ${rdist}\n` +
                `Road: ${roadName}`;
        }
        // Update debug marker position
        if (window._debugMarker) {
            const debugY = elevationWorldYAtWorldXZ(car.x, car.z);
            window._debugMarker.position.set(car.x, debugY, car.z);
            window._debugMarker.material.color.setHex(car.onRoad ? 0x00ff00 : 0xffff00);
        }
    }

    if (composer) {
        composer.render();
    } else {
        renderer.render(scene, camera);
    }

    if (typeof recordPerfRendererInfo === 'function') {
        recordPerfRendererInfo(renderer);
    }

    _perfPanelTimer += dt;
    if (_perfPanelTimer > 0.2) {
        _perfPanelTimer = 0;
        if (typeof updatePerfPanel === 'function') updatePerfPanel(false);
    }
}

function showLoad(txt, options = {}) {
    const loading = document.getElementById('loading');
    const loadText = document.getElementById('loadText');
    if (!loading || !loadText) return;

    const spinner = loading.querySelector('.spinner');
    const selectedMode = options.mode || globalThis.loadingScreenMode || 'earth';
    const themedBg = LOADING_BG_BY_MODE[selectedMode] || DEFAULT_LOADING_BG;
    const background = options.background || themedBg;
    const overlay = Number.isFinite(options.overlay) ? options.overlay : 0.32;

    loading.style.background = `linear-gradient(rgba(0,0,0,${overlay}),rgba(0,0,0,${overlay})), url('${background}') center center / cover no-repeat`;
    loadText.textContent = txt || 'Loading...';
    loadText.style.fontWeight = options.bold ? '700' : '500';
    loadText.style.letterSpacing = options.letterSpacing || '';
    loadText.style.textShadow = options.transition ? '0 4px 18px rgba(0,0,0,0.9)' : '';
    if (spinner) spinner.style.display = options.hideSpinner ? 'none' : '';

    loading.classList.add('show');
}

function hideLoad() {
    const loading = document.getElementById('loading');
    const loadText = document.getElementById('loadText');
    if (!loading || !loadText) return;

    const spinner = loading.querySelector('.spinner');
    if (spinner) spinner.style.display = '';
    loadText.style.fontWeight = '';
    loadText.style.letterSpacing = '';
    loadText.style.textShadow = '';
    loading.style.background = '';
    loading.classList.remove('show');
}

async function showTransitionLoad(mode, durationMs = 1400) {
    const cfg = TRANSITION_LOADING[mode];
    if (!cfg) return;

    showLoad(cfg.text, {
        background: cfg.background,
        hideSpinner: true,
        transition: true,
        bold: true,
        letterSpacing: '1px',
        overlay: 0.22
    });

    await new Promise((resolve) => setTimeout(resolve, durationMs));
    hideLoad();
}

Object.assign(globalThis, { hideLoad, renderLoop, showLoad, showTransitionLoad });

export { hideLoad, renderLoop, showLoad, showTransitionLoad };
