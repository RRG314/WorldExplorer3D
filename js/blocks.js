// ============================================================================
// blocks.js - Lightweight voxel-style builder (place/stack/remove brick blocks)
// ============================================================================

const BUILD_BLOCK_SIZE = 1;
const BUILD_MAX_DISTANCE = 260;
const BUILD_BLOCK_COLORS = [0xb55239, 0xa74631, 0x9a3d2b, 0xc16345];

let buildModeEnabled = false;
let buildGroup = null;
let buildGeometry = null;
let buildRaycaster = null;

const buildBlocks = new Map();
const buildMaterials = [];
const buildMouse = typeof THREE !== 'undefined' ? new THREE.Vector2() : null;
const buildPlane = typeof THREE !== 'undefined' ? new THREE.Plane(new THREE.Vector3(0, 1, 0), 0) : null;
const buildTempPoint = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;
const buildNormalMatrix = typeof THREE !== 'undefined' ? new THREE.Matrix3() : null;

function getBuildRaycaster() {
    if (!buildRaycaster && typeof THREE !== 'undefined') {
        buildRaycaster = new THREE.Raycaster();
        buildRaycaster.far = 1200;
    }
    return buildRaycaster;
}

function ensureBuildMaterials() {
    if (buildMaterials.length > 0 || typeof THREE === 'undefined') return;
    BUILD_BLOCK_COLORS.forEach((color) => {
        buildMaterials.push(new THREE.MeshStandardMaterial({
            color,
            roughness: 0.92,
            metalness: 0.04
        }));
    });
}

function ensureBuildGeometry() {
    if (!buildGeometry && typeof THREE !== 'undefined') {
        buildGeometry = new THREE.BoxGeometry(BUILD_BLOCK_SIZE, BUILD_BLOCK_SIZE, BUILD_BLOCK_SIZE);
    }
}

function ensureBuildGroup() {
    if (!scene || typeof THREE === 'undefined') return null;
    if (!buildGroup) {
        buildGroup = new THREE.Group();
        buildGroup.name = 'buildBlocksGroup';
    }
    if (buildGroup.parent !== scene) {
        scene.add(buildGroup);
    }
    return buildGroup;
}

function toGridCoord(v) {
    return Math.round(v / BUILD_BLOCK_SIZE);
}

function toWorldCoord(g) {
    return g * BUILD_BLOCK_SIZE;
}

function blockKey(gx, gy, gz) {
    return `${gx}|${gy}|${gz}`;
}

function getBuildReferencePosition() {
    if (droneMode) {
        return { x: drone.x, y: drone.y, z: drone.z };
    }
    if (Walk && Walk.state && Walk.state.mode === 'walk' && Walk.state.walker) {
        return {
            x: Walk.state.walker.x,
            y: Walk.state.walker.y,
            z: Walk.state.walker.z
        };
    }
    return { x: car.x, y: car.y || 0, z: car.z };
}

function getSurfaceYAt(x, z) {
    if (onMoon && moonSurface && typeof _getPhysRaycaster === 'function' && _physRayStart && _physRayDir) {
        const raycaster = _getPhysRaycaster();
        _physRayStart.set(x, 2000, z);
        raycaster.set(_physRayStart, _physRayDir);
        const hits = raycaster.intersectObject(moonSurface, false);
        if (hits.length > 0) return hits[0].point.y;
    }
    if (typeof terrainMeshHeightAt === 'function') return terrainMeshHeightAt(x, z);
    if (typeof elevationWorldYAtWorldXZ === 'function') return elevationWorldYAtWorldXZ(x, z);
    return 0;
}

function isBuildClickBlocked(target) {
    if (!target || !target.closest) return false;
    return !!target.closest(
        '#titleScreen, #largeMap, #propertyPanel, #propertyModal, #historicPanel, #memoryComposer, ' +
        '#memoryInfoPanel, #floatMenuContainer, #controlsTab, #pauseScreen, #resultScreen, #caughtScreen, ' +
        '#legendPanel, #mapInfoPanel, #mainMenuBtn, #realEstateBtn, #historicBtn, #memoryFlowerFloatBtn, #starInfo, #solarSystemInfoPanel'
    );
}

