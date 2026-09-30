// Solid-colour character parts can share a draw without changing their triangles
// or skeleton. Textured, recolourable, independently animated and weapon parts
// keep their original graph and materials.
export function batchSkinnedModelTemplate(THREE, root, animations = []) {
  const animated = new Set();
  for (const clip of animations) for (const track of clip.tracks || []) {
    try { animated.add(THREE.PropertyBinding.parseTrackName(track.name).nodeName); }
    catch { return { sourceMeshes: 0, batches: 0, savedDrawCalls: 0 }; }
  }
  root.updateWorldMatrix(true, true);
  const groups = new Map();
  root.traverseVisible(mesh => {
    const geometry = mesh.geometry, material = mesh.material;
    if (!mesh.isSkinnedMesh || mesh.children.length || !mesh.skeleton ||
        Array.isArray(material) || !material?.isMeshStandardMaterial || material.isMeshPhysicalMaterial ||
        material.transparent || material.opacity !== 1 || material.vertexColors ||
        /SciFi_/i.test(material.name) || Object.values(material).some(v => v?.isTexture) ||
        !geometry?.attributes.position || Object.keys(geometry.morphAttributes).length ||
        geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return;
    for (let node = mesh; node && node !== root; node = node.parent) {
      if (animated.has(node.name) || animated.has(node.uuid) || /pistol|rifle|gun|weapon/i.test(node.name)) return;
    }
    const attributes = Object.keys(geometry.attributes).sort();
    if (attributes.some(k => !['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k) ||
        geometry.attributes[k].normalized)) return;
    const state = material.toJSON();
    delete state.metadata; delete state.uuid; delete state.name; delete state.color;
    const key = JSON.stringify([state, mesh.matrixWorld.elements, mesh.bindMatrix.elements,
      mesh.bindMatrixInverse.elements, mesh.bindMode, mesh.skeleton.bones.map(b => b.uuid),
      mesh.skeleton.boneInverses.map(m => m.elements), mesh.castShadow, mesh.receiveShadow,
      mesh.renderOrder, mesh.layers.mask, attributes.map(k => [k, geometry.attributes[k].itemSize, geometry.attributes[k].array.constructor.name])]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(mesh);
  });
  const retiredGeometry = new Set(), retiredMaterial = new Set();
  let sourceMeshes = 0, batches = 0;
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const first = meshes[0], vertices = meshes.reduce((n, m) => n + m.geometry.attributes.position.count, 0);
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(first.geometry.attributes)) {
      const values = new attribute.array.constructor(vertices * attribute.itemSize);
      let cursor = 0;
      for (const mesh of meshes) {
        const source = mesh.geometry.attributes[name];
        for (let i = 0; i < source.count; i++) {
          values[cursor++] = source.getX(i);
          if (source.itemSize > 1) values[cursor++] = source.getY(i);
          if (source.itemSize > 2) values[cursor++] = source.getZ(i);
          if (source.itemSize > 3) values[cursor++] = source.getW(i);
        }
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize));
    }
    const colors = new Float32Array(vertices * 3);
    const indices = new Uint32Array(meshes.reduce((n, m) => n + (m.geometry.index?.count ?? m.geometry.attributes.position.count), 0));
    let vertex = 0, cursor = 0;
    for (const mesh of meshes) {
      const count = mesh.geometry.attributes.position.count, color = mesh.material.color;
      for (let i = vertex; i < vertex + count; i++) { colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b; }
      const index = mesh.geometry.index, countIndices = index?.count ?? count;
      for (let i = 0; i < countIndices; i++) indices[cursor++] = vertex + (index ? index.getX(i) : i);
      vertex += count;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const material = first.material.clone(); material.color.setRGB(1, 1, 1); material.vertexColors = true;
    material.name = 'Character authored colours';
    const batch = new THREE.SkinnedMesh(geometry, material);
    batch.name = first.name; batch.position.copy(first.position); batch.quaternion.copy(first.quaternion); batch.scale.copy(first.scale);
    batch.matrix.copy(first.matrix); batch.matrixAutoUpdate = first.matrixAutoUpdate;
    batch.skeleton = first.skeleton; batch.bindMode = first.bindMode;
    batch.bindMatrix.copy(first.bindMatrix); batch.bindMatrixInverse.copy(first.bindMatrixInverse);
    batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
    batch.renderOrder = first.renderOrder; batch.layers.mask = first.layers.mask;
    batch.userData.skinnedModelBatch = true; batch.userData.sourceMeshCount = meshes.length;
    first.parent.add(batch);
    for (const mesh of meshes) { mesh.parent.remove(mesh); retiredGeometry.add(mesh.geometry); retiredMaterial.add(mesh.material); }
    sourceMeshes += meshes.length; batches++;
  }
  root.traverse(mesh => { retiredGeometry.delete(mesh.geometry); for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) retiredMaterial.delete(material); });
  retiredGeometry.forEach(g => g.dispose()); retiredMaterial.forEach(m => m.dispose());
  return { sourceMeshes, batches, savedDrawCalls: sourceMeshes - batches };
}
