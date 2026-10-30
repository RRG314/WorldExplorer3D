import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {earthCoordinateFrame} from '../app/js/earth-core/coordinate-frame.js';
import {DAYTONA_STAND_FOOTPRINT,DAYTONA_STAND_SOURCE_ID} from '../app/js/world/daytona-grandstand-survey.js';
import {createDaytonaGrandstandExterior,isDaytonaStandRepresentation} from '../app/js/world/daytona-grandstand-exterior.js';
import {publishReviewedVenueExteriors} from '../app/js/world/reviewed-venue-exteriors.js';
import {disposeLandmarkModel} from '../app/js/world/landmark-lifetime.js';
const frame=earthCoordinateFrame({lat:29.185,lon:-81.071},100000);
const context=()=>({worldLoadRuntimeState:{venuePack:{id:'daytona-tri-oval'}},_worldLoadSequence:7,deferredTransportLandmarkPublishers:[],buildingMeshes:[],METERS_PER_WORLD_UNIT:1.11,geoToWorld:(lat,lon)=>frame.toWorld(lat,lon),elevationWorldYAtWorldXZ:()=>8});
function contains(p,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[i],b=ring[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)hit=!hit;
}return hit;}
const edgeDistance=(p,ring)=>Math.min(...ring.map((a,i)=>{const b=ring[(i+1)%ring.length],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);}));
test('Daytona seating follows the complete curved mapped plan, bounded height and decreasing detail budgets',()=>{
 const ctx=context(),model=createDaytonaGrandstandExterior(T,ctx);assert.ok(model);const {root,footprint}=model;
 assert.equal(footprint.length,238);assert.equal(root.userData.sourceBuildingId,DAYTONA_STAND_SOURCE_ID);assert.equal(root.userData.architecture.interiorAdmission,false);
 assert.deepEqual(root.userData.architecture.seatingTiers,3);assert.equal(root.userData.architecture.rows,68);assert.equal(root.userData.architecture.estimatedArchitecture,true);
 const levels=root.children[0].levels,counts=[];
 for(const {object}of levels){let triangles=0;assert.ok(object.children.length<=9);
  for(const mesh of object.children){const p=mesh.geometry.attributes.position;triangles+=p.count/3;assert.ok(Array.from(p.array).every(Number.isFinite));
   for(let i=0;i<p.count;i+=31){const q={x:p.getX(i)+root.position.x,z:p.getZ(i)+root.position.z};assert.ok(contains(q,footprint)||edgeDistance(q,footprint)<.003,'architectural vertices must stay within the retained outline');}
  }counts.push(triangles);
 }
 assert.ok(counts[0]<220000&&counts[1]<45000&&counts[2]<6500);assert.ok(counts[0]>counts[1]*3&&counts[1]>counts[2]*3);
 const box=new T.Box3().setFromObject(root);assert.ok(box.min.y>=8&&box.max.y<8+42.8/1.11);
 let released=0;root.traverse(m=>{m.geometry?.addEventListener('dispose',()=>released++);});disposeLandmarkModel(root);assert.equal(released,22);
});
test('post-transport publication transfers only the matching stand visual and collision through existing owners',()=>{
 const ctx=context(),scene=new T.Scene(),footprint=DAYTONA_STAND_FOOTPRINT.map(p=>ctx.geoToWorld(p.lat,p.lon)),stand=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial()),neighbor=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial());
 stand.userData={sourceBuildingId:'provider:stand',buildingFootprint:footprint};neighbor.userData={sourceBuildingId:'provider:neighbour',buildingFootprint:footprint.map(p=>({...p,x:p.x+150}))};scene.add(stand,neighbor);
 assert.equal(isDaytonaStandRepresentation({buildingFootprint:footprint},footprint),true,'the curved outline must match even with its centroid outside');
 const collider={pts:footprint,sourceBuildingId:'provider:stand'},other={pts:neighbor.userData.buildingFootprint},entrances={retain:true};
 Object.assign(ctx,{buildingMeshes:[stand,neighbor],buildings:[collider,other],dynamicBuildingColliders:[],buildingEntranceCatalog:entrances,replaceWorldCollection(k,v){this[k]=v;},addEarthWorldObject:m=>scene.add(m)});
 const result=publishReviewedVenueExteriors(ctx,T);assert.ok(stand.parent===scene,'publication waits for transport');assert.equal(ctx.deferredTransportLandmarkPublishers.length,1);
 ctx.deferredTransportLandmarkPublishers.splice(0).forEach(f=>f());assert.ok(stand.parent===null,'the matching provider visual must retire');assert.ok(neighbor.parent===scene,'neighbour retained');assert.equal(collider.collisionReplacedByVenue,true);assert.equal(other.collisionReplacedByVenue,undefined);
 assert.equal(ctx.dynamicBuildingColliders.length,1);assert.equal(ctx.dynamicBuildingColliders[0].sourceBuildingId,DAYTONA_STAND_SOURCE_ID);assert.equal(ctx.buildingEntranceCatalog,entrances);assert.deepEqual(result.published,['Daytona — mapped curved grandstand']);
 publishReviewedVenueExteriors(ctx,T);ctx.deferredTransportLandmarkPublishers.splice(0).forEach(f=>f());assert.equal(ctx.buildingMeshes.length,2);assert.equal(ctx.dynamicBuildingColliders.length,1);disposeLandmarkModel(ctx.buildingMeshes.find(m=>m!==neighbor));
});
test('world cancellation, unavailable ground and another venue cannot publish this stand',()=>{
 const ctx=context(),scene=new T.Scene();Object.assign(ctx,{buildings:[],dynamicBuildingColliders:[],replaceWorldCollection(k,v){this[k]=v;},addEarthWorldObject:m=>scene.add(m)});
 publishReviewedVenueExteriors(ctx,T);ctx._worldLoadSequence++;ctx.deferredTransportLandmarkPublishers.splice(0).forEach(f=>f());assert.equal(ctx.buildingMeshes.length,0);assert.equal(ctx.dynamicBuildingColliders.length,0);
 assert.equal(createDaytonaGrandstandExterior(T,{...ctx,elevationWorldYAtWorldXZ:()=>NaN}),null);assert.equal(createDaytonaGrandstandExterior(T,{...ctx,worldLoadRuntimeState:{venuePack:{id:'silverstone-grand-prix'}}}),null);
 const footprint=DAYTONA_STAND_FOOTPRINT.map(p=>ctx.geoToWorld(p.lat,p.lon));assert.equal(isDaytonaStandRepresentation({buildingName:'Daytona',buildingFootprint:footprint.map(p=>({...p,x:p.x+150}))},footprint),false);
 let reads=0;ctx.elevationWorldYAtWorldXZ=(x,z)=>{reads++;return 8+x*.003-z*.002;};const model=createDaytonaGrandstandExterior(T,ctx);assert.ok(model);const compiledReads=reads;model.root.updateMatrixWorld(true);model.root.children[0].update(new T.PerspectiveCamera());assert.equal(reads,compiledReads,'detail selection cannot create a live height authority');disposeLandmarkModel(model.root);
});