function snapFaceNormalToAxis(faceNormal, object) {
    if (!faceNormal || !object || typeof THREE === 'undefined') return { x: 0, y: 1, z: 0 };
    const worldNormal = faceNormal.clone();
    buildNormalMatrix.getNormalMatrix(object.matrixWorld);
    worldNormal.applyMatrix3(buildNormalMatrix).normalize();

    const ax = Math.abs(worldNormal.x);
    const ay = Math.abs(worldNormal.y);
    const az = Math.abs(worldNormal.z);

    if (ax >= ay && ax >= az) return { x: worldNormal.x >= 0 ? 1 : -1, y: 0, z: 0 };
    if (ay >= ax && ay >= az) return { x: 0, y: worldNormal.y >= 0 ? 1 : -1, z: 0 };
    return { x: 0, y: 0, z: worldNormal.z >= 0 ? 1 : -1 };
}

function placeBuildBlock(gx, gy, gz, materialIndex = null) {
    if (!Number.isFinite(gx) || !Number.isFinite(gy) || !Number.isFinite(gz)) return false;
    const group = ensureBuildGroup();
    if (!group) return false;
    ensureBuildMaterials();
    ensureBuildGeometry();

    const key = blockKey(gx, gy, gz);
    if (buildBlocks.has(key)) return false;

    const idx = Number.isInteger(materialIndex)
        ? Math.max(0, Math.min(buildMaterials.length - 1, materialIndex))
        : Math.floor(Math.random() * buildMaterials.length);
    const mesh = new THREE.Mesh(buildGeometry, buildMaterials[idx]);
    mesh.position.set(toWorldCoord(gx), toWorldCoord(gy), toWorldCoord(gz));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = {
        isBuildBlock: true,
        buildBlock: true,
        materialIndex: idx,
        gx, gy, gz,
        blockKey: key
    };

    group.add(mesh);
    buildBlocks.set(key, mesh);
    return true;
}

function removeBuildBlock(gx, gy, gz) {
    const key = blockKey(gx, gy, gz);
    const mesh = buildBlocks.get(key);
    if (!mesh) return false;
    if (mesh.parent) mesh.parent.remove(mesh);
    buildBlocks.delete(key);
    return true;
}

function clearAllBuildBlocks() {
    buildBlocks.clear();
    if (!buildGroup) return;
    while (buildGroup.children.length > 0) {
        const child = buildGroup.children[buildGroup.children.length - 1];
        buildGroup.remove(child);
    }
}

function updateBuildModeUI() {
    const toggleBtn = document.getElementById('fBlockBuild');
    if (toggleBtn) {
        toggleBtn.classList.toggle('on', buildModeEnabled);
        toggleBtn.textContent = buildModeEnabled ? '🧱 Build Mode: ON' : '🧱 Build Mode';
    }

    const indicator = document.getElementById('buildModeIndicator');
    if (indicator) {
        indicator.classList.toggle('show', buildModeEnabled);
    }
}

function setBuildModeEnabled(nextState) {
    buildModeEnabled = !!nextState;
    if (buildModeEnabled) {
        ensureBuildGroup();
        if (typeof clearStarSelection === 'function') clearStarSelection();
    }
    updateBuildModeUI();
    return buildModeEnabled;
}

function toggleBlockBuildMode(forceState) {
    if (!gameStarted) return false;
    if (typeof isEnv === 'function' && typeof ENV !== 'undefined' && isEnv(ENV.SPACE_FLIGHT)) {
        return false;
    }
    const next = typeof forceState === 'boolean' ? forceState : !buildModeEnabled;
    return setBuildModeEnabled(next);
}

