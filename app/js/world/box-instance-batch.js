// Fixed-size chunks avoid per-box objects and grow/copy churn. Only transforms
// vary: every instance uses the exact same indexed unit box, normals and UVs.
export function createBoxInstanceBatch() {
  const chunks = [];
  const matricesPerChunk = 256;
  let count = 0;
  return {
    get count() { return count; },
    append(matrix) {
      const values = matrix.elements;
      for (let i = 0; i < 16; i++) if (!Number.isFinite(values[i])) return false;
      const chunkIndex = Math.floor(count / matricesPerChunk);
      const offset = (count % matricesPerChunk) * 16;
      const chunk = chunks[chunkIndex] || (chunks[chunkIndex] = new Float32Array(matricesPerChunk * 16));
      chunk.set(values, offset);
      count++;
      return true;
    },
    build(geometry, material) {
      if (!count) return null;
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      for (let i = 0, offset = 0; i < chunks.length; i++) {
        const length = Math.min(chunks[i].length, count * 16 - offset);
        mesh.instanceMatrix.array.set(chunks[i].subarray(0, length), offset);
        offset += length;
      }
      // r128 cannot frustum-test instance transforms. Keep its conservative
      // default; do not corrupt unit-box bounds used by instance raycasts.
      mesh.frustumCulled = false;
      return mesh;
    }
  };
}
