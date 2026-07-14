export function createMemoryUiApi({ appCtx, constants, state, helpers }) {
  const { MEMORY_MAX_MESSAGE_LENGTH } = constants;
  const {
    getCurrentLocationLabel,
    updatePersistenceHint
  } = helpers;
  const {
    getMemoryPersistenceEnabled,
    getSelectedMemoryType,
    setSelectedMemoryEntryId,
    setSelectedMemoryType
  } = state;

  function getPlacementReferencePosition() {
    if (appCtx.droneMode && appCtx.drone) return { x: appCtx.drone.x, z: appCtx.drone.z };
    if (appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.mode === 'walk' && appCtx.Walk.state.walker) {
      return { x: appCtx.Walk.state.walker.x, z: appCtx.Walk.state.walker.z };
    }
    if (appCtx.car) return { x: appCtx.car.x, z: appCtx.car.z };
    return null;
  }

  function setComposerType(type) {
    setSelectedMemoryType(type === 'flower' ? 'flower' : 'pin');
    const pinBtn = document.getElementById('memoryTypePin');
    const flowerBtn = document.getElementById('memoryTypeFlower');
    if (pinBtn) pinBtn.classList.toggle('active', getSelectedMemoryType() === 'pin');
    if (flowerBtn) flowerBtn.classList.toggle('active', getSelectedMemoryType() === 'flower');
  }

  function setComposerStatus(text, isError) {
    const el = document.getElementById('memoryComposerStatus');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('error', !!isError);
  }

  function updateComposerCharCount() {
    const input = document.getElementById('memoryMessageInput');
    const count = document.getElementById('memoryCharCount');
    if (!input || !count) return;
    count.textContent = `${String(input.value || '').length}/${MEMORY_MAX_MESSAGE_LENGTH}`;
  }

  function openMemoryComposer(defaultType = 'pin') {
    if (!appCtx.gameStarted) return;
    const panel = document.getElementById('memoryComposer');
    const input = document.getElementById('memoryMessageInput');
    if (!panel || !input) return;
    panel.classList.add('show');
    setComposerType(defaultType);
    updatePersistenceHint();
    if (!getMemoryPersistenceEnabled()) {
      setComposerStatus('Persistent storage unavailable. Enable local storage for this site.', true);
    } else {
      setComposerStatus('Drop point: your current surface position.', false);
    }
    updateComposerCharCount();
    input.focus();
  }

  function closeMemoryComposer() {
    const panel = document.getElementById('memoryComposer');
    const input = document.getElementById('memoryMessageInput');
    if (panel) panel.classList.remove('show');
    if (input) input.value = '';
    updateComposerCharCount();
    setComposerStatus('', false);
  }

  function showMemoryInfo(entry) {
    const panel = document.getElementById('memoryInfoPanel');
    const title = document.getElementById('memoryInfoTitle');
    const text = document.getElementById('memoryInfoText');
    const meta = document.getElementById('memoryInfoMeta');
    if (!panel || !title || !text || !meta) return;

    setSelectedMemoryEntryId(entry.id);
    title.textContent = entry.type === 'flower' ? 'Flower Memory' : 'Pin Memory';
    text.textContent = entry.message;
    const date = new Date(entry.createdAt);
    const dateText = Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Unknown time';
    meta.textContent = `${getCurrentLocationLabel()} • ${dateText}`.replace(getCurrentLocationLabel(), entry.locationLabel);
    panel.classList.add('show');
  }

  function hideMemoryInfo() {
    const panel = document.getElementById('memoryInfoPanel');
    if (panel) panel.classList.remove('show');
    setSelectedMemoryEntryId(null);
  }

  return {
    closeMemoryComposer,
    getPlacementReferencePosition,
    hideMemoryInfo,
    openMemoryComposer,
    setComposerStatus,
    setComposerType,
    showMemoryInfo,
    updateComposerCharCount
  };
}
