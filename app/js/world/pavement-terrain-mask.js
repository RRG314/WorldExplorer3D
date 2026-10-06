import {pavementMaskLayout} from './compiler/pavement-mask.js';

// Terrain road and pavement coverage share one compositional hook. Disposing
// the earlier layer must not leave its closure/textures captured by the later
// layer, nor restore a retired hook when the later layer is eventually removed.
const materialCoverageLayers = new WeakMap();
// r128 reuses a material's previously compiled program without calling
// onBeforeCompile again. Keep each material's uniform objects stable even when
// an entire coverage owner is retired and later reinstalled on that material.
const materialCoverageUniforms = new WeakMap();
function stableCoverageUniforms(material, values) {
  let uniforms = materialCoverageUniforms.get(material);
  if (!uniforms) { uniforms={};materialCoverageUniforms.set(material,uniforms); }
  for (const [name, uniform] of Object.entries(values)) {
    if (uniforms[name]) uniforms[name].value=uniform.value;
    else uniforms[name]={value:uniform.value};
  }
  return Object.fromEntries(Object.keys(values).map(name=>[name,uniforms[name]]));
}
function registerCoverageLayer(material, token, layer) {
  let entry = materialCoverageLayers.get(material);
  if (!entry) {
    const previousCompile = material.onBeforeCompile, previousKey = material.customProgramCacheKey;
    entry = { previousCompile, previousKey, layers: new Map() };
    entry.compile = (shader, renderer) => {
      previousCompile?.call(material, shader, renderer);
      for (const value of entry.layers.values()) value.apply(shader);
    };
    entry.key = () => `${previousKey?.call(material) || ''}:${[...entry.layers.values()].map(value => value.key).join(':')}`;
    material.onBeforeCompile = entry.compile; material.customProgramCacheKey = entry.key;
    materialCoverageLayers.set(material, entry);
  }
  entry.layers.set(token, layer); material.needsUpdate = true;
}
function unregisterCoverageLayer(material, token) {
  const entry = materialCoverageLayers.get(material);
  if (!entry || !entry.layers.delete(token)) return;
  if (!entry.layers.size) {
    if (material.onBeforeCompile === entry.compile) material.onBeforeCompile = entry.previousCompile;
    if (material.customProgramCacheKey === entry.key) material.customProgramCacheKey = entry.previousKey;
    materialCoverageLayers.delete(material);
  }
  material.needsUpdate = true;
}

export function createPavementMaterialBinding(appCtx,{kind="pavement",color=[0.5029,0.4851,0.4564]}={}) {
  const hooks=new Set(),uniforms={pavementColor:{value:new Float32Array(color)}},token={};
  const names=text=>kind==="road"?text.replaceAll("pavement","roadCoverage").replaceAll("Pavement","RoadCoverage"):text;
  const prelude=`varying vec2 pavementWorldXZ;
  uniform sampler2D pavementMaskAtlas;
  uniform sampler2D pavementMaskLookup;
  uniform float pavementMaskEnabled;
  uniform vec3 pavementColor;
  uniform float pavementCellSize;
  uniform vec4 pavementMaskGrid;
  uniform vec4 pavementMaskLayout;
  uniform vec4 nearPavementBounds;
  float pavementCoverage(){
    if(pavementMaskEnabled<0.5)return 0.0;
    if(all(greaterThanEqual(pavementWorldXZ,nearPavementBounds.xy))&&all(lessThanEqual(pavementWorldXZ,nearPavementBounds.zw)))return 0.0;
    vec2 cell=floor(pavementWorldXZ/pavementCellSize)-pavementMaskGrid.xy;
    if(any(lessThan(cell,vec2(0.0)))||any(greaterThanEqual(cell,pavementMaskGrid.zw)))return 0.0;
    vec4 address=texture2D(pavementMaskLookup,(cell+0.5)/pavementMaskGrid.zw);
    float slot=floor(address.r*255.0+0.5)+floor(address.g*255.0+0.5)*256.0-1.0;
    if(slot<0.0)return 0.0;
    vec2 tile=vec2(mod(slot,pavementMaskLayout.x),floor(slot/pavementMaskLayout.x));
    vec2 local=clamp(fract(pavementWorldXZ/pavementCellSize)*pavementMaskLayout.y,vec2(0.5),vec2(pavementMaskLayout.y-0.5));
    return texture2D(pavementMaskAtlas,(tile*pavementMaskLayout.y+local)/pavementMaskLayout.zw).r;
  }`;
  function syncMaterials(){
    const materials=new Set();
    for(const mesh of appCtx.terrainGroup?.children||[])if(mesh.userData?.isTerrainMesh||mesh.userData?.isFixedLocationTerrainLod){for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(material)materials.add(material);}
    for(const mesh of appCtx.landuseMeshes||[])if(!['water','river','pond','reservoir','basin'].includes(mesh.userData?.landuseType))for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(material)materials.add(material);
    for(const material of hooks)if(!materials.has(material)){unregisterCoverageLayer(material,token);hooks.delete(material);}
    for(const material of materials)if(!hooks.has(material)){
      const values=()=>Object.fromEntries(Object.entries(uniforms).map(([key,value])=>[names(key),value]));
      stableCoverageUniforms(material,values());
      const apply=shader=>{
        Object.assign(shader.uniforms,stableCoverageUniforms(material,values()));
        shader.vertexShader=names('varying vec2 pavementWorldXZ;\n')+shader.vertexShader.replace('#include <begin_vertex>',names('#include <begin_vertex>\npavementWorldXZ=(modelMatrix*vec4(transformed,1.0)).xz;'));
        shader.fragmentShader=names(prelude)+'\n'+shader.fragmentShader.replace('#include <color_fragment>',names(`#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,pavementColor,pavementCoverage());`));
      };
      registerCoverageLayer(material,token,{apply,key:`${kind}-terrain-mask-v2`});hooks.add(material);
    }
    return materials.size;
  }
  function detachMaterials(){
    for(const material of hooks){
      stableCoverageUniforms(material,{[names('pavementMaskEnabled')]:{value:0}});
      unregisterCoverageLayer(material,token);
    }
    hooks.clear();
  }
  return {syncMaterials,detachMaterials,
    setUniforms(next){for(const [key,uniform] of Object.entries(next)){
      if(uniforms[key])uniforms[key].value=uniform.value;else uniforms[key]={value:uniform.value};
      for(const material of hooks)stableCoverageUniforms(material,{[names(key)]:uniform});
    }},
    dispose(){
      if(uniforms.pavementMaskEnabled)uniforms.pavementMaskEnabled.value=0;
      for(const key of ['pavementMaskAtlas','pavementMaskLookup'])if(uniforms[key])uniforms[key].value=null;
      const values=Object.fromEntries(Object.entries(uniforms).map(([key,value])=>[names(key),value]));
      for(const material of hooks){stableCoverageUniforms(material,values);unregisterCoverageLayer(material,token);}hooks.clear();
    }
  };
}


