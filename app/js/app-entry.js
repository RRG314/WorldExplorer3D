// ES module entrypoint with explicit application boot contract.
// Import order mirrors legacy runtime dependencies.
import { getCurrentUser, observeAuth } from '../../js/auth-ui.js';
import './rdt.js?v=55';
import './config.js?v=57';
import { ctx as appCtx } from './shared-context.js?v=55';
import './state.js?v=59';
import './perf.js?v=59';
import './continuous-world-diagnostics.js?v=14';
import './continuous-world-runtime.js?v=7';
import './env.js?v=57';
import './real-estate.js?v=55';
import './ground.js?v=82';
import './terrain.js?v=143';
import './world.js?v=206';
import { init, tryEnablePostProcessing } from './engine.js?v=64';
import './physics.js?v=99';
import './walking.js?v=64';
import './travel-mode.js?v=5';
import { initBoatMode } from './boat-mode.js?v=10';
import './sky.js?v=57';
import './weather.js?v=2';
import './solar-system.js?v=55';
import './space.js?v=56';
import './ocean.js?v=8';
import './game.js?v=58';
import './input.js?v=58';
import './hud.js?v=73';
import './map.js?v=61';
import { renderLoop } from './main.js?v=80';
import { setupUI } from './ui.js?v=71';

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
let _overlayRuntimeRequested = false;
let _tutorialInitPromise = null;
let _optionalRuntimeBootScheduled = false;
let _editorWarmupScheduled = false;
let _activityDiscoveryWarmupScheduled = false;
let _analyticsWarmupScheduled = false;
let _memoryModule = null;
let _memoryModulePromise = null;
let _blocksModule = null;
let _blocksModulePromise = null;
let _flowerChallengeModule = null;
let _flowerChallengeModulePromise = null;
let _liveEarthModule = null;
let _liveEarthModulePromise = null;
let _interiorsModule = null;
let _interiorsModulePromise = null;
let _deferredFeatureBootScheduled = false;
const _deferredFeatureBootCompleted = new Set();

function scheduleIdleTask(task, timeout = 1200) {
    if (typeof task !== 'function') return;
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => task(), { timeout });
        return;
    }
    window.setTimeout(() => task(), Math.max(32, timeout));
}

function markBootMilestone(name, detail = {}) {
    if (typeof appCtx.markPerfMilestone === 'function') {
        appCtx.markPerfMilestone(name, detail);
    }
}

async function ensureMemoryModule() {
    if (_memoryModule) return _memoryModule;
    if (!_memoryModulePromise) {
        _memoryModulePromise = import('./memory.js?v=55').then((mod) => {
            _memoryModule = mod;
            if (typeof mod.setupMemoryUI === 'function') mod.setupMemoryUI();
            if (appCtx.gameStarted && typeof mod.refreshMemoryMarkersForCurrentLocation === 'function') {
                mod.refreshMemoryMarkersForCurrentLocation();
            }
            return mod;
        }).catch((error) => {
            _memoryModulePromise = null;
            throw error;
        });
    }
    return _memoryModulePromise;
}

async function ensureBlocksModule() {
    if (_blocksModule) return _blocksModule;
    if (!_blocksModulePromise) {
        _blocksModulePromise = import('./blocks.js?v=58').then((mod) => {
            _blocksModule = mod;
            if (appCtx.gameStarted && typeof mod.refreshBlockBuilderForCurrentLocation === 'function') {
                mod.refreshBlockBuilderForCurrentLocation();
            }
            return mod;
        }).catch((error) => {
            _blocksModulePromise = null;
            throw error;
        });
    }
    return _blocksModulePromise;
}

async function ensureFlowerChallengeModule() {
    if (_flowerChallengeModule) return _flowerChallengeModule;
    if (!_flowerChallengeModulePromise) {
        _flowerChallengeModulePromise = import('./flower-challenge.js?v=55').then((mod) => {
            _flowerChallengeModule = mod;
            if (typeof mod.setupFlowerChallenge === 'function') mod.setupFlowerChallenge();
            return mod;
        }).catch((error) => {
            _flowerChallengeModulePromise = null;
            throw error;
        });
    }
    return _flowerChallengeModulePromise;
}

async function ensureLiveEarthModule() {
    if (_liveEarthModule) return _liveEarthModule;
    if (!_liveEarthModulePromise) {
        _liveEarthModulePromise = import('./live-earth/controller.js?v=9').then((mod) => {
            _liveEarthModule = mod;
            return mod;
        }).catch((error) => {
            _liveEarthModulePromise = null;
            throw error;
        });
    }
    return _liveEarthModulePromise;
}

