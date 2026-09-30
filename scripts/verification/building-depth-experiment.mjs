// Diagnostic only: depth from immutable opaque building batches, using the same
// geometry, transform, visibility and side as their normal color pass.
export function installBuildingDepthExperiment(ctx) {
  const T=globalThis.THREE,renderer=ctx.renderer,world=ctx.scene;
  const depthScene=new T.Scene(),materials=new Map(),entries=[];
  depthScene.matrixAutoUpdate=false;
  for(const source of ctx.buildingMeshes || []){
    const m=source.material;
    if(!source.userData?.isBuildingBatch || !source.isMesh || source.isSkinnedMesh || source.isInstancedMesh || Array.isArray(m) ||
      m.transparent || m.opacity!==1 || m.alphaTest || m.displacementMap || !m.depthWrite || m.polygonOffset || m.clippingPlanes?.length)continue;
    let material=materials.get(m.side);
    if(!material){material=new T.MeshDepthMaterial({side:m.side});material.colorWrite=false;materials.set(m.side,material);}
    const mesh=new T.Mesh(source.geometry,material);mesh.matrixAutoUpdate=false;mesh.frustumCulled=source.frustumCulled;
    mesh.layers.mask=source.layers.mask;depthScene.add(mesh);entries.push({source,mesh});
  }
  const original=renderer.render;
  let enabled=true;
  renderer.render=function(scene,camera){
    if(scene!==world||!enabled)return original.call(this,scene,camera);
    world.updateMatrixWorld();
    for(const {source,mesh}of entries){
      let visible=true;for(let p=source;p;p=p.parent)if(!p.visible){visible=false;break;}
      mesh.visible=visible;mesh.matrix.copy(source.matrixWorld);mesh.matrixWorldNeedsUpdate=true;
    }
    const autoClear=this.autoClear,clearDepth=this.autoClearDepth,shadowEnabled=this.shadowMap.enabled;
    try{
      if(autoClear)this.clear(this.autoClearColor,clearDepth,this.autoClearStencil);
      this.autoClear=false;this.shadowMap.enabled=false;
      original.call(this,depthScene,camera);
      this.shadowMap.enabled=shadowEnabled;
      // A solid scene background may force a color clear even with autoClear
      // disabled. Keep that color behavior but preserve the prepared depth.
      this.autoClearDepth=false;
      return original.call(this,scene,camera);
    }finally{this.autoClear=autoClear;this.autoClearDepth=clearDepth;this.shadowMap.enabled=shadowEnabled;}
  };
  return {setEnabled(value){enabled=value;},count:entries.length,dispose(){renderer.render=original;for(const m of materials.values())m.dispose();depthScene.clear();}};
}
