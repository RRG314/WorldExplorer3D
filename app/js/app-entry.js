// ES module entrypoint with explicit application boot contract.
// Import order mirrors legacy runtime dependencies.
import { getCurrentUser, observeAuth } from '../../js/auth-ui.js';
import './rdt.js?v=55';
import './config.js?v=59';
import { ctx as appCtx } from './shared-context.js?v=55';
import './runtime-diagnostics.js?v=10';
import './state.js?v=60';
import './camera-mode.js?v=1';
import './pause-state.js?v=1';
import './location-session.js?v=1';
import './controls/action-input.js?v=1';
import './transport/actor-contract.js?v=1';
import './world/collection-registry.js?v=1';
import './perf.js?v=56';
import './env.js?v=57';
import './session-coordinator.js?v=2';
import './real-estate.js?v=55';
import './ground.js?v=66';
import './terrain.js?v=126';
import './world.js?v=194';
import './earth-streaming.js?v=22';
import './world/streaming-vector-chunks.js?v=52';
import './world/load-continuous-world.js?v=1';
import './world/streaming-aerial-context.js?v=26';
import './earth-origin.js?v=4';
import './building-entry.js?v=4';
import './interiors.js?v=9';
import { init, tryEnablePostProcessing } from './engine.js?v=73';
import './physics.js?v=76';
import './walking.js?v=65';
import './travel-mode.js?v=11';
import { initBoatMode } from './boat-mode.js?v=27';
import { setupFishingGame } from './fishing-game.js?v=2';
import './sky.js?v=77';
import './weather.js?v=3';
import './live-earth/controller.js?v=11';
import './solar-system.js?v=70';
import './space.js?v=87';
import './planetary/scene-ownership.js?v=7';
import './planetary/vehicles.js?v=2';
import './planetary/astronaut.js?v=1';
import './planetary/sky-orientation.js?v=9';
import './planetary/moon-sky.js?v=1';
import './planetary/mars-world.js?v=16';
import './planetary/tracks.js?v=1';
import './ocean.js?v=5';
import './game.js?v=56';
import './input.js?v=59';
import './hud.js?v=67';
import './map.js?v=58';
import { renderLoop } from './main.js?v=64';
import './memory.js?v=55';
import './blocks.js?v=60';
import './block-builder/ui.js?v=2';
import './flower-challenge.js?v=56';
import { setupUI } from './ui.js?v=95';

let _booted = false;
let _multiplayerObserverReady = false;
let _multiplayerApi = null;
let _multiplayerApiPromise = null;
let _lastObservedAuthUser = null;
let _editorSessionModule = null;
let _editorSessionPromise = null;
let _editorSessionReady = false;
let _activityCreatorModule = null;
let _activityCreatorPromise = null;
let _activityCreatorReady = false;
let _activityDiscoveryModule = null;
let _activityDiscoveryPromise = null;
let _activityDiscoveryReady = false;
let _creatorProfileModule = null;
let _creatorProfilePromise = null;
let _creatorProfileReady = false;
let _analyticsModule = null;
let _analyticsModulePromise = null;
let _analyticsReady = false;
let _overlayRuntimePromise = null;
let _overlayRuntimeReady = false;
let _tutorialInitPromise = null;
let _optionalRuntimeBootScheduled = false;
let _editorWarmupScheduled = false;
let _activityDiscoveryWarmupScheduled = false;
let _analyticsWarmupScheduled = false;

function scheduleIdleTask(task, timeout = 1200) {
    if (typeof task !== 'function') return;
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => task(), { timeout });
        return;
    }
    window.setTimeout(() => task(), Math.max(32, timeout));
}

async function ensureEditorSessionModule() {
    if (_editorSessionModule) return _editorSessionModule;
    if (!_editorSessionPromise) {
        _editorSessionPromise = import('./editor/session.js?v=5').then((mod) => {
            _editorSessionModule = mod;
            if (!_editorSessionReady && typeof mod.initEditorSession === 'function') {
                mod.initEditorSession();
                _editorSessionReady = true;
            }
            return mod;
        });
    }
    return _editorSessionPromise;
}

async function ensureActivityCreatorModule() {
  if (_activityCreatorModule) return _activityCreatorModule;
  if (!_activityCreatorPromise) {
        _activityCreatorPromise = import('./activity-editor/session.js?v=11').then((mod) => {
            _activityCreatorModule = mod;
            if (!_activityCreatorReady && typeof mod.initActivityCreator === 'function') {
                mod.initActivityCreator();
                _activityCreatorReady = true;
            }
            return mod;
        });
    }
    return _activityCreatorPromise;
}

