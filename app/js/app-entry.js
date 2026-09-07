// ES module entrypoint with explicit application boot contract.
// Import order mirrors legacy runtime dependencies.
import { getCurrentUser, observeAuth } from '../../js/auth-ui.js?v=55';
import { setupAnalyticsConsentUi } from '../../js/analytics-consent.js?v=3';
import './rdt.js?v=55';
import './config.js?v=63';
import { ctx as appCtx } from './shared-context.js?v=55';
import { createAccountService } from './platform/account-service.js?v=1';
import { createPlatformServiceRegistry } from './platform/service-registry.js?v=1';
import { scheduleAfterFirstPlay } from './runtime/workload-policy.js?v=1';
import './runtime-diagnostics.js?v=82';
import './ui/legal-attribution.js?v=1';
import './state.js?v=65';
import './camera-mode.js?v=1';
import './pause-state.js?v=1';
import './location-session.js?v=7';
import './controls/action-input.js?v=13';
import './controls/keyboard-binding-ui.js?v=2';
import './interaction/context-router.js?v=5';
import './transport/actor-contract.js?v=6';
import './world/collection-registry.js?v=1';
import './world/water-environment.js?v=2';
import './perf.js?v=57';
import './env.js?v=58';
import './session-coordinator.js?v=2';
import './planetary/scene-ownership.js?v=9';
import './real-estate.js?v=55';
import { init, tryEnablePostProcessing } from './engine.js?v=105';
import './physics.js?v=128';
import './walking.js?v=98';
import './travel-mode.js?v=29';
import { initBoatMode } from './boat-mode.js?v=58';
import './sky.js?v=89';
import './weather.js?v=11';
import './runtime/on-demand-modes.js?v=52';
import { installOnDemandEarth } from './runtime/on-demand-earth.js?v=190';
import { installOnDemandBlockBuilder } from './runtime/on-demand-block-builder.js?v=10';
import { installOnDemandFlowerChallenge } from './runtime/on-demand-flower-challenge.js?v=1';
import { installOnDemandLiveEarth } from './runtime/on-demand-live-earth.js?v=6';
import { installOnDemandMars } from './runtime/on-demand-mars.js?v=1';
import './planetary/solid-world-runtime.js?v=20';
import './planetary/vehicles.js?v=3';
import './planetary/astronaut.js?v=4';
import './planetary/sky-orientation.js?v=15';
import './planetary/moon-sky.js?v=1';
import './planetary/tracks.js?v=2';
import './planetary/field-activities.js?v=11';
import './game.js?v=70';
import './input.js?v=79';
import './hud.js?v=105';
import './map.js?v=61';
import { renderLoop } from './main.js?v=76';
import './memory.js?v=55';
import { setupUI } from './ui.js?v=172';
import { initAccessibility } from './ui/accessibility.js?v=2';

let _booted = false;
let _lastObservedAuthUser = null;
let _tutorialInitPromise = null;
let _activityDiscoveryWarmupScheduled = false;
let _analyticsWarmupScheduled = false;
let _platformServicesRegistered = false;
let _interiorsModulePromise = null;
let _fishingModulePromise = null;
const platformServices = createPlatformServiceRegistry({
    onEvent(event) {
        globalThis.dispatchEvent?.(new CustomEvent('we3d:platform-service', { detail: event }));
    }
});
setupAnalyticsConsentUi();

function scheduleIdleTask(task, timeout = 1200) {
    if (typeof task !== 'function') return;
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => task(), { timeout });
        return;
    }
    window.setTimeout(() => task(), Math.max(32, timeout));
}

