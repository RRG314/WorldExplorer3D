import { OVERLAY_EDITOR_TOOLS, normalizeOverlayTool } from './config.js?v=1';
import { getOverlayPreset } from './preset-registry.js?v=1';
import { pickBaseFeatureAtWorldPoint, snapTargetsAroundPoint } from './base-features.js?v=1';
import {
  buildAxisAlignedWorldRing,
  cleanWorldLinePoints,
  cleanWorldRingPoints,
  distanceToWorldFeature,
  geometryToWorldData,
  insertWorldGeometryVertex,
  mergeLineWorldGeometries,
  nearestSegmentIndex,
  nearestVertexIndex,
  projectPointToPolygonBoundary,
  removeWorldGeometryVertex,
  sampleSurfaceY,
  splitLineWorldGeometry,
  updateWorldGeometryVertex,
  worldDataToGeometry
} from './geometry.js?v=1';
import {
  createClientFeatureId,
  createOverlayFeatureDraft,
  normalizeOverlayFeature
} from './schema.js?v=1';

function featureSelectHit(ctx, worldPoint) {
  let best = null;
  ctx.state.workspaceFeatures.forEach((feature) => {
    const hit = distanceToWorldFeature(feature, worldPoint, { maxDistance: ctx.FEATURE_SELECT_DISTANCE });
    if (!hit || !Number.isFinite(hit.distance) || hit.distance > ctx.FEATURE_SELECT_DISTANCE) return;
    if (!best || hit.distance < best.distance) {
      best = {
        feature,
        distance: hit.distance,
        target: hit.target,
        segmentIndex: hit.segmentIndex ?? -1
      };
    }
  });
  return best;
}

function snapWorldPoint(ctx, worldPoint, options = {}) {
  const allowBase = options.allowBase !== false;
  const allowSelected = options.allowSelected !== false;
  let best = null;
  if (allowBase) {
    const vertexTarget = snapTargetsAroundPoint(worldPoint, ctx.SNAP_DISTANCE)[0];
    if (vertexTarget) {
      best = {
        point: vertexTarget.point,
        distance: vertexTarget.distance
      };
    }
    const baseHit = pickBaseFeatureAtWorldPoint(worldPoint, ctx.SNAP_DISTANCE);
    if (baseHit && (!best || baseHit.distance < best.distance)) {
      best = {
        point: baseHit.target || worldPoint,
        distance: baseHit.distance
      };
    }
  }
  if (allowSelected) {
    const feature = ctx.selectedFeature();
    if (feature) {
      const worldGeometry = geometryToWorldData(feature.geometry || {});
      const points = worldGeometry.type === 'Point'
        ? [worldGeometry.coordinates]
        : worldGeometry.type === 'LineString'
          ? worldGeometry.coordinates || []
          : worldGeometry.coordinates?.[0] || [];
      const nearestVertex = nearestVertexIndex(points, worldPoint, ctx.SNAP_DISTANCE);
      if (nearestVertex >= 0) {
        const point = points[nearestVertex];
        const distance = Math.hypot(point.x - worldPoint.x, point.z - worldPoint.z);
        if (!best || distance < best.distance) {
          best = { point, distance };
        }
      }
      const nearestSegment = nearestSegmentIndex(points, worldPoint, feature.geometryType === 'Polygon', ctx.SNAP_DISTANCE);
      if (nearestSegment.index >= 0 && nearestSegment.point && (!best || nearestSegment.distance < best.distance)) {
        best = {
          point: { x: nearestSegment.point.x, z: nearestSegment.point.z },
          distance: nearestSegment.distance
        };
      }
    }
  }
  ctx.state.snapPoint = best?.point || null;
  return ctx.state.snapPoint || worldPoint;
}

function worldPointFromPointerEvent(ctx, event) {
  if (typeof THREE === 'undefined' || !ctx.appCtx.camera || !ctx.appCtx.renderer?.domElement) return null;
  const rect = ctx.appCtx.renderer.domElement.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return null;
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, ctx.appCtx.camera);
  const origin = raycaster.ray.origin;
  const direction = raycaster.ray.direction;
  if (Math.abs(direction.y) < 1e-5) return null;
  let x = 0;
  let z = 0;
  for (let i = 0; i < 3; i += 1) {
    const targetY = i === 0 ? 0 : sampleSurfaceY(x, z, 0);
    const t = (targetY - origin.y) / direction.y;
    x = origin.x + direction.x * t;
    z = origin.z + direction.z * t;
  }
  return {
    x,
    z,
    y: sampleSurfaceY(x, z, 0)
  };
}

