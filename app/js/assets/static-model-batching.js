// Opt-in for static, opaque model templates only. Animated/interactive subparts
// retain their graph. Materials remain the same objects for paint/damage/lights.
export function batchStaticModelTemplate(THREE, root, animations = []) {
  if (animations.length) return {sourceMeshes:0,batches:0,savedDrawCalls:0};
  let animated=false;
  root.traverse(o=>{if(o.isSkinnedMesh || o.isBone || Object.keys(o.geometry?.morphAttributes || {}).length)animated=true;});
  if(animated) return {sourceMeshes:0,batches:0,savedDrawCalls:0};
  root.updateWorldMatrix(true,true);
  const inverse=root.matrixWorld.clone().invert(),groups=new Map(),retired=new Set();
  root.traverseVisible(mesh=>{
    const geometry=mesh.geometry,material=mesh.material;
    if(mesh===root || !mesh.isMesh || mesh.children.length || Array.isArray(material) || material.transparent ||
       !geometry?.attributes.position || geometry.drawRange.start!==0 || geometry.drawRange.count!==Infinity) return;
    const attributes=Object.keys(geometry.attributes).sort();
    if(attributes.some(k=>!['position','normal','uv'].includes(k) || geometry.attributes[k].normalized || geometry.attributes[k].itemSize!==(k==='uv'?2:3)))return;
    let states=groups.get(material);if(!states)groups.set(material,states=new Map());
    const key=`${attributes.join(',')}:${mesh.castShadow}:${mesh.receiveShadow}:${mesh.renderOrder}:${mesh.layers.mask}`;
    if(!states.has(key))states.set(key,[]);states.get(key).push(mesh);
  });
  let sourceMeshes=0,batches=0;
  for(const [material,states] of groups)for(const meshes of states.values()){
    if(meshes.length<2)continue;
    const first=meshes[0],attributes=Object.fromEntries(Object.keys(first.geometry.attributes).map(k=>[k,[]])),indices=[];
    for(const mesh of meshes){
      const transform=new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld);
      const geometry=mesh.geometry.clone().applyMatrix4(transform),offset=attributes.position.length/3;
      for(const [key,values] of Object.entries(attributes)){
        const attribute=geometry.attributes[key];
        for(let i=0;i<attribute.count;i++){
          values.push(attribute.getX(i),attribute.getY(i));
          if(attribute.itemSize===3)values.push(attribute.getZ(i));
        }
      }
      const index=geometry.index,count=index?.count ?? geometry.attributes.position.count,reverse=transform.determinant()<0;
      for(let i=0;i<count;i+=3){const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;indices.push(offset+a,offset+(reverse?c:b),offset+(reverse?b:c));}
      geometry.dispose();
    }
    const geometry=new THREE.BufferGeometry();
    for(const [key,values] of Object.entries(attributes))geometry.setAttribute(key,new THREE.Float32BufferAttribute(values,first.geometry.attributes[key].itemSize));
    geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const batch=new THREE.Mesh(geometry,material);batch.name=first.name;
    batch.castShadow=first.castShadow;batch.receiveShadow=first.receiveShadow;batch.renderOrder=first.renderOrder;batch.layers.mask=first.layers.mask;
    batch.userData.staticModelBatch=true;batch.userData.sourceMeshCount=meshes.length;
    batch.matrixAutoUpdate=false;
    root.add(batch);
    for(const mesh of meshes){mesh.parent.remove(mesh);retired.add(mesh.geometry);}
    sourceMeshes+=meshes.length;batches++;
  }
  // A geometry may also be referenced by an unbatched part. Shared survivors
  // remain alive; new batched geometry is owned by the cached template.
  const nodes=[];root.traverse(o=>{retired.delete(o.geometry);nodes.push(o);});
  for(const geometry of retired)geometry.dispose();
  for(const node of nodes.reverse())if(node!==root&&node.isGroup&&!node.children.length)node.parent?.remove(node);
  return {sourceMeshes,batches,savedDrawCalls:sourceMeshes-batches};
}
