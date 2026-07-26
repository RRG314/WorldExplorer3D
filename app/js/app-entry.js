// ES module entrypoint with explicit application boot contract.
// Import order mirrors legacy runtime dependencies.
import { getCurrentUser, observeAuth } from '../../js/auth-ui.js';
import './rdt.js?v=55';
import './config.js?v=59';
import { ctx as appCtx } from './shared-context.js?v=55';
import { createAccountService } from './platform/account-service.js?v=1';
import { createPlatformServiceRegistry } from './platform/service-registry.js?v=1';
import './runtime-diagnostics.js?v=18';
import './state.js?v=60';
import './camera-mode.js?v=1';
import './pause-state.js?v=1';
import './location-session.js?v=3';
import {
    getControlInputSnapshot,
    updateControlInput
} from './controls/action-input.js?v=4';
import './transport/actor-contract.js?v=2';
import './world/collection-registry.js?v=1';
import './perf.js?v=57';
import './env.js?v=57';
import {
    bindRuntimeProductPort,
    getRuntimeProductPorts
} from './session-coordinator.js?v=2';
import './real-estate.js?v=55';
import './ground.js?v=72';
import './terrain.js?v=154';
import './world.js?v=270';
import './building-entry.js?v=4';
import './interiors.js?v=9';
import './multiplayer/room-world-patches.js?v=1';
import { init, tryEnablePostProcessing } from './engine.js?v=80';
import './physics.js?v=88';
import './walking.js?v=71';
import './travel-mode.js?v=13';
import { initBoatMode } from './boat-mode.js?v=36';
import { setupFishingGame } from './fishing-game.js?v=2';
import './weather.js?v=6';
import './live-earth/controller.js?v=21';
import './solar-system.js?v=72';
import './planetary/scene-ownership.js?v=11';
import './planetary/vehicles.js?v=3';
import './planetary/astronaut.js?v=1';
import './planetary/sky-orientation.js?v=9';
import './planetary/moon-sky.js?v=1';
import './planetary/tracks.js?v=1';
import './game.js?v=58';
import './input.js?v=61';
import './hud.js?v=76';
import './map.js?v=60';
import { composeRuntimeOwnership, renderLoop } from './runtime-composition.js';
import './memory.js?v=56';
import './blocks.js?v=63';
import './block-builder/ui.js?v=3';
import './flower-challenge.js?v=56';
import { setupUI } from './ui.js?v=119';

let _booted = false;
let _lastObservedAuthUser = null;
let _tutorialInitPromise = null;
let _optionalRuntimeBootScheduled = false;
let _editorWarmupScheduled = false;
let _activityDiscoveryWarmupScheduled = false;
let _analyticsWarmupScheduled = false;
let _platformServicesRegistered = false;
let _runtimeProductPortsBound = false;
const platformServices = createPlatformServiceRegistry({
    onEvent(event) {
        globalThis.dispatchEvent?.(new CustomEvent('we3d:platform-service', { detail: event }));
    }
});
const runtimeProductPorts = getRuntimeProductPorts();

