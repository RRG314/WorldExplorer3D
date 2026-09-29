// Landmark models own their geometry, materials and textures. Generic building
// batches use a different owner and must never be disposed through this path.
export function disposeLandmarkModel(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root?.traverse?.(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.isInstancedMesh) object.dispose?.();
    for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  root?.parent?.remove(root);
  geometries.forEach(value => value.dispose());
  materials.forEach(value => value.dispose());
  textures.forEach(value => value.dispose());
}

export function loadOwnedLandmarkModel(THREE, url, signal) {
  return new Promise((resolve, reject) => {
    let settled = false, request;
    const abort = () => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      request?.abort?.();
      reject(signal?.reason instanceof Error ? signal.reason : new DOMException('Landmark load cancelled', 'AbortError'));
    };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, {once:true});
    try {
      request = new THREE.GLTFLoader().load(url, gltf => {
        if (settled) { disposeLandmarkModel(gltf.scene); return; }
        settled = true;
        signal?.removeEventListener('abort', abort);
        resolve(gltf.scene);
      }, undefined, error => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', abort);
        reject(error);
      });
    } catch (error) {
      settled = true;
      signal?.removeEventListener('abort', abort);
      reject(error);
    }
  });
}

export function retireReplacedHistoricVisuals(ctx, landmark, world) {
  const retired = new Set();
  for (const mesh of ctx.historicMarkers || []) {
    const data = mesh?.userData;
    if (!data || data.curatedLandmarkId) continue;
    // Only the generic representation of this landmark is eligible. Nearby
    // walls, buildings and merged batches are not interchangeable landmarks.
    const matches = landmark.wikidata && data.wikidata === landmark.wikidata ||
      landmark.builder === 'measured-khufu-pyramid' && data.landmarkKind === 'pyramid';
    const footprint = data.footprint;
    if (!matches || !Array.isArray(footprint) || footprint.length < 3) continue;
    const center = footprint.reduce((p,v)=>({x:p.x+v.x/footprint.length,z:p.z+v.z/footprint.length}),{x:0,z:0});
    if (Math.hypot(center.x-world.x,center.z-world.z) > landmark.hideRadiusMeters) continue;
    disposeLandmarkModel(mesh);
    retired.add(mesh);
  }
  if (retired.size) ctx.historicMarkers = ctx.historicMarkers.filter(mesh => !retired.has(mesh));
  return retired.size;
}