function finishPendingDraw(ctx) {
  const preset = getOverlayPreset(ctx.state.activePresetId);
  const points = ctx.state.pendingDraw.type === 'Polygon'
    ? cleanWorldRingPoints(ctx.state.pendingDraw.points)
    : cleanWorldLinePoints(ctx.state.pendingDraw.points);
  if (ctx.state.pendingDraw.type === 'Point' && points.length >= 1) {
    ctx.addWorkspaceFeature(createOverlayFeatureDraft({
      presetId: ctx.state.activePresetId,
      geometry: worldDataToGeometry({ type: 'Point', coordinates: points[0] }, 'Point')
    }));
    ctx.pushHistory();
  } else if (ctx.state.pendingDraw.type === 'LineString' && points.length >= 2) {
    ctx.addWorkspaceFeature(createOverlayFeatureDraft({
      presetId: ctx.state.activePresetId,
      geometry: worldDataToGeometry({ type: 'LineString', coordinates: points }, 'LineString')
    }));
    ctx.pushHistory();
  } else if (ctx.state.pendingDraw.type === 'Polygon' && points.length >= 3) {
    ctx.addWorkspaceFeature(createOverlayFeatureDraft({
      presetId: ctx.state.activePresetId,
      geometry: worldDataToGeometry({ type: 'Polygon', coordinates: [points] }, 'Polygon')
    }));
    ctx.pushHistory();
  } else {
    ctx.setStatus(`${preset.label} needs more geometry before it can be created.`, 'warning');
    return false;
  }
  ctx.state.pendingDraw = { type: '', points: [] };
  ctx.setStatus(`${preset.label} draft created.`, 'ok');
  ctx.refreshWorkspacePreview();
  ctx.renderUi();
  return true;
}

export function setTool(ctx, toolId) {
  ctx.state.tool = normalizeOverlayTool(toolId);
  ctx.state.pendingDraw = { type: '', points: [] };
  ctx.state.drawGesture = null;
  ctx.state.drawGestureCandidate = null;
  ctx.state.selectedVertexIndex = -1;
  ctx.closePreviewDrawer();
  ctx.refreshWorkspacePreview();
  ctx.renderUi();
}

export function setActivePreset(ctx, presetId) {
  ctx.state.activePresetId = ctx.sanitizeText(presetId || ctx.state.activePresetId, 80).toLowerCase() || 'road';
  if (!ctx.state.selectedFeatureId) ctx.state.workspaceSidebarView = 'presets';
  if (ctx.state.tool === 'draw_point' || ctx.state.tool === 'draw_line' || ctx.state.tool === 'draw_polygon') {
    ctx.state.pendingDraw.type = getOverlayPreset(ctx.state.activePresetId).geometryType;
  }
  ctx.renderUi();
}

export function setToolForPreset(ctx, presetId) {
  setActivePreset(ctx, presetId);
  const preset = getOverlayPreset(presetId);
  if (preset.geometryType === 'Point') setTool(ctx, 'draw_point');
  else if (preset.geometryType === 'LineString') setTool(ctx, 'draw_line');
  else setTool(ctx, 'draw_polygon');
}

function presetDrawBehavior(ctx, preset = getOverlayPreset(ctx.state.activePresetId)) {
  const featureClass = ctx.sanitizeText(preset?.featureClass || '', 40).toLowerCase();
  if (featureClass === 'building' || featureClass === 'parking' || preset?.id === 'building') return 'drag_box';
  if (featureClass === 'road' || featureClass === 'footway' || featureClass === 'cycleway' || featureClass === 'railway' || featureClass === 'corridor' || featureClass === 'stairs') return 'drag_segment';
  return 'click_vertices';
}

