import { ctx as appCtx } from "../shared-context.js?v=55";

const PROPERTY_MARKER_HIT_RADIUS = 10;
const POI_MARKER_HIT_RADIUS = 8;
const HISTORIC_MARKER_HIT_RADIUS = 8;
const ACTIVITY_MARKER_HIT_RADIUS = 10;
const DEFLOCK_MARKER_HIT_RADIUS = 10;
const MINIMAP_ZOOM_MIN = 12;
const MINIMAP_ZOOM_MAX = 18;
const LARGE_MAP_ZOOM_MIN = 10;
const LARGE_MAP_ZOOM_MAX = 18;
let suppressLargeMapClick = false;

function syncLargeMapBrowsingUi() {
  const largeMap = document.getElementById('largeMap');
  const status = document.getElementById('mapExplorerStatus');
  const browsing = Number.isFinite(appCtx.largeMapCenterWorld?.x) && Number.isFinite(appCtx.largeMapCenterWorld?.z);
  largeMap?.classList.toggle('browsing', browsing);
  if (status) status.textContent = browsing ? 'Exploring away from your position' : 'Following your position';
}

function resetLargeMapBrowsing() {
  appCtx.largeMapCenterWorld = null;
  syncLargeMapBrowsingUi();
}

function adjustLargeMapZoom(delta = 0) {
  const current = Math.round(Number(appCtx.largeMapZoom) || 14);
  appCtx.largeMapZoom = Math.max(LARGE_MAP_ZOOM_MIN, Math.min(LARGE_MAP_ZOOM_MAX, current + delta));
  const zoomLevel = document.getElementById('zoomLevel');
  if (zoomLevel) zoomLevel.textContent = `Z ${appCtx.largeMapZoom}`;
  document.getElementById('mapZoomIn')?.toggleAttribute('disabled', appCtx.largeMapZoom >= LARGE_MAP_ZOOM_MAX);
  document.getElementById('mapZoomOut')?.toggleAttribute('disabled', appCtx.largeMapZoom <= LARGE_MAP_ZOOM_MIN);
  appCtx.drawLargeMap?.();
}

function canvasPointerPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