function shouldLoadInteriorsModule() {
    if (!appCtx.gameStarted || appCtx.worldLoading) return false;
    if (typeof appCtx.isEnv === 'function' && appCtx.ENV && !appCtx.isEnv(appCtx.ENV.EARTH)) return false;
    if (appCtx.droneMode || appCtx.onMoon || appCtx.oceanMode?.active || appCtx.spaceFlight?.active) return false;
    return !!(appCtx.Walk && appCtx.Walk.state?.mode === 'walk');
}

function getDeferredBootMovementState() {
    if (appCtx.oceanMode?.active) {
        return { mode: 'ocean', speed: Math.abs(Number(appCtx.getOceanModeDebugState?.()?.speed || 0)) };
    }
    if (appCtx.boatMode?.active) {
        return { mode: 'boat', speed: Math.abs(Number(appCtx.boat?.speed || 0)) };
    }
    if (appCtx.droneMode) {
        return { mode: 'drone', speed: Math.abs(Number(appCtx.drone?.speed || 0)) };
    }
    if (appCtx.Walk?.state?.mode === 'walk') {
        return { mode: 'walk', speed: Math.abs(Number(appCtx.Walk.state.walker?.speedMph || 0)) };
    }
    return { mode: 'drive', speed: Math.abs(Number(appCtx.car?.speed || 0)) };
}

function deferredBootShouldYieldToGameplay() {
    const movement = getDeferredBootMovementState();
    const mode = String(movement?.mode || 'drive');
    const speed = Math.abs(Number(movement?.speed || 0));
    const moving =
        mode === 'walk' ? speed >= 0.45 :
        mode === 'drone' ? speed >= 1.75 :
        mode === 'boat' || mode === 'ocean' ? speed >= 1.75 :
        speed >= 1.4;
    if (moving) return true;

    const streamState = appCtx.getContinuousWorldInteractiveStreamSnapshot?.();
    if (streamState?.pending) return true;
    if ((Date.now() - Number(streamState?.lastLoadAt || 0)) < 2600) return true;

    const frameMs = Number(appCtx.perfStats?.live?.frameMs || 0);
    if (frameMs >= 34) return true;

    const worldStage = String(appCtx.worldBuildStage || '');
    if (
        worldStage !== 'full_world_ready' &&
        worldStage !== 'partial_world_ready'
    ) {
        return true;
    }

    return false;
}

async function ensureInteriorsModule() {
    if (_interiorsModule) return _interiorsModule;
    if (!_interiorsModulePromise) {
        _interiorsModulePromise = import('./interiors.js?v=5').then((mod) => {
            _interiorsModule = mod;
            return mod;
        }).catch((error) => {
            _interiorsModulePromise = null;
            throw error;
        });
    }
    return _interiorsModulePromise;
}

