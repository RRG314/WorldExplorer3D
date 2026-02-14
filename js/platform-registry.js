// ============================================================================
// platform-registry.js - Lightweight feature registry + lifecycle/capability API
// ============================================================================

const PLATFORM_REGISTRY_VERSION = 1;

const registeredFeatures = new Map();
const featureOrder = [];
const uiSlots = new Map();
const capabilityProviders = new Map();

let featuresInitialized = false;
const sharedRaycaster = (typeof THREE !== 'undefined') ? new THREE.Raycaster() : null;
const sharedPointer = (typeof THREE !== 'undefined') ? new THREE.Vector2() : null;

function ensureFeatureId(rawId) {
    const id = String(rawId || '').trim();
    if (!id) throw new Error('Feature id is required.');
    return id;
}

function normalizeFeatureDefinition(definition) {
    if (!definition || typeof definition !== 'object') {
        throw new Error('Feature definition must be an object.');
    }
    const id = ensureFeatureId(definition.id);
    return {
        id,
        name: String(definition.name || id),
        version: String(definition.version || '0.0.0'),
        description: String(definition.description || ''),
        enabled: definition.enabled !== false,
        initialized: false,
        init: typeof definition.init === 'function' ? definition.init : null,
        update: typeof definition.update === 'function' ? definition.update : null,
        dispose: typeof definition.dispose === 'function' ? definition.dispose : null,
        onEnable: typeof definition.onEnable === 'function' ? definition.onEnable : null,
        onDisable: typeof definition.onDisable === 'function' ? definition.onDisable : null,
        onEnvEnter: typeof definition.onEnvEnter === 'function' ? definition.onEnvEnter : null,
        onEnvExit: typeof definition.onEnvExit === 'function' ? definition.onEnvExit : null,
        onEnvChange: typeof definition.onEnvChange === 'function' ? definition.onEnvChange : null,
        uiPanel: definition.uiPanel ? String(definition.uiPanel) : null,
        tags: Array.isArray(definition.tags) ? definition.tags.map((tag) => String(tag)) : []
    };
}

function createFeatureContext(extra = {}) {
    return {
        env: typeof getEnv === 'function' ? getEnv() : null,
        now: Date.now(),
        getCapability,
        registerCapability,
        requestUISlot,
        releaseUISlot,
        ...extra
    };
}

function runFeatureHook(feature, hookName, args = []) {
    if (!feature) return;
    const hook = feature[hookName];
    if (typeof hook !== 'function') return;
    try {
        const result = hook(...args);
        if (result && typeof result.then === 'function') {
            result.catch((err) => {
                console.warn(`[platform] Feature "${feature.id}" hook "${hookName}" failed (async):`, err);
            });
        }
    } catch (err) {
        console.warn(`[platform] Feature "${feature.id}" hook "${hookName}" failed:`, err);
    }
}

function registerFeature(definition, options = {}) {
    const feature = normalizeFeatureDefinition(definition);
    const replace = !!options.replace;
    const existing = registeredFeatures.get(feature.id);
    if (existing && !replace) {
        throw new Error(`Feature "${feature.id}" already registered.`);
    }

    if (existing) {
        unregisterFeature(feature.id, { dispose: true });
    }

    registeredFeatures.set(feature.id, feature);
    featureOrder.push(feature.id);

    if (featuresInitialized && feature.enabled) {
        const ctx = createFeatureContext({ reason: 'register' });
        runFeatureHook(feature, 'init', [ctx]);
        feature.initialized = true;
    }
    return feature.id;
}

function unregisterFeature(id, options = {}) {
    const featureId = ensureFeatureId(id);
    const feature = registeredFeatures.get(featureId);
    if (!feature) return false;
    const shouldDispose = options.dispose !== false;

    if (shouldDispose && feature.initialized) {
        runFeatureHook(feature, 'dispose', [createFeatureContext({ reason: 'unregister' })]);
    }

    registeredFeatures.delete(featureId);
    const idx = featureOrder.indexOf(featureId);
    if (idx >= 0) featureOrder.splice(idx, 1);
    return true;
}

function initializeRegisteredFeatures(context = {}) {
    if (featuresInitialized) return;
    featuresInitialized = true;
    const ctx = createFeatureContext({ phase: 'init', ...context });
    featureOrder.forEach((id) => {
        const feature = registeredFeatures.get(id);
        if (!feature || !feature.enabled || feature.initialized) return;
        runFeatureHook(feature, 'init', [ctx]);
        feature.initialized = true;
    });
}

function updateRegisteredFeatures(dt, context = {}) {
    if (!featuresInitialized) return;
    const ctx = createFeatureContext({ phase: 'update', dt, ...context });
    featureOrder.forEach((id) => {
        const feature = registeredFeatures.get(id);
        if (!feature || !feature.enabled || !feature.initialized) return;
        runFeatureHook(feature, 'update', [dt, ctx]);
    });
}

