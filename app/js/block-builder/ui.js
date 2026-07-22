import { ctx as appCtx } from '../shared-context.js?v=55';
import { BLOCK_MATERIALS, BLOCK_SHAPES } from './catalog.js?v=4';

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

function syncBlockBuilderUi(snapshot = {}) {
  if (!panel) return;
  const enabled = snapshot.enabled === true;
  panel.classList.toggle('show', enabled);
  panel.setAttribute('aria-hidden', enabled ? 'false' : 'true');
  const menuItem = document.getElementById('fEditorMode');
  if (menuItem) {
    menuItem.classList.toggle('on', enabled);
    menuItem.textContent = enabled ? '🧱 Build with Blocks: ON' : '🧱 Build with Blocks';
  }

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
  const enabled = appCtx.toggleBlockBuildMode(true);
  if (enabled) setStatus('Choose a shape and color, then place it in the world.');
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
  document.getElementById('blockBuilderClear')?.addEventListener('click', () => {
    if (!globalThis.confirm('Clear your blocks at this location?')) return;
    appCtx.clearAllBuildBlocks?.();
    setStatus('Blocks cleared for this location.');
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