export function createPavementTerrainMask(appCtx,keys,{kind="pavement",cellSize=64,color=[0.5029,0.4851,0.4564],deferUpload=false,materialBinding=null}={}){
  if(!["pavement","road"].includes(kind)||!Number.isFinite(cellSize)||cellSize<=0||color.length!==3||!color.every(Number.isFinite))throw new TypeError("Invalid terrain coverage layer");
  const limit=Math.min(4096,appCtx.renderer?.capabilities?.maxTextureSize||4096),layout=pavementMaskLayout(keys,limit);
  const bytes=new Uint8Array(layout.width*layout.height),addresses=new Uint8Array(layout.lookupWidth*layout.lookupHeight*4);
  const slots=new Map(keys.map((key,index)=>[key,index]));
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
  const uniforms={pavementMaskAtlas:{value:texture},pavementMaskLookup:{value:lookup},pavementMaskEnabled:{value:1},pavementCellSize:{value:cellSize},
    pavementMaskGrid:{value:new THREE.Vector4(layout.minX,layout.minZ,layout.lookupWidth,layout.lookupHeight)},
    pavementMaskLayout:{value:new THREE.Vector4(layout.columns,layout.resolution,layout.width,layout.height)},
    nearPavementBounds:{value:new THREE.Vector4(1,1,-1,-1)}};
  const ownsBinding=!materialBinding;
  const binding=materialBinding||createPavementMaterialBinding(appCtx,{kind,color});
  const activate=()=>binding.setUniforms(uniforms);
  if(ownsBinding)activate();
  return {layout,uploadStats,bytes:bytes.byteLength+addresses.byteLength,syncMaterials:binding.syncMaterials,detachMaterials:binding.detachMaterials,activate,
    setEnabled(enabled){uniforms.pavementMaskEnabled.value=enabled?1:0;binding.setUniforms({pavementMaskEnabled:uniforms.pavementMaskEnabled});},
    setDetailBounds(b){uniforms.nearPavementBounds.value.set(...(b?[b.minX,b.minZ,b.maxX,b.maxZ]:[1,1,-1,-1]));},
    publish(key,mask){
      const slot=slots.get(key);if(slot===undefined||mask.length!==layout.resolution**2)throw new Error('Invalid pavement mask cell');
      const x=slot%layout.columns*layout.resolution,y=Math.floor(slot/layout.columns)*layout.resolution;
      for(let row=0;row<layout.resolution;row++)bytes.set(mask.subarray(row*layout.resolution,(row+1)*layout.resolution),(y+row)*layout.width+x);
      const [ix,iz]=key.split(':').map(Number),index=((iz-layout.minZ)*layout.lookupWidth+ix-layout.minX)*4;
      addresses[index]=(slot+1)%256;addresses[index+1]=Math.floor((slot+1)/256);
      if(deferUpload){texture.needsUpdate=true;lookup.needsUpdate=true;return;}
      const started=performance.now();
      cellUpload.image.data=mask;
      addressUpload.image.data.set(addresses.subarray(index,index+4));
      appCtx.renderer.copyTextureToTexture(uploadPosition.set(x,y),cellUpload,texture);
      appCtx.renderer.copyTextureToTexture(uploadPosition.set(ix-layout.minX,iz-layout.minZ),addressUpload,lookup);
      uploadStats.cells++;uploadStats.incrementalBytes+=mask.byteLength+4;
      uploadStats.maxUploadMs=Math.max(uploadStats.maxUploadMs,performance.now()-started);
      cellUpload.image.data=null;
    },
    retire(key){
      if(!slots.has(key))return;
      const [ix,iz]=key.split(':').map(Number),index=((iz-layout.minZ)*layout.lookupWidth+ix-layout.minX)*4;
      addresses.fill(0,index,index+4);
      if(deferUpload){lookup.needsUpdate=true;return;}
      addressUpload.image.data.fill(0);
      appCtx.renderer.copyTextureToTexture(uploadPosition.set(ix-layout.minX,iz-layout.minZ),addressUpload,lookup);
    },
    finishBulkUpload(){deferUpload=false;},
    dispose(){if(ownsBinding)binding.dispose();texture.dispose();lookup.dispose();cellUpload.dispose();addressUpload.dispose();slots.clear();}
  };
}