function disposeRegisteredFeatures(context = {}) {
    const ctx = createFeatureContext({ phase: 'dispose', ...context });
    for (let i = featureOrder.length - 1; i >= 0; i--) {
        const feature = registeredFeatures.get(featureOrder[i]);
        if (!feature || !feature.initialized) continue;
        runFeatureHook(feature, 'dispose', [ctx]);
        feature.initialized = false;
    }
    featuresInitialized = false;
}

function notifyFeatureEnvTransition(oldEnv, newEnv, context = {}) {
    if (!featuresInitialized || oldEnv === newEnv) return;
    const ctx = createFeatureContext({ phase: 'env-transition', oldEnv, newEnv, ...context });
    featureOrder.forEach((id) => {
        const feature = registeredFeatures.get(id);
        if (!feature || !feature.enabled || !feature.initialized) return;
        if (oldEnv != null) runFeatureHook(feature, 'onEnvExit', [oldEnv, newEnv, ctx]);
        if (newEnv != null) runFeatureHook(feature, 'onEnvEnter', [newEnv, oldEnv, ctx]);
        runFeatureHook(feature, 'onEnvChange', [oldEnv, newEnv, ctx]);
    });
}

function setFeatureEnabled(id, enabled, context = {}) {
    const featureId = ensureFeatureId(id);
    const feature = registeredFeatures.get(featureId);
    if (!feature) return false;
    const nextEnabled = !!enabled;
    if (feature.enabled === nextEnabled) return true;
    feature.enabled = nextEnabled;

    const ctx = createFeatureContext({ phase: 'toggle', ...context });
    if (nextEnabled) {
        if (featuresInitialized && !feature.initialized) {
            runFeatureHook(feature, 'init', [ctx]);
            feature.initialized = true;
        }
        runFeatureHook(feature, 'onEnable', [ctx]);
    } else {
        runFeatureHook(feature, 'onDisable', [ctx]);
    }
    return true;
}

function getRegisteredFeatures() {
    return featureOrder
        .map((id) => registeredFeatures.get(id))
        .filter(Boolean)
        .map((feature) => ({
            id: feature.id,
            name: feature.name,
            version: feature.version,
            description: feature.description,
            enabled: feature.enabled,
            initialized: feature.initialized,
            uiPanel: feature.uiPanel,
            tags: feature.tags.slice()
        }));
}

function requestUISlot(slotId, options = {}) {
    const id = ensureFeatureId(slotId);
    if (uiSlots.has(id)) return uiSlots.get(id);

    const parentId = options.parentId ? String(options.parentId) : 'floatMenuContainer';
    const parent = document.getElementById(parentId) || document.body;
    const tagName = options.tagName ? String(options.tagName) : 'div';
    const slotEl = document.createElement(tagName);
    slotEl.id = options.elementId ? String(options.elementId) : `platform-slot-${id}`;
    slotEl.dataset.platformSlot = id;
    if (options.className) slotEl.className = String(options.className);
    if (options.styleText) slotEl.style.cssText = String(options.styleText);
    parent.appendChild(slotEl);
    uiSlots.set(id, slotEl);
    return slotEl;
}

function releaseUISlot(slotId) {
    const id = ensureFeatureId(slotId);
    const slot = uiSlots.get(id);
    if (!slot) return false;
    if (slot.parentNode) slot.parentNode.removeChild(slot);
    uiSlots.delete(id);
    return true;
}

function registerCapability(name, resolver) {
    const key = ensureFeatureId(name);
    if (typeof resolver !== 'function') {
        throw new Error(`Capability "${key}" resolver must be a function.`);
    }
    capabilityProviders.set(key, resolver);
    return key;
}

function getCapability(name, ...args) {
    const key = ensureFeatureId(name);
    const provider = capabilityProviders.get(key);
    if (!provider) return undefined;
    try {
        return provider(...args);
    } catch (err) {
        console.warn(`[platform] Capability "${key}" failed:`, err);
        return undefined;
    }
}

