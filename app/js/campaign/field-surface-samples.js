// Sparse blades/fronds may miss an evenly spaced photograph probe. These
// bounded deterministic samples come from real, opaque static triangle pixels.
export function sampleFieldSurfacePoints({
  THREE: T,
  root,
  opacity,
  maxPoints = 24,
  maxCandidates = 2048
}) {
  root.updateWorldMatrix(true, true);
  const meshes = [];
  root.traverseVisible((object) => {
    if (object.isMesh && !object.isSkinnedMesh && object.geometry?.attributes?.position)
      meshes.push(object);
  });
  if (!meshes.length) return [];
  const bounds = new T.Box3().setFromObject(root),
    minimumY = bounds.min.y + (bounds.max.y - bounds.min.y) * 0.15,
    points = [];
  for (let attempt = 1; attempt <= maxCandidates && points.length < maxPoints; attempt++) {
    const object = meshes[(attempt - 1) % meshes.length],
      geometry = object.geometry,
      position = geometry.attributes.position,
      uv = geometry.attributes.uv,
      index = geometry.index,
      triangles = Math.floor((index?.count || position.count) / 3);
    if (!triangles) continue;
    const triangle = Math.floor(((attempt * 0.7548776662466927) % 1) * triangles),
      offset = triangle * 3,
      ids = [0, 1, 2].map((i) => (index ? index.getX(offset + i) : offset + i)),
      r = Math.sqrt((attempt * 0.6180339887498948) % 1),
      s = (attempt * 0.4142135623730951) % 1,
      weights = [1 - r, r * (1 - s), r * s];
    const point = new T.Vector3(),
      coordinates = uv ? new T.Vector2() : undefined;
    for (let i = 0; i < 3; i++) {
      point.addScaledVector(new T.Vector3().fromBufferAttribute(position, ids[i]), weights[i]);
      if (uv)
        coordinates.addScaledVector(new T.Vector2().fromBufferAttribute(uv, ids[i]), weights[i]);
    }
    point.applyMatrix4(object.matrixWorld);
    if (point.y < minimumY) continue;
    const materialIndex =
      geometry.groups.find((group) => offset >= group.start && offset < group.start + group.count)
        ?.materialIndex || 0;
    if (opacity.accepts({ object, uv: coordinates, face: { materialIndex } })) points.push(point);
  }
  return points.sort((a, b) => b.y - a.y);
}
