import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {publishReviewedVenueExteriors} from '../app/js/world/reviewed-venue-exteriors.js';
import {AQUARIUM_GEOGRAPHY} from '../app/js/interiors/aquarium-geography.js';
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
 let disposed=0;for(const mesh of meshes)mesh.geometry.addEventListener('dispose',()=>disposed++);
 disposeLandmarkModel(root);assert.equal(disposed,meshes.length);assert.equal(root.parent,null);
});