function distance2D(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function findFirstMapHit(items = [], point = { x: 0, y: 0 }, radius = 8, project = null, isVisible = null) {
  if (!Array.isArray(items) || typeof project !== 'function') return null;
  for (const item of items) {
    if (typeof isVisible === 'function' && !isVisible(item)) continue;
    const projected = project(item);
    if (!projected) continue;
    if (distance2D(point.x, point.y, projected.x, projected.y) < radius) return item;
  }
  return null;
}

function bindLargeMapCanvasInteractions() {
  const largeMapCanvas = document.getElementById('largeMapCanvas');
  if (!largeMapCanvas) return;

  largeMapCanvas.addEventListener('click', (event) => {
    if (!appCtx.showLargeMap) return;
    if (suppressLargeMapClick) {
      suppressLargeMapClick = false;
      return;
    }

    const clickPoint = canvasPointerPoint(largeMapCanvas, event);

    if (appCtx.gameMode === 'deflock' && Array.isArray(appCtx.deFlockMapMarkers)) {
      const cameraHit = findFirstMapHit(
        appCtx.deFlockMapMarkers,
        clickPoint,
        DEFLOCK_MARKER_HIT_RADIUS,
        (camera) => appCtx.worldToScreenLarge(camera.x, camera.z)
      );
      if (cameraHit) {
        appCtx.showMapInfo('deflock', cameraHit);
        return;
      }
    }

    if (appCtx.mapLayers.activities !== false && Array.isArray(appCtx.activityDiscoveryMapMarkers) && appCtx.activityDiscoveryMapMarkers.length > 0) {
      const activityHit = findFirstMapHit(
        appCtx.activityDiscoveryMapMarkers,
        clickPoint,
        ACTIVITY_MARKER_HIT_RADIUS,
        (activity) => appCtx.worldToScreenLarge(activity.x, activity.z)
      );
      if (activityHit) {
        if (typeof appCtx.openActivityBrowser === 'function') {
          appCtx.openActivityBrowser({ activityId: activityHit.id });
        }
        return;
      }
    }

    if (appCtx.mapLayers.properties && appCtx.realEstateMode) {
      const propertyHit = findFirstMapHit(
        appCtx.properties,
        clickPoint,
        PROPERTY_MARKER_HIT_RADIUS,
        (prop) => appCtx.worldToScreenLarge(prop.x, prop.z)
      );
      if (propertyHit) {
        appCtx.showMapInfo('property', propertyHit);
        return;
      }
    }

    if (appCtx.pois.length > 0) {
      const poiHit = findFirstMapHit(
        appCtx.pois,
        clickPoint,
        POI_MARKER_HIT_RADIUS,
        (poi) => appCtx.worldToScreenLarge(poi.x, poi.z),
        (poi) => appCtx.isPOIVisible(poi.type)
      );
      if (poiHit) {
        appCtx.showMapInfo('poi', poiHit);
        return;
      }
    }

    if (appCtx.mapLayers.historic && appCtx.historicSites.length > 0) {
      const historicHit = findFirstMapHit(
        appCtx.historicSites,
        clickPoint,
        HISTORIC_MARKER_HIT_RADIUS,
        (site) => appCtx.worldToScreenLarge(site.x, site.z)
      );
      if (historicHit) appCtx.showMapInfo('historic', historicHit);
    }
  });

  largeMapCanvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (!appCtx.showLargeMap) return;
    const clickPoint = canvasPointerPoint(largeMapCanvas, event);
    const worldPos = appCtx.largeMapScreenToWorld(clickPoint.x, clickPoint.y);
    appCtx.teleportToLocation(worldPos.x, worldPos.z, {
      source: 'large_map_context',
      preferBoatIfWater: true
    });
  });

  let panPointerId = null;
  let lastPointer = null;
  let panDistance = 0;
  const endPan = (event) => {
    if (panPointerId !== event.pointerId) return;
    if (panDistance > 6) suppressLargeMapClick = true;
    panPointerId = null;
    lastPointer = null;
    panDistance = 0;
    largeMapCanvas.classList.remove('is-panning');
    try { largeMapCanvas.releasePointerCapture(event.pointerId); } catch (_) {}
  };

  largeMapCanvas.addEventListener('pointerdown', (event) => {
    if (!appCtx.showLargeMap || panPointerId !== null || event.button > 0) return;
    panPointerId = event.pointerId;
    lastPointer = { x: event.clientX, y: event.clientY };
    panDistance = 0;
    largeMapCanvas.classList.add('is-panning');
    try { largeMapCanvas.setPointerCapture(event.pointerId); } catch (_) {}
  });
  largeMapCanvas.addEventListener('pointermove', (event) => {
    if (panPointerId !== event.pointerId || !lastPointer || !appCtx.showLargeMap) return;
    const dx = event.clientX - lastPointer.x;
    const dy = event.clientY - lastPointer.y;
    if (dx === 0 && dy === 0) return;
    const rect = largeMapCanvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? largeMapCanvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? largeMapCanvas.height / rect.height : 1;
    const center = appCtx.largeMapScreenToWorld(400 - dx * scaleX, 400 - dy * scaleY);
    appCtx.largeMapCenterWorld = { x: center.x, z: center.z };
    lastPointer = { x: event.clientX, y: event.clientY };
    panDistance += Math.hypot(dx, dy);
    syncLargeMapBrowsingUi();
    appCtx.drawLargeMap?.();
    event.preventDefault();
  });
  largeMapCanvas.addEventListener('pointerup', endPan);
  largeMapCanvas.addEventListener('pointercancel', endPan);
  largeMapCanvas.addEventListener('lostpointercapture', endPan);
  largeMapCanvas.addEventListener('wheel', (event) => {
    if (!appCtx.showLargeMap) return;
    event.preventDefault();
    adjustLargeMapZoom(event.deltaY < 0 ? 1 : -1);
  }, { passive: false });
}