async function ensureEditorSessionModule() {
    if (_editorSessionModule) return _editorSessionModule;
    if (!_editorSessionPromise) {
        _editorSessionPromise = import('./editor/session.js?v=8').then((mod) => {
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
        _activityCreatorPromise = import('./activity-editor/session.js?v=4').then((mod) => {
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
        _activityDiscoveryPromise = import('./activity-discovery/session.js?v=6').then((mod) => {
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
        _overlayRuntimePromise = import('./editor/public-layer.js?v=6').then((mod) => {
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

function isEditorWorkspaceOpen() {
    return !!document.body?.classList.contains('editor-workspace-open');
}

function shouldBootOverlayRuntime() {
    if (!_overlayRuntimeRequested) return false;
    if (!appCtx.gameStarted) return false;
    if (appCtx.onMoon || appCtx.oceanMode?.active || appCtx.spaceFlight?.active) return false;
    if (typeof appCtx.isEnv === 'function' && appCtx.ENV) {
        if (appCtx.isEnv(appCtx.ENV.MOON) || appCtx.isEnv(appCtx.ENV.SPACE_FLIGHT)) return false;
    }
    if (deferredBootShouldYieldToGameplay()) return false;
    return true;
}

function requestOverlayRuntimeBoot(reason = 'runtime', options = {}) {
    _overlayRuntimeRequested = true;
    if (options.eager === true) return ensureOverlayRuntimeLayer();
    kickOptionalRuntimeBoot(reason);
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
        _multiplayerApiPromise = import('./multiplayer/ui-room.js?v=75').then(({ initMultiplayerPlatform }) => {
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
                const mod = await import('./tutorial/tutorial.js?v=1');
                if (typeof mod.initTutorial === 'function') mod.initTutorial(appCtx);
            } catch (error) {
                console.warn('[boot] Tutorial init deferred import failed.', error);
            } finally {
                resolve(true);
            }
        }, 2200);
    });
    return _tutorialInitPromise;
}

function shouldBootDeferredFeatures() {
    if (!appCtx.gameStarted || appCtx.worldLoading) return false;
    if (typeof appCtx.isEnv === 'function' && appCtx.ENV && !appCtx.isEnv(appCtx.ENV.EARTH)) return false;
    if (isEditorWorkspaceOpen()) return false;
    if (deferredBootShouldYieldToGameplay()) return false;
    return true;
}

function nextDeferredFeatureBootTask() {
    const queue = [
        {
            key: 'memory',
            load: ensureMemoryModule,
            timeout: 500,
            shouldRun: () => !appCtx.droneMode
        },
        {
            key: 'blocks',
            load: ensureBlocksModule,
            timeout: 850,
            shouldRun: () => !appCtx.droneMode
        },
        {
            key: 'flower',
            load: ensureFlowerChallengeModule,
            timeout: 1150,
            shouldRun: () => true
        },
        {
            key: 'interiors',
            load: ensureInteriorsModule,
            timeout: 1280,
            shouldRun: shouldLoadInteriorsModule
        },
        {
            key: 'live-earth',
            load: ensureLiveEarthModule,
            timeout: 1450,
            shouldRun: () => true
        }
    ];
    for (let i = 0; i < queue.length; i++) {
        const entry = queue[i];
        if (_deferredFeatureBootCompleted.has(entry.key)) continue;
        if (typeof entry.shouldRun === 'function' && !entry.shouldRun()) continue;
        return entry;
    }
    return null;
}

function kickDeferredFeatureBoot(reason = 'runtime') {
    if (_deferredFeatureBootScheduled || !shouldBootDeferredFeatures()) return false;
    const task = nextDeferredFeatureBootTask();
    if (!task) return false;
    _deferredFeatureBootScheduled = true;
    scheduleIdleTask(async () => {
        _deferredFeatureBootScheduled = false;
        if (!shouldBootDeferredFeatures()) return;
        const next = nextDeferredFeatureBootTask();
        if (!next) return;
        try {
            await next.load();
            _deferredFeatureBootCompleted.add(next.key);
            markBootMilestone(`deferred:${next.key}:ready`, { reason });
        } catch (error) {
            console.warn(`[boot] Deferred feature module "${next.key}" failed.`, error);
        }
    }, task.timeout);
    return true;
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
        await ensureOverlayRuntimeLayer();
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
        if (snapshot.active) return mod.closeEditorSession();
        await ensureOverlayRuntimeLayer();
        return mod.openEditorSession();
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
    appCtx.getActivityCreatorRuntimeBootSnapshot = () => ({
        activityCreatorModuleLoaded: !!_activityCreatorModule,
        activityCreatorReady: _activityCreatorReady,
        active: !!appCtx.getActivityCreatorSnapshot?.().active
    });
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
    appCtx.ensureInteriorsReady = ensureInteriorsModule;
    if (typeof appCtx.sampleInteriorWalkSurface !== 'function') {
        appCtx.sampleInteriorWalkSurface = (x, z) => {
            if (!_interiorsModule || typeof _interiorsModule.sampleInteriorWalkSurface !== 'function') return null;
            return _interiorsModule.sampleInteriorWalkSurface(x, z);
        };
    }
    if (typeof appCtx.updateInteriorInteraction !== 'function') {
        appCtx.updateInteriorInteraction = () => {
            if (!_interiorsModule) {
                if (shouldLoadInteriorsModule()) {
                    void ensureInteriorsModule();
                }
                return;
            }
            if (typeof _interiorsModule.updateInteriorInteraction === 'function') {
                return _interiorsModule.updateInteriorInteraction();
            }
        };
    }
    if (typeof appCtx.handleInteriorAction !== 'function') {
        appCtx.handleInteriorAction = async () => {
            const mod = await ensureInteriorsModule();
            return typeof mod.handleInteriorAction === 'function' ? mod.handleInteriorAction() : false;
        };
    }
    if (typeof appCtx.scanNearbyInteriorSupport !== 'function') {
        appCtx.scanNearbyInteriorSupport = async (options = {}) => {
            const mod = await ensureInteriorsModule();
            return typeof mod.scanNearbyInteriorSupport === 'function' ? mod.scanNearbyInteriorSupport(options) : null;
        };
    }
    if (typeof appCtx.listSupportedInteriorsNear !== 'function') {
        appCtx.listSupportedInteriorsNear = (x, z, radius, limit) => {
            if (!_interiorsModule || typeof _interiorsModule.listSupportedInteriorsNear !== 'function') return [];
            return _interiorsModule.listSupportedInteriorsNear(x, z, radius, limit);
        };
    }
    if (typeof appCtx.enterInteriorForSupport !== 'function') {
        appCtx.enterInteriorForSupport = async (support) => {
            const mod = await ensureInteriorsModule();
            return typeof mod.enterInteriorForSupport === 'function' ? mod.enterInteriorForSupport(support) : false;
        };
    }
    if (typeof appCtx.clearActiveInterior !== 'function') {
        appCtx.clearActiveInterior = async (options = {}) => {
            if (!_interiorsModule || typeof _interiorsModule.clearActiveInterior !== 'function') return false;
            return _interiorsModule.clearActiveInterior(options);
        };
    }
    appCtx.ensureLiveEarthReady = ensureLiveEarthModule;
    if (!appCtx.liveEarth) {
        appCtx.liveEarth = {
            ready: true,
            openLiveEarth(layerId = 'satellites') {
                return appCtx.openLiveEarthSelector(layerId);
            },
            getSummary() {
                if (typeof appCtx.getLiveEarthSummary === 'function') {
                    return appCtx.getLiveEarthSummary();
                }
                return { ready: false, deferred: true };
            },
            inspectState() {
                if (typeof appCtx.inspectLiveEarthState === 'function') {
                    return appCtx.inspectLiveEarthState();
                }
                return { ready: false, deferred: true };
            }
        };
    }
    appCtx.getLiveEarthSummary = () => {
        if (_liveEarthModule && typeof appCtx.liveEarth?.getSummary === 'function') {
            return appCtx.liveEarth.getSummary();
        }
        return {
            ready: false,
            deferred: true,
            loaded: !!_liveEarthModule
        };
    };
    appCtx.inspectLiveEarthState = () => {
        if (_liveEarthModule && typeof appCtx.liveEarth?.inspectState === 'function') {
            return appCtx.liveEarth.inspectState();
        }
        return {
            ready: false,
            deferred: true,
            loaded: !!_liveEarthModule
        };
    };
    appCtx.openLiveEarthSelector = async (layerId = 'satellites') => {
        await ensureLiveEarthModule();
        return appCtx.liveEarth?.openLiveEarth?.(layerId);
    };
    appCtx.kickDeferredFeatureBoot = kickDeferredFeatureBoot;
    appCtx.scheduleActivityDiscoveryWarmup = scheduleActivityDiscoveryWarmup;
    appCtx.ensureOverlayRuntimeReady = ensureOverlayRuntimeLayer;
    appCtx.requestOverlayRuntimeBoot = requestOverlayRuntimeBoot;
    appCtx.kickOptionalRuntimeBoot = kickOptionalRuntimeBoot;
    appCtx.getEditorRuntimeBootSnapshot = () => ({
        editorModuleLoaded: !!_editorSessionModule,
        editorReady: _editorSessionReady,
        editorWarmupScheduled: _editorWarmupScheduled,
        overlayRuntimeRequested: _overlayRuntimeRequested,
        overlayRuntimeReady: _overlayRuntimeReady,
        overlayRuntimeScheduled: _optionalRuntimeBootScheduled,
        editorWorkspaceOpen: isEditorWorkspaceOpen()
    });
    appCtx.ensureMultiplayerPlatformReady = ensureMultiplayerPlatformReady;
    appCtx.getCurrentMultiplayerRoom = () => _multiplayerApi?.getCurrentRoom?.() || null;
    appCtx.getCurrentMultiplayerRoomActivities = () => _multiplayerApi?.getCurrentRoomActivities?.() || [];
    appCtx.getCurrentMultiplayerRoomActivity = () => _multiplayerApi?.getActiveRoomActivity?.() || null;
    appCtx.canManageCurrentRoomActivities = () => !!_multiplayerApi?.canManageCurrentRoomActivities?.();
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
            void ensureOverlayRuntimeLayer();
            return appCtx.getApprovedEditorContributionSnapshot();
        };
    }
    if (typeof appCtx.refreshOverlayRuntimeLayer !== 'function') {
        appCtx.refreshOverlayRuntimeLayer = () => {
            void ensureOverlayRuntimeLayer();
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
    markBootMilestone('boot:start');
    init();
    markBootMilestone('boot:engine_ready');
    registerLazySubsystemEntrypoints();
    markBootMilestone('boot:lazy_entrypoints_ready');
    setupUI();
    markBootMilestone('boot:ui_ready');
    initBoatMode();
    markBootMilestone('boot:boat_ready');
    scheduleTutorialInit();
    startMultiplayerAfterAuthReady();
    renderLoop();
    markBootMilestone('boot:render_loop_started');
    scheduleAnalyticsWarmup(2800);
    _booted = true;
    return { tryEnablePostProcessing };
}

export { bootApp, tryEnablePostProcessing };