function previewDragGeometry(anchor, current, geometryType, behavior) {
  if (!anchor || !current) return [];
  if (geometryType === 'LineString' && behavior === 'drag_segment') return cleanWorldLinePoints([anchor, current]);
  if (geometryType === 'Polygon' && behavior === 'drag_box') return buildAxisAlignedWorldRing(anchor, current);
  return [];
}

function projectEntranceToBuilding(feature, worldPoint) {
  const worldGeometry = geometryToWorldData(feature.geometry || {});
  const ring = worldGeometry.type === 'Polygon' ? worldGeometry.coordinates?.[0] || [] : [];
  if (ring.length < 3) return null;
  return projectPointToPolygonBoundary(worldPoint, ring);
}

function handleSelectTool(ctx, worldPoint, event) {
  const feature = ctx.selectedFeature();
  if (feature) {
    const worldGeometry = geometryToWorldData(feature.geometry || {});
    const points = worldGeometry.type === 'Point'
      ? [worldGeometry.coordinates]
      : worldGeometry.type === 'LineString'
        ? worldGeometry.coordinates || []
        : worldGeometry.coordinates?.[0] || [];
    const vertexIndex = nearestVertexIndex(points, worldPoint, ctx.VERTEX_DISTANCE);
    if (vertexIndex >= 0) {
      ctx.state.selectedVertexIndex = vertexIndex;
      ctx.state.drag = { featureId: feature.featureId, vertexIndex };
      ctx.refreshWorkspacePreview();
      ctx.renderUi();
      return true;
    }
  }

  const workspaceHit = featureSelectHit(ctx, worldPoint);
  if (workspaceHit) {
    if ((event.metaKey || event.ctrlKey) && feature && feature.featureId !== workspaceHit.feature.featureId) {
      ctx.state.secondaryFeatureId = workspaceHit.feature.featureId;
    } else {
      ctx.state.secondaryFeatureId = '';
      ctx.state.selectedBaseFeature = null;
      ctx.setSelectedFeature(workspaceHit.feature.featureId);
    }
    ctx.refreshWorkspacePreview();
    ctx.renderUi();
    return true;
  }

  const baseFeature = pickBaseFeatureAtWorldPoint(worldPoint, ctx.FEATURE_SELECT_DISTANCE);
  ctx.state.selectedBaseFeature = baseFeature;
  ctx.state.selectedFeatureId = '';
  ctx.state.selectedVertexIndex = -1;
  ctx.refreshWorkspacePreview();
  ctx.renderUi();
  return !!baseFeature;
}

function handleDrawTool(ctx, worldPoint) {
  const preset = getOverlayPreset(ctx.state.activePresetId);
  const geometryType = preset.geometryType;
  const snapped = snapWorldPoint(ctx, worldPoint);
  if (geometryType === 'Point') {
    ctx.state.pendingDraw = { type: 'Point', points: [snapped] };
    return finishPendingDraw(ctx);
  }
  if (ctx.state.pendingDraw.type !== geometryType) ctx.state.pendingDraw = { type: geometryType, points: [] };
  if (geometryType === 'Polygon' && ctx.state.pendingDraw.points.length >= 3) {
    const first = ctx.state.pendingDraw.points[0];
    if (Math.hypot(first.x - snapped.x, first.z - snapped.z) <= ctx.SNAP_DISTANCE) {
      return finishPendingDraw(ctx);
    }
  }
  ctx.state.pendingDraw.points.push(snapped);
  ctx.refreshWorkspacePreview();
  ctx.renderUi();
  return true;
}

