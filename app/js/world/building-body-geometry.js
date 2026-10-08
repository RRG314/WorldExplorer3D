import { markPrivateBuildingGeometry } from './retired-building-buffers.js';

// Buildings use straight footprint edges, one vertical step and no bevels.
// Write that exact extrusion directly into its final attribute allocations.
// Unlike general-purpose ExtrudeGeometry this retains no Shape/Curve graph,
// bevel vectors, boxed vertex arrays or per-triangle UV objects per building.
// Triangle order and r128 UV/normal conventions intentionally remain unchanged.
export function createBuildingBodyGeometry(THREE, footprint, height) {
  if (!Array.isArray(footprint) || footprint.length < 3 || !Number.isFinite(height) || height <= 0) {
    throw new TypeError('A building body needs a finite footprint and positive height');
  }
  const contour = [];
  for (const p of footprint) {
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.z)) throw new TypeError('Non-finite building footprint');
    const last = contour.at(-1);
    if (!last || last.x !== p.x || last.y !== -p.z) contour.push(new THREE.Vector2(p.x, -p.z));
  }
  if (contour.length < 3) throw new TypeError('Degenerate building footprint');
  // LineCurve's first sample evaluates t=0 (including signed-zero arithmetic);
  // later endpoints are exact copies. Preserve even these attribute bytes.
  contour[0].x = (footprint[1].x - footprint[0].x) * 0 + footprint[0].x;
  contour[0].y = (-footprint[1].z + footprint[0].z) * 0 - footprint[0].z;
  if (!contour[0].equals(contour.at(-1))) contour.push(contour[0].clone());
  if (!THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  const lidVertices = triangles.length * 6;
  const vertexCount = lidVertices + contour.length * 6;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  let cursor = 0;
  function vertex(index, depth, u, v) {
    const point = contour[index], at = cursor * 3, uv = cursor * 2;
    positions[at] = point.x; positions[at + 1] = point.y; positions[at + 2] = depth;
    uvs[uv] = u; uvs[uv + 1] = v;
    cursor++;
  }
  for (const top of [false, true]) {
    for (const face of triangles) {
      for (let corner = 0; corner < 3; corner++) {
        const index = face[top ? corner : 2 - corner], p = contour[index];
        vertex(index, top ? height : 0, p.x, p.y);
      }
    }
  }
  for (let a = contour.length - 1; a >= 0; a--) {
    const b = a === 0 ? contour.length - 1 : a - 1;
    const horizontal = Math.abs(contour[a].y - contour[b].y) < .01;
    const au = horizontal ? contour[a].x : contour[a].y;
    const bu = horizontal ? contour[b].x : contour[b].y;
    vertex(a, 0, au, 1); vertex(b, 0, bu, 1); vertex(a, height, au, 1 - height);
    vertex(b, 0, bu, 1); vertex(b, height, bu, 1 - height); vertex(a, height, au, 1 - height);
  }
  const geometry = markPrivateBuildingGeometry(new THREE.BufferGeometry());
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.addGroup(0, lidVertices, 0);
  geometry.addGroup(lidVertices, vertexCount - lidVertices, 1);
  geometry.computeVertexNormals();
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}
