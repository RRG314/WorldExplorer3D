export function createActivityCreatorCanvasApi(context = {}) {
  const {
    appCtx,
    state,
    selectedAnchor,
    resolvePlacementCandidateFromPointer,
    setStatus,
    setAnchorSelection,
    placeAnchorFromCursor,
    updateAnchor,
    applyCandidateToAnchor,
    clamp,
    finiteNumber,
    revalidateAnchors,
    pushHistory,
    refreshScenePreview,
    renderUi,
    deleteSelectedAnchor,
    closeActivityCreator,
    startTestMode,
    stopTestMode,
    currentActivitySnapshot,
    applyHistorySnapshot,
    pickAnchorFromPointer,
    scheduleSceneRefresh
  } = context;

  function updateCursor(event) {
    if (!state.active || state.testing.active) return;
    const selected = selectedAnchor();
    const anchorTypeId = state.tool === 'place' ? state.anchorTypeId : selected?.typeId || state.anchorTypeId;
    const offset = state.tool === 'move' && selected ? finiteNumber(selected.heightOffset, 0) : finiteNumber(state.placementHeightOffset, 0);
    const candidate = resolvePlacementCandidateFromPointer(event, {
      templateId: state.templateId,
      anchorTypeId,
      heightOffset: offset,
      anchors: state.anchors,
      excludeAnchorId: selected?.id || '',
      snapEnabled: state.snapEnabled
    });
    state.cursor = candidate;
    scheduleSceneRefresh();
  }

  function handleCanvasPointerDown(event) {
    if (!state.active || state.testing.active || event.button !== 0) return;
    updateCursor(event);
    const hitAnchorId = pickAnchorFromPointer(event);
    if (state.tool === 'select') {
      setAnchorSelection(hitAnchorId);
      if (!hitAnchorId && state.cursor?.valid) setStatus('Nothing selected. Click an anchor to inspect or edit it.', 'info');
      return;
    }
    if (state.tool === 'place') {
      placeAnchorFromCursor();
      return;
    }
    const selected = hitAnchorId ? state.anchors.find((anchor) => anchor.id === hitAnchorId) || null : selectedAnchor();
    if (!selected) {
      setStatus('Select an anchor before using transform tools.', 'warning');
      return;
    }
    setAnchorSelection(selected.id);
    if (state.tool === 'move') {
      state.drag = { mode: 'move', anchorId: selected.id };
    } else if (state.tool === 'height') {
      state.drag = {
        mode: 'height',
        anchorId: selected.id,
        startClientY: event.clientY,
        startHeightOffset: finiteNumber(selected.heightOffset, 0)
      };
    } else if (state.tool === 'rotate') {
      state.drag = {
        mode: 'rotate',
        anchorId: selected.id,
        startClientX: event.clientX,
        startYaw: finiteNumber(selected.yaw, 0)
      };
    } else if (state.tool === 'scale') {
      state.drag = {
        mode: 'scale',
        anchorId: selected.id,
        startClientX: event.clientX,
        startRadius: finiteNumber(selected.radius, 18),
        startSizeX: finiteNumber(selected.sizeX, 12),
        startSizeY: finiteNumber(selected.sizeY, 6),
        startSizeZ: finiteNumber(selected.sizeZ, 12)
      };
    }
  }

  function handleCanvasPointerMove(event) {
    if (!state.active || state.testing.active) return;
    updateCursor(event);
    const selected = selectedAnchor();
    if (!state.drag || !selected) return;

    if (state.drag.mode === 'move' && state.cursor) {
      updateAnchor(state.drag.anchorId, (anchor) => {
        applyCandidateToAnchor(anchor, state.cursor, { keepHeightOffset: true });
      });
      return;
    }

    if (state.drag.mode === 'height') {
      const delta = (state.drag.startClientY - event.clientY) * 0.05;
      const nextOffset = clamp(state.drag.startHeightOffset + delta, -120, 320);
      updateAnchor(state.drag.anchorId, (anchor) => {
        anchor.heightOffset = nextOffset;
        anchor.y = anchor.baseY + nextOffset;
      });
      return;
    }

    if (state.drag.mode === 'rotate') {
      const delta = (event.clientX - state.drag.startClientX) * 0.01;
      updateAnchor(state.drag.anchorId, (anchor) => {
        anchor.yaw = state.drag.startYaw + delta;
      });
      return;
    }

    if (state.drag.mode === 'scale') {
      const delta = (event.clientX - state.drag.startClientX) * 0.05;
      updateAnchor(state.drag.anchorId, (anchor) => {
        if (anchor.typeId === 'fishing_zone') {
          anchor.radius = Math.max(4, state.drag.startRadius + delta);
        } else if (anchor.typeId === 'trigger_zone') {
          anchor.sizeX = Math.max(1.2, state.drag.startSizeX + delta);
          anchor.sizeZ = Math.max(1.2, state.drag.startSizeZ + delta);
          anchor.sizeY = Math.max(1, state.drag.startSizeY + delta * 0.3);
        }
      });
    }
  }

  function handleCanvasPointerUp() {
    if (!state.drag) return;
    state.drag = null;
    revalidateAnchors();
    pushHistory();
    refreshScenePreview();
    renderUi();
  }

  function handleWindowKeyDown(event) {
    if (!state.active) return;
    const target = event.target;
    const editingText = target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    if (editingText) return;

    const key = String(event.key || '').toLowerCase();
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && key === 'z') {
      event.preventDefault();
      const snapshot = state.history.undo(currentActivitySnapshot());
      if (snapshot) applyHistorySnapshot(snapshot);
      return;
    }
    if (((event.metaKey || event.ctrlKey) && event.shiftKey && key === 'z') || ((event.metaKey || event.ctrlKey) && key === 'y')) {
      event.preventDefault();
      const snapshot = state.history.redo(currentActivitySnapshot());
      if (snapshot) applyHistorySnapshot(snapshot);
      return;
    }
    if (key === 'escape') {
      if (state.testing.active) {
        stopTestMode();
        return;
      }
      closeActivityCreator();
      return;
    }
    if (key === 'delete' || key === 'backspace') {
      event.preventDefault();
      deleteSelectedAnchor();
      return;
    }
    if (key === '1') state.tool = 'select';
    else if (key === '2') state.tool = 'place';
    else if (key === '3') state.tool = 'move';
    else if (key === '4') state.tool = 'height';
    else if (key === '5') state.tool = 'rotate';
    else if (key === '6') state.tool = 'scale';
    else if (key === 'enter') {
      if (state.testing.active) stopTestMode();
      else startTestMode();
    } else {
      return;
    }
    event.preventDefault();
    renderUi();
    refreshScenePreview();
  }

  function bindCanvasEvents() {
    if (state.canvasBound || !appCtx.renderer?.domElement) return;
    const canvas = appCtx.renderer.domElement;
    canvas.addEventListener('pointerdown', handleCanvasPointerDown);
    canvas.addEventListener('pointermove', handleCanvasPointerMove);
    window.addEventListener('pointerup', handleCanvasPointerUp);
    window.addEventListener('keydown', handleWindowKeyDown);
    state.canvasElement = canvas;
    state.canvasBound = true;
  }

  function unbindCanvasEvents() {
    if (!state.canvasBound) return;
    const canvas = state.canvasElement || appCtx.renderer?.domElement;
    canvas?.removeEventListener('pointerdown', handleCanvasPointerDown);
    canvas?.removeEventListener('pointermove', handleCanvasPointerMove);
    window.removeEventListener('pointerup', handleCanvasPointerUp);
    window.removeEventListener('keydown', handleWindowKeyDown);
    state.canvasElement = null;
    state.canvasBound = false;
  }

  return {
    bindCanvasEvents,
    unbindCanvasEvents
  };
}
