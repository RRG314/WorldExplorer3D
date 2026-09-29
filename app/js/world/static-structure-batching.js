// Only for locally constructed static structures whose resources are owned by
// this root. Imported assets and animated/skinned meshes use their own owners.
export function batchOwnedStaticStructure(THREE, root) {
  root.updateMatrixWorld(true);
  const inverseRoot=new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups=new Map();
  root.traverse(mesh=>{
    if(!mesh.isMesh||mesh.isInstancedMesh||mesh.isSkinnedMesh||Array.isArray(mesh.material))return;
    const m=mesh.material,g=mesh.geometry;
    if(!g?.attributes?.position||g.morphAttributes?.position?.length||m.map||m.onBeforeCompile!==THREE.Material.prototype.onBeforeCompile)return;
    const key=[m.type,m.color?.getHex(),m.emissive?.getHex(),m.emissiveIntensity,m.roughness,m.metalness,m.opacity,m.transparent,m.side,mesh.castShadow,mesh.receiveShadow].join(':');
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(mesh);
  });
  for(const meshes of groups.values()) {
    if(meshes.length<2)continue;
    const copies=meshes.map(mesh=>{
      const copy=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
      return copy.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverseRoot,mesh.matrixWorld));
    });
    const geometry=new THREE.BufferGeometry();
    for(const name of ['position','normal','uv']) {
      if(!copies.every(g=>g.attributes[name]))continue;
      const size=copies[0].attributes[name].itemSize;
      const values=new Float32Array(copies.reduce((n,g)=>n+g.attributes[name].array.length,0));
      let offset=0;
      for(const g of copies){values.set(g.attributes[name].array,offset);offset+=g.attributes[name].array.length;}
      geometry.setAttribute(name,new THREE.BufferAttribute(values,size));
    }
    geometry.computeBoundingSphere();geometry.computeBoundingBox();
    const material=meshes[0].material;
    const batch=new THREE.Mesh(geometry,material);batch.name='static-structure-batch';
    batch.castShadow=meshes[0].castShadow;batch.receiveShadow=meshes[0].receiveShadow;
    const oldGeometry=new Set(),oldMaterials=new Set();
    for(const mesh of meshes){mesh.parent.remove(mesh);oldGeometry.add(mesh.geometry);if(mesh.material!==material)oldMaterials.add(mesh.material);}
    root.add(batch);
    const liveGeometry=new Set(),liveMaterials=new Set();
    root.traverse(o=>{if(o.geometry)liveGeometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)liveMaterials.add(m);});
    oldGeometry.forEach(g=>{if(!liveGeometry.has(g))g.dispose();});
    oldMaterials.forEach(m=>{if(!liveMaterials.has(m))m.dispose();});
    copies.forEach(g=>g.dispose());
  }
  return root;
}
