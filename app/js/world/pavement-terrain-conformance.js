import { conformRoadTriangles } from '../terrain/road-surface-geometry.js?v=2';

// Refine locally where terrain bends inside the worker's regular cells. Both
// the surface and its curb use the same sampler and bounded error/depth policy.
export function conformPavementMesh(mesh, sampleBase, sampleTop, { tolerance = .03, maxDepth = 3 } = {}) {
  const vertices = mesh.vertices;
  const indices = Array.from({ length: vertices.length / 3 }, (_, i) => i);
  const originalTriangles = indices.length / 3;
  conformRoadTriangles(vertices, indices, sampleTop, 0, { tolerance, maxDepth, edgeRefinement:true });
  const top = [];
  for (const i of indices) top.push(vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2]);
  mesh.vertices = top;

  const curbs = [];
  const emit = (p, q, lowP, lowQ, depth) => {
    const x = (p[0] + q[0]) / 2, z = (p[2] + q[2]) / 2;
    const mid = [x, sampleTop(x, z), z], low = [x, sampleBase(x, z), z];
    if (depth < maxDepth && Math.max(Math.abs(mid[1] - (p[1] + q[1]) / 2),
      Math.abs(low[1] - (lowP[1] + lowQ[1]) / 2)) > tolerance) {
      emit(p, mid, lowP, low, depth + 1);
      emit(mid, q, low, lowQ, depth + 1);
    } else curbs.push(...p, ...lowP, ...lowQ, ...p, ...lowQ, ...q);
  };
  for (let i = 0; i < mesh.curbVertices.length; i += 18) {
    const v = mesh.curbVertices;
    emit(v.slice(i, i + 3), v.slice(i + 15, i + 18), v.slice(i + 3, i + 6), v.slice(i + 6, i + 9), 0);
  }
  mesh.curbVertices = curbs;
  return indices.length / 3 - originalTriangles;
}