function raycastBuildAction(event) {
    const raycaster = getBuildRaycaster();
    if (!raycaster || !camera || !renderer || !buildMouse) return null;

    const canvasRect = renderer.domElement.getBoundingClientRect();
    buildMouse.x = ((event.clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
    buildMouse.y = -((event.clientY - canvasRect.top) / canvasRect.height) * 2 + 1;
    raycaster.setFromCamera(buildMouse, camera);

    // Existing blocks take precedence for stacking/removal.
    if (buildGroup && buildGroup.children.length > 0) {
        const hits = raycaster.intersectObjects(buildGroup.children, false);
        if (hits.length > 0) {
            const hit = hits[0];
            const data = hit.object && hit.object.userData ? hit.object.userData : null;
            if (data && Number.isFinite(data.gx) && Number.isFinite(data.gy) && Number.isFinite(data.gz)) {
                if (event.shiftKey) {
                    return { kind: 'remove', gx: data.gx, gy: data.gy, gz: data.gz };
                }
                const n = snapFaceNormalToAxis(hit.face && hit.face.normal, hit.object);
                return {
                    kind: 'place',
                    gx: data.gx + n.x,
                    gy: data.gy + n.y,
                    gz: data.gz + n.z
                };
            }
        }
    }

    if (event.shiftKey) return null;

    // Place on world surface if not targeting an existing block.
    let point = null;
    const worldTargets = [];
    if (Array.isArray(roadMeshes)) {
        roadMeshes.forEach((mesh) => {
            if (mesh && mesh.visible) worldTargets.push(mesh);
        });
    }
    if (Array.isArray(buildingMeshes)) {
        buildingMeshes.forEach((mesh) => {
            if (mesh && mesh.visible) worldTargets.push(mesh);
        });
    }
    if (Array.isArray(landuseMeshes)) {
        landuseMeshes.forEach((mesh) => {
            if (mesh && mesh.visible) worldTargets.push(mesh);
        });
    }
    if (onMoon && moonSurface && moonSurface.visible !== false) {
        worldTargets.push(moonSurface);
    }

    if (worldTargets.length > 0) {
        const worldHits = raycaster.intersectObjects(worldTargets, true);
        if (worldHits.length > 0) {
            point = worldHits[0].point.clone();
        }
    }

    if (!point) {
        if (!buildPlane || !buildTempPoint || !raycaster.ray.intersectPlane(buildPlane, buildTempPoint)) {
            return null;
        }
        point = buildTempPoint.clone();
        point.y = getSurfaceYAt(point.x, point.z);
    }

    const gy = toGridCoord(point.y + BUILD_BLOCK_SIZE * 0.5);
    return {
        kind: 'place',
        gx: toGridCoord(point.x),
        gy,
        gz: toGridCoord(point.z)
    };
}

function handleBlockBuilderClick(event) {
    if (!buildModeEnabled || !gameStarted || paused || showLargeMap) return false;
    if (typeof isEnv === 'function' && typeof ENV !== 'undefined' && isEnv(ENV.SPACE_FLIGHT)) return false;
    if (isBuildClickBlocked(event.target)) return false;

    const action = raycastBuildAction(event);
    if (!action) return false;

    const worldX = toWorldCoord(action.gx);
    const worldY = toWorldCoord(action.gy);
    const worldZ = toWorldCoord(action.gz);
    const ref = getBuildReferencePosition();
    const dist = Math.hypot(worldX - ref.x, worldY - ref.y, worldZ - ref.z);
    if (dist > BUILD_MAX_DISTANCE) return true;

    if (action.kind === 'remove') {
        removeBuildBlock(action.gx, action.gy, action.gz);
        return true;
    }
    if (action.kind === 'place') {
        placeBuildBlock(action.gx, action.gy, action.gz);
        return true;
    }
    return false;
}

function clearBlockBuilderForWorldReload() {
    clearAllBuildBlocks();
}

function refreshBlockBuilderForCurrentLocation() {
    ensureBuildGroup();
}

Object.assign(globalThis, {
    clearAllBuildBlocks,
    clearBlockBuilderForWorldReload,
    handleBlockBuilderClick,
    placeBuildBlock,
    refreshBlockBuilderForCurrentLocation,
    setBuildModeEnabled,
    toggleBlockBuildMode
});

export {
    clearAllBuildBlocks,
    clearBlockBuilderForWorldReload,
    handleBlockBuilderClick,
    placeBuildBlock,
    refreshBlockBuilderForCurrentLocation,
    setBuildModeEnabled,
    toggleBlockBuildMode
};
