// ============================================================================
// main.js - Main game loop, render loop, loading helpers
// ============================================================================

let _hudTimer = 0;
let _mapTimer = 0;
let _lodTimer = 0;
let _perfPanelTimer = 0;
const OVERLAY_EDGE_MARGIN = 6;
const OVERLAY_ANCHOR_GAP = 10;
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

function _isVisibleRect(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return null;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return null;
    const rect = el.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return null;
    return rect;
}

function _positionOverlayBetween(overlay, leftRect, rightRect) {
    if (!overlay || !leftRect || !rightRect) return;
    const overlayRect = overlay.getBoundingClientRect();
    if (!(overlayRect.width > 0)) return;

    const minLeft = Math.max(OVERLAY_EDGE_MARGIN, leftRect.right + OVERLAY_ANCHOR_GAP);
    const maxLeft = Math.min(
        window.innerWidth - OVERLAY_EDGE_MARGIN - overlayRect.width,
        rightRect.left - OVERLAY_ANCHOR_GAP - overlayRect.width
    );
    if (maxLeft < minLeft) return;

    const desiredLeft = ((leftRect.right + rightRect.left) * 0.5) - (overlayRect.width * 0.5);
    const clampedLeft = Math.max(minLeft, Math.min(maxLeft, desiredLeft));
    overlay.style.left = `${Math.round(clampedLeft)}px`;
    overlay.style.right = 'auto';
}

function positionTopOverlays() {
    if (!gameStarted) return;
    const modeHudRect = _isVisibleRect(document.getElementById('modeHud'));
    if (!modeHudRect) return;

    const debugOverlay = document.getElementById('debugOverlay');
    if (debugOverlay && debugOverlay.style.display !== 'none') {
        const hudRect = _isVisibleRect(document.getElementById('hud'));
        if (hudRect) _positionOverlayBetween(debugOverlay, hudRect, modeHudRect);
    }

    const perfPanel = document.getElementById('perfPanel');
    if (perfPanel && perfPanel.style.display !== 'none') {
        const menuRect = _isVisibleRect(document.getElementById('mainMenuBtn'));
        if (menuRect) _positionOverlayBetween(perfPanel, modeHudRect, menuRect);
    }
}

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
            positionTopOverlays();
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
    if (window._debugMode && gameStarted && _hudTimer === 0) {
        const overlay = document.getElementById('debugOverlay');
        if (overlay) {
            let modeLabel = 'drive';
            let refX = Number.isFinite(car?.x) ? car.x : 0;
            let refZ = Number.isFinite(car?.z) ? car.z : 0;
            let refY = Number.isFinite(car?.y) ? car.y : null;
            let onRoadValue = !!car?.onRoad;
            let roadName = car?.road?.name || '-';

            if (droneMode) {
                modeLabel = 'drone';
                refX = Number.isFinite(drone?.x) ? drone.x : refX;
                refZ = Number.isFinite(drone?.z) ? drone.z : refZ;
                refY = Number.isFinite(drone?.y) ? drone.y : refY;
            } else if (Walk && Walk.state && Walk.state.mode === 'walk' && Walk.state.walker) {
                modeLabel = 'walk';
                refX = Number.isFinite(Walk.state.walker.x) ? Walk.state.walker.x : refX;
                refZ = Number.isFinite(Walk.state.walker.z) ? Walk.state.walker.z : refZ;
                refY = Number.isFinite(Walk.state.walker.y) ? Walk.state.walker.y : refY;
            }

            const nr = findNearestRoad(refX, refZ);
            const roadDist = Number.isFinite(nr?.dist) ? nr.dist : null;
            if (modeLabel !== 'drive') {
                roadName = nr?.road?.name || roadName;
                const halfWidth = nr?.road?.width ? (nr.road.width * 0.5) : 5;
                onRoadValue = Number.isFinite(roadDist) ? roadDist <= (halfWidth + 3) : false;
            }

            const onRd = onRoadValue ? 'YES' : 'no';
            const tY = elevationWorldYAtWorldXZ(refX, refZ).toFixed(2);
            const refYVal = Number.isFinite(refY) ? refY.toFixed(2) : '?';
            const rdist = Number.isFinite(roadDist) ? roadDist.toFixed(1) : '?';
            const speed = modeLabel === 'drone'
                ? Math.round(Math.abs((drone?.speed || 0) * 1.8))
                : modeLabel === 'walk'
                    ? Math.round(Math.abs(Walk?.state?.walker?.speedMph || 0))
                    : Math.round(Math.abs((car?.speed || 0) * 0.5));
            overlay.textContent =
                `Mode: ${modeLabel.toUpperCase()}  Speed: ${speed} mph\n` +
                `Ref Y: ${refYVal}  Terrain Y: ${tY}\n` +
                `On road: ${onRd}  dist: ${rdist}\n` +
                `Road: ${roadName}`;
        }
        // Update debug marker position
        if (window._debugMarker) {
            let markerX = Number.isFinite(car?.x) ? car.x : 0;
            let markerZ = Number.isFinite(car?.z) ? car.z : 0;
            let markerOnRoad = !!car?.onRoad;

            if (droneMode) {
                markerX = Number.isFinite(drone?.x) ? drone.x : markerX;
                markerZ = Number.isFinite(drone?.z) ? drone.z : markerZ;
                const nr = findNearestRoad(markerX, markerZ);
                const halfWidth = nr?.road?.width ? (nr.road.width * 0.5) : 5;
                markerOnRoad = Number.isFinite(nr?.dist) ? nr.dist <= (halfWidth + 3) : false;
            } else if (Walk && Walk.state && Walk.state.mode === 'walk' && Walk.state.walker) {
                markerX = Number.isFinite(Walk.state.walker.x) ? Walk.state.walker.x : markerX;
                markerZ = Number.isFinite(Walk.state.walker.z) ? Walk.state.walker.z : markerZ;
                const nr = findNearestRoad(markerX, markerZ);
                const halfWidth = nr?.road?.width ? (nr.road.width * 0.5) : 5;
                markerOnRoad = Number.isFinite(nr?.dist) ? nr.dist <= (halfWidth + 3) : false;
            }

            const debugY = elevationWorldYAtWorldXZ(markerX, markerZ);
            window._debugMarker.position.set(markerX, debugY, markerZ);
            window._debugMarker.material.color.setHex(markerOnRoad ? 0x00ff00 : 0xffff00);
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
        positionTopOverlays();
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

window.addEventListener('resize', () => {
    requestAnimationFrame(() => positionTopOverlays());
}, { passive: true });

Object.assign(globalThis, { hideLoad, positionTopOverlays, renderLoop, showLoad, showTransitionLoad });

export { hideLoad, positionTopOverlays, renderLoop, showLoad, showTransitionLoad };
