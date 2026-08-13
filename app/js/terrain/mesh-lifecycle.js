import { ctx as appCtx } from '../shared-context.js?v=55';

function ensureTerrainGroup() {
  if (!appCtx.terrainGroup) {
    appCtx.terrainGroup = new THREE.Group();
    appCtx.terrainGroup.name = 'TerrainGroup';
    appCtx.addEarthWorldObject(appCtx.terrainGroup);
  }
}

function terrainTileMeshKey(z, tx, ty) {
  return `${z}/${tx}/${ty}`;
}

function getTerrainMeshKey(mesh) {
  const info = mesh?.userData?.terrainTile;
  if (!info) return '';
  return terrainTileMeshKey(info.z, info.tx, info.ty);
}

function disposeTerrainMesh(mesh) {
  if (!mesh) return;
  if (mesh.userData) mesh.userData.terrainDisposed = true;
  mesh?.userData?.worldCoverAbortController?.abort?.();
  const ownedTextures = new Set();
  const registerTexture = (texture) => {
    if (texture && typeof texture.dispose === 'function') ownedTextures.add(texture);
  };
  const registerTextureSet = (textureSet) => {
    if (!textureSet || typeof textureSet !== 'object') return;
    Object.values(textureSet).forEach(registerTexture);
  };
  registerTextureSet(mesh?.userData?.terrainTextureSet);
  Object.values(mesh?.userData?.terrainTextureSetsByMode || {}).forEach(registerTextureSet);
  ownedTextures.forEach((texture) => texture.dispose());
  if (mesh.userData) {
    mesh.userData.worldCoverResult = null;
    mesh.userData.terrainTextureSet = null;
    mesh.userData.terrainTextureSetsByMode = {};
  }
  mesh.geometry?.dispose?.();
  mesh.material?.dispose?.();
}

function clearTerrainMeshes() {
  appCtx.worldCoverBaseDetailMode = null;
  appCtx.worldCoverBaseDetailModeOwnerDistance = Infinity;
  appCtx.worldCoverDetailModeRefreshQueued = false;
  if (!appCtx.terrainGroup) return;
  while (appCtx.terrainGroup.children.length) {
    disposeTerrainMesh(appCtx.terrainGroup.children.pop());
  }
}

export {
  clearTerrainMeshes,
  disposeTerrainMesh,
  ensureTerrainGroup,
  getTerrainMeshKey,
  terrainTileMeshKey
};
