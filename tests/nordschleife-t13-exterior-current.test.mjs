import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {earthCoordinateFrame} from '../app/js/earth-core/coordinate-frame.js';
import {NORD_T13_FOOTPRINT,NORD_T13_SOURCE_ID} from '../app/js/world/nordschleife-t13-survey.js';
import {createNordschleifeT13Exterior,isT13StandRepresentation} from '../app/js/world/nordschleife-t13-exterior.js';
import {publishReviewedVenueExteriors} from '../app/js/world/reviewed-venue-exteriors.js';
import {disposeLandmarkModel} from '../app/js/world/landmark-lifetime.js';
const frame=earthCoordinateFrame({lat:50.359,lon:6.963},100000);
function context(){return {worldLoadRuntimeState:{venuePack:{id:'nurburgring-nordschleife'}},METERS_PER_WORLD_UNIT:1.11,geoToWorld:(lat,lon)=>frame.toWorld(lat,lon),elevationWorldYAtWorldXZ:()=>550,buildingMeshes:[]};}
test('mapped T13 terraces retain their geographic scale and bound estimated architecture and owned resources',()=>{
 const ctx=context(),data=createNordschleifeT13Exterior(T,ctx);assert.ok(data);
 const {root,footprint}=data,box=new T.Box3().setFromObject(root),meshes=[];
 assert.equal(root.userData.sourceBuildingId,NORD_T13_SOURCE_ID);assert.equal(root.userData.exteriorOnly,true);assert.equal(root.userData.architecture.interiorAdmission,false);
 assert.equal(root.userData.architecture.estimatedHeights,true);assert.equal(footprint.length,20);
 assert.ok(box.min.x>=Math.min(...footprint.map(p=>p.x))-.2&&box.max.x<=Math.max(...footprint.map(p=>p.x))+.2);
 assert.ok(box.min.z>=Math.min(...footprint.map(p=>p.z))-.2&&box.max.z<=Math.max(...footprint.map(p=>p.z))+.2);
 assert.ok(box.min.y>=549.99&&box.max.y<557);
 root.traverse(o=>{if(o.isMesh){meshes.push(o);assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));}});
 assert.ok(meshes.length<=4);assert.ok(meshes.reduce((sum,m)=>sum+m.geometry.attributes.position.count/3,0)<12000);
 let freed=0;for(const m of meshes)m.geometry.addEventListener('dispose',()=>freed++);disposeLandmarkModel(root);assert.equal(freed,meshes.length);
});
test('the existing building owner replaces only the unique stand footprint and its collider, retaining neighbours and entrance authority',()=>{
 const ctx=context(),scene=new T.Scene(),footprint=NORD_T13_FOOTPRINT.map(p=>ctx.geoToWorld(p.lat,p.lon)),
  stand=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial()),other=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial()),
  roof=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial());
 stand.userData={sourceBuildingId:'provider:stand',buildingFootprint:footprint};roof.userData={...stand.userData,isRoofDetail:true};
 other.userData={sourceBuildingId:'nearby-house',buildingFootprint:footprint.map(p=>({...p,x:p.x+50}))};scene.add(stand,roof,other);
 const oldCollider={sourceBuildingId:'provider:stand',pts:footprint},neighborCollider={sourceBuildingId:'nearby-house',pts:other.userData.buildingFootprint},entrances={entrances:[{id:'keep'}]};
 Object.assign(ctx,{buildingMeshes:[stand,roof,other],buildings:[oldCollider,neighborCollider],dynamicBuildingColliders:[],buildingEntranceCatalog:entrances,
  replaceWorldCollection(k,v){this[k]=v;},addEarthWorldObject:o=>scene.add(o)});
 const result=publishReviewedVenueExteriors(ctx,T);assert.deepEqual(result.published,['Nordschleife T13 — mapped grandstand']);
 assert.equal(stand.parent,null);assert.equal(roof.parent,null);assert.equal(other.parent,scene);
 assert.equal(oldCollider.collisionReplacedByVenue,true);assert.equal(neighborCollider.collisionReplacedByVenue,undefined);
 assert.equal(ctx.dynamicBuildingColliders.length,1);assert.equal(ctx.dynamicBuildingColliders[0].sourceBuildingId,NORD_T13_SOURCE_ID);
 assert.equal(ctx.buildingEntranceCatalog,entrances);assert.equal(ctx.buildingMeshes.length,2);
 assert.deepEqual(publishReviewedVenueExteriors(ctx,T).published,[],'the publication callback cannot duplicate the stand or its collision');
 disposeLandmarkModel(ctx.buildingMeshes.find(m=>m!==other));
});
test('unavailable ground, another location and nearby unrelated outlines cannot adopt this exterior',()=>{
 const ctx=context(),footprint=NORD_T13_FOOTPRINT.map(p=>ctx.geoToWorld(p.lat,p.lon));
 assert.equal(createNordschleifeT13Exterior(T,{...ctx,worldLoadRuntimeState:{venuePack:{id:'silverstone-grand-prix'}}}),null);
 assert.equal(createNordschleifeT13Exterior(T,{...ctx,elevationWorldYAtWorldXZ:()=>NaN}),null);
 assert.equal(isT13StandRepresentation({buildingName:'Tribüne 13',buildingFootprint:footprint.map(p=>({...p,z:p.z+25}))},footprint),false);
});