function registerDefaultCapabilities() {
    registerCapability('ground.height', (x, z) => {
        if (typeof elevationWorldYAtWorldXZ === 'function') return elevationWorldYAtWorldXZ(x, z);
        if (typeof terrainMeshHeightAt === 'function') return terrainMeshHeightAt(x, z);
        return 0;
    });

    registerCapability('surface.topY', (x, z) => {
        let topY = getCapability('ground.height', x, z);
        if (typeof getBuildTopSurfaceAtWorldXZ === 'function') {
            const blockTop = getBuildTopSurfaceAtWorldXZ(x, z, Infinity);
            if (Number.isFinite(blockTop) && blockTop > topY) topY = blockTop;
        }
        return topY;
    });

    registerCapability('world.refs', () => ({
        scene: globalThis.scene || null,
        camera: globalThis.camera || null,
        renderer: globalThis.renderer || null,
        env: typeof getEnv === 'function' ? getEnv() : null,
        car: globalThis.car || null,
        drone: globalThis.drone || null,
        roads: Array.isArray(globalThis.roads) ? globalThis.roads : [],
        buildings: Array.isArray(globalThis.buildings) ? globalThis.buildings : [],
        poiMeshes: Array.isArray(globalThis.poiMeshes) ? globalThis.poiMeshes : [],
        landuseMeshes: Array.isArray(globalThis.landuseMeshes) ? globalThis.landuseMeshes : []
    }));

    registerCapability('raycast.screen', (clientX, clientY, targets, options = {}) => {
        if (!sharedRaycaster || !sharedPointer || !globalThis.camera || !globalThis.renderer) return [];
        const canvas = globalThis.renderer.domElement;
        if (!canvas) return [];
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return [];
        sharedPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        sharedPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        sharedRaycaster.setFromCamera(sharedPointer, globalThis.camera);
        if (Number.isFinite(options.far)) sharedRaycaster.far = options.far;
        const recursive = options.recursive !== false;
        const targetArray = Array.isArray(targets) ? targets : (targets ? [targets] : []);
        return sharedRaycaster.intersectObjects(targetArray, recursive);
    });

    registerCapability('ui.element', (id) => document.getElementById(String(id || '')));
    registerCapability('ui.requestSlot', requestUISlot);
    registerCapability('ui.releaseSlot', releaseUISlot);
    registerCapability('markers.memory.currentLocation', () => (
        typeof getMemoryEntriesForCurrentLocation === 'function'
            ? getMemoryEntriesForCurrentLocation()
            : []
    ));
    registerCapability('blocks.limits', () => (
        typeof getBuildLimits === 'function'
            ? getBuildLimits()
            : null
    ));
}

registerDefaultCapabilities();

function exportWorldEditsPack(options = {}) {
    const scope = options.scope === 'all' ? 'all' : 'current';
    const memoryPack = (typeof exportMemoryPack === 'function')
        ? exportMemoryPack({ scope })
        : null;
    const buildPack = (typeof exportBuildPack === 'function')
        ? exportBuildPack({ scope })
        : null;

    return {
        kind: 'worldExplorer3D.worldEditsPack',
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        scope,
        env: typeof getEnv === 'function' ? getEnv() : null,
        locationKey: typeof getCurrentLocationKey === 'function' ? getCurrentLocationKey() : null,
        memoryPack,
        buildPack
    };
}

function importWorldEditsPack(rawPack, options = {}) {
    let parsed;
    try {
        parsed = typeof rawPack === 'string' ? JSON.parse(rawPack) : rawPack;
    } catch (err) {
        return { ok: false, error: `Invalid JSON: ${err && err.message ? err.message : String(err)}` };
    }
    if (!parsed || typeof parsed !== 'object') {
        return { ok: false, error: 'Unsupported world edits pack format.' };
    }

    const conflict = options.conflictMode || options.conflict || 'replace-location';
    const result = {
        ok: true,
        memory: null,
        blocks: null
    };

    if (parsed.memoryPack && typeof importMemoryPack === 'function') {
        result.memory = importMemoryPack(parsed.memoryPack, { conflictMode: conflict });
        if (!result.memory || result.memory.ok !== true) result.ok = false;
    }

    if (parsed.buildPack && typeof importBuildPack === 'function') {
        result.blocks = importBuildPack(parsed.buildPack, { conflictMode: conflict });
        if (!result.blocks || result.blocks.ok !== true) result.ok = false;
    }

    return result;
}

function downloadWorldEditsPack(options = {}) {
    const pack = exportWorldEditsPack(options);
    if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
        return false;
    }
    const scopeLabel = pack.scope === 'all' ? 'all' : (pack.locationKey || 'current');
    const safeScope = String(scopeLabel).replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = options.fileName || `worldexplorer3d-edits-${safeScope}-${Date.now()}.json`;
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(href), 0);
    return true;
}

if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        disposeRegisteredFeatures({ reason: 'beforeunload' });
    });
}

Object.assign(globalThis, {
    PLATFORM_REGISTRY_VERSION,
    createFeatureContext,
    disposeRegisteredFeatures,
    downloadWorldEditsPack,
    getCapability,
    getRegisteredFeatures,
    importWorldEditsPack,
    initializeRegisteredFeatures,
    notifyFeatureEnvTransition,
    exportWorldEditsPack,
    registerCapability,
    registerFeature,
    releaseUISlot,
    requestUISlot,
    setFeatureEnabled,
    unregisterFeature,
    updateRegisteredFeatures
});

export {
    PLATFORM_REGISTRY_VERSION,
    createFeatureContext,
    disposeRegisteredFeatures,
    downloadWorldEditsPack,
    getCapability,
    getRegisteredFeatures,
    importWorldEditsPack,
    initializeRegisteredFeatures,
    notifyFeatureEnvTransition,
    exportWorldEditsPack,
    registerCapability,
    registerFeature,
    releaseUISlot,
    requestUISlot,
    setFeatureEnabled,
    unregisterFeature,
    updateRegisteredFeatures
};