async function ensureActivityDiscoveryModule() {
    if (_activityDiscoveryModule) return _activityDiscoveryModule;
    if (!_activityDiscoveryPromise) {
        _activityDiscoveryPromise = import('./activity-discovery/session.js?v=4').then((mod) => {
            _activityDiscoveryModule = mod;
            if (!_activityDiscoveryReady && typeof mod.initActivityDiscovery === 'function') {
                mod.initActivityDiscovery();
                _activityDiscoveryReady = true;
            }
            return mod;
        }).catch((error) => {
            _activityDiscoveryPromise = null;
            throw error;
        });
    }
    return _activityDiscoveryPromise;
}

async function ensureCreatorProfileModule() {
    if (_creatorProfileModule) return _creatorProfileModule;
    if (!_creatorProfilePromise) {
        _creatorProfilePromise = import('./creator/session.js?v=2').then((mod) => {
            _creatorProfileModule = mod;
            if (!_creatorProfileReady && typeof mod.initCreatorProfileSession === 'function') {
                mod.initCreatorProfileSession();
                _creatorProfileReady = true;
            }
            return mod;
        }).catch((error) => {
            _creatorProfilePromise = null;
            throw error;
        });
    }
    return _creatorProfilePromise;
}

async function ensureAnalyticsModule() {
    if (_analyticsModule) return _analyticsModule;
    if (!_analyticsModulePromise) {
        _analyticsModulePromise = import('../../js/analytics.js?v=1').then((mod) => {
            _analyticsModule = mod;
            if (typeof mod.getAnalyticsSessionSnapshot === 'function') {
                appCtx.getAnalyticsSessionSnapshot = () => mod.getAnalyticsSessionSnapshot(appCtx);
            }
            if (!_analyticsReady && typeof mod.startAnalyticsTracking === 'function') {
                mod.startAnalyticsTracking(appCtx);
                _analyticsReady = true;
            }
            return mod;
        }).catch((error) => {
            _analyticsModulePromise = null;
            throw error;
        });
    }
    return _analyticsModulePromise;
}

function scheduleEditorSessionWarmup(timeout = 900) {
    if (_editorWarmupScheduled || _editorSessionReady) return;
    _editorWarmupScheduled = true;
    scheduleIdleTask(() => {
        void ensureEditorSessionModule();
    }, timeout);
}

function scheduleActivityDiscoveryWarmup(timeout = 2600) {
    if (_activityDiscoveryWarmupScheduled || _activityDiscoveryReady) return;
    _activityDiscoveryWarmupScheduled = true;
    scheduleIdleTask(() => {
        _activityDiscoveryWarmupScheduled = false;
        if (!appCtx.gameStarted) return;
        void ensureActivityDiscoveryModule();
    }, timeout);
}

function scheduleAnalyticsWarmup(timeout = 2800) {
    if (_analyticsWarmupScheduled || _analyticsReady) return;
    _analyticsWarmupScheduled = true;
    scheduleIdleTask(() => {
        _analyticsWarmupScheduled = false;
        void ensureAnalyticsModule();
    }, timeout);
}

async function ensureOverlayRuntimeLayer() {
    if (_overlayRuntimeReady) return true;
    if (!_overlayRuntimePromise) {
        _overlayRuntimePromise = import('./editor/public-layer.js?v=5').then((mod) => {
            if (!_overlayRuntimeReady && typeof mod.initEditorPublicLayer === 'function') {
                mod.initEditorPublicLayer();
                _overlayRuntimeReady = true;
            }
            return true;
        }).catch((error) => {
            _overlayRuntimePromise = null;
            throw error;
        });
    }
    return _overlayRuntimePromise;
}

function shouldBootOverlayRuntime() {
    if (!appCtx.gameStarted) return false;
    if (appCtx.onMoon || appCtx.oceanMode?.active || appCtx.spaceFlight?.active) return false;
    if (typeof appCtx.isEnv === 'function' && appCtx.ENV) {
        if (appCtx.isEnv(appCtx.ENV.MOON) || appCtx.isEnv(appCtx.ENV.SPACE_FLIGHT)) return false;
    }
    return true;
}

function kickOptionalRuntimeBoot(reason = 'runtime') {
    if (_overlayRuntimeReady || _optionalRuntimeBootScheduled || !shouldBootOverlayRuntime()) return false;
    _optionalRuntimeBootScheduled = true;
    scheduleIdleTask(() => {
        _optionalRuntimeBootScheduled = false;
        if (!shouldBootOverlayRuntime()) return;
        void ensureOverlayRuntimeLayer();
    }, reason === 'boot' ? 1500 : 700);
    return true;
}

async function ensureMultiplayerPlatformReady() {
    if (_multiplayerApi) return _multiplayerApi;
    if (!_multiplayerApiPromise) {
        _multiplayerApiPromise = import('./multiplayer/ui-room.js?v=74').then(({ initMultiplayerPlatform }) => {
            _multiplayerApi = initMultiplayerPlatform({
                getScene: () => appCtx.scene
            });
            const authed = _lastObservedAuthUser || getCurrentUser();
            if (typeof _multiplayerApi?.setAuthUser === 'function') {
                _multiplayerApi.setAuthUser(authed || null);
            }
            return _multiplayerApi;
        }).catch((error) => {
            _multiplayerApiPromise = null;
            throw error;
        });
    }
    return _multiplayerApiPromise;
}

