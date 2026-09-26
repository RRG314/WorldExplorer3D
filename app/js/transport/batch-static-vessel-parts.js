// Vessel roots move as a unit. Bake only unannotated, opaque direct children;
// independently controlled lights, damage panels and smoke keep their objects.
export function batchStaticVesselParts(THREE, root) {
  const groups = new Map();
  for (const mesh of root.children) {
    if (!mesh.isMesh || mesh.children.length || !mesh.visible || Object.keys(mesh.userData).length ||
        Array.isArray(mesh.material) || mesh.material.transparent || !mesh.geometry?.attributes.position ||
        Object.keys(mesh.geometry.attributes).some(key => !['position','normal','uv'].includes(key)) ||
        mesh.geometry.drawRange.start !== 0 || mesh.geometry.drawRange.count !== Infinity) continue;
    let byState = groups.get(mesh.material);
    if (!byState) groups.set(mesh.material, byState = new Map());
    const state = `${mesh.castShadow}:${mesh.receiveShadow}:${mesh.renderOrder}:${mesh.layers.mask}`;
    if (!byState.has(state)) byState.set(state, []);
    byState.get(state).push(mesh);
  }
  const retired = new Set();
  let sourceMeshes = 0, batches = 0;
  for (const [material, byState] of groups) for (const meshes of byState.values()) {
    if (meshes.length < 2) continue;
    const positions = [], normals = [], uvs = [], indices = [];
    for (const mesh of meshes) {
      mesh.updateMatrix();
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix);
      const p = geometry.attributes.position, n = geometry.attributes.normal, uv = geometry.attributes.uv;
      const offset = positions.length / 3;
      for (let i = 0; i < p.count; i++) {
        positions.push(p.getX(i),p.getY(i),p.getZ(i));
        normals.push(n?.getX(i) ?? 0,n?.getY(i) ?? 1,n?.getZ(i) ?? 0);
        uvs.push(uv?.getX(i) ?? 0,uv?.getY(i) ?? 0);
      }
      const reversed = mesh.matrix.determinant() < 0;
      const index = geometry.index, count = index?.count ?? p.count;
      for (let i = 0; i < count; i += 3) {
        const a = index ? index.getX(i) : i, b = index ? index.getX(i+1) : i+1, c = index ? index.getX(i+2) : i+2;
        indices.push(offset+a,offset+(reversed?c:b),offset+(reversed?b:c));
      }
      geometry.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const merged = new THREE.Mesh(geometry, material), first = meshes[0];
    merged.castShadow=first.castShadow;merged.receiveShadow=first.receiveShadow;
    merged.renderOrder=first.renderOrder;merged.layers.mask=first.layers.mask;
    merged.userData.staticVesselBatch=true;merged.userData.sourceMeshCount=meshes.length;
    merged.matrixAutoUpdate=false;
    root.add(merged);
    for (const mesh of meshes) {root.remove(mesh);retired.add(mesh.geometry);}
    sourceMeshes+=meshes.length;batches++;
  }
  // Keep a shared geometry alive if an independently controlled part uses it.
  root.traverse(object=>retired.delete(object.geometry));
  for (const geometry of retired) geometry.dispose();
  return {sourceMeshes,batches,savedDrawCalls:sourceMeshes-batches};
}