function bindRuntimeProductPorts() {
    if (_runtimeProductPortsBound) return;
    _runtimeProductPortsBound = true;
    bindRuntimeProductPort('shell', {
        publishRuntimeEvent(event) {
            globalThis.dispatchEvent?.(new CustomEvent('we3d:app-runtime', { detail: event }));
        },
        reportRuntimeError(detail) {
            globalThis.dispatchEvent?.(new CustomEvent('we3d:runtime-system-error', { detail }));
        },
        setRuntimeReady(ready) {
            const isReady = ready === true;
            appCtx.runtimeReady = isReady;
            globalThis.__WE3D_RUNTIME_READY__ = isReady;
            const startButton = document.getElementById('startBtn');
            if (startButton) {
                startButton.disabled = !isReady;
                startButton.setAttribute('aria-busy', isReady ? 'false' : 'true');
            }
            if (isReady) globalThis.dispatchEvent?.(new CustomEvent('we3d:runtime-ready'));
            return isReady;
        }
    });
    bindRuntimeProductPort('input', {
        snapshot: getControlInputSnapshot,
        update: updateControlInput
    });
    bindRuntimeProductPort('persistence', {
        async capture(destination = appCtx.getEnv?.()) {
            if (destination !== appCtx.ENV?.EARTH) return null;
            const module = await import('./earth-session.js?v=20');
            return module.captureEarthWorldSession();
        },
        async restore(destination = appCtx.getEnv?.(), options = {}) {
            if (destination !== appCtx.ENV?.EARTH) return false;
            const module = await import('./earth-session.js?v=20');
            return module.resumeEarthWorldSession(options);
        },
        snapshot() {
            return {
                destination: appCtx.getEnv?.() || null,
                earthLoaded: Array.isArray(appCtx.roads) && appCtx.roads.length > 0,
                selection: String(appCtx.selLoc || '')
            };
        }
    });
    bindRuntimeProductPort('multiplayer', {
        ensureReady: ensureMultiplayerPlatformReady,
        snapshot() {
            return {
                service: platformServices.snapshot().services
                    .find((service) => service.id === 'multiplayer') || null,
                room: platformServices.peek('multiplayer')?.getCurrentRoom?.() || null
            };
        }
    });
}

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
        id: 'editor', category: 'authoring',
        load: async () => {
            const mod = await import('./editor/session.js?v=5');
            mod.initEditorSession?.();
            return mod;
        }
    });
    platformServices.register({
        id: 'activity-creator', category: 'gameplay-authoring',
        load: async () => {
            const mod = await import('./activity-editor/session.js?v=13');
            mod.initActivityCreator?.();
            return mod;
        }
    });
    platformServices.register({
        id: 'activity-discovery', category: 'discovery',
        load: async () => {
            const mod = await import('./activity-discovery/session.js?v=6');
            mod.initActivityDiscovery?.();
            return mod;
        }
    });
    platformServices.register({
        id: 'creator-profile', category: 'identity',
        load: async () => {
            const mod = await import('./creator/session.js?v=2');
            mod.initCreatorProfileSession?.();
            return mod;
        }
    });
    platformServices.register({
        id: 'analytics', category: 'telemetry',
        load: async () => {
            const mod = await import('../../js/analytics.js?v=4');
            if (typeof mod.getAnalyticsSessionSnapshot === 'function') {
                appCtx.getAnalyticsSessionSnapshot = () => mod.getAnalyticsSessionSnapshot(appCtx);
            }
            mod.startAnalyticsTracking?.(appCtx);
            return mod;
        }
    });
    platformServices.register({
        id: 'editor-overlay', category: 'world-content',
        load: async () => {
            const mod = await import('./editor/public-layer.js?v=6');
            mod.initEditorPublicLayer?.();
            return mod;
        }
    });
    platformServices.register({
        id: 'multiplayer', category: 'social',
        load: async () => {
            const { initMultiplayerPlatform } = await import('./multiplayer/ui-room.js?v=85');
            const api = initMultiplayerPlatform({ getScene: () => appCtx.scene });
            api?.setAuthUser?.(_lastObservedAuthUser || getCurrentUser() || null);
            return api;
        }
    });
}

function ensurePlatformService(id) {
    registerPlatformServices();
    return platformServices.ensure(id);
}

const ensureEditorSessionModule = () => ensurePlatformService('editor');
const ensureActivityCreatorModule = () => ensurePlatformService('activity-creator');
const ensureActivityDiscoveryModule = () => ensurePlatformService('activity-discovery');
const ensureCreatorProfileModule = () => ensurePlatformService('creator-profile');
const ensureAnalyticsModule = () => ensurePlatformService('analytics');

function scheduleEditorSessionWarmup(timeout = 900) {
    if (_editorWarmupScheduled || platformServices.isReady('editor')) return;
    _editorWarmupScheduled = true;
    scheduleIdleTask(() => {
        void ensureEditorSessionModule();
    }, timeout);
}

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
    scheduleIdleTask(() => {
        _analyticsWarmupScheduled = false;
        void ensureAnalyticsModule();
    }, timeout);
}

