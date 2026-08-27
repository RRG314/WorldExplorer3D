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

  const undo = document.getElementById('blockBuilderUndo');
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
    setStatus(recoveryNotice || 'Choose a piece and color, or select a nearby mapped building to edit this virtual world.');
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
  document.getElementById('blockBuilderBack')?.addEventListener('click', async () => {
    closeBlockBuilder();
    await appCtx.openEditorSession?.({ initialTab: 'workspace', skipTutorial: true });
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
  document.getElementById('editableWorldSelectBuilding')?.addEventListener('click', () => {
    const selected = appCtx.selectNearestEditableBuilding?.(42);
    if (!selected) {
      if (selectionLabel) selectionLabel.textContent = 'No mapped building within 42 m. Move closer and try again.';
      return;
    }
    if (selectionLabel) selectionLabel.textContent = `${selected.label} · ${selected.distance.toFixed(1)} m · ${selected.sourceFeatureId}`;
    setStatus('Mapped building selected. Virtual removal only affects this saved world or room.');
  });
  document.getElementById('editableWorldSuppressBuilding')?.addEventListener('click', async () => {
    if (!globalThis.confirm('Virtually remove the selected mapped building from this saved world? The real map data is never changed.')) return;
    const result = await appCtx.suppressSelectedEditableBuilding?.();
    setStatus(result?.committed ? 'Saved. Rebuilding this fixed world from cached source data…' : `Could not remove building: ${result?.reason || 'select a nearby building first'}.`);
  });
  document.getElementById('editableWorldRestoreBuilding')?.addEventListener('click', async () => {
    const result = await appCtx.restoreSelectedEditableBuilding?.();
    setStatus(result?.committed ? 'Building restored. Rebuilding this fixed world…' : `Could not restore building: ${result?.reason || 'nothing selected'}.`);
  });
  document.getElementById('editableWorldReset')?.addEventListener('click', async () => {
    if (!globalThis.confirm('Restore the base world here? This clears virtual removals, custom structures, and your local blocks at this location.')) return;
    const result = await appCtx.resetLocalEditableWorld?.();
    setStatus(result?.committed ? 'Base world restored. Reloading this fixed location…' : `Could not reset world: ${result?.reason || 'unknown error'}.`);
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
