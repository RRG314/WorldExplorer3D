import {loadModelAsset} from '../assets/model-asset-runtime.js?v=16';
import {createMarineHabitatPlan,marineHabitatCollision} from './habitat-plan.js';
export function createMarineHabitat(THREE,{site,scale,sampleSeabedHeight,rockTextures={}}){
 const group=new THREE.Group();group.name='Marine regional habitat';
 const plan=createMarineHabitatPlan({site,scale,sampleSeabedHeight});
 group.userData.habitat={id:plan.id,truthType:plan.truthType,label:plan.label,assetState:plan.featured?'loading':'not-required',coralCount:plan.corals.length};
 let disposed=false,lodElapsed=0,lastX=Infinity,lastZ=Infinity;const assets=[],models=[],matrix=new THREE.Object3D();
 const palette=[0x9e7954,0xb58b60,0x797446,0x846689,0xab7464,0x587d74];
 const rockGeometry=new THREE.IcosahedronGeometry(1,2),rockMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.98,metalness:0,...rockTextures});
 // Extend submerged undersides into sloping terrain; upper ellipsoid remains
 // the placement/collision surface. Shared geometry keeps the draw count fixed.
 const rp=rockGeometry.attributes.position;for(let i=0;i<rp.count;i++)if(rp.getY(i)<0)rp.setY(i,rp.getY(i)*4);rockGeometry.computeVertexNormals();
 const rocks=new THREE.InstancedMesh(rockGeometry,rockMaterial,plan.rocks.length);rocks.frustumCulled=false;
 for(let i=0;i<plan.rocks.length;i++){const r=plan.rocks[i];matrix.position.set(r.x,r.y,r.z);matrix.rotation.set(0,0,0);matrix.scale.set(r.rx,r.ry,r.rz);matrix.updateMatrix();rocks.setMatrixAt(i,matrix.matrix);rocks.setColorAt(i,new THREE.Color([0x8d896e,0xa59d80,0x6b7865][r.tint]).convertSRGBToLinear());}
 rocks.instanceMatrix.needsUpdate=true;rocks.receiveShadow=true;rocks.castShadow=true;group.add(rocks);
 // Small seagrass ribbons, not temperate kelp cylinders, fringe authored reef patches.
 const blade=new THREE.PlaneGeometry(.12,1.1,1,5);const p=blade.attributes.position;
 for(let i=0;i<p.count;i++){const y=p.getY(i)+.55;p.setXYZ(i,p.getX(i)*(1-y*.65),y,Math.sin(y*1.7)*.22);}
 blade.computeVertexNormals();
 const grassMaterial=new THREE.MeshStandardMaterial({color:0x4a6341,roughness:.94,side:THREE.DoubleSide});
 const grass=new THREE.InstancedMesh(blade,grassMaterial,plan.grass.length*3);grass.frustumCulled=false;
 for(let i=0;i<plan.grass.length;i++)for(let j=0;j<3;j++){const g=plan.grass[i];matrix.position.set(g.x,g.y,g.z);matrix.rotation.set(0,g.yaw+j*2.1,0);matrix.scale.set(g.scale,g.scale,g.scale);matrix.updateMatrix();grass.setMatrixAt(i*3+j,matrix.matrix);}
 grass.instanceMatrix.needsUpdate=true;group.add(grass);
 let shader=null;grassMaterial.onBeforeCompile=s=>{shader=s;s.uniforms.habitatTime={value:0};s.vertexShader='uniform float habitatTime;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.x += sin(habitatTime * 0.65 + instanceMatrix[3].x * 0.06) * position.y * position.y * 0.12;');};grassMaterial.customProgramCacheKey=()=> 'marine-grass-v1';
 function fill(model,focus){
  let count=0;const entries=plan.corals.filter(c=>c.kind===model.kind);
  for(const c of entries){const near=Math.hypot(c.x-focus.x,c.z-focus.z)<65;if(near!==model.near)continue;matrix.position.set(c.x,c.y-(c.kind==='table-coral'?.55:.35)*c.scale,c.z);matrix.rotation.set(0,c.yaw,0);matrix.scale.setScalar(c.scale);matrix.updateMatrix();model.mesh.setMatrixAt(count,matrix.matrix);model.mesh.setColorAt(count,new THREE.Color(palette[c.tint]));count++;}
  model.mesh.count=count;model.mesh.instanceMatrix.needsUpdate=true;if(model.mesh.instanceColor)model.mesh.instanceColor.needsUpdate=true;
 }
 function update(dt,focus,time){if(shader)shader.uniforms.habitatTime.value=time;lodElapsed+=dt;if(lodElapsed<.25||Math.hypot(focus.x-lastX,focus.z-lastZ)<7)return;lodElapsed=0;lastX=focus.x;lastZ=focus.z;for(const model of models)fill(model,focus);}
 function releaseModels(){for(const model of models){group.remove(model.mesh);model.mesh.geometry.dispose();model.mesh.material.dispose();}models.length=0;for(const asset of assets)asset.dispose();assets.length=0;}
 const ready=(async()=>{
  if(!plan.featured)return true;
  try{for(const kind of ['table-coral','branch-coral','massive-coral'])for(const near of [false,true]){
   const asset=await loadModelAsset(THREE,`marine-${kind}${near?'':'-lod'}`);if(disposed){asset.dispose();return false;}assets.push(asset);asset.root.updateMatrixWorld(true);
   asset.root.traverse(object=>{if(!object.isMesh)return;
    const geometry=object.geometry.clone().applyMatrix4(object.matrixWorld),material=object.material.clone();material.color.setHex(0xffffff);material.roughness=.94;material.metalness=0;
    const mesh=new THREE.InstancedMesh(geometry,material,plan.corals.filter(c=>c.kind===kind).length);mesh.frustumCulled=false;mesh.castShadow=near;mesh.receiveShadow=true;mesh.name=`${kind} ${near?'near':'far'}`;group.add(mesh);
    const model={kind,near,mesh};models.push(model);fill(model,{x:Number.isFinite(lastX)?lastX:0,z:Number.isFinite(lastZ)?lastZ:62});
   });
   await new Promise(resolve=>requestAnimationFrame(resolve));if(disposed)return false;
  }group.userData.habitat.assetState='ready';return true;}catch{releaseModels();group.userData.habitat.assetState='unavailable';return false;}
 })();
 group.userData.disposeOceanHabitat=()=>{if(disposed)return;disposed=true;releaseModels();};
 return {group,plan,ready,update,collision:(point,radius)=>marineHabitatCollision(group.userData.habitat.assetState==='ready'?plan:{rocks:plan.rocks,corals:[]},point,radius)};
}