function handleGeometryEditTool(ctx, worldPoint) {
  const feature = ctx.selectedFeature();
  if (!feature) {
    ctx.setStatus('Select a workspace feature first.', 'warning');
    return false;
  }
  const worldGeometry = geometryToWorldData(feature.geometry || {});
  const points = worldGeometry.type === 'Point'
    ? [worldGeometry.coordinates]
    : worldGeometry.type === 'LineString'
      ? worldGeometry.coordinates || []
      : worldGeometry.coordinates?.[0] || [];
  const snapped = snapWorldPoint(ctx, worldPoint);

  if (ctx.state.tool === 'add_vertex') {
    const segment = nearestSegmentIndex(points, snapped, feature.geometryType === 'Polygon', ctx.FEATURE_SELECT_DISTANCE);
    if (segment.index < 0) return false;
    feature.geometry = worldDataToGeometry(insertWorldGeometryVertex(worldGeometry, segment.index, snapped), feature.geometryType);
    ctx.addWorkspaceFeature(feature);
    ctx.pushHistory();
    ctx.setStatus('Vertex inserted.', 'ok');
    return true;
  }

  if (ctx.state.tool === 'delete_vertex') {
    const vertexIndex = nearestVertexIndex(points, snapped, ctx.FEATURE_SELECT_DISTANCE);
    if (vertexIndex < 0) return false;
    feature.geometry = worldDataToGeometry(removeWorldGeometryVertex(worldGeometry, vertexIndex), feature.geometryType);
    ctx.addWorkspaceFeature(feature);
    ctx.pushHistory();
    ctx.setStatus('Vertex removed.', 'ok');
    return true;
  }

  if (ctx.state.tool === 'split_line' && feature.geometryType === 'LineString') {
    const segment = nearestSegmentIndex(points, snapped, false, ctx.FEATURE_SELECT_DISTANCE);
    if (segment.index < 0) return false;
    const split = splitLineWorldGeometry(worldGeometry, segment.index, snapped);
    if (!split) return false;
    const first = normalizeOverlayFeature({
      ...ctx.cloneJson(feature),
      geometry: worldDataToGeometry(split[0], 'LineString'),
      version: 1,
      featureId: feature.featureId
    });
    const second = createOverlayFeatureDraft({
      ...ctx.cloneJson(feature),
      featureId: createClientFeatureId('split'),
      geometry: worldDataToGeometry(split[1], 'LineString')
    });
    const index = ctx.state.workspaceFeatures.findIndex((entry) => entry.featureId === feature.featureId);
    if (index >= 0) {
      ctx.state.workspaceFeatures.splice(index, 1, first, second);
      ctx.state.selectedFeatureId = second.featureId;
      ctx.pushHistory();
      ctx.refreshWorkspacePreview();
      ctx.renderUi();
      ctx.setStatus('Line split into two overlay features.', 'ok');
      return true;
    }
  }
  return false;
}

export function mergeSelectedFeatures(ctx) {
  const feature = ctx.selectedFeature();
  const other = ctx.state.workspaceFeatures.find((entry) => entry.featureId === ctx.state.secondaryFeatureId) || null;
  if (!feature || !other) {
    ctx.setStatus('Select two compatible overlay line features to merge.', 'warning');
    return false;
  }
  if (feature.geometryType !== 'LineString' || other.geometryType !== 'LineString' || feature.presetId !== other.presetId) {
    ctx.setStatus('Only compatible line overlays can be merged in this pass.', 'error');
    return false;
  }
  const mergedWorld = mergeLineWorldGeometries(
    geometryToWorldData(feature.geometry || {}),
    geometryToWorldData(other.geometry || {})
  );
  if (!mergedWorld) {
    ctx.setStatus('Those line features do not share a mergeable endpoint.', 'warning');
    return false;
  }
  feature.geometry = worldDataToGeometry(mergedWorld, 'LineString');
  ctx.addWorkspaceFeature(feature);
  ctx.removeWorkspaceFeature(other.featureId);
  ctx.state.secondaryFeatureId = '';
  ctx.pushHistory();
  ctx.setStatus('Overlay lines merged.', 'ok');
  return true;
}

export function addEntranceAtCurrentPoint(ctx) {
  const feature = ctx.selectedFeature();
  if (!feature || feature.featureClass !== 'building') {
    ctx.setStatus('Select a building overlay before adding an entrance.', 'warning');
    return false;
  }
  const point = ctx.state.snapPoint || ctx.state.pointerWorld;
  if (!point) {
    ctx.setStatus('Move the pointer near the building wall to place an entrance.', 'warning');
    return false;
  }
  const projected = projectEntranceToBuilding(feature, point);
  if (!projected) {
    ctx.setStatus('Could not project that entrance onto the building shell.', 'warning');
    return false;
  }
  const anchorGeometry = worldDataToGeometry({ type: 'Point', coordinates: projected.point }, 'Point');
  const entrance = {
    lat: anchorGeometry.coordinates.lat,
    lon: anchorGeometry.coordinates.lon,
    label: `Entrance ${feature.threeD?.entrances?.length ? feature.threeD.entrances.length + 1 : 1}`,
    kind: 'entrance',
    elevation: 0,
    yaw: projected.yaw
  };
  feature.threeD.entrances = Array.isArray(feature.threeD?.entrances) ? feature.threeD.entrances.concat([entrance]) : [entrance];
  ctx.addWorkspaceFeature(feature);
  ctx.pushHistory();
  ctx.setStatus('Entrance added to building overlay.', 'ok');
  return true;
}

