import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {publishReviewedVenueExteriors} from '../app/js/world/reviewed-venue-exteriors.js';
import {AQUARIUM_GEOGRAPHY} from '../app/js/interiors/aquarium-geography.js';
import {AQUARIUM_EXTERIOR_PARTS} from '../app/js/world/aquarium-exterior-survey.js';
import {disposeLandmarkModel} from '../app/js/world/landmark-lifetime.js';

test('mapped aquarium replacement transfers only its render owner and releases resources',()=>{
 const scene=new THREE.Scene(),shared=new THREE.MeshStandardMaterial();shared.userData.sharedRuntimeMaterial=true;
 const source=new THREE.Mesh(new THREE.BoxGeometry(),shared),neighbor=new THREE.Mesh(new THREE.BoxGeometry(),shared);
 source.userData={sourceBuildingId:AQUARIUM_GEOGRAPHY.sourceId,buildingFootprint:[{x:0,z:0},{x:10,z:0},{x:10,z:10}]};scene.add(source,neighbor);
 let retired=0;source.geometry.addEventListener('dispose',()=>retired++);
 const ctx={buildingMeshes:[source,neighbor],buildingEntranceCatalog:{entrances:[]},geoToWorld:(lat,lon)=>({x:(lon+76.6085)*77000,z:(39.2855-lat)*100000}),replaceWorldCollection(k,v){this[k]=v},addEarthWorldObject:o=>scene.add(o)};
 const result=publishReviewedVenueExteriors(ctx,THREE);
 assert.equal(result.published.length,1);assert.equal(retired,1);assert.equal(neighbor.parent,scene);assert.equal(source.parent,null);
 const root=ctx.buildingMeshes.find(m=>m.userData.reviewedVenueExterior),bounds=new THREE.Box3().setFromObject(root);
 assert.ok(bounds.max.y>=36);assert.ok(bounds.max.z-bounds.min.z>100);
 const meshes=[];root.traverse(o=>{if(o.isMesh){meshes.push(o);assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));}});
 assert.ok(meshes.length<=8,`Architectural detail is batched, got ${meshes.length} meshes`);
 // Cast at the mapped pavilion perimeter below the old 18 m concrete shell.
 // This catches coincident walls that a strict point-in-polygon filter misses.
 root.updateMatrixWorld(true);
 const glassRing=AQUARIUM_EXTERIOR_PARTS.find(p=>p.id==='1061954708').points.slice(0,-1).map(p=>ctx.geoToWorld(p.lat,p.lon));
 const center=glassRing.reduce((p,v)=>({x:p.x+v.x/glassRing.length,z:p.z+v.z/glassRing.length}),{x:0,z:0});
 const glassColor=new THREE.Color(0x427984).convertSRGBToLinear().getHex();
 for(let i=0;i<glassRing.length;i++){
  const a=glassRing[i],b=glassRing[(i+1)%glassRing.length],point=new THREE.Vector3(a.x*.63+b.x*.37,5,a.z*.63+b.z*.37);
  const outward=new THREE.Vector3(point.x-center.x,0,point.z-center.z).normalize();
  const hits=new THREE.Raycaster(point.clone().addScaledVector(outward,1),outward.negate(),0,1.1).intersectObject(root,true);
  assert.ok(hits.some(h=>h.object.material.color.getHex()===glassColor),'Pavilion glazing reaches the ground');
  assert.ok(hits.every(h=>h.object.material.roughness<.9),'No concrete face may cover the glazing at a shared mapped boundary');
 }
 let disposed=0;for(const mesh of meshes)mesh.geometry.addEventListener('dispose',()=>disposed++);
 disposeLandmarkModel(root);assert.equal(disposed,meshes.length);assert.equal(root.parent,null);
});