function registerPlatformServices() {
    if (_platformServicesRegistered) return;
    _platformServicesRegistered = true;
    platformServices.register({
        id: 'account', category: 'identity',
        load: async () => {
            const account = createAccountService({
                getCurrentUser,
                observeAuth,
                onChange(user) {
                    _lastObservedAuthUser = user || null;
                    globalThis.__WE3D_AUTH_UID__ = user?.uid || '';
                    const multiplayer = platformServices.peek('multiplayer');
                    try {
                        multiplayer?.setAuthUser?.(user || null);
                    } catch (error) {
                        console.warn('[boot] Multiplayer auth sync failed.', error);
                    }
                }
            });
            return account.start();
        }
    });
    platformServices.register({
        id: 'activity-discovery', category: 'discovery',
        load: async () => {
            const mod = await import('./activity-discovery/session.js?v=8');
            mod.initActivityDiscovery?.();
            return mod;
        }
    });
    platformServices.register({
        id: 'creator-profile', category: 'identity',
        load: async () => {
            const mod = await import('./creator/session.js?v=4');
            mod.initCreatorProfileSession?.();
            return mod;
        }
    });
    platformServices.register({
        id: 'analytics', category: 'telemetry',
        load: async () => {
            const mod = await import('../../js/analytics.js?v=3');
            if (typeof mod.getAnalyticsSessionSnapshot === 'function') {
                appCtx.getAnalyticsSessionSnapshot = () => mod.getAnalyticsSessionSnapshot(appCtx);
            }
            mod.startAnalyticsTracking?.(appCtx);
            return mod;
        }
    });
    platformServices.register({
        id: 'multiplayer', category: 'social',
        load: async () => {
            const { initMultiplayerPlatform } = await import('./multiplayer/ui-room.js?v=83');
            const api = initMultiplayerPlatform({ getScene: () => appCtx.scene });
            api?.setAuthUser?.(_lastObservedAuthUser || getCurrentUser() || null);
            return api;
        }
    });
    platformServices.register({
        id: 'augmented-reality', category: 'presentation',
        load: async () => {
            const mod = await import('./ar/session-service.js?v=9');
            mod.initArPlatform?.(appCtx);
            return mod;
        }
    });
}

function ensurePlatformService(id) {
    registerPlatformServices();
    return platformServices.ensure(id);
}

function ensureInteriorsReady() {
    if (!_interiorsModulePromise) {
        _interiorsModulePromise = import('./interiors.js?v=24').catch((error) => {
            _interiorsModulePromise = null;
            throw error;
        });
    }
    return _interiorsModulePromise;
}

function ensureFishingReady() {
    if (!_fishingModulePromise) {
        _fishingModulePromise = import('./fishing-game.js?v=5').then((fishing) => {
            fishing.setupFishingGame?.();
            return fishing;
        }).catch((error) => {
            _fishingModulePromise = null;
            throw error;
        });
    }
    return _fishingModulePromise;
}

function registerLazyFishingEntrypoints() {
    appCtx.fishingGame = { open: false, active: false };
    appCtx.ensureFishingReady = ensureFishingReady;
    appCtx.openFishingGame = async (...args) => {
        const fishing = await ensureFishingReady();
        return fishing.openFishingGame?.(...args) ?? false;
    };
    appCtx.closeFishingGame = () => false;
    appCtx.updateFishingGame = () => false;
    const dockButton = document.getElementById('fishingDockBtn');
    const menuButton = document.getElementById('fFishing');
    if (menuButton) menuButton.style.display = '';
    const activate = async (event) => {
        event?.preventDefault?.();
        dockButton?.removeEventListener('click', activate);
        menuButton?.removeEventListener('click', activate);
        const fishing = await ensureFishingReady();
        fishing.openFishingGame?.();
    };
    dockButton?.addEventListener('click', activate);
    menuButton?.addEventListener('click', activate);
}

const ensureActivityDiscoveryModule = () => ensurePlatformService('activity-discovery');
const ensureCreatorProfileModule = () => ensurePlatformService('creator-profile');
const ensureAnalyticsModule = () => ensurePlatformService('analytics');

function scheduleActivityDiscoveryWarmup(timeout = 2600) {
    if (_activityDiscoveryWarmupScheduled || platformServices.isReady('activity-discovery')) return;
    _activityDiscoveryWarmupScheduled = true;
    scheduleIdleTask(() => {
        _activityDiscoveryWarmupScheduled = false;
        if (!appCtx.gameStarted) return;
        void ensureActivityDiscoveryModule();
    }, timeout);
}

