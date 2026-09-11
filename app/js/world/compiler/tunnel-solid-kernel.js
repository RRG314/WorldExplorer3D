// Pure worker kernel. Inputs are indexed closed clearance sweeps, never
// the open visual strips. Manifold removes internal surfaces at their union.
export function compileTunnelSolid(kernel, input) {
  const { Manifold, Mesh } = kernel;
  const solids = [];
  let united;
  try {
    for (const rings of input.sweeps || []) {
      const count = rings[0].length, indices = [];
      for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < count; j++) {
        const a = i * count + j, b = i * count + (j + 1) % count;
        indices.push(a, b, a + count, b, b + count, a + count);
      }
      const end = (rings.length - 1) * count;
      for (let j = 1; j < count - 1; j++) {
        indices.push(0, j + 1, j, end, end + j, end + j + 1);
      }
      const solid = new Manifold(new Mesh({ numProp: 3,
        vertProperties: Float32Array.from(rings.flat(2)), triVerts: Uint32Array.from(indices) }));
      if (solid.status() !== 'NoError' || !(solid.volume() > 0)) { solid.delete(); throw new Error('Invalid closed tunnel sweep'); }
      solids.push(solid);
    }
    for (const points of input.pieces) {
      const solid = Manifold.hull(points);
      if (solid.status() !== 'NoError') { solid.delete(); throw new Error('Invalid tunnel sweep'); }
      if (solid.volume() > 1e-5) solids.push(solid);
      else solid.delete();
    }
    if (!solids.length) throw new Error('Empty tunnel clearance');
    united = Manifold.union(solids);
    if (united.status() !== 'NoError' || !(united.volume() > 0)) throw new Error('Tunnel union failed');
    const mesh = united.getMesh();
    const positions = Float32Array.from(mesh.vertProperties);
    const indices = Uint32Array.from(mesh.triVerts);
    if (!positions.every(Number.isFinite)) throw new Error('Nonfinite tunnel boundary');
    return { positions, indices, volume: united.volume(), triangles: indices.length / 3 };
  } finally {
    united?.delete();
    for (const solid of solids) solid.delete();
  }
}
