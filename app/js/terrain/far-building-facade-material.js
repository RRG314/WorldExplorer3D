import {MATERIAL_VARIANTS,WINDOW_STYLES} from '../world/building-exterior-catalog.js?v=1';
import {FACADE_OPENINGS_GLSL} from '../world/building-facade-layout.js?v=3';
import {facadeNightUniform} from '../world/facade-lighting.js';
import {FACADE_PRESENTATION,FACADE_PRESENTATION_GLSL} from '../world/facade-presentation.js';
import {REGIONAL_MATERIAL_IDS,REGIONAL_WINDOW_IDS} from './regional-building-appearance.js';
import {REGIONAL_SURFACE_IDS,sharedRegionalFacadeAtlas} from './regional-facade-atlas.js';
const gl=n=>Number(n).toFixed(5);
const lookup=(name,values)=>`vec4 ${name}(float id){\n${values.map((v,i)=>`if(id<${gl(i+.5)})return vec4(${v.map(gl).join(',')});`).join('\n')}return vec4(0.0);}`;
const materials=lookup('regionalMaterial',REGIONAL_MATERIAL_IDS.map(id=>{const m=MATERIAL_VARIANTS[id];return [REGIONAL_SURFACE_IDS.indexOf(m.texture),m.roughness,m.metalness,0];}));
const windows=lookup('regionalWindow',REGIONAL_WINDOW_IDS.map(id=>{const w=WINDOW_STYLES[id];return [w.bayWidth,w.floorHeight,w.width,w.height];}));

// The regional renderer retains packed batches, but shares the detailed world's
// floor/bay catalog, surface photographs, window interiors and night authority.
export function applyFarBuildingFacadeDetail(material,{unitsPerMeter=1}={}){
 if(!material||typeof material!=='object')return material;
 const atlas=sharedRegionalFacadeAtlas();
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{regionalSurfaces:{value:atlas.texture},regionalUnits:{value:unitsPerMeter},facadeNight:facadeNightUniform});
  shader.vertexShader=`attribute vec4 regionalStyle;
attribute vec4 regionalLayout;
uniform float regionalUnits;
varying vec4 vRegionalStyle;
varying vec4 vRegionalLayout;
varying float vRegionalWall;
${shader.vertexShader}`.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
vRegionalStyle=regionalStyle;
vRegionalWall=1.0-step(0.2,abs(objectNormal.y));
#ifdef USE_INSTANCING
 vec3 dimensions=regionalLayout.xyz/regionalUnits;
 float width=abs(objectNormal.x)>.5?dimensions.z:dimensions.x;
 float along=(abs(objectNormal.x)>.5?position.z+.5:position.x+.5)*width;
 vRegionalLayout=vec4(along,position.y*dimensions.y,width,dimensions.y*(1.0-regionalLayout.w));
#else
 vRegionalLayout=regionalLayout;
 vRegionalWall=step(.01,regionalLayout.z);
