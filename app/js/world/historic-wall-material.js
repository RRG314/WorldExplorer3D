// Poly Haven Stone Brick Wall 001, CC0, photographed by Dimitrios Savva.
// One shared texture/material per landmark publication; world-space sampling
// keeps its 2.5 m capture scale independent of the length of each wall segment.
export function createHistoricWallMaterial(THREE, sharedMap = null) {
  const map=sharedMap || new THREE.TextureLoader().load('/app/assets/textures/facades/polyhaven-stone-brick-wall-001-diff-1k.jpg');
  map.encoding=THREE.sRGBEncoding;
  map.wrapS=map.wrapT=THREE.RepeatWrapping;
  map.anisotropy=4;
  const material=new THREE.MeshStandardMaterial({color:0xffffff,map,roughness:.98,metalness:0});
  material.extensions={...material.extensions,derivatives:true};
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vHistoricPosition;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec4 historicPosition=vec4(position,1.0);
      #ifdef USE_INSTANCING
      historicPosition=instanceMatrix*historicPosition;
      #endif
      vHistoricPosition=(modelMatrix*historicPosition).xyz;`);
    shader.fragmentShader='varying vec3 vHistoricPosition;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      vec3 historicAxis=abs(normalize(cross(dFdx(vHistoricPosition),dFdy(vHistoricPosition))));
      historicAxis=pow(historicAxis,vec3(4.0));
      historicAxis/=max(dot(historicAxis,vec3(1.0)),.0001);
      vec3 historicPoint=vHistoricPosition/2.5;
      vec4 historicColor=mapTexelToLinear(texture2D(map,historicPoint.zy))*historicAxis.x;
      historicColor+=mapTexelToLinear(texture2D(map,historicPoint.xz))*historicAxis.y;
      historicColor+=mapTexelToLinear(texture2D(map,historicPoint.xy))*historicAxis.z;
      diffuseColor*=historicColor;`);
  };
  material.customProgramCacheKey=()=> 'historic-wall-metres-v1';
  return material;
}
