const sharedTextureSets = new Map();

function cloneWithRepeat(source, repeats) {
  if (!source) return null;
  const texture = source.clone();
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeats, repeats);
  texture.needsUpdate = true;
  return texture;
}

export function retainTerrainTextureSet(mesh, key, source, repeats) {
  let record = sharedTextureSets.get(key);
  if (!record) {
    record = {
      refs: 0,
      textures: {
        map: cloneWithRepeat(source.map, repeats),
        normalMap: cloneWithRepeat(source.normalMap, repeats),
        roughnessMap: cloneWithRepeat(source.roughnessMap, repeats)
      }
    };
    sharedTextureSets.set(key, record);
  }
  record.refs += 1;
  if (!mesh.userData.terrainTextureSetCacheKeys) mesh.userData.terrainTextureSetCacheKeys = [];
  mesh.userData.terrainTextureSetCacheKeys.push(key);
  return record.textures;
}

export function releaseTerrainTextureSets(mesh) {
  const keys = Array.isArray(mesh?.userData?.terrainTextureSetCacheKeys) ?
    mesh.userData.terrainTextureSetCacheKeys : [];
  keys.forEach((key) => {
    const record = sharedTextureSets.get(key);
    if (!record) return;
    record.refs = Math.max(0, record.refs - 1);
    if (record.refs > 0) return;
    Object.values(record.textures || {}).forEach((texture) => texture?.dispose?.());
    sharedTextureSets.delete(key);
  });
  if (mesh?.userData) {
    mesh.userData.terrainTextureSetCacheKeys = [];
    mesh.userData.terrainTextureSet = null;
    mesh.userData.terrainTextureSetsByMode = {};
  }
}

export function terrainTextureCacheSnapshot() {
  let refs = 0;
  sharedTextureSets.forEach((record) => { refs += Number(record?.refs || 0); });
  return { entries: sharedTextureSets.size, refs };
}