function scheduleAnalyticsWarmup(timeout = 2800) {
    if (_analyticsWarmupScheduled || platformServices.isReady('analytics')) return;
    _analyticsWarmupScheduled = true;
    scheduleAfterFirstPlay('analytics-runtime', () => {
        _analyticsWarmupScheduled = false;
        return ensureAnalyticsModule();
    }, { timeout });
}

async function ensureMultiplayerPlatformReady() {
    return ensurePlatformService('multiplayer');
}

function scheduleTutorialInit() {
    if (_tutorialInitPromise) return _tutorialInitPromise;
    _tutorialInitPromise = new Promise((resolve) => {
        let started = false;
        const startTutorial = async () => {
            if (started) return;
            started = true;
            try {
                const mod = await import('./tutorial/tutorial.js?v=13');
                if (typeof mod.initTutorial === 'function') mod.initTutorial();
            } catch (error) {
                console.warn('[boot] Tutorial init deferred import failed.', error);
            } finally {
                resolve(true);
            }
        };
        scheduleAfterFirstPlay('tutorial-runtime', startTutorial, { timeout: 1200 });
        globalThis.addEventListener?.('we3d:first-play-ready', startTutorial, { once: true });
        // Continuous WebGL rendering can starve requestIdleCallback on some
        // mobile browsers. The tutorial is small, so a bounded fallback keeps
        // First Journey available without returning it to the blocking boot path.
        globalThis.setTimeout(startTutorial, 6000);
    });
    return _tutorialInitPromise;
}

