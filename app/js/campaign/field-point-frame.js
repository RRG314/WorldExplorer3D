// Explicit point-frame operation over a bounded authored quadrat. This reads
// the actual posed meshes and their cutout alpha, never a preset cover score.
export function sampleFieldPointFrame({
  THREE: T,
  plants,
  soil,
  center,
  metersPerUnit = 1,
  sideMeters = 1.6,
  opacity
}) {
  if (!T || !soil || !plants || !Number.isFinite(metersPerUnit) || metersPerUnit <= 0)
    throw Error('The marked plot is not ready.');
  const roots = [soil, ...plants],
    bounds = new T.Box3();
  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    bounds.union(new T.Box3().setFromObject(root));
  }
  const visible = (object) => {
    for (let p = object; p; p = p.parent) if (!p.visible) return false;
    return true;
  };
  const vegetation = (object) => {
    for (let p = object; p; p = p.parent) if (plants.includes(p)) return true;
    return false;
  };
  const ray = new T.Raycaster(),
    points = [],
    top = bounds.max.y + 0.2 / metersPerUnit,
    far = Math.max(1, top - bounds.min.y + 1 / metersPerUnit);
  for (let index = 0; index < 16; index++) {
    const localX = (((index % 4) + 0.5) / 4 - 0.5) * sideMeters,
      localZ = ((Math.floor(index / 4) + 0.5) / 4 - 0.5) * sideMeters,
      x = center.x + localX / metersPerUnit,
      z = center.z + localZ / metersPerUnit;
    ray.set(new T.Vector3(x, top, z), new T.Vector3(0, -1, 0));
    ray.near = 0;
    ray.far = far;
    const hit = ray
      .intersectObjects(roots, true)
      .find((row) => visible(row.object) && !row.object.isSprite && opacity.accepts(row));
    if (!hit)
      throw Error(
        'A point missed the supported plot surface. Reopen the station before recording cover.'
      );
    const kind = vegetation(hit.object) ? 'vegetation' : 'soil';
    let sourceAssetId = null;
    for (let p = hit.object; p; p = p.parent)
      if (p.userData.modelAsset) {
        sourceAssetId = p.userData.modelAsset.id;
        break;
      }
    points.push({ index, kind, localX, localZ, hitY: hit.point.y, sourceAssetId });
  }
  const vegetationHits = points.filter((row) => row.kind === 'vegetation').length;
  return { points, vegetationHits, coverPercent: (vegetationHits / 16) * 100 };
}
