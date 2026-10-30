import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {DAYTONA_PADDOCK_BUILDINGS} from '../app/js/world/daytona-paddock-survey.js';
import {createDaytonaPaddockExteriors,daytonaPaddockPlans,isDaytonaPaddockRepresentation,reserveDaytonaPaddockRepresentations} from '../app/js/world/daytona-paddock-exterior.js';
import {disposeLandmarkModel} from '../app/js/world/landmark-lifetime.js';
import {publishReviewedVenueExteriors} from '../app/js/world/reviewed-venue-exteriors.js';
function fixture(unit=1){let reads=0;return {METERS_PER_WORLD_UNIT:unit,worldLoadRuntimeState:{venuePack:{id:'daytona-tri-oval'}},buildingMeshes:[],geoToWorld:(lat,lon)=>({x:(lon+81.071)*97000/unit,z:-(lat-29.185)*111100/unit}),elevationWorldYAtWorldXZ:(x,z)=>(reads++,10/unit+x*.001),reads:()=>reads};}
function inside(p,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)hit=!hit;}return hit;}
test('mapped garage reservation distinguishes neighbouring sources and waits for post-transport support',()=>{
 const c=fixture(),plans=daytonaPaddockPlans(c),p=plans[0],near={userData:{sourceBuildingId:'other',buildingFootprint:p.footprint.map(q=>({x:q.x+25,z:q.z+25}))}},body={userData:{sourceBuildingId:'tile:garage',buildingFootprint:p.footprint}},adjunct={userData:{sourceBuildingId:'tile:garage',isRoofDetail:true}};
 c.buildingMeshes.push(near,body,adjunct);reserveDaytonaPaddockRepresentations(c);assert.equal(c.reads(),0);assert.equal(near.userData.deferredReviewedExterior,undefined);assert.equal(body.userData.deferredReviewedExterior,'daytona-paddock:'+p.sourceBuildingId);assert.equal(adjunct.userData.deferredReviewedExterior,body.userData.deferredReviewedExterior);
 assert.equal(isDaytonaPaddockRepresentation(near.userData,p),false);assert.equal(isDaytonaPaddockRepresentation(body.userData,p),true);
 c.worldLoadRuntimeState.venuePack={id:'ordinary-city'};assert.deepEqual(createDaytonaPaddockExteriors(T,c),[]);
});
test('three mapped garages retain indented roof plans, metre-scale detail, bounded LODs and exactly owned resources',()=>{
 for(const unit of [1,1.11]){
  const c=fixture(unit),exteriors=createDaytonaPaddockExteriors(T,c);assert.equal(exteriors.length,9);assert.equal(exteriors.filter(e=>e.root.userData.paddockGarage).length,3);assert.ok(c.reads()>100);
  for(const [i,e]of exteriors.entries()){
   const {root,footprint}=e,source=DAYTONA_PADDOCK_BUILDINGS[i],lod=root.children[0];assert.equal(root.userData.sourceBuildingId,source.sourceBuildingId);assert.equal(root.userData.exteriorOnly,true);assert.equal(lod.levels.length,3);assert.equal(lod.levels[2].object.children.length,0);if(source.kind==='garage')assert.ok(root.userData.architecture.closedServiceBays>15);else assert.equal(root.userData.architecture.garages,0);
   assert.ok(Math.abs((e.top-root.position.y)*unit-source.ridgeMeters-.35)<1e-9);assert.ok(lod.levels[0].object.children.length<=7);assert.ok(lod.levels[1].object.children.length<=3);
   for(const level of lod.levels.slice(0,2)){
    const roof=level.object.children.find(m=>m.material?.color?.getHex()===lod.levels[0].object.children.find(m=>m.material?.metalness===.45&&m.material?.roughness===.55)?.material.color.getHex());assert.ok(roof);
    const p=roof.geometry.attributes.position;for(let j=0;j<p.count;j+=3){const center={x:root.position.x+(p.getX(j)+p.getX(j+1)+p.getX(j+2))/3,z:root.position.z+(p.getZ(j)+p.getZ(j+1)+p.getZ(j+2))/3};assert.ok(inside(center,footprint),'roof triangles must not bridge an indented service/access gap');}
   }
   const resources=new Set();root.traverse(m=>{if(m.geometry)resources.add(m.geometry);if(m.material)resources.add(m.material);});let disposed=0;for(const r of resources)r.addEventListener('dispose',()=>disposed++);disposeLandmarkModel(root);assert.equal(disposed,resources.size);
  }
  c.buildingMeshes.push(...exteriors.map(e=>e.root));assert.deepEqual(createDaytonaPaddockExteriors(T,c),[]);
 }
});
test('unknown or excessive ground variation keeps the existing representation',()=>{
 const c=fixture();c.elevationWorldYAtWorldXZ=()=>NaN;assert.deepEqual(createDaytonaPaddockExteriors(T,c),[]);c.elevationWorldYAtWorldXZ=x=>x;assert.deepEqual(createDaytonaPaddockExteriors(T,c),[]);
});
test('the existing publication owner retires only the matching bodies and adjuncts, transfers collision once and rejects stale publication',()=>{
 const c=fixture(),plans=daytonaPaddockPlans(c),scene=new T.Scene();c._worldLoadSequence=7;c.deferredTransportLandmarkPublishers=[];c.dynamicBuildingColliders=[];c.buildings=plans.map(p=>({sourceBuildingId:p.sourceBuildingId,pts:p.footprint}));c.replaceWorldCollection=(key,value)=>{c[key]=value;};c.addEarthWorldObject=root=>scene.add(root);
 const retired=[];for(const p of plans){const m=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial());m.userData={sourceBuildingId:p.sourceBuildingId,buildingFootprint:p.footprint};scene.add(m);c.buildingMeshes.push(m);retired.push(m);}
 const roof=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial());roof.userData={sourceBuildingId:plans[0].sourceBuildingId,isRoofDetail:true};scene.add(roof);c.buildingMeshes.push(roof);retired.push(roof);
 const neighbour=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial());neighbour.userData={sourceBuildingId:'unrelated'};scene.add(neighbour);c.buildingMeshes.push(neighbour);
 publishReviewedVenueExteriors(c,T);const callback=c.deferredTransportLandmarkPublishers.at(-1);assert.equal(c.reads(),0);c._worldLoadSequence=8;callback();assert.equal(c.reads(),0);assert.equal(c.buildingMeshes.length,11);
 c._worldLoadSequence=7;callback();assert.equal(c.buildingMeshes.filter(m=>m.userData.paddockStructure).length,9);assert.ok(retired.every(m=>m.parent===null));assert.equal(neighbour.parent,scene);assert.equal(c.dynamicBuildingColliders.length,9);assert.ok(c.buildings.every(b=>b.collisionReplacedByVenue));callback();assert.equal(c.dynamicBuildingColliders.length,9);
 for(const m of c.buildingMeshes)disposeLandmarkModel(m);
});