#endif`);
  shader.fragmentShader=`uniform sampler2D regionalSurfaces;
uniform float regionalUnits;
uniform float facadeNight;
varying vec4 vRegionalStyle;
varying vec4 vRegionalLayout;
varying float vRegionalWall;
${materials}\n${windows}\n${FACADE_OPENINGS_GLSL}\n${FACADE_PRESENTATION_GLSL}
${shader.fragmentShader}`.replace('#include <color_fragment>',`#include <color_fragment>
vec4 surfaceProfile=regionalMaterial(vRegionalStyle.x);
vec4 windowProfile=regionalWindow(vRegionalStyle.y);
float floors=max(0.0,floor((vRegionalLayout.w-.3)/max(2.4,windowProfile.y)+.5));
if(vRegionalStyle.y<0.0)floors=0.0;
float bays=max(1.0,floor(vRegionalLayout.z/windowProfile.x+.5));
vec4 wallLayout=vec4(vRegionalLayout.x/max(.01,vRegionalLayout.z)*bays,
 vRegionalLayout.y/max(2.0,(vRegionalLayout.w-.3)/max(1.0,floors)),vRegionalLayout.xy);
vec4 openingStyle=vec4(windowProfile.zw,floors+.05,vRegionalStyle.z);
float footprint=max(fwidth(wallLayout.x),fwidth(wallLayout.y));
float nearDetail=facadeDetailWeight(length(vViewPosition)/regionalUnits);
vec3 wall=diffuseColor.rgb;
if(vRegionalWall>.5&&nearDetail>.001){
 vec2 tile=vec2(mod(surfaceProfile.x,4.0),floor(surfaceProfile.x/4.0));
 vec2 uv=(tile+mix(vec2(.004),vec2(.996),fract(vRegionalLayout.xy*.25)))/4.0;
 vec3 grain=sRGBToLinear(texture2D(regionalSurfaces,uv)).rgb;
 wall=mix(wall,facadeWallSurface(wall,grain),nearDetail*(1.0-smoothstep(.2,.6,footprint)));
}
vec4 facadeSurface=vec4(wall,0.0);
float seed=facadeBuildingSeed(diffuseColor.rgb);
if(vRegionalWall>.5){
 if(nearDetail>.001&&footprint<.8){
  facadeSurface=facadeOpenings(wall,wallLayout,openingStyle,facadeViewRay(vViewPosition,vRegionalLayout.xy),seed);
  // One restrained entrance on each generated facade, below the windows.
  // Decoration only: these inferred doors do not advertise an enterable room.
  if(floors>0.0&&vRegionalLayout.z>2.5&&vRegionalLayout.y<2.65){
   vec2 p=vec2(vRegionalLayout.x-vRegionalLayout.z*.5,vRegionalLayout.y-1.2);
   float feather=max(.015,fwidth(vRegionalLayout.x));
   float frame=facadeBox(p,vec2(.64,1.23),feather);
   float door=facadeBox(p,vec2(.52,1.15),feather);
   facadeSurface.rgb=mix(facadeSurface.rgb,wall*.38,frame*nearDetail);
   facadeSurface.rgb=mix(facadeSurface.rgb,vec3(.042,.05,.052),door*nearDetail);
   facadeSurface.a*=1.0-frame;
  }
 }else if(floors>0.0){
  float coverage=clamp(windowProfile.z*windowProfile.w,0.0,.85);
  facadeSurface=vec4(mix(wall,vec3(.065,.092,.11),coverage),coverage);
 }
}else{
 float packed=vRegionalStyle.w;
 vec3 roof=vec3(floor(packed/65536.0),mod(floor(packed/256.0),256.0),mod(packed,256.0))/255.0;
 facadeSurface.rgb=sRGBToLinear(vec4(roof,1.0)).rgb;
}
diffuseColor.rgb=facadeSurface.rgb;`)
   .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
roughnessFactor=mix(surfaceProfile.y,${FACADE_PRESENTATION.glassRoughness},facadeSurface.a*vRegionalWall);`)
   .replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
metalnessFactor=mix(surfaceProfile.z,${FACADE_PRESENTATION.glassMetalness},facadeSurface.a*vRegionalWall);`)
   .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
totalEmissiveRadiance+=facadeRoomEmission(facadeSurface.rgb,wallLayout.xy,seed,vRegionalStyle.z,facadeNight)*facadeSurface.a*vRegionalWall;`);
 };
 material.customProgramCacheKey=()=> `regional-building-shared-facades-v2:${FACADE_PRESENTATION.version}`;
 Object.assign(material.userData,{facadePresentationVersion:FACADE_PRESENTATION.version,farBuildingFacadeDetail:'catalog-floor-bays-and-interiors',farBuildingFacadeOwner:'terrain/far-building-facade-material',farBuildingFacadeCoverage:'active-regional-window',farBuildingFacadeAtlas:'shared-licensed-surface-catalog',regionalSurfaceState:atlas.state});
 return material;
}