function scheduleTutorialInit() {
    if (_tutorialInitPromise) return _tutorialInitPromise;
    _tutorialInitPromise = new Promise((resolve) => {
        scheduleIdleTask(async () => {
            try {
                const mod = await import('./tutorial/tutorial.js?v=2');
                if (typeof mod.initTutorial === 'function') mod.initTutorial();
            } catch (error) {
                console.warn('[boot] Tutorial init deferred import failed.', error);
            } finally {
                resolve(true);
            }
        }, 2200);
    });
    return _tutorialInitPromise;
}

function registerLazySubsystemEntrypoints() {
    if (typeof appCtx.getEditorSnapshot !== 'function') {
        appCtx.getEditorSnapshot = () => ({
            active: false,
            tab: 'workspace',
            tool: 'select',
            activePresetId: 'road',
            workspaceCount: 0,
            selectedFeatureId: '',
            ownFeatureCount: 0,
            moderationCount: 0,
            userIsAdmin: false,
            previewOpen: false,
            peekWorld: false,
            backendReady: false,
            capturedTarget: false,
            draftEditType: '',
            draftPreviewVisible: false,
            supportedEditTypes: []
        });
    }
    appCtx.captureEditorHereTarget = (...args) => {
        if (_editorSessionModule && typeof _editorSessionModule.captureEditorHereTarget === 'function') {
            return _editorSessionModule.captureEditorHereTarget(...args);
        }
        scheduleEditorSessionWarmup();
        return null;
    };
    appCtx.setEditorDraft = (...args) => {
        if (_editorSessionModule && typeof _editorSessionModule.setEditorDraft === 'function') {
            return _editorSessionModule.setEditorDraft(...args);
        }
        scheduleEditorSessionWarmup();
        return null;
    };
    appCtx.previewEditorDraft = (...args) => {
        if (_editorSessionModule && typeof _editorSessionModule.previewEditorDraft === 'function') {
            return _editorSessionModule.previewEditorDraft(...args);
        }
        scheduleEditorSessionWarmup();
        return null;
    };
    appCtx.openEditorSession = async (options = {}) => {
        const mod = await ensureEditorSessionModule();
        return typeof mod.openEditorSession === 'function' ? mod.openEditorSession(options) : false;
    };
    appCtx.closeEditorSession = async (options = {}) => {
        if (!_editorSessionModule || typeof _editorSessionModule.closeEditorSession !== 'function') return false;
        return _editorSessionModule.closeEditorSession(options);
    };
    appCtx.toggleEditorSession = async () => {
        const mod = await ensureEditorSessionModule();
        const snapshot = typeof mod.getEditorSnapshot === 'function' ? mod.getEditorSnapshot() : { active: false };
        return snapshot.active ? mod.closeEditorSession() : mod.openEditorSession();
    };
    if (typeof appCtx.getActivityCreatorSnapshot !== 'function') {
        appCtx.getActivityCreatorSnapshot = () => ({
            active: false,
            templateId: '',
            anchorTypeId: '',
            tool: 'place',
            anchorCount: 0,
            selectedAnchorId: '',
            testing: false,
            valid: false
        });
    }
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
            measurementId: '',
            currentUserId: '',
            trackingStarted: false,
            runtimeAgeSec: 0,
            worldSessionActive: false,
            worldSessionAgeSec: 0,
            worldSessionCount: 0,
            flushCount: 0,
            currentMode: '',
            currentEnvironment: '',
            lastLocationKey: '',
            multiplayer: false,
            errors: []
        });
    }
    appCtx.openActivityCreator = async (options = {}) => {
        const mod = await ensureActivityCreatorModule();
        return typeof mod.openActivityCreator === 'function' ? mod.openActivityCreator(options) : false;
    };
    appCtx.closeActivityCreator = async () => {
        if (!_activityCreatorModule || typeof _activityCreatorModule.closeActivityCreator !== 'function') return false;
        return _activityCreatorModule.closeActivityCreator();
    };
    appCtx.toggleActivityCreator = async () => {
        const mod = await ensureActivityCreatorModule();
        const snapshot = typeof mod.getActivityCreatorSnapshot === 'function' ? mod.getActivityCreatorSnapshot() : { active: false };
        return snapshot.active ? mod.closeActivityCreator() : mod.openActivityCreator();
    };
    appCtx.openActivityBrowser = async (options = {}) => {
        const mod = await ensureActivityDiscoveryModule();
        return typeof mod.openActivityBrowser === 'function' ? mod.openActivityBrowser(options) : false;
    };
    appCtx.closeActivityBrowser = async () => {
        if (!_activityDiscoveryModule || typeof _activityDiscoveryModule.closeActivityBrowser !== 'function') return false;
        return _activityDiscoveryModule.closeActivityBrowser();
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
        if (!_creatorProfileModule || typeof _creatorProfileModule.closeCreatorProfile !== 'function') return false;
        return _creatorProfileModule.closeCreatorProfile();
    };
    appCtx.ensureAnalyticsTracking = async () => {
        const mod = await ensureAnalyticsModule();
        return typeof mod.getAnalyticsSessionSnapshot === 'function'
            ? mod.getAnalyticsSessionSnapshot(appCtx)
            : appCtx.getAnalyticsSessionSnapshot();
    };
    appCtx.scheduleActivityDiscoveryWarmup = scheduleActivityDiscoveryWarmup;
    appCtx.ensureOverlayRuntimeReady = ensureOverlayRuntimeLayer;
    appCtx.kickOptionalRuntimeBoot = kickOptionalRuntimeBoot;
    appCtx.ensureMultiplayerPlatformReady = ensureMultiplayerPlatformReady;
    appCtx.getCurrentMultiplayerRoom = () => _multiplayerApi?.getCurrentRoom?.() || null;
    appCtx.getCurrentMultiplayerRoomActivities = () => _multiplayerApi?.getCurrentRoomActivities?.() || [];
    appCtx.getCurrentMultiplayerRoomActivity = () => _multiplayerApi?.getActiveRoomActivity?.() || null;
    appCtx.canManageCurrentRoomActivities = () => !!_multiplayerApi?.canManageCurrentRoomActivities?.();
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
    if (typeof appCtx.getApprovedEditorContributionSnapshot !== 'function') {
        appCtx.getApprovedEditorContributionSnapshot = () => ({
            activeAreaSignature: '',
            publishedCount: Array.isArray(appCtx.overlayPublishedFeatures) ? appCtx.overlayPublishedFeatures.length : 0,
            runtimeRoadCount: Array.isArray(appCtx.overlayRuntimeRoads) ? appCtx.overlayRuntimeRoads.length : 0,
            runtimeLinearCount: Array.isArray(appCtx.overlayRuntimeLinearFeatures) ? appCtx.overlayRuntimeLinearFeatures.length : 0,
            runtimePoiCount: Array.isArray(appCtx.overlayRuntimePois) ? appCtx.overlayRuntimePois.length : 0,
            runtimeBuildingCount: Array.isArray(appCtx.overlayRuntimeBuildingColliders) ? appCtx.overlayRuntimeBuildingColliders.length : 0,
            visible: appCtx.mapLayers?.contributions !== false
        });
    }
    if (typeof appCtx.refreshApprovedEditorContributions !== 'function') {
        appCtx.refreshApprovedEditorContributions = () => {
            kickOptionalRuntimeBoot('manual_refresh');
            return appCtx.getApprovedEditorContributionSnapshot();
        };
    }
    if (typeof appCtx.refreshOverlayRuntimeLayer !== 'function') {
        appCtx.refreshOverlayRuntimeLayer = () => {
            kickOptionalRuntimeBoot('manual_refresh');
            return appCtx.getApprovedEditorContributionSnapshot();
        };
    }
    if (typeof appCtx.syncApprovedEditorContributionVisibility !== 'function') {
        appCtx.syncApprovedEditorContributionVisibility = () => appCtx.mapLayers?.contributions !== false;
    }
}

function startMultiplayerAfterAuthReady() {
    if (_multiplayerObserverReady) return;
    _multiplayerObserverReady = true;

    observeAuth((user) => {
        _lastObservedAuthUser = user || null;
        globalThis.__WE3D_AUTH_UID__ = user && user.uid ? user.uid : '';
        if (_multiplayerApi && typeof _multiplayerApi.setAuthUser === 'function') {
            try {
                _multiplayerApi.setAuthUser(user || null);
            } catch (error) {
                console.warn('[boot] Multiplayer auth sync failed.', error);
            }
        }
    });
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

    const initOk = runBootStep('init', () => init());
    if (initOk === false || appCtx.engineInitFailed === true || !appCtx.renderer) {
        console.warn('[boot] init aborted before full app startup');
        _booted = false;
        return { tryEnablePostProcessing };
    }
    runBootStep('registerLazySubsystemEntrypoints', () => registerLazySubsystemEntrypoints());
    runBootStep('setupUI', () => setupUI());
    runBootStep('initBoatMode', () => initBoatMode());
    runBootStep('setupFishingGame', () => setupFishingGame());
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
    _booted = true;
    return { tryEnablePostProcessing };
}

export { bootApp, tryEnablePostProcessing };
