import {makeReflector} from '../../vendor/three-water/Reflector.js';
import {makeRefractor} from '../../vendor/three-water/Refractor.js';
import {makeWater} from '../../vendor/three-water/Water.js';

// Captive habitat optics. These coefficients are an authored clear-water
// appearance, not a claim about measured aquarium chemistry or live conditions.
export const AQUARIUM_ABSORPTION = Object.freeze([.14,.045,.025]);
export function aquariumTransmittance(distanceMeters){
  return AQUARIUM_ABSORPTION.map(a=>Math.exp(-a*Math.max(0,distanceMeters)));
}
export function aquariumWaterPath(point,eye,habitat){
  const dx=eye.x-point.x,dy=eye.y-point.y,dz=eye.z-point.z,length=Math.hypot(dx,dy,dz);
  if(!length)return 0;
  let fraction=1;
  if(dy>1e-7)fraction=Math.min(fraction,Math.max(0,(habitat.surface-point.y)/dy));
  if(dy< -1e-7)fraction=Math.min(fraction,Math.max(0,(habitat.floor-point.y)/dy));
  for(let i=0;i<habitat.outline.length;i++){
    const a=habitat.outline[i],b=habitat.outline[(i+1)%habitat.outline.length],ex=b.x-a.x,ez=b.z-a.z,den=dx*ez-dz*ex;
    if(Math.abs(den)<1e-8)continue;
    const ax=a.x-point.x,az=a.z-point.z,t=(ax*ez-az*ex)/den,u=(ax*dz-az*dx)/den;
    if(t>1e-5&&u>=0&&u<=1)fraction=Math.min(fraction,t);
  }
  return Math.max(0,fraction*length);
}

function rippleNormal(T,phase){
  const size=128,data=new Uint8Array(size*size*4);
  const waves=Array.from({length:19},(_,i)=>({x:((i*7+3)%11)-5,y:((i*3+1)%9)-4,p:i*2.399+phase,a:.0035/(1+i*.15)}));
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size*Math.PI*2,v=y/size*Math.PI*2;
    let nx=0,ny=0;for(const w of waves){const c=Math.cos(u*w.x+v*w.y+w.p)*w.a;nx-=w.x*c;ny-=w.y*c;}
    const n=Math.hypot(nx,ny,1),i=(y*size+x)*4;
    data[i]=Math.round((nx/n*.5+.5)*255);data[i+1]=Math.round((ny/n*.5+.5)*255);data[i+2]=Math.round(255/n);data[i+3]=255;
  }
  const t=new T.DataTexture(data,size,size,T.RGBAFormat);t.wrapS=t.wrapT=T.RepeatWrapping;t.magFilter=T.LinearFilter;t.minFilter=T.LinearFilter;t.needsUpdate=true;return t;
}

function surfaceGeometry(T,shape,spacing){
  const source=new T.ShapeGeometry(shape),p=source.attributes.position,indices=source.index.array,queue=[],positions=[];
  for(let i=0;i<indices.length;i+=3)queue.push([0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,indices[i+j])));
  while(queue.length){
    const t=queue.pop(),lengths=t.map((p,i)=>p.distanceToSquared(t[(i+1)%3])),edge=lengths.indexOf(Math.max(...lengths));
    if(lengths[edge]>spacing*spacing){const a=t[edge],b=t[(edge+1)%3],c=t[(edge+2)%3],mid=a.clone().add(b).multiplyScalar(.5);queue.push([a,mid,c],[mid,b,c]);}
    else for(const v of t)positions.push(v.x,v.y,v.z);
    if(positions.length>108000)throw Error('Aquarium water surface exceeds its geometry budget.');
  }
  source.dispose();const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(positions.flatMap((v,i)=>i%3===2?[]:[v]),2));geometry.computeVertexNormals();return geometry;
}