function bindMapControls() {
  const minimapCanvas = document.getElementById('minimap');
  const minimapZoomLevel = document.getElementById('minimapZoomLevel');
  const minimapZoomInBtn = document.getElementById('minimapZoomIn');
  const minimapZoomOutBtn = document.getElementById('minimapZoomOut');
  const largeMap = document.getElementById('largeMap');
  const mapClose = document.getElementById('mapClose');
  const mapRecenter = document.getElementById('mapRecenter');
  const mapSearchForm = document.getElementById('mapSearchForm');
  const mapSearchInput = document.getElementById('mapSearchInput');
  const mapSearchBtn = document.getElementById('mapSearchBtn');
  const mapSearchStatus = document.getElementById('mapSearchStatus');
  const mapLegend = document.getElementById('mapLegend');
  const mapSatelliteToggle = document.getElementById('mapSatelliteToggle');
  const mapRoadsToggle = document.getElementById('mapRoadsToggle');
  const mapPathsToggle = document.getElementById('mapPathsToggle');
  const mapZoomIn = document.getElementById('mapZoomIn');
  const mapZoomOut = document.getElementById('mapZoomOut');
  const zoomLevel = document.getElementById('zoomLevel');
  const legendPanel = document.getElementById('legendPanel');

  const syncMinimapZoomUi = () => {
    const zoom = Math.max(MINIMAP_ZOOM_MIN, Math.min(MINIMAP_ZOOM_MAX, Math.round(Number(appCtx.minimapZoom) || 15)));
    appCtx.minimapZoom = zoom;
    if (minimapZoomLevel) minimapZoomLevel.textContent = `Z ${zoom}`;
    if (minimapZoomInBtn) minimapZoomInBtn.disabled = zoom >= MINIMAP_ZOOM_MAX;
    if (minimapZoomOutBtn) minimapZoomOutBtn.disabled = zoom <= MINIMAP_ZOOM_MIN;
  };

  const adjustMinimapZoom = (delta = 0) => {
    const nextZoom = Math.max(
      MINIMAP_ZOOM_MIN,
      Math.min(MINIMAP_ZOOM_MAX, Math.round((Number(appCtx.minimapZoom) || 15) + delta))
    );
    if (nextZoom === appCtx.minimapZoom) return;
    appCtx.minimapZoom = nextZoom;
    syncMinimapZoomUi();
  };

  syncMinimapZoomUi();
  adjustLargeMapZoom(0);

  const openLargeMap = () => {
    resetLargeMapBrowsing();
    appCtx.clearControlInputState?.('large-map-open');
    appCtx.showLargeMap = true;
    largeMap?.classList.add('show');
    if (typeof appCtx.renderInteriorLegend === 'function') appCtx.renderInteriorLegend();
    appCtx.drawLargeMap?.();
  };
  const closeLargeMap = () => {
    appCtx.showLargeMap = false;
    resetLargeMapBrowsing();
    largeMap?.classList.remove('show');
    document.getElementById('legendPanel')?.style.setProperty('display', 'none');
    appCtx.closeMapInfo?.();
  };
  appCtx.openLargeMap = openLargeMap;
  appCtx.closeLargeMap = closeLargeMap;
  appCtx.adjustLargeMapZoom = adjustLargeMapZoom;

  if (minimapCanvas) {
    minimapCanvas.addEventListener('click', () => {
      openLargeMap();
    });
    minimapCanvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const point = canvasPointerPoint(minimapCanvas, event);
      const worldPos = appCtx.minimapScreenToWorld(point.x, point.y);
      appCtx.teleportToLocation(worldPos.x, worldPos.z, {
        source: 'minimap_context',
        preferBoatIfWater: true
      });
    });
    minimapCanvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      adjustMinimapZoom(event.deltaY < 0 ? 1 : -1);
    }, { passive: false });
  }

  minimapZoomInBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    adjustMinimapZoom(1);
  });
  minimapZoomOutBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    adjustMinimapZoom(-1);
  });

  mapClose?.addEventListener('click', closeLargeMap);
  mapRecenter?.addEventListener('click', () => {
    resetLargeMapBrowsing();
    appCtx.drawLargeMap?.();
  });
  mapSearchForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof appCtx.searchAndTravelToLocation !== 'function') {
      if (mapSearchStatus) {
        mapSearchStatus.textContent = 'Place search is still loading. Try again in a moment.';
        mapSearchStatus.dataset.tone = 'error';
      }
      return;
    }
    if (mapSearchBtn) mapSearchBtn.disabled = true;
    try {
      await appCtx.searchAndTravelToLocation(mapSearchInput?.value, {
        statusElement: mapSearchStatus,
        closeMap: true
      });
    } finally {
      if (mapSearchBtn) mapSearchBtn.disabled = false;
    }
  });

  mapLegend?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!legendPanel) return;
    const opening = legendPanel.style.display === 'none';
    legendPanel.style.display = opening ? 'block' : 'none';
    if (!opening) return;
    if (typeof appCtx.renderInteriorLegend === 'function') appCtx.renderInteriorLegend();
    if (typeof appCtx.scanNearbyInteriorSupport === 'function') {
      appCtx.scanNearbyInteriorSupport().catch((error) => {
        console.warn('[Interior] Nearby support scan failed from legend open.', error);
      });
    }
  });

  largeMap?.addEventListener('click', (event) => {
    if (event.target?.id !== 'largeMap') return;
    closeLargeMap();
  });

  mapSatelliteToggle?.addEventListener('click', (event) => {
    event.stopPropagation();
    appCtx.satelliteView = !appCtx.satelliteView;
    mapSatelliteToggle.classList.toggle('active', appCtx.satelliteView);
    document.getElementById('fSatellite')?.classList.toggle('on', appCtx.satelliteView);
  });

  mapRoadsToggle?.addEventListener('click', (event) => {
    event.stopPropagation();
    appCtx.showRoads = !appCtx.showRoads;
    mapRoadsToggle.classList.toggle('active', appCtx.showRoads);
    document.getElementById('fRoads')?.classList.toggle('on', appCtx.showRoads);
  });

  mapPathsToggle?.addEventListener('click', (event) => {
    event.stopPropagation();
    appCtx.showPathOverlays = !appCtx.showPathOverlays;
    mapPathsToggle.classList.toggle('active', appCtx.showPathOverlays);
    document.getElementById('fPaths')?.classList.toggle('on', appCtx.showPathOverlays);
    if (typeof appCtx.syncLinearFeatureOverlayVisibility === 'function') {
      appCtx.syncLinearFeatureOverlayVisibility();
    }
  });

  mapZoomIn?.addEventListener('click', (event) => {
    event.stopPropagation();
    adjustLargeMapZoom(1);
  });

  mapZoomOut?.addEventListener('click', (event) => {
    event.stopPropagation();
    adjustLargeMapZoom(-1);
  });

  document.getElementById('legendCloseBtn')?.addEventListener('click', () => appCtx.closeLegend());
  document.getElementById('legendShowAllBtn')?.addEventListener('click', () => appCtx.toggleAllLayers(true));
  document.getElementById('legendHideAllBtn')?.addEventListener('click', () => appCtx.toggleAllLayers(false));
  document.getElementById('mapInfoCloseBtn')?.addEventListener('click', () => appCtx.closeMapInfo());
  document.getElementById('closePropertyPanelBtn')?.addEventListener('click', () => appCtx.closePropertyPanel());
  document.getElementById('propertyFiltersToggle')?.addEventListener('click', () => appCtx.togglePropertyFilters());
  document.getElementById('closeHistoricPanelBtn')?.addEventListener('click', () => appCtx.closeHistoricPanel());
  document.getElementById('closeModalBtn')?.addEventListener('click', () => appCtx.closeModal());

  legendPanel?.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.id || !target.id.startsWith('filter')) return;
    if (target.id === 'filterPOIsAll') return void appCtx.toggleAllPOIs();
    if (target.id === 'filterGameElementsAll') return void appCtx.toggleAllGameElements();
    if (target.id === 'filterRoads') return void appCtx.toggleRoads();
    appCtx.updateMapLayers();
  });
}

function initMapInteractions() {
  bindLargeMapCanvasInteractions();
  bindMapControls();
}

export { initMapInteractions };
