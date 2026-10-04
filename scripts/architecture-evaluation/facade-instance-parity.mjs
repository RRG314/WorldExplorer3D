import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import * as THREE from 'three';
import * as current from '../../app/js/world/building-exterior-details.js';
import {selectBuildingExteriorProfile} from '../../app/js/world/building-exterior-catalog.js';
globalThis.THREE=THREE;
const baseline=process.argv[2]||'955bab8b';assert.match(baseline,/^[a-f0-9]{8,40}$/);
const file='app/js/world/building-exterior-details.js';
const moduleUrl=new URL('../../'+file,import.meta.url);
const source=execFileSync('git',['show',`${baseline}:${file}`],{encoding:'utf8'}).replace(/from ['"](\.[^'"]+)['"]/g,(_,specifier)=>`from ${JSON.stringify(new URL(specifier,moduleUrl).href)}`);
const previous=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const types=['terrace','house','apartments','retail','office','warehouse','industrial','hospital'];
function world(tier){
 const scene=new THREE.Scene();
 const buildings=Array.from({length:600},(_,i)=>{
  const x=(i%25-12)*22,z=(Math.floor(i/25)-12)*22,width=6+i%13,depth=8+i%9,yaw=i*.17;
  const points=[[-width/2,-depth/2],[width/2,-depth/2],[width/2,depth/2],[-width/2,depth/2]].map(([a,b])=>({x:x+a*Math.cos(yaw)-b*Math.sin(yaw),z:z+a*Math.sin(yaw)+b*Math.cos(yaw)}));
  const type=types[i%types.length],id=`fixture:${i}`,height=8+i%60,levels=2+i%15;
  return {position:{y:i%5*.1},material:{userData:{buildingExterior:true}},userData:{lodTier:i%2?'mid':'near',sourceBuildingId:id,buildingFootprint:points,bodyHeightMeters:height,heightMeters:height,levels,buildingSeed:i,
   exteriorProfile:selectBuildingExteriorProfile({buildingIdentity:id,buildingSeed:i,buildingType:type,heightMeters:height,levels,footprintWidth:width,footprintDepth:depth,footprintArea:width*depth,denseUrban:true,location:{countryCode:'US',name:'Baltimore'},tags:{building:type},qualityTier:tier})}};
 });
 return {scene,buildingMeshes:buildings,_worldLoadSequence:1,buildingEntranceByBuilding:new Map(),addEarthWorldObject:object=>scene.add(object)};
}
const results=[];
for(const tier of ['low','performance','balanced','quality']){
 const old=world(tier),next=world(tier);
 const expected=previous.publishBuildingExteriorDetails(old,{tier}),actual=current.publishBuildingExteriorDetails(next,{tier});
 assert.deepEqual(actual,expected);
 let oldBytes=0,newBytes=0,maxPositionError=0,maxNormalError=0;const geometries=new Set();
 const matrix=new THREE.Matrix4(),normalMatrix=new THREE.Matrix3(),point=new THREE.Vector3(),normal=new THREE.Vector3();
 for(const original of old.scene.children){
  const mesh=next.scene.children.find(m=>m.name===original.name);assert.ok(mesh?.isInstancedMesh);
  assert.equal(mesh.material.color.getHex(),original.material.color.getHex());assert.equal(mesh.material.roughness,original.material.roughness);assert.equal(mesh.material.metalness,original.material.metalness);
  assert.equal(mesh.castShadow,original.castShadow);assert.equal(mesh.receiveShadow,original.receiveShadow);
  assert.equal(mesh.count*24,original.geometry.attributes.position.count);
  for(let i=0;i<mesh.count;i++){
   mesh.getMatrixAt(i,matrix);normalMatrix.getNormalMatrix(matrix);
   for(let vertex=0;vertex<24;vertex++){
    point.fromBufferAttribute(mesh.geometry.attributes.position,vertex).applyMatrix4(matrix);normal.fromBufferAttribute(mesh.geometry.attributes.normal,vertex).applyMatrix3(normalMatrix).normalize();
    const offset=i*24+vertex;
    for(const [k,axis] of ['x','y','z'].entries()){
     maxPositionError=Math.max(maxPositionError,Math.abs(point[axis]-original.geometry.attributes.position.array[offset*3+k]));
     maxNormalError=Math.max(maxNormalError,Math.abs(normal[axis]-original.geometry.attributes.normal.array[offset*3+k]));
    }
    assert.equal(mesh.geometry.attributes.uv.getX(vertex),original.geometry.attributes.uv.getX(offset));assert.equal(mesh.geometry.attributes.uv.getY(vertex),original.geometry.attributes.uv.getY(offset));
   }
  }
  oldBytes+=original.geometry.index.array.byteLength+Object.values(original.geometry.attributes).reduce((sum,a)=>sum+a.array.byteLength,0);
  newBytes+=mesh.instanceMatrix.array.byteLength;geometries.add(mesh.geometry);
 }
 for(const geometry of geometries)newBytes+=geometry.index.array.byteLength+Object.values(geometry.attributes).reduce((sum,a)=>sum+a.array.byteLength,0);
 assert.ok(maxPositionError<.0001);assert.ok(maxNormalError<.000001);
 if(actual.boxes)assert.ok(newBytes<oldBytes*.1);
 results.push({tier,buildings:actual.sourceBuildings,boxes:actual.boxes,triangles:actual.triangles,oldBytes,newBytes,maxPositionError,maxNormalError});
 previous.clearBuildingExteriorDetails(old);current.clearBuildingExteriorDetails(next);
}
const directory='output/verification/architecture-polish/facade-instancing-parity';await mkdir(directory,{recursive:true});
await writeFile(`${directory}/report.json`,JSON.stringify({ok:true,scope:'Actual previous/current facade builders on 600 deterministic fixture buildings, all four tiers; not whole-world frame acceptance',baseline,results},null,2));
console.log(JSON.stringify({ok:true,results}));
