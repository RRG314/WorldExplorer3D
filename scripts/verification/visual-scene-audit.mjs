// Read-only snapshot from the actual active scene. No private URLs, account
// state, mesh arrays or diagnostic dumps. Estimates are not measured GPU VRAM.
export async function captureVisualSceneAudit(page) {
 return page.evaluate(()=>{
  const ctx=globalThis.__sandboxTestContext,T=globalThis.THREE;
  const materials=new Set(),textures=new Set(),geometries=new Set(),types={},channels={};
  let meshes=0,visibleMeshes=0,instances=0;
  ctx.scene.traverse(o=>{
   if(!o.isMesh)return;meshes++;if(o.isInstancedMesh)instances+=o.count;
   let visible=true;for(let p=o;p;p=p.parent)if(!p.visible){visible=false;break;}if(visible)visibleMeshes++;
   if(o.geometry)geometries.add(o.geometry);
   for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)materials.add(m);
  });
  let estimatedTextureBytes=0,compressed=0,unloaded=0;
  for(const m of materials){types[m.type]=(types[m.type]||0)+1;for(const [key,value] of Object.entries(m))if(value?.isTexture){textures.add(value);channels[key]=(channels[key]||0)+1;}}
  for(const t of textures){
   if(t.isCompressedTexture){compressed++;estimatedTextureBytes+=(t.mipmaps||[]).reduce((sum,m)=>sum+(m.data?.byteLength||0),0);continue;}
   const width=Number(t.image?.width||t.image?.naturalWidth||0),height=Number(t.image?.height||t.image?.naturalHeight||0);
   if(!width||!height)unloaded++;estimatedTextureBytes+=width*height*4*(t.generateMipmaps===false?1:4/3);
  }
  const d=globalThis.getWorldExplorerRuntimeDiagnostics?.();
  return {evidence:'Loaded source Earth scene, one observation; not a performance certification',threeRevision:T.REVISION,quality:ctx.renderQualityLevel,
   render:d?.renderer||null,performance:d?.performance?.live||null,mappedBuildings:ctx.buildings?.length,mappedRoads:ctx.roads?.length,
   meshes,visibleMeshes,instancedInstances:instances,geometries:geometries.size,materials:materials.size,materialTypes:types,textureChannels:channels,
   textures:textures.size,compressedTextures:compressed,unloadedTextures:unloaded,estimatedDirectMaterialTextureBytes:Math.ceil(estimatedTextureBytes),
   estimateLimits:'RGBA8 mipmapped approximation; excludes custom shader uniforms, environment targets, render targets, GLB cached-only templates, decoder and browser overhead. Visibility means scene flags, not frustum or occlusion.',
   output:{encoding:ctx.renderer.outputEncoding,toneMapping:ctx.renderer.toneMapping,exposure:ctx.renderer.toneMappingExposure,physicallyCorrectLights:ctx.renderer.physicallyCorrectLights}};
 });
}
