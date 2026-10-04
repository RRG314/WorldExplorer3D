// On-demand accounting, never a per-frame traversal or a GPU residency claim.
// Counts resources referenced by the selected scene, including hidden children.
function textureEstimate(texture) {
 if(texture.isCompressedTexture){
  const levels=texture.mipmaps||[];
  if(levels.length)return {bytes:levels.reduce((n,m)=>n+(m.data?.byteLength||0),0),known:true};
 }
 const images=Array.isArray(texture.image)?texture.image:[texture.image];let bytes=0,known=true;
 for(const image of images){
  if(Array.isArray(image?.mipmaps)&&image.mipmaps.length){bytes+=image.mipmaps.reduce((n,m)=>n+(m.data?.byteLength||0),0);continue;}
  let width=Number(image?.width||image?.naturalWidth||image?.videoWidth||0),height=Number(image?.height||image?.naturalHeight||image?.videoHeight||0),depth=Number(image?.depth||1);
  if(!(width>0&&height>0&&depth>0)){known=false;continue;}
  // RGB render/storage formats can be padded by a driver. Keep this a source
  // format estimate, with no implied measurement of actual GPU allocation.
  const channels=[1021,1024,1026,1028,1029].includes(texture.format)?1:[1025,1030,1031].includes(texture.format)?2:[1022,1032].includes(texture.format)?3:4;
  const componentBytes=texture.type===1015||texture.type===1014||texture.type===1013?4:texture.type===1016||texture.type===1012||texture.type===1011?2:1;
  const texelBytes=image?.data?.byteLength?image.data.byteLength/(width*height*depth):[1017,1018,1019].includes(texture.type)?2:texture.type===1020?4:channels*componentBytes;
  while(true){bytes+=width*height*depth*texelBytes;if(texture.generateMipmaps===false||(width===1&&height===1&&depth===1))break;width=Math.max(1,Math.floor(width/2));height=Math.max(1,Math.floor(height/2));depth=Math.max(1,Math.floor(depth/2));}
 }
 return {bytes:Math.ceil(bytes),known};
}
export function sceneResourceSnapshot({scene,renderer,colliders=null,animation=null}={}) {
 const geometries=new Set(),materials=new Set(),textures=new Set(),buffers=new Set(),skeletons=new Set();
 let objects=0,meshes=0,instances=0,geometrySourceBytes=0,textureSourceBytes=0,unknownTextures=0;
 const texture=value=>{
  if(value?.isTexture)textures.add(value);
  else if(Array.isArray(value))for(const item of value)if(item?.isTexture)textures.add(item);
 };
 scene?.traverse?.(object=>{
  objects++;if(object.isMesh)meshes++;if(object.isInstancedMesh)instances+=Number(object.count)||0;
  if(object.geometry)geometries.add(object.geometry);
  if(object.skeleton){skeletons.add(object.skeleton);texture(object.skeleton.boneTexture);}
  for(const material of Array.isArray(object.material)?object.material:[object.material]){
   if(!material||materials.has(material))continue;materials.add(material);
   for(const value of Object.values(material))texture(value);
   for(const uniform of Object.values(material.uniforms||{}))texture(uniform?.value);
  }
  texture(object.shadow?.map?.texture);texture(object.shadow?.mapPass?.texture);
  if(object.instanceMatrix?.array)buffers.add(object.instanceMatrix.array.buffer);
  if(object.instanceColor?.array)buffers.add(object.instanceColor.array.buffer);
 });
 texture(scene?.background);texture(scene?.environment);
 for(const geometry of geometries)for(const attribute of [...Object.values(geometry.attributes||{}),...Object.values(geometry.morphAttributes||{}).flat(),geometry.index].filter(Boolean)){
  const array=attribute.isInterleavedBufferAttribute?attribute.data.array:attribute.array;if(array?.buffer)buffers.add(array.buffer);
 }
 for(const buffer of buffers)geometrySourceBytes+=buffer.byteLength;
 for(const value of textures){const estimate=textureEstimate(value);textureSourceBytes+=estimate.bytes;if(!estimate.known)unknownTextures++;}
 return {schemaVersion:1,scope:'scene-referenced resources, including hidden children; excludes detached caches and compositor targets; texture bytes are source-format estimates, not GPU residency',
  objects,meshes,instances,geometries:geometries.size,materials:materials.size,textures:textures.size,skeletons:skeletons.size,
  geometrySourceBytes,textureSourceBytes,unknownTextures,drawCalls:Number(renderer?.info?.render?.calls)||0,triangles:Number(renderer?.info?.render?.triangles)||0,programs:renderer?.info?.programs?.length||0,
  colliders:colliders?{scope:'Earth registered building and structure records; excludes terrain, water, actor and interior analytic constraints',mappedBuildings:Number(colliders.mappedBuildings)||0,transportStructures:Number(colliders.transportStructures)||0,dynamic:Number(colliders.dynamic)||0}:null,animation};
}

let activeAnimationProbe=false;
export async function measureSceneAnimation(THREE,scene,{durationMs=2000,signal,now=()=>performance.now()}={}) {
 if(activeAnimationProbe)throw new Error('A scene animation probe is already running.');
 if(signal?.aborted)throw new DOMException('Animation probe cancelled.','AbortError');
 const prototype=THREE?.AnimationMixer?.prototype;
 if(!prototype?.update)throw new Error('Animation mixer is unavailable.');
 const original=prototype.update,seen=new WeakSet();let calls=0,mixers=0,totalMs=0,maxMs=0;
 const started=now();
 function update(...args){
  let root=this.getRoot?.(),belongs=false;
  for(let depth=0;root&&depth<256;depth++,root=root.parent)if(root===scene){belongs=true;break;}
  if(!belongs)return original.apply(this,args);
  if(!seen.has(this)){seen.add(this);mixers++;}
  const start=now();try{return original.apply(this,args);}finally{const elapsed=Math.max(0,now()-start);calls++;totalMs+=elapsed;maxMs=Math.max(maxMs,elapsed);}
 }
 activeAnimationProbe=true;prototype.update=update;
 try{
  await new Promise((resolve,reject)=>{
   const finish=()=>{signal?.removeEventListener('abort',abort);resolve();};
   const timer=setTimeout(finish,Math.max(50,Math.min(5000,Number(durationMs)||2000)));
   const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new DOMException('Animation probe cancelled.','AbortError'));};
   signal?.addEventListener('abort',abort,{once:true});
  });
  return {scope:'Explicit AnimationMixer instrumentation; excludes procedural motion and is not a normal frame-time receipt',elapsedMs:now()-started,mixers,calls,totalMs,maxMs};
 }finally{if(prototype.update===update)prototype.update=original;activeAnimationProbe=false;}
}
