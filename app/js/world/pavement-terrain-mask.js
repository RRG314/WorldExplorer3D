import {pavementMaskLayout} from './compiler/pavement-mask.js';

export function createPavementTerrainMask(appCtx,keys){
  const limit=Math.min(4096,appCtx.renderer?.capabilities?.maxTextureSize||4096),layout=pavementMaskLayout(keys,limit);
  const bytes=new Uint8Array(layout.width*layout.height),addresses=new Uint8Array(layout.lookupWidth*layout.lookupHeight*4);
  const slots=new Map(keys.map((key,index)=>[key,index])),hooks=new Map();
  const texture=new THREE.DataTexture(bytes,layout.width,layout.height,appCtx.renderer?.capabilities?.isWebGL2===false?THREE.LuminanceFormat:THREE.RedFormat);
  texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.unpackAlignment=1;texture.generateMipmaps=false;texture.needsUpdate=true;
  const lookup=new THREE.DataTexture(addresses,layout.lookupWidth,layout.lookupHeight,THREE.RGBAFormat);
  lookup.minFilter=lookup.magFilter=THREE.NearestFilter;lookup.generateMipmaps=false;lookup.needsUpdate=true;
  // Three r128 copyTextureToTexture uses texSubImage2D for DataTexture input.
  // Updating one cell must not invalidate and re-upload the complete atlas.
  const cellUpload=new THREE.DataTexture(new Uint8Array(layout.resolution**2),layout.resolution,layout.resolution,texture.format);
  const addressUpload=new THREE.DataTexture(new Uint8Array(4),1,1,THREE.RGBAFormat);
  const uploadPosition=new THREE.Vector2();
  const uploadStats={cells:0,incrementalBytes:0,maxUploadMs:0};
  const uniforms={pavementMaskAtlas:{value:texture},pavementMaskLookup:{value:lookup},pavementMaskEnabled:{value:1},
    pavementMaskGrid:{value:new THREE.Vector4(layout.minX,layout.minZ,layout.lookupWidth,layout.lookupHeight)},
    pavementMaskLayout:{value:new THREE.Vector4(layout.columns,layout.resolution,layout.width,layout.height)},
    nearPavementBounds:{value:new THREE.Vector4(1,1,-1,-1)}};
  const prelude=`varying vec2 pavementWorldXZ;
  uniform sampler2D pavementMaskAtlas;
  uniform sampler2D pavementMaskLookup;
  uniform float pavementMaskEnabled;
  uniform vec4 pavementMaskGrid;
  uniform vec4 pavementMaskLayout;
  uniform vec4 nearPavementBounds;
  float pavementCoverage(){
    if(pavementMaskEnabled<0.5)return 0.0;
    if(all(greaterThanEqual(pavementWorldXZ,nearPavementBounds.xy))&&all(lessThanEqual(pavementWorldXZ,nearPavementBounds.zw)))return 0.0;
    vec2 cell=floor(pavementWorldXZ/64.0)-pavementMaskGrid.xy;
    if(any(lessThan(cell,vec2(0.0)))||any(greaterThanEqual(cell,pavementMaskGrid.zw)))return 0.0;
    vec4 address=texture2D(pavementMaskLookup,(cell+0.5)/pavementMaskGrid.zw);
    float slot=floor(address.r*255.0+0.5)+floor(address.g*255.0+0.5)*256.0-1.0;
    if(slot<0.0)return 0.0;
    vec2 tile=vec2(mod(slot,pavementMaskLayout.x),floor(slot/pavementMaskLayout.x));
    vec2 local=clamp(fract(pavementWorldXZ/64.0)*pavementMaskLayout.y,vec2(0.5),vec2(pavementMaskLayout.y-0.5));
    return texture2D(pavementMaskAtlas,(tile*pavementMaskLayout.y+local)/pavementMaskLayout.zw).r;
  }`;
  function restore(material,entry){
    if(material.onBeforeCompile===entry.compile)material.onBeforeCompile=entry.previousCompile;
    if(material.customProgramCacheKey===entry.key)material.customProgramCacheKey=entry.previousKey;
    material.needsUpdate=true;
  }
  function syncMaterials(){
    const materials=new Set();
    for(const mesh of appCtx.terrainGroup?.children||[])if(mesh.userData?.isTerrainMesh||mesh.userData?.isFixedLocationTerrainLod){for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(material)materials.add(material);}
    for(const mesh of appCtx.landuseMeshes||[])if(!['water','river','pond','reservoir','basin'].includes(mesh.userData?.landuseType))for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(material)materials.add(material);
    for(const [material,entry] of hooks)if(!materials.has(material)){restore(material,entry);hooks.delete(material);}
    for(const material of materials)if(!hooks.has(material)){
      const previousCompile=material.onBeforeCompile,previousKey=material.customProgramCacheKey;
      const compile=(shader,renderer)=>{
        previousCompile?.call(material,shader,renderer);Object.assign(shader.uniforms,uniforms);
        shader.vertexShader='varying vec2 pavementWorldXZ;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\npavementWorldXZ=(modelMatrix*vec4(transformed,1.0)).xz;');
        shader.fragmentShader=prelude+'\n'+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.5029,0.4851,0.4564),pavementCoverage());');
      };
      const key=()=>`${previousKey?.call(material)||''}:pavement-terrain-mask-v1`;
      hooks.set(material,{previousCompile,previousKey,compile,key});material.onBeforeCompile=compile;material.customProgramCacheKey=key;material.needsUpdate=true;
    }
    return materials.size;
  }
  return {layout,uploadStats,bytes:bytes.byteLength+addresses.byteLength,syncMaterials,
    setDetailBounds(b){uniforms.nearPavementBounds.value.set(...(b?[b.minX,b.minZ,b.maxX,b.maxZ]:[1,1,-1,-1]));},
    publish(key,mask){
      const slot=slots.get(key);if(slot===undefined||mask.length!==layout.resolution**2)throw new Error('Invalid pavement mask cell');
      const x=slot%layout.columns*layout.resolution,y=Math.floor(slot/layout.columns)*layout.resolution;
      for(let row=0;row<layout.resolution;row++)bytes.set(mask.subarray(row*layout.resolution,(row+1)*layout.resolution),(y+row)*layout.width+x);
      const [ix,iz]=key.split(':').map(Number),index=((iz-layout.minZ)*layout.lookupWidth+ix-layout.minX)*4;
      addresses[index]=(slot+1)%256;addresses[index+1]=Math.floor((slot+1)/256);
      const started=performance.now();
      cellUpload.image.data=mask;
      addressUpload.image.data.set(addresses.subarray(index,index+4));
      appCtx.renderer.copyTextureToTexture(uploadPosition.set(x,y),cellUpload,texture);
      appCtx.renderer.copyTextureToTexture(uploadPosition.set(ix-layout.minX,iz-layout.minZ),addressUpload,lookup);
      uploadStats.cells++;uploadStats.incrementalBytes+=mask.byteLength+4;
      uploadStats.maxUploadMs=Math.max(uploadStats.maxUploadMs,performance.now()-started);
      cellUpload.image.data=null;
    },
    dispose(){uniforms.pavementMaskEnabled.value=0;for(const [material,entry] of hooks)restore(material,entry);hooks.clear();texture.dispose();lookup.dispose();cellUpload.dispose();addressUpload.dispose();slots.clear();}
  };
}