test('the real mid-building batch keeps deferred stand bodies and roofs individually replaceable',async()=>{
 globalThis.THREE=T;
 const {ctx:runtime}=await import('../app/js/shared-context.js?v=55'),{batchMidLodBuildingMeshes}=await import('../app/js/world/building-batching.js?v=15');
 const ctx=context(),scene=new T.Scene(),footprint=DAYTONA_STAND_FOOTPRINT.map(p=>ctx.geoToWorld(p.lat,p.lon)),material=new T.MeshStandardMaterial(),stand=new T.Mesh(new T.BoxGeometry(),material),roof=new T.Mesh(new T.BoxGeometry(),material),others=[0,1].map(()=>new T.Mesh(new T.BoxGeometry(),material));
 stand.userData={sourceBuildingId:'provider:stand',buildingFootprint:footprint,lodTier:'mid'};roof.userData={...stand.userData,isRoofDetail:true};others.forEach((m,i)=>{m.position.x=i*3;m.userData={sourceBuildingId:'neighbor:'+i,lodTier:'mid'};});scene.add(stand,roof,...others);
 Object.assign(ctx,{buildingMeshes:[stand,roof,...others],buildings:[],dynamicBuildingColliders:[],replaceWorldCollection(k,v){this[k]=v;},addEarthWorldObject:m=>scene.add(m)});
 publishReviewedVenueExteriors(ctx,T);assert.equal(stand.userData.deferredReviewedExterior,'daytona-tri-oval');assert.equal(roof.userData.deferredReviewedExterior,'daytona-tri-oval');assert.equal(others[0].userData.deferredReviewedExterior,undefined);
 Object.assign(runtime,{buildingMeshes:ctx.buildingMeshes,replaceWorldCollection(k,v){this[k]=v;},addEarthWorldObject:m=>scene.add(m)});
 assert.equal(await batchMidLodBuildingMeshes({yieldToMainThread:async()=>{}}),2);assert.ok(runtime.buildingMeshes.includes(stand)&&runtime.buildingMeshes.includes(roof));
 const batch=runtime.buildingMeshes.find(m=>m.userData.isBuildingBatch);assert.ok(batch);assert.deepEqual(batch.userData.editableBuildingIndexRanges.map(r=>r.sourceBuildingId),['neighbor:0','neighbor:1']);
 ctx.buildingMeshes=runtime.buildingMeshes;ctx.elevationWorldYAtWorldXZ=()=>NaN;ctx.deferredTransportLandmarkPublishers.splice(0).forEach(f=>f());assert.ok(stand.parent===scene&&roof.parent===scene,'unavailable replacement ground preserves both original visuals');assert.equal(ctx.dynamicBuildingColliders.length,0);
 ctx.elevationWorldYAtWorldXZ=()=>8;publishReviewedVenueExteriors(ctx,T);ctx.deferredTransportLandmarkPublishers.splice(0).forEach(f=>f());assert.ok(stand.parent===null&&roof.parent===null);assert.ok(batch.parent===scene);assert.equal(ctx.buildingMeshes.length,2);
 for(const m of ctx.buildingMeshes)disposeLandmarkModel(m);for(const k of Object.keys(runtime))delete runtime[k];delete globalThis.THREE;
});
