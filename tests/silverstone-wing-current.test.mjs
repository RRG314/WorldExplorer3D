import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createSilverstoneWingExterior,SILVERSTONE_WING_SOURCE_ID,isSilverstoneWing} from '../app/js/world/silverstone-wing-exterior.js';
import {publishReviewedVenueExteriors} from '../app/js/world/reviewed-venue-exteriors.js';
import {reviewedVenueForBuilding} from '../app/js/interiors/venue-exterior-policy.js';
import {disposeLandmarkModel} from '../app/js/world/landmark-lifetime.js';
const footprint=[{x:-160,z:-16},{x:160,z:-16},{x:164,z:4},{x:158,z:16},{x:-160,z:16}];
function source(id=SILVERSTONE_WING_SOURCE_ID){const m=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial());m.position.y=12;m.userData={sourceBuildingId:id,buildingFootprint:structuredClone(footprint),heightMeters:30.19,buildingName:'Silverstone Wing'};return m;}
test('Wing reconstruction stays inside mapped plan and height bounds, batches details and grants no interior permission',()=>{
 const old=source(),root=createSilverstoneWingExterior(T,old);assert.ok(root);assert.equal(isSilverstoneWing({buildingName:'Silverstone Wing'}),false);
 assert.equal(reviewedVenueForBuilding(old.userData),null);assert.equal(root.userData.exteriorOnly,true);assert.equal(root.userData.architecture.garageBays,41);
 const box=new T.Box3().setFromObject(root);assert.ok(box.min.y>=11.99);assert.ok(box.max.y<=12+30.19+.2);assert.ok(box.min.x>=-160.2&&box.max.x<=164.2);assert.ok(box.min.z>=-16.2&&box.max.z<=16.2);
 const meshes=[];root.traverse(o=>{if(o.isMesh){meshes.push(o);assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));}});
 assert.ok(meshes.length<=6);let released=0;for(const mesh of meshes)mesh.geometry.addEventListener('dispose',()=>released++);disposeLandmarkModel(root);assert.equal(released,meshes.length);
 const changed=source();changed.userData.buildingFootprint=[{x:0,z:0},{x:5,z:0},{x:5,z:5},{x:0,z:5}];assert.equal(createSilverstoneWingExterior(T,changed),null);
 assert.equal(createSilverstoneWingExterior(T,source('unrelated')),null);
});
test('publication replaces the matched visual only and preserves its closed building collider, other buildings and entrance catalogue',()=>{
 const scene=new T.Scene(),wing=source(),other=source('neighbor'),roof=source();roof.userData.isRoofDetail=true;scene.add(wing,other,roof);
 const buildings=[{sourceBuildingId:SILVERSTONE_WING_SOURCE_ID,pts:footprint,minY:12,maxY:42.19}],entrances={entrances:[{id:'existing'}]};
 const ctx={buildingMeshes:[wing,other,roof],buildings,buildingEntranceCatalog:entrances,replaceWorldCollection(k,v){this[k]=v;},addEarthWorldObject:o=>scene.add(o)};
 const result=publishReviewedVenueExteriors(ctx,T);assert.deepEqual(result.published,['Silverstone Wing — mapped pit complex']);assert.equal(wing.parent,null);assert.equal(roof.parent,null);assert.equal(other.parent,scene);assert.equal(ctx.buildingMeshes.length,2);
 assert.equal(ctx.buildings,buildings);assert.equal(ctx.buildingEntranceCatalog,entrances);assert.ok(!buildings[0].collisionReplacedByVenue);
 disposeLandmarkModel(ctx.buildingMeshes.find(m=>m!==other));
});