export function createAquariumWater(T,root,plan,{targetSize=512,depthTexture=true}={}){
  const k=1/plan.metersPerUnit,habitat=plan.habitat,time={value:0},origin={value:root.position.clone()},points=habitat.outline.map(p=>new T.Vector2(p.x,p.z));
  const uniforms={weTankTime:time,weTankOrigin:origin,weTankSurface:{value:habitat.surface},weTankBottom:{value:habitat.floor},weTankMeters:{value:plan.metersPerUnit},weTankEdges:{value:points}};
  const shape=new T.Shape();habitat.outline.forEach((p,i)=>i?shape.lineTo(p.x,-p.z):shape.moveTo(p.x,-p.z));shape.closePath();
  const normal0=rippleNormal(T,0),normal1=rippleNormal(T,1.3),Water=makeWater({...T,Reflector:makeReflector(T),Refractor:makeRefractor(T)});
  const mesh=new Water(surfaceGeometry(T,shape,1.5*k),{textureWidth:targetSize,textureHeight:targetSize,depthTexture,renderBackground:false,color:0xf4fffc,normalMap0:normal0,normalMap1:normal1,flowDirection:new T.Vector2(.7,.3),flowSpeed:.013,reflectivity:.0204,scale:.35/k});
  mesh.material.uniforms.weTankTime=time;
  mesh.material.vertexShader=mesh.material.vertexShader.replace('#include <common>','#include <common>\nuniform float weTankTime;').replace('vUv = uv;',`vUv = uv; vec3 waterPosition=position; waterPosition.z += ${.005*k}*sin(position.x*1.3+position.y*.7+weTankTime*.8)+${.003*k}*sin(position.y*1.7-position.x*.4-weTankTime*.65);`).replaceAll('vec4( position, 1.0 )','vec4( waterPosition, 1.0 )');
  mesh.name='aquarium-water-reflection-refraction';mesh.rotation.x=-Math.PI/2;mesh.position.y=habitat.surface;mesh.material.depthWrite=false;
  root.add(mesh);
  const patches=[],clones=new Map();let disposed=false;
  const declarations=`
uniform float weTankTime; uniform vec3 weTankOrigin;
uniform float weTankSurface; uniform float weTankBottom; uniform float weTankMeters;
uniform vec2 weTankEdges[${points.length}]; varying vec3 vTankWorld; varying float vTankUp;
float tankCross(vec2 a,vec2 b){return a.x*b.y-a.y*b.x;}
float tankDistance(vec3 p,vec3 eye){
 vec3 delta=eye-p;float fraction=1.0;
 if(delta.y>0.000001)fraction=min(fraction,max(0.0,(weTankSurface-p.y)/delta.y));
 if(delta.y< -0.000001)fraction=min(fraction,max(0.0,(weTankBottom-p.y)/delta.y));
 for(int i=0;i<${points.length};i++){
  vec2 a=weTankEdges[i];vec2 b=weTankEdges[(i+1)%${points.length}];vec2 edge=b-a;float den=tankCross(delta.xz,edge);
  if(abs(den)>0.000001){float t=tankCross(a-p.xz,edge)/den;float u=tankCross(a-p.xz,delta.xz)/den;if(t>0.00001&&u>=0.0&&u<=1.0)fraction=min(fraction,t);}
 }
 return max(0.0,fraction*length(delta))*weTankMeters;
}
float tankCaustic(vec2 p){
 vec2 q=p*1.7+vec2(sin(p.y*.8+weTankTime*.4),cos(p.x*.65-weTankTime*.35))*.7;
 float bands=abs(sin(q.x+q.y*.65+weTankTime*.32)*sin(q.y-q.x*.48-weTankTime*.26));
 return pow(1.0-smoothstep(.0,.19,bands),3.0);
}`;
  // The reflected image contains the object-to-surface leg. Below the water
  // line, both reflection and refraction also traverse surface-to-window water.
  // Attenuate that second leg, stopping at the actual tank outline, not the eye
  // in the dry gallery. This prevents a bright, dry-looking mirror overhead.
  Object.assign(mesh.material.uniforms,uniforms);
  mesh.material.vertexShader=mesh.material.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWaterWorld;').replace('vToEye = cameraPosition - worldPosition.xyz;','vWaterWorld=worldPosition.xyz; vToEye = cameraPosition - worldPosition.xyz;');
  mesh.material.fragmentShader=mesh.material.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 vWaterWorld;\n${declarations.replace('varying vec3 vTankWorld; varying float vTankUp;','')}`).replace('#include <tonemapping_fragment>',`
if(waterSide<0.0){
 float secondLeg=tankDistance(vWaterWorld-weTankOrigin-vec3(0.0,0.0001,0.0),cameraPosition-weTankOrigin);
 vec3 transmittance=exp(-vec3(${AQUARIUM_ABSORPTION.join(',')})*secondLeg);
 gl_FragColor.rgb=gl_FragColor.rgb*transmittance+vec3(.012,.035,.048)*(1.0-transmittance);
}
#include <tonemapping_fragment>`);
  function patchMaterial(original){
    if(clones.has(original))return clones.get(original);
    const m=original.clone(),previous=original.onBeforeCompile;
    m.onBeforeCompile=(shader,renderer)=>{
      previous?.call(m,shader,renderer);Object.assign(shader.uniforms,uniforms);
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTankWorld; varying float vTankUp;').replace('#include <project_vertex>',`#include <project_vertex>
vec4 tankVertex=vec4(transformed,1.0);
#ifdef USE_INSTANCING
tankVertex=instanceMatrix*tankVertex;
#endif
vTankWorld=(modelMatrix*tankVertex).xyz;
vTankUp=max(0.0,inverseTransformDirection(transformedNormal,viewMatrix).y);`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\n${declarations}`).replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );',`
vec3 tankLocal=vTankWorld-weTankOrigin;
if(tankLocal.y<=weTankSurface){
 float waterLength=tankDistance(tankLocal,cameraPosition-weTankOrigin);
 vec3 transmission=exp(-vec3(${AQUARIUM_ABSORPTION.join(',')})*waterLength);
 float below=max(0.0,(weTankSurface-tankLocal.y)*weTankMeters);
 float caustic=tankCaustic(tankLocal.xz*weTankMeters+vec2(below*.15,below*.21))*exp(-below*.13)*vTankUp;
 outgoingLight*=1.0+caustic*.32;
 outgoingLight=outgoingLight*transmission+vec3(.012,.035,.048)*(vec3(1.0)-transmission);
}
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`);
    };
    m.customProgramCacheKey=()=>`aquarium-volume-v1:${points.length}:${original.customProgramCacheKey?.()||original.type}`;
    m.needsUpdate=true;clones.set(original,m);return m;
  }
  function apply(object){object.traverse(o=>{if(!o.isMesh||o===mesh||o.userData.aquariumOptics)return;const original=o.material;o.material=Array.isArray(original)?original.map(patchMaterial):patchMaterial(original);o.userData.aquariumOptics=true;patches.push({o,original});});}
  let lastPassTime=-1;const renderWater=mesh.onBeforeRender;
  mesh.onBeforeRender=(renderer,scene,camera)=>{
    // Only the existing main render invokes this; the two auxiliary passes
    // hide their surface and retain the active venue camera's layer mask.
    // SSAO/depth override passes must not replace these scene-color targets.
    if(disposed||scene.overrideMaterial)return;renderWater(renderer,scene,camera);lastPassTime=time.value;
  };
  return {mesh,apply,update(seconds){if(disposed)return;time.value=seconds;mesh.setSimulationTime(seconds);origin.value.copy(root.position);},
    snapshot(){return {kind:'contained-aquarium-water',time:time.value,lastPassTime,renderTargets:disposed?0:2,targetSize,materialCount:clones.size,volumeDepthMeters:(habitat.surface-habitat.floor)*plan.metersPerUnit};},
    dispose(){if(disposed)return;disposed=true;for(const {o,original} of patches){o.material=original;delete o.userData.aquariumOptics;}patches.length=0;clones.forEach(m=>m.dispose());clones.clear();normal0.dispose();normal1.dispose();mesh.dispose();mesh.geometry.dispose();mesh.parent?.remove(mesh);}
  };
}