async function ensureOverlayRuntimeLayer() {
    await ensurePlatformService('editor-overlay');
    return true;
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
    if (platformServices.isReady('editor-overlay') || _optionalRuntimeBootScheduled || !shouldBootOverlayRuntime()) return false;
    _optionalRuntimeBootScheduled = true;
    scheduleIdleTask(() => {
        _optionalRuntimeBootScheduled = false;
        if (!shouldBootOverlayRuntime()) return;
        void ensureOverlayRuntimeLayer();
    }, reason === 'boot' ? 1500 : 700);
    return true;
}

async function ensureMultiplayerPlatformReady() {
    return ensurePlatformService('multiplayer');
}

function scheduleTutorialInit() {
    if (_tutorialInitPromise) return _tutorialInitPromise;
    _tutorialInitPromise = new Promise((resolve) => {
        scheduleIdleTask(async () => {
            try {
                const mod = await import('./tutorial/tutorial.js?v=4');
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
    registerPlatformServices();
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
        const editor = platformServices.peek('editor');
        if (typeof editor?.captureEditorHereTarget === 'function') {
            return editor.captureEditorHereTarget(...args);
        }
        scheduleEditorSessionWarmup();
        return null;
    };
    appCtx.setEditorDraft = (...args) => {
        const editor = platformServices.peek('editor');
        if (typeof editor?.setEditorDraft === 'function') {
            return editor.setEditorDraft(...args);
        }
        scheduleEditorSessionWarmup();
        return null;
    };
    appCtx.previewEditorDraft = (...args) => {
        const editor = platformServices.peek('editor');
        if (typeof editor?.previewEditorDraft === 'function') {
            return editor.previewEditorDraft(...args);
        }
        scheduleEditorSessionWarmup();
        return null;
    };
    appCtx.openEditorSession = async (options = {}) => {
        const mod = await ensureEditorSessionModule();
        return typeof mod.openEditorSession === 'function' ? mod.openEditorSession(options) : false;
    };
    appCtx.closeEditorSession = async (options = {}) => {
        const editor = platformServices.peek('editor');
        return typeof editor?.closeEditorSession === 'function' ? editor.closeEditorSession(options) : false;
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
        const creator = platformServices.peek('activity-creator');
        return typeof creator?.closeActivityCreator === 'function' ? creator.closeActivityCreator() : false;
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
    appCtx.recordProductEvent = async (category, params = {}) => {
        const mod = await ensureAnalyticsModule();
        return typeof mod.recordProductEvent === 'function'
            ? mod.recordProductEvent(category, params)
            : false;
    };
    appCtx.scheduleActivityDiscoveryWarmup = scheduleActivityDiscoveryWarmup;
    appCtx.ensureOverlayRuntimeReady = ensureOverlayRuntimeLayer;
    appCtx.kickOptionalRuntimeBoot = kickOptionalRuntimeBoot;
    appCtx.ensurePlatformService = ensurePlatformService;
    appCtx.getPlatformServicesSnapshot = () => platformServices.snapshot();
    appCtx.getAccountSnapshot = () => platformServices.peek('account')?.snapshot?.() || {
        started: false,
        signedIn: false,
        anonymous: false,
        providerCount: 0,
        revision: 0
    };
    appCtx.ensureMultiplayerPlatformReady = ensureMultiplayerPlatformReady;
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
    return ensurePlatformService('account');
}

function bootApp() {
    if (_booted) {
        return { tryEnablePostProcessing };
    }

    bindRuntimeProductPorts();
    composeRuntimeOwnership();
    runtimeProductPorts.call('shell', 'setRuntimeReady', false);

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
        runtimeProductPorts.call('shell', 'setRuntimeReady', true);
    });
    runBootStep('scheduleAnalyticsWarmup', () => scheduleAnalyticsWarmup(2800));
    _booted = true;
    return { tryEnablePostProcessing };
}

export { bootApp, tryEnablePostProcessing };