function handleCanvasPointerDown(ctx, event) {
  if (!ctx.state.active || ctx.state.tab !== 'workspace' || event.button !== 0) return;
  const worldPoint = worldPointFromPointerEvent(ctx, event);
  if (!worldPoint) return;
  ctx.state.pointerWorld = worldPoint;
  const snapped = snapWorldPoint(ctx, worldPoint);
  if (ctx.state.tool === 'select') {
    handleSelectTool(ctx, snapped, event);
    return;
  }
  if (ctx.state.tool === 'draw_point') {
    handleDrawTool(ctx, snapped);
    return;
  }
  if (ctx.state.tool === 'draw_line' || ctx.state.tool === 'draw_polygon') {
    const preset = getOverlayPreset(ctx.state.activePresetId);
    ctx.state.drawGestureCandidate = {
      anchor: snapped,
      geometryType: preset.geometryType,
      behavior: presetDrawBehavior(ctx, preset)
    };
    return;
  }
  handleGeometryEditTool(ctx, snapped);
}

function handleCanvasPointerMove(ctx, event) {
  if (!ctx.state.active || ctx.state.tab !== 'workspace') return;
  const worldPoint = worldPointFromPointerEvent(ctx, event);
  if (!worldPoint) return;
  ctx.state.pointerWorld = worldPoint;
  const snapped = snapWorldPoint(ctx, worldPoint);
  if (ctx.state.drag?.featureId && Number.isFinite(ctx.state.drag.vertexIndex)) {
    const feature = ctx.state.workspaceFeatures.find((entry) => entry.featureId === ctx.state.drag.featureId);
    if (feature) {
      const worldGeometry = geometryToWorldData(feature.geometry || {});
      feature.geometry = worldDataToGeometry(updateWorldGeometryVertex(worldGeometry, ctx.state.drag.vertexIndex, snapped), feature.geometryType);
      ctx.addWorkspaceFeature(feature);
    }
    ctx.scheduleWorkspacePreviewRefresh();
    return;
  }
  if (ctx.state.drawGestureCandidate?.anchor && ctx.state.drawGestureCandidate.behavior !== 'click_vertices') {
    const distance = Math.hypot(
      snapped.x - ctx.state.drawGestureCandidate.anchor.x,
      snapped.z - ctx.state.drawGestureCandidate.anchor.z
    );
    if (distance > 1.2) {
      ctx.state.drawGesture = ctx.cloneJson(ctx.state.drawGestureCandidate);
      ctx.state.pendingDraw = {
        type: ctx.state.drawGesture.geometryType,
        points: previewDragGeometry(
          ctx.state.drawGesture.anchor,
          snapped,
          ctx.state.drawGesture.geometryType,
          ctx.state.drawGesture.behavior
        )
      };
    }
  } else if (ctx.state.drawGesture?.anchor) {
    ctx.state.pendingDraw = {
      type: ctx.state.drawGesture.geometryType,
      points: previewDragGeometry(
        ctx.state.drawGesture.anchor,
        snapped,
        ctx.state.drawGesture.geometryType,
        ctx.state.drawGesture.behavior
      )
    };
  }
  ctx.scheduleWorkspacePreviewRefresh();
}

