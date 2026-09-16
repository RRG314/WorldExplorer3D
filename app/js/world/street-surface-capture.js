// On-demand evidence only: capture the rendered surfaces together, in world
// coordinates. Matching a bad terrain surface is not a geometry quality pass.
export function captureStreetSurfaceGeometry(appCtx, focus, ground, radius = 32) {
  const origin = {x:focus.x,z:focus.z};
  const surfaces = [];
  const inside = points => Math.min(...points.map(p=>p.x)) <= origin.x+radius &&
    Math.max(...points.map(p=>p.x)) >= origin.x-radius &&
    Math.min(...points.map(p=>p.z)) <= origin.z+radius &&
    Math.max(...points.map(p=>p.z)) >= origin.z-radius;
  const collect = (meshes, family) => {
    for(const mesh of meshes || []) {
      if(mesh.userData?.isRoadSkirt || mesh.userData?.isRoadMarking) continue;
      const positions=mesh.geometry?.attributes?.position, index=mesh.geometry?.index;
      if(!positions)continue;
      mesh.updateWorldMatrix?.(true,false);
      const e=mesh.matrixWorld?.elements;
      const vertex = i => {
        const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
        const p=e ? {x:e[0]*x+e[4]*y+e[8]*z+e[12],y:e[1]*x+e[5]*y+e[9]*z+e[13],z:e[2]*x+e[6]*y+e[10]*z+e[14]} : {x,y,z};
        return p;
      };
      const triangles=[];
      for(let i=0;i<(index?.count ?? positions.count);i+=3){
        const points=[0,1,2].map(j=>vertex(index ? index.getX(i+j) : i+j));
        if(inside(points))triangles.push(points.map(p=>({...p,terrain:ground(p.x,p.z)})));
      }
      if(triangles.length)surfaces.push({family,kind:mesh.userData?.kind,terrainMode:mesh.userData?.terrainMode,triangles});
    }
  };
  collect(appCtx.roadMeshes,'road');
  collect(appCtx.streetPavement?.meshes,'pavement');
  const samples=[];
  for(let dx=-radius;dx<=radius;dx++)for(let dz=-radius;dz<=radius;dz++){
    const x=origin.x+dx,z=origin.z+dz,terrain=ground(x,z);
    samples.push({x,z,terrain,rawTerrain:appCtx.elevationWorldYAtWorldXZ?.(x,z),
      road:appCtx.roadContactIndex?.sampleAt(x,z,terrain),pavement:appCtx.streetPavement?.sampleAt(x,z)});
  }
  const roads=(appCtx.roads||[]).filter(r=>r.pts?.length && inside(r.pts)).map(r=>({
    name:r.name,type:r.type,metersPerWorldUnit:r.metersPerWorldUnit,pts:r.pts,width:r.width,tags:r.transportRecord?.sourceTags||r.tags,
    semantics:r.structureSemantics,crossSection:r.resolvedCrossSection,
    sourceFeatureId:r.sourceFeatureId,surfaceBias:r.surfaceBias,transportSurfaceModel:r.transportSurfaceModel
  }));
  return {schemaVersion:2,origin,radius,location:appCtx.LOC,groundMode:appCtx.worldLoadRuntimeState?.groundMode,
    groundProvenance:appCtx.worldLoadRuntimeState?.acceptedGround,surfaces,samples,roads};
}

// Preserve numeric-array types so a saved capture samples the same stations
// and widths as the live model, rather than falling back to another array.
export function serializeStreetSurfaceCapture(capture) {
  return JSON.stringify(capture,(_key,value)=>ArrayBuffer.isView(value)&&!(value instanceof DataView)
    ? {numericArray:value.constructor.name,values:Array.from(value)} : value);
}
export function parseStreetSurfaceCapture(text) {
  const types={Float32Array,Float64Array,Uint32Array,Uint16Array,Uint8Array,Int32Array,Int16Array,Int8Array};
  return JSON.parse(text,(_key,value)=>value?.numericArray&&types[value.numericArray]&&Array.isArray(value.values)
    ? types[value.numericArray].from(value.values) : value);
}