function registerLazySubsystemEntrypoints() {
    registerPlatformServices();
    installOnDemandBlockBuilder(appCtx);
    installOnDemandFlowerChallenge(appCtx);
    installOnDemandLiveEarth(appCtx);
    installOnDemandMars(appCtx);
    appCtx.ensureInteriorsReady = ensureInteriorsReady;
    appCtx.handleInteriorAction = async (...args) => {
        const interiors = await ensureInteriorsReady();
        return interiors.handleInteriorAction?.(...args) ?? false;
    };
    appCtx.enterInteriorForSupport = async (...args) => {
        const interiors = await ensureInteriorsReady();
        return interiors.enterInteriorForSupport?.(...args) ?? false;
    };
    appCtx.scanNearbyInteriorSupport = async (...args) => {
        const interiors = await ensureInteriorsReady();
        return interiors.scanNearbyInteriorSupport?.(...args) ?? [];
    };
    appCtx.listSupportedInteriorsNear = () => [];
    appCtx.sampleInteriorWalkSurface = () => null;
    appCtx.updateInteriorInteraction = () => {
        const walking = appCtx.Walk?.state?.mode === 'walk' || appCtx.travelMode === 'walk';
        if (
            !_interiorsModulePromise &&
            appCtx.gameStarted === true &&
            walking &&
            Array.isArray(appCtx.buildings) &&
            appCtx.buildings.length > 0
        ) {
            void ensureInteriorsReady().then((interiors) => interiors.updateInteriorInteraction?.()).catch((error) => {
                console.warn('[interior] Proximity runtime failed to initialize:', error);
            });
        }
        return false;
    };
    appCtx.clearActiveInterior = () => false;
    if (typeof appCtx.getActivityDiscoverySnapshot !== 'function') {
        appCtx.getActivityDiscoverySnapshot = () => ({
            active: false,
            count: Array.isArray(appCtx.activityDiscoveryCatalog) ? appCtx.activityDiscoveryCatalog.length : 0,
            selectedId: '',
            nearbyPromptId: ''
        });
    }
    if (typeof appCtx.getCreatorProfileSnapshot !== 'function') {
        appCtx.getCreatorProfileSnapshot = () => ({
            active: false,
            creatorId: '',
            loading: false
        });
    }
    if (typeof appCtx.getAnalyticsSessionSnapshot !== 'function') {
        appCtx.getAnalyticsSessionSnapshot = () => ({
            enabled: false,
            ready: false,
            disabledReason: 'not_started',
            measurementId: '',
            consent: 'unset',
            currentUserId: '',
            trackingStarted: false,
            runtimeAgeSec: 0,
            worldSessionActive: false,
            worldSessionAgeSec: 0,
            worldSessionCount: 0,
            flushCount: 0,
            productEventCount: 0,
            eventLoggedCount: 0,
            recentEvents: [],
            deliveryState: 'warmup_pending',
            currentMode: '',
            currentEnvironment: '',
            lastLocationKey: '',
            multiplayer: false,
            errors: []
        });
    }
    globalThis.getWorldExplorerAnalyticsSnapshot = () => appCtx.getAnalyticsSessionSnapshot();
    appCtx.openActivityBrowser = async (options = {}) => {
        const mod = await ensureActivityDiscoveryModule();
        return typeof mod.openActivityBrowser === 'function' ? mod.openActivityBrowser(options) : false;
    };
    appCtx.closeActivityBrowser = async () => {
        const discovery = platformServices.peek('activity-discovery');
        return typeof discovery?.closeActivityBrowser === 'function' ? discovery.closeActivityBrowser() : false;
    };
    appCtx.toggleActivityBrowser = async (options = {}) => {
        const mod = await ensureActivityDiscoveryModule();
        return typeof mod.toggleActivityBrowser === 'function' ? mod.toggleActivityBrowser(options) : false;
    };
    appCtx.openCreatorProfile = async (options = {}) => {
        const mod = await ensureCreatorProfileModule();
        return typeof mod.openCreatorProfile === 'function' ? mod.openCreatorProfile(options) : false;
    };
    appCtx.closeCreatorProfile = async () => {
        const profile = platformServices.peek('creator-profile');
        return typeof profile?.closeCreatorProfile === 'function' ? profile.closeCreatorProfile() : false;
    };
    appCtx.ensureAnalyticsTracking = async () => {
        const mod = await ensureAnalyticsModule();
        return typeof mod.getAnalyticsSessionSnapshot === 'function'
            ? mod.getAnalyticsSessionSnapshot(appCtx)
            : appCtx.getAnalyticsSessionSnapshot();
    };
    appCtx.scheduleActivityDiscoveryWarmup = scheduleActivityDiscoveryWarmup;
    appCtx.ensurePlatformService = ensurePlatformService;
    appCtx.openArExperience = async (request = {}) => {
        const mod = await ensurePlatformService('augmented-reality');
        const platform = mod.initArPlatform?.(appCtx);
        return platform?.open?.(request) ?? false;
    };
    appCtx.closeArExperience = async (reason = 'user-exit') => {
        const mod = platformServices.peek('augmented-reality');
        if (!mod) return false;
        return mod.initArPlatform?.(appCtx)?.end?.(reason) ?? false;
    };
    appCtx.getArPlatformSnapshot = () => platformServices.peek('augmented-reality')?.getArPlatformSnapshot?.() || {
        type: 'ArPlatformSnapshot', phase: 'idle', active: false
    };
    appCtx.getPlatformServicesSnapshot = () => platformServices.snapshot();
    appCtx.getAccountSnapshot = () => platformServices.peek('account')?.snapshot?.() || {
        started: false,
        signedIn: false,
        anonymous: false,
        providerCount: 0,
        revision: 0
    };
    appCtx.ensureMultiplayerPlatformReady = ensureMultiplayerPlatformReady;
    appCtx.openMultiplayerPanel = async () => {
        const api = await ensureMultiplayerPlatformReady();
        if (typeof api?.openRoomPanel !== 'function') return false;
        api.openRoomPanel();
        return true;
    };
    appCtx.getCurrentMultiplayerRoom = () => platformServices.peek('multiplayer')?.getCurrentRoom?.() || null;
    appCtx.getCurrentMultiplayerRoomActivities = () => platformServices.peek('multiplayer')?.getCurrentRoomActivities?.() || [];
    appCtx.getCurrentMultiplayerRoomActivity = () => platformServices.peek('multiplayer')?.getActiveRoomActivity?.() || null;
    appCtx.canManageCurrentRoomActivities = () => !!platformServices.peek('multiplayer')?.canManageCurrentRoomActivities?.();
    appCtx.syncMultiplayerRoomWorld = async (room = {}, options = {}) => {
        const api = await ensureMultiplayerPlatformReady();
        if (typeof api?.syncRoomWorldContext !== 'function') {
            throw new Error('Multiplayer room world sync is unavailable right now.');
        }
        return api.syncRoomWorldContext(room, options);
    };
    appCtx.saveCurrentRoomActivity = async (activity = {}) => {
        const api = await ensureMultiplayerPlatformReady();
        if (typeof api?.saveRoomActivity !== 'function') throw new Error('Room game saving is unavailable right now.');
        return api.saveRoomActivity(activity);
    };
    appCtx.launchCurrentRoomActivity = async (activity = {}) => {
        const api = await ensureMultiplayerPlatformReady();
        if (typeof api?.launchRoomActivity !== 'function') throw new Error('Room game launch is unavailable right now.');
        return api.launchRoomActivity(activity);
    };
    appCtx.stopCurrentRoomActivity = async () => {
        const api = await ensureMultiplayerPlatformReady();
        if (typeof api?.stopRoomActivity !== 'function') return false;
        return api.stopRoomActivity();
    };
}

