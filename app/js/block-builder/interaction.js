export function createBlockBuilderInteraction(options) {
  const {
    appCtx,
    blockHalf,
    blockKey,
    getBuildGroup,
    getBuildReferencePosition,
    getBuildShape,
    getBuildTool,
    getMaterialIndex,
    getRotation,
    getSurfaceYAt,
    onAction,
    placeBuildBlock,
    removeBuildBlock,
    toGridCoord,
    toWorldCoord
  } = options;

  const THREE = globalThis.THREE;
  const mouse = THREE ? new THREE.Vector2() : null;
  const plane = THREE ? new THREE.Plane(new THREE.Vector3(0, 1, 0), 0) : null;
  const tempPoint = THREE ? new THREE.Vector3() : null;
  const normalMatrix = THREE ? new THREE.Matrix3() : null;
  let raycaster = null;
  let lastTouchAction = null;

  function getRaycaster() {
    if (!raycaster && THREE) {
      raycaster = new THREE.Raycaster();
      raycaster.far = 1200;
    }
    return raycaster;
  }

  function clientPoint(event) {
    if (Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
      return { x: event.clientX, y: event.clientY };
    }
    const touch = event?.changedTouches?.[0] || event?.touches?.[0];
    if (Number.isFinite(touch?.clientX) && Number.isFinite(touch?.clientY)) {
      return { x: touch.clientX, y: touch.clientY };
    }
    return null;
  }

  function isTouchLike(event) {
    if (event?.source === 'touch') return true;
    if (event?.pointerType && event.pointerType !== 'mouse') return true;
    return String(event?.type || '').startsWith('touch');
  }

  function isDuplicateTouchClick(point, event) {
    if (!lastTouchAction || !point || isTouchLike(event)) return false;
    const type = String(event?.type || '');
    if (type !== 'click' && type !== 'mouseup') return false;
    const age = Date.now() - lastTouchAction.ts;
    return age >= 0 && age <= 700 &&
      Math.abs(point.x - lastTouchAction.x) <= 6 &&
      Math.abs(point.y - lastTouchAction.y) <= 6;
  }

  function blockedTarget(target) {
    if (!target?.closest) return false;
    return !!target.closest(
      '#titleScreen, #largeMap, #propertyPanel, #propertyModal, #historicPanel, #memoryComposer, ' +
      '#memoryInfoPanel, #floatMenuContainer, #controlsTab, #pauseScreen, #resultScreen, #caughtScreen, ' +
      '#legendPanel, #mapInfoPanel, #mainMenuBtn, #realEstateBtn, #historicBtn, #memoryFlowerFloatBtn, ' +
      '#starInfo, #solarSystemInfoPanel, #blockBuilderPanel'
    );
  }

  function faceAxis(faceNormal, object) {
    if (!faceNormal || !object || !THREE) return { x: 0, y: 1, z: 0 };
    const normal = faceNormal.clone();
    normalMatrix.getNormalMatrix(object.matrixWorld);
    normal.applyMatrix3(normalMatrix).normalize();
    const ax = Math.abs(normal.x);
    const ay = Math.abs(normal.y);
    const az = Math.abs(normal.z);
    if (ax >= ay && ax >= az) return { x: normal.x >= 0 ? 1 : -1, y: 0, z: 0 };
    if (ay >= ax && ay >= az) return { x: 0, y: normal.y >= 0 ? 1 : -1, z: 0 };
    return { x: 0, y: 0, z: normal.z >= 0 ? 1 : -1 };
  }

  function worldTargets() {
    const targets = [];
    const addVisible = (mesh) => {
      if (mesh?.visible !== false) targets.push(mesh);
    };
    appCtx.activeInterior?.placementTargets?.forEach(addVisible);
    appCtx.roadMeshes?.forEach(addVisible);
    appCtx.buildingMeshes?.forEach(addVisible);
    appCtx.landuseMeshes?.forEach(addVisible);
    appCtx.terrainGroup?.children?.forEach(addVisible);
    if (appCtx.onMars) addVisible(appCtx.marsSurface);
    else if (appCtx.onMoon) addVisible(appCtx.moonSurface);
    return targets;
  }

  function raycastAction(event) {
    const activeRaycaster = getRaycaster();
    const point = clientPoint(event);
    if (!activeRaycaster || !appCtx.camera || !appCtx.renderer || !mouse || !point) return null;

    const rect = appCtx.renderer.domElement.getBoundingClientRect();
    mouse.x = (point.x - rect.left) / rect.width * 2 - 1;
    mouse.y = -((point.y - rect.top) / rect.height * 2 - 1);
    activeRaycaster.setFromCamera(mouse, appCtx.camera);

    const group = getBuildGroup();
    if (group?.children?.length) {
      const hit = activeRaycaster.intersectObjects(group.children, false)[0];
      const data = hit?.object?.userData;
      if (Number.isFinite(data?.gx) && Number.isFinite(data?.gy) && Number.isFinite(data?.gz)) {
        if (event.shiftKey || getBuildTool() === 'remove') {
          return {
            kind: 'remove',
            gx: data.gx,
            gy: data.gy,
            gz: data.gz,
            materialIndex: Number(data.materialIndex) || 0,
            shape: String(data.shape || 'cube'),
            rotation: Number(data.rotation) || 0
          };
        }
        const axis = faceAxis(hit.face?.normal, hit.object);
        return { kind: 'place', gx: data.gx + axis.x, gy: data.gy + axis.y, gz: data.gz + axis.z };
      }
    }

    if (event.shiftKey || getBuildTool() === 'remove') return null;
    const targetHit = activeRaycaster.intersectObjects(worldTargets(), true)[0];
    let worldPoint = targetHit?.point?.clone?.() || null;
    if (!worldPoint) {
      if (!plane || !tempPoint || !activeRaycaster.ray.intersectPlane(plane, tempPoint)) return null;
      worldPoint = tempPoint.clone();
      worldPoint.y = getSurfaceYAt(worldPoint.x, worldPoint.z);
    }
    return {
      kind: 'place',
      gx: toGridCoord(worldPoint.x),
      gy: toGridCoord(worldPoint.y + blockHalf),
      gz: toGridCoord(worldPoint.z)
    };
  }

  function handleBlockBuilderClick(event) {
    if (!options.isEnabled() || !appCtx.gameStarted || appCtx.paused || appCtx.showLargeMap) return false;
    if (appCtx.isEnv?.(appCtx.ENV?.SPACE_FLIGHT)) return false;
    if (blockedTarget(event.target)) return false;
    const point = clientPoint(event);
    if (!point || isDuplicateTouchClick(point, event)) return false;

    const action = raycastAction(event);
    if (!action) return false;
    const reference = getBuildReferencePosition();
    const distance = Math.hypot(
      toWorldCoord(action.gx) - reference.x,
      toWorldCoord(action.gy) - reference.y,
      toWorldCoord(action.gz) - reference.z
    );
    if (distance > options.maxDistance) return true;

    let changed = false;
    if (action.kind === 'remove') {
      changed = removeBuildBlock(action.gx, action.gy, action.gz);
    } else {
      action.shape = getBuildShape();
      action.rotation = getRotation();
      changed = placeBuildBlock(action.gx, action.gy, action.gz, getMaterialIndex(), {
        shape: action.shape,
        rotation: action.rotation
      });
    }
    if (changed) onAction({
      ...action,
      materialIndex: action.materialIndex ?? getMaterialIndex(),
      shape: action.shape || getBuildShape(),
      rotation: action.rotation ?? getRotation()
    });
    if (isTouchLike(event)) lastTouchAction = { x: point.x, y: point.y, ts: Date.now() };
    return true;
  }

  return { handleBlockBuilderClick };
}
