import { ctx as appCtx } from '../shared-context.js?v=55';
import { BLOCK_MATERIALS, BLOCK_SHAPES } from './catalog.js?v=2';

let panel = null;
let status = null;
let refreshButton = null;
let lastMapRefreshAt = 0;

function stopBuildPointer(event) {
  event.stopPropagation();
}

function setStatus(message) {
  if (status) status.textContent = String(message || '');
}

function deferTutorialPrompt() {
  const card = document.getElementById('tutorialHintCard');
  if (!card || card.hidden) return;
  const later = card.querySelector('.tutorial-icon-btn');
  if (later instanceof HTMLButtonElement) later.click();
  else card.hidden = true;
}

function syncBlockBuilderUi(snapshot = {}) {
  if (!panel) return;
  const enabled = snapshot.enabled === true;
  panel.classList.toggle('show', enabled);
  panel.setAttribute('aria-hidden', enabled ? 'false' : 'true');

  panel.querySelectorAll('[data-block-tool]').forEach((button) => {
    const active = button.dataset.blockTool === snapshot.tool;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  panel.querySelectorAll('[data-block-material]').forEach((button) => {
    const active = Number(button.dataset.blockMaterial) === Number(snapshot.materialIndex);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  panel.querySelectorAll('[data-block-shape]').forEach((button) => {
    const active = button.dataset.blockShape === snapshot.shape;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  const rotate = document.getElementById('blockBuilderRotate');
  if (rotate) rotate.title = `Rotate shape (${(Number(snapshot.rotation) || 0) * 90} degrees)`;

  const saved = document.getElementById('blockBuilderSaveState');
  const persistence = appCtx.getBuildPersistenceStatus?.() || {};
  if (saved) saved.textContent = snapshot.shared
    ? persistence.shared?.availableHere === false ? 'Room blocks are saved at its starting world. Return there to keep building.'
      : persistence.shared?.connected === false ? 'Room offline. Reconnect before saving more blocks.'
      : persistence.shared?.pendingCount > 0 ? 'Saving to room… Keep your connection until this finishes.'
        : 'Connected room · accepted blocks are saved to this room. Keep its code to return.'
    : persistence.enabled === false ? persistence.detail || 'Device storage is unavailable. Check the status below before leaving.'
      : 'Solo blocks save on this device at this location. Return here to keep building.';
  const blockRecovery = document.getElementById('blockBuilderRecovery');
  if (blockRecovery) blockRecovery.hidden = snapshot.shared === true || !['protected', 'conflict', 'error'].includes(persistence.notice);
  const undo = document.getElementById('blockBuilderUndo');
  const editState = appCtx.editableWorldRuntimeSnapshot?.();
  const edits = editState?.persistence;
  const buildingTools = panel.querySelector('.editableWorldBuildingTools');
  if (buildingTools) buildingTools.hidden = editState?.active === false;
  const reset = document.getElementById('editableWorldReset');
  if (reset) { reset.hidden = editState?.active === false; reset.disabled = editState?.canManage === false; }
  for (const id of ['editableWorldSuppressBuilding', 'editableWorldRestoreBuilding']) {
    const button = document.getElementById(id);
    if (button) { button.disabled = editState?.canManage === false; button.title = button.disabled ? 'Room owners and moderators manage mapped buildings.' : ''; }
  }
  const protectedEdits = snapshot.shared !== true && ['invalid-existing', 'backup-read-only', 'backup-protected'].includes(edits?.recovery);
  const recoveryNotice = document.getElementById('editableWorldSaveNotice');
  if (recoveryNotice) { recoveryNotice.hidden = !protectedEdits; recoveryNotice.textContent = protectedEdits ? 'Saved building edits need recovery. The original data is preserved and editing is paused. Download a recovery copy to keep it safe.' : ''; }
  const recoveryButton = document.getElementById('editableWorldRecovery');
  if (recoveryButton) recoveryButton.hidden = !protectedEdits;
  if (undo) undo.disabled = !snapshot.canUndo;
  const count = document.getElementById('blockBuilderCount');
  if (count) {
    const scope = snapshot.shared ? 'Room' : 'This location';
    count.textContent = `${scope}: ${Number(snapshot.count) || 0} / ${Number(snapshot.maxCount) || 0} blocks`;
  }
}

function openBlockBuilder() {
  if (!appCtx.gameStarted || typeof appCtx.toggleBlockBuildMode !== 'function') return false;
  deferTutorialPrompt();
  const enabled = appCtx.toggleBlockBuildMode(true);
  if (enabled) {
    const snapshot = appCtx.getBlockBuilderSnapshot?.() || {};
    const persistence = appCtx.getBuildPersistenceStatus?.() || {};
    const recoveryNotice = snapshot.shared !== true && persistence.notice && persistence.notice !== 'none'
      ? String(persistence.detail || '')
      : '';
    const guidance = snapshot.characterAssistance?.guidanceLabel || 'Basic placement guidance';
    setStatus(recoveryNotice || `${guidance}. Click or tap the world to place your selected piece.`);
  }
  return enabled;
}

function closeBlockBuilder() {
  if (typeof appCtx.toggleBlockBuildMode === 'function') appCtx.toggleBlockBuildMode(false);
}

async function refreshMapData() {
  if (typeof appCtx.refreshAuthoritativeMapData !== 'function') {
    setStatus('Map refresh is unavailable in this mode.');
    return;
  }
  const now = Date.now();
  if (now - lastMapRefreshAt < 2 * 60 * 1000) {
    setStatus('Map data was just refreshed. Try again in a couple of minutes.');
    return;
  }
  lastMapRefreshAt = now;
  refreshButton.disabled = true;
  setStatus('Refreshing current OSM map data...');
  try {
    await appCtx.refreshAuthoritativeMapData();
    setStatus('Base map refreshed. Loading current building details...');
    const deadline = Date.now() + 18000;
    while (Date.now() < deadline && (!Array.isArray(appCtx.buildings) || appCtx.buildings.length === 0)) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    setStatus(Array.isArray(appCtx.buildings) && appCtx.buildings.length > 0
      ? 'Current OSM map and building data refreshed.'
      : 'Base map refreshed. No mapped building details returned yet.');
  } catch (error) {
    lastMapRefreshAt = 0;
    setStatus(`Refresh failed: ${error?.message || error}`);
  } finally {
    refreshButton.disabled = false;
  }
}

function initBlockBuilderUi() {
  panel = document.getElementById('blockBuilderPanel');
  status = document.getElementById('blockBuilderStatus');
  refreshButton = document.getElementById('blockBuilderRefresh');
  if (!panel) return;

  panel.addEventListener('pointerdown', stopBuildPointer);
  panel.addEventListener('click', stopBuildPointer);
  document.getElementById('blockBuilderClose')?.addEventListener('click', closeBlockBuilder);
  document.getElementById('blockBuilderJournal')?.addEventListener('click', () => {
    closeBlockBuilder();
    const category = document.getElementById('discoveryJournalCategory');
    if (category) category.value = 'creation';
    const region = document.getElementById('discoveryJournalRegion');
    if (region) region.value = 'all';
    appCtx.openWorldDiscoverySection?.('journal');
  });
  panel.querySelectorAll('[data-block-tool]').forEach((button) => {
    button.addEventListener('click', () => appCtx.setBlockBuildTool?.(button.dataset.blockTool));
  });

  const shapes = document.getElementById('blockBuilderShapes');
  BLOCK_SHAPES.forEach((shape) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.blockShape = shape.id;
    button.textContent = shape.label;
    button.title = `${shape.label} shape`;
    button.setAttribute('aria-label', button.title);
    button.addEventListener('click', () => appCtx.setBlockBuildShape?.(shape.id));
    shapes?.appendChild(button);
  });

  const swatches = document.getElementById('blockBuilderSwatches');
  BLOCK_MATERIALS.forEach((material, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.blockMaterial = String(index);
    button.style.background = material.css;
    button.title = material.label;
    button.setAttribute('aria-label', button.title);
    button.addEventListener('click', () => appCtx.setBlockBuildMaterial?.(index));
    swatches?.appendChild(button);
  });
  document.getElementById('blockBuilderRotate')?.addEventListener('click', () => {
    const rotation = appCtx.rotateBlockBuildShape?.();
    setStatus(`Shape rotated ${(Number(rotation) || 0) * 90} degrees.`);
  });

  document.getElementById('blockBuilderUndo')?.addEventListener('click', () => {
    if (!appCtx.undoLastBuildAction?.()) setStatus('Nothing to undo.');
  });
  const selectionLabel = document.getElementById('editableWorldSelection');
  const editFailure = (result,fallback) => ({
    'world-limit':'This device has reached its saved-area limit. Existing creations are kept. You can still edit those areas.',
    'storage-conflict':'Another tab changed your saved world. Reload before editing; your existing creations are kept.',
    'storage-unavailable':'World editing could not save on this device. Existing records are kept.',
    'storage-write-failed':'This edit could not be saved. Free browser storage and try again; the previous world is unchanged.'
  }[result?.reason] || fallback);
  document.getElementById('editableWorldRecovery')?.addEventListener('click', () => {
    let url;
    try {
      const data = appCtx.exportLocalEditableWorld?.({ recovery: true });
      if (typeof data !== 'string') throw Error('Unavailable');
      url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'world-explorer-building-edits-recovery.json';
      document.body.append(link); link.click(); link.remove();
      setStatus('Recovery copy downloaded. Your saved building edits remain unchanged.');
    } catch { setStatus('The recovery copy could not be read. Keep this browser data and try again.'); }
    finally { if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); }
  });
  document.getElementById('blockBuilderRecovery')?.addEventListener('click', () => {
    let url;
    try {
      const data = appCtx.exportBuildRecovery?.();
      if (typeof data !== 'string') throw Error('Unavailable');
      url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'world-explorer-blocks-recovery.json';
      document.body.append(link); link.click(); link.remove();
      setStatus('Block recovery copy downloaded. Your original saves remain unchanged.');
    } catch { setStatus('The block recovery copy could not be read. Keep this browser data and try again.'); }
    finally { if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); }
  });
  document.getElementById('editableWorldSelectBuilding')?.addEventListener('click', () => {
    const radius = Number(appCtx.getConstructionAssistance?.().mappedSelectionRadiusMeters) || 42;
    const selected = appCtx.selectNearestEditableBuilding?.(radius);
    if (!selected) {
      if (selectionLabel) selectionLabel.textContent = `No mapped building within ${radius.toFixed(0)} m. Move closer and try again.`;
      return;
    }
    if (selectionLabel) selectionLabel.textContent = `${selected.label} · ${selected.distance.toFixed(1)} m · ${selected.sourceFeatureId}`;
    setStatus('Mapped building selected. Virtual removal only affects this saved world or room.');
  });
  document.getElementById('editableWorldSuppressBuilding')?.addEventListener('click', async () => {
    if (!globalThis.confirm('Virtually remove the selected mapped building from this saved world? The real map data is never changed.')) return;
    const result = await appCtx.suppressSelectedEditableBuilding?.();
    if (result?.previousWorld) { setStatus(result.committed ? 'Edit saved to your previous room.' : 'The edit in your previous room could not be saved.'); return; }
    setStatus(result?.committed ? 'Building removed from this saved world.' : editFailure(result,`Could not remove building: ${result?.reason || 'select a nearby building first'}.`));
  });
  document.getElementById('editableWorldRestoreBuilding')?.addEventListener('click', async () => {
    const result = await appCtx.restoreSelectedEditableBuilding?.();
    if (result?.previousWorld) { setStatus(result.committed ? 'Edit saved to your previous room.' : 'The edit in your previous room could not be saved.'); return; }
    setStatus(result?.committed ? 'Building restored.' : editFailure(result,`Could not restore building: ${result?.reason || 'nothing selected'}.`));
  });
  document.getElementById('editableWorldReset')?.addEventListener('click', async () => {
    if (!globalThis.confirm('Reset building edits here? This restores mapped buildings and removes custom structures. To remove blocks, use Clear.')) return;
    const result = await appCtx.resetLocalEditableWorld?.();
    if (result?.previousWorld) { setStatus(result.committed ? 'Building edits reset in your previous room.' : 'The reset in your previous room could not be saved.'); return; }
    setStatus(result?.committed ? 'Building edits reset.' : editFailure(result,`Could not reset building edits: ${result?.reason || 'unknown error'}.`));
    syncBlockBuilderUi(appCtx.getBlockBuilderSnapshot?.() || {});
  });
  document.getElementById('blockBuilderClear')?.addEventListener('click', () => {
    if (!globalThis.confirm('Clear your blocks at this location?')) return;
    const shared = appCtx.getBlockBuilderSnapshot?.()?.shared === true;
    const cleared = appCtx.clearAllBuildBlocks?.();
    if (cleared === false) {
      setStatus('Could not save that clear. Your blocks were kept.');
    } else {
      setStatus(shared ? 'Removing your saved room blocks…' : 'Blocks cleared for this location.');
    }
    syncBlockBuilderUi(appCtx.getBlockBuilderSnapshot?.() || {});
  });
  refreshButton?.addEventListener('click', refreshMapData);

  appCtx.syncBlockBuilderUi = syncBlockBuilderUi;
  appCtx.showBlockBuilderStatus = setStatus;
  appCtx.openBlockBuilder = openBlockBuilder;
  appCtx.closeBlockBuilder = closeBlockBuilder;
  syncBlockBuilderUi(appCtx.getBlockBuilderSnapshot?.() || {});
}

initBlockBuilderUi();

export { closeBlockBuilder, initBlockBuilderUi, openBlockBuilder, syncBlockBuilderUi };