function startMultiplayerAfterAuthReady() {
    return ensurePlatformService('account');
}

function bootApp() {
    if (_booted) {
        return { tryEnablePostProcessing };
    }

    appCtx.runtimeReady = false;
    globalThis.__WE3D_RUNTIME_READY__ = false;

    const runBootStep = (label, action) => {
        console.log(`[boot] step:start:${label}`);
        const result = action();
        console.log(`[boot] step:done:${label}`);
        return result;
    };

    runBootStep('installOnDemandEarth', () => installOnDemandEarth(appCtx));
    const initOk = runBootStep('init', () => init());
    if (initOk === false || appCtx.engineInitFailed === true || !appCtx.renderer) {
        console.warn('[boot] init aborted before full app startup');
        _booted = false;
        return { tryEnablePostProcessing };
    }
    runBootStep('registerLazySubsystemEntrypoints', () => registerLazySubsystemEntrypoints());
    runBootStep('initAccessibility', () => { appCtx.accessibility = initAccessibility(); });
    runBootStep('setupUI', () => setupUI());
    runBootStep('initBoatMode', () => initBoatMode());
    runBootStep('registerLazyFishingEntrypoints', () => registerLazyFishingEntrypoints());
    runBootStep('scheduleTutorialInit', () => scheduleTutorialInit());
    runBootStep('startMultiplayerAfterAuthReady', () => startMultiplayerAfterAuthReady());
    runBootStep('renderLoop', () => renderLoop());
    runBootStep('markRuntimeReady', () => {
        appCtx.runtimeReady = true;
        globalThis.__WE3D_RUNTIME_READY__ = true;
        const startButton = document.getElementById('startBtn');
        if (startButton) {
            startButton.disabled = false;
            startButton.setAttribute('aria-busy', 'false');
        }
        globalThis.dispatchEvent?.(new CustomEvent('we3d:runtime-ready'));
    });
    runBootStep('scheduleAnalyticsWarmup', () => scheduleAnalyticsWarmup(2800));
    runBootStep('schedulePlaneVisualWarmup', () => {
        scheduleAfterFirstPlay('plane-visual', () => appCtx.preparePlaneModeVisual?.(), { timeout: 9000 });
    });
    _booted = true;
    return { tryEnablePostProcessing };
}

export { bootApp, tryEnablePostProcessing };