function handleCanvasPointerUp(ctx, event) {
  if (ctx.state.drag) {
    ctx.state.drag = null;
    ctx.pushHistory();
    ctx.refreshWorkspacePreview();
    return;
  }
  const worldPoint = event ? worldPointFromPointerEvent(ctx, event) : null;
  const snapped = worldPoint ? snapWorldPoint(ctx, worldPoint) : null;
  if (ctx.state.drawGesture?.anchor) {
    const previewPoints = Array.isArray(ctx.state.pendingDraw.points) ? ctx.state.pendingDraw.points.slice() : [];
    ctx.state.drawGesture = null;
    ctx.state.drawGestureCandidate = null;
    if (previewPoints.length) return finishPendingDraw(ctx);
  }
  if (ctx.state.drawGestureCandidate?.anchor && snapped) {
    ctx.state.drawGestureCandidate = null;
    return handleDrawTool(ctx, snapped);
  }
  ctx.state.drawGestureCandidate = null;
}

function handleWindowKeyDown(ctx, event) {
  if (!ctx.state.active) return;
  const target = event.target;
  const editingText = target instanceof HTMLElement && (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );
  if (editingText) return;

  const key = String(event.key || '').toLowerCase();
  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && key === 'z') {
    event.preventDefault();
    const snapshot = ctx.state.history.undo(ctx.editorSnapshot());
    if (snapshot) ctx.applyHistorySnapshot(snapshot);
    return;
  }
  if (((event.metaKey || event.ctrlKey) && event.shiftKey && key === 'z') || ((event.metaKey || event.ctrlKey) && key === 'y')) {
    event.preventDefault();
    const snapshot = ctx.state.history.redo(ctx.editorSnapshot());
    if (snapshot) ctx.applyHistorySnapshot(snapshot);
    return;
  }

  const tool = OVERLAY_EDITOR_TOOLS.find((entry) => String(entry.hotkey || '').toLowerCase() === key);
  if (tool) {
    event.preventDefault();
    setTool(ctx, tool.id);
    return;
  }

  if (key === 'enter') {
    if (ctx.state.pendingDraw.type) {
      event.preventDefault();
      finishPendingDraw(ctx);
    } else {
      ctx.openPreviewDrawer();
    }
    return;
  }

  if (key === 'escape') {
    if (ctx.state.pendingDraw.type) {
      ctx.state.pendingDraw = { type: '', points: [] };
      ctx.refreshWorkspacePreview();
      ctx.renderUi();
      return;
    }
    if (ctx.state.helpOpen) {
      ctx.closeHelpDrawer();
      return;
    }
    ctx.closePreviewDrawer();
    return;
  }

  if (key === 'delete' || key === 'backspace') {
    event.preventDefault();
    ctx.deleteSelectedFeature();
  }
}

export function bindCanvasHandlers(ctx) {
  ctx.handleCanvasPointerDown = (event) => handleCanvasPointerDown(ctx, event);
  ctx.handleCanvasPointerMove = (event) => handleCanvasPointerMove(ctx, event);
  ctx.handleCanvasPointerUp = (event) => handleCanvasPointerUp(ctx, event);
  ctx.handleWindowKeyDown = (event) => handleWindowKeyDown(ctx, event);
}

export function bindCanvasEvents(ctx) {
  if (ctx.state.canvasBound || !ctx.appCtx.renderer?.domElement) return;
  const canvas = ctx.appCtx.renderer.domElement;
  canvas.addEventListener('pointerdown', ctx.handleCanvasPointerDown);
  canvas.addEventListener('pointermove', ctx.handleCanvasPointerMove);
  window.addEventListener('pointerup', ctx.handleCanvasPointerUp);
  window.addEventListener('keydown', ctx.handleWindowKeyDown);
  ctx.state.canvasElement = canvas;
  ctx.state.canvasBound = true;
}

export function unbindCanvasEvents(ctx) {
  if (!ctx.state.canvasBound) return;
  const canvas = ctx.state.canvasElement || ctx.appCtx.renderer?.domElement;
  canvas?.removeEventListener('pointerdown', ctx.handleCanvasPointerDown);
  canvas?.removeEventListener('pointermove', ctx.handleCanvasPointerMove);
  window.removeEventListener('pointerup', ctx.handleCanvasPointerUp);
  window.removeEventListener('keydown', ctx.handleWindowKeyDown);
  ctx.state.canvasElement = null;
  ctx.state.canvasBound = false;
}
