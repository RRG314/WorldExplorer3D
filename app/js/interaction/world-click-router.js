import { openRealityCaptureForBuilding } from '../reality-capture/ui.js?v=1';

function uniqueVisibleRoots(groups = []) {
  const seen = new Set();
  return groups.flat().filter((object) => {
    if (!object?.isObject3D || object.visible === false || seen.has(object.uuid)) return false;
    seen.add(object.uuid);
    return true;
  });
}

function targetFromObject(object) {
  let current = object;
  while (current) {
    const semantic = typeof current.userData?.worldClickTarget === 'function'
      ? current.userData.worldClickTarget()
      : current.userData?.worldClickTarget;
    if (semantic) return semantic;
    if (current.userData?.isPOIMarker) {
      return { kind: 'poi', position: current.userData.poiPosition || null };
    }
    if (current.userData?.interactiveWorldObject) {
      return {
        kind: 'furniture',
        id: current.userData.urbanEntityId || current.uuid,
        label: String(current.userData.furnitureKind || 'street object').replaceAll('_', ' '),
        object: current
      };
    }
    if (current.userData?.sourceBuildingId || current.userData?.buildingFootprint) {
      return {
        kind: 'building',
        id: String(current.userData.sourceBuildingId || current.uuid),
        label: String(current.userData.buildingName || current.userData.buildingType || 'building').replaceAll('_', ' '),
        object: current
      };
    }
    current = current.parent;
  }
  return null;
}

function targetFromIntersection(intersection) {
  const objectTarget = targetFromObject(intersection?.object);
  if (objectTarget) return { ...objectTarget, position: intersection?.point || null };
  const ranges = intersection?.object?.userData?.editableBuildingIndexRanges;
  const indexOffset = Number.isInteger(intersection?.faceIndex) ? intersection.faceIndex * 3 : -1;
  if (!Array.isArray(ranges) || indexOffset < 0) return null;
  const range = ranges.find((entry) => (
    indexOffset >= Number(entry.start) && indexOffset < Number(entry.start) + Number(entry.count)
  ));
  return range ? {
    kind: 'building',
    id: String(range.sourceBuildingId || ''),
    label: 'mapped building',
    object: intersection.object,
    position: intersection?.point || null
  } : null;
}

function nearestPoi(appCtx, position) {
  if (!position) return null;
  return (appCtx.pois || []).map((poi) => ({
    poi,
    distance: Math.hypot(Number(poi.x || 0) - Number(position.x || 0), Number(poi.z || 0) - Number(position.z || 0))
  })).sort((left, right) => left.distance - right.distance)[0]?.poi || null;
}

function showWorldSelectionNotice(title, detail = '', action = null) {
  let card = document.getElementById('worldSelectionNotice');
  if (!card) {
    card = document.createElement('aside');
    card.id = 'worldSelectionNotice';
    card.className = 'world-selection-notice';
    card.hidden = true;
    card.setAttribute('aria-live', 'polite');
    card.innerHTML = '<div><strong></strong><span></span></div><div class="worldSelectionActions"><button type="button" data-world-selection-action hidden></button><button type="button" data-world-selection-dismiss aria-label="Dismiss selection">×</button></div>';
    card.querySelector('[data-world-selection-dismiss]')?.addEventListener('click', () => { card.hidden = true; });
    document.body.appendChild(card);
  }
  card.querySelector('strong').textContent = String(title || 'World object');
  card.querySelector('span').textContent = String(detail || '');
  const actionButton = card.querySelector('[data-world-selection-action]');
  actionButton.hidden = !action?.label || typeof action?.onClick !== 'function';
  actionButton.textContent = action?.label || '';
  actionButton.onclick = action?.onClick || null;
  card.hidden = false;
  clearTimeout(Number(card._hideTimer) || 0);
  card._hideTimer = setTimeout(() => { card.hidden = true; }, 5500);
  return true;
}

function performWorldClickTarget(appCtx, target) {
  if (!target) return false;
  if (typeof appCtx.showWorldSelectionNotice !== 'function') {
    appCtx.showWorldSelectionNotice = showWorldSelectionNotice;
  }
  if (appCtx.handleLivingWorldSelection?.(target) === true) return true;
  if (target.kind === 'poi') {
    const poi = target.poi || nearestPoi(appCtx, target.position);
    if (!poi) return false;
    appCtx.showMapInfo?.('poi', poi);
    return true;
  }
  if (target.kind === 'furniture') {
    showWorldSelectionNotice(
      target.label || 'Street object',
      String(target.object?.userData?.provenance || 'World Explorer').replaceAll('_', ' ')
    );
    return true;
  }
  if (target.kind === 'building') {
    showWorldSelectionNotice(
      target.label || 'Building',
      'Approach an entrance to enter, open Real Estate, or help improve this mapped place.',
      {
        label: 'Improve this place',
        onClick: () => {
          document.getElementById('worldSelectionNotice')?.setAttribute('hidden', '');
          void openRealityCaptureForBuilding(appCtx, target);
        }
      }
    );
    return true;
  }
  return false;
}

function handleWorldCanvasClick(appCtx, event) {
  if (!globalThis.THREE || event?.button !== 0 || event?.target !== appCtx.renderer?.domElement) return false;
  if (!appCtx.gameStarted || appCtx.paused || appCtx.blockBuildMode || appCtx.fishingGame?.open) return false;
  if (appCtx.worldDiscoveryRuntime?.ui?.open || appCtx.urbanSandboxRuntime?.equipmentOpen) return false;
  if (appCtx.Walk?.state?.mode !== 'walk') return false;
  const equipmentCategory = appCtx.urbanSandboxRuntime?.equipment?.equipped?.()?.category;
  if (equipmentCategory === 'sidearm' || equipmentCategory === 'explosive') return false;
  const populationRoots = appCtx.livingWorldRuntime?.population?.pickableRoots?.() || [];
  const roots = uniqueVisibleRoots([
    populationRoots,
    appCtx.poiMeshes || [],
    appCtx.streetFurnitureMeshes || [],
    appCtx.buildingMeshes || []
  ]);
  if (!roots.length) return false;
  const rect = appCtx.renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    (event.clientX - rect.left) / Math.max(1, rect.width) * 2 - 1,
    -((event.clientY - rect.top) / Math.max(1, rect.height) * 2 - 1)
  );
  const raycaster = new THREE.Raycaster();
  raycaster.far = 900;
  raycaster.setFromCamera(pointer, appCtx.camera);
  const hit = raycaster.intersectObjects(roots, true)[0];
  return performWorldClickTarget(appCtx, targetFromIntersection(hit));
}

export {
  handleWorldCanvasClick,
  performWorldClickTarget,
  showWorldSelectionNotice,
  targetFromIntersection,
  targetFromObject
};
