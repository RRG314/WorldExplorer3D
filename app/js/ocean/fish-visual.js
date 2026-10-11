import {loadModelAsset} from '../assets/model-asset-runtime.js?v=16';

// +Z is the swim direction. The source mesh is normalized to the same 1.76
// local length as the population presentation, then sized by the fish catalogue.
export async function loadFishVisual(THREE,assetId,{signal,load=loadModelAsset}={}){
 const asset=await load(THREE,assetId,{signal});
 const phase={value:0};
 try{
  asset.root.traverse(object=>{
   if(!object.isMesh)return;
   object.castShadow=false;object.receiveShadow=false;
   for(const material of [].concat(object.material||[])){
    const before=material.onBeforeCompile;
    material.onBeforeCompile=shader=>{
     before?.call(material,shader);
     shader.uniforms.weFishPhase=phase;
     shader.vertexShader=`uniform float weFishPhase;
      float weFishBend(float z){float w=clamp((0.30-z)/1.18,0.0,1.0);return 0.08*w*w*sin(weFishPhase+z*4.0);}
      ${shader.vertexShader}`
       .replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
        float weFishSlope=(weFishBend(position.z+0.001)-weFishBend(position.z-0.001))/0.002;
        objectNormal.z-=weFishSlope*objectNormal.x;
        #ifdef USE_TANGENT
          objectTangent.x+=weFishSlope*objectTangent.z;
        #endif`)
       .replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.x+=weFishBend(position.z);');
    };
    material.customProgramCacheKey=()=> 'we3d-fish-swim-v1';material.needsUpdate=true;
   }
  });
  return {root:asset.root,update(value){phase.value=value;},dispose:asset.dispose};
 }catch(error){asset.dispose();throw error;}
}
