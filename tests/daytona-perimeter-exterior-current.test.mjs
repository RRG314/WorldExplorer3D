import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {buildDaytonaPerimeter,createDaytonaPerimeterExterior} from '../app/js/world/daytona-perimeter-exterior.js';
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js';
import {disposeLandmarkModel} from '../app/js/world/landmark-lifetime.js';

// Controlled five-way bank/apron surface. This checks presentation projection
// and resource ownership; native venue geometry has its own accepted evidence.
function fixture(unit){
 const roads=[],positions=[],height=l=>(10+(l>=-6?l*.6:-3.6+(l+6)*.02))/unit;
 for(let i=0;i<5;i++){
  const sourceFeatureId=`fixture:${i}`,a={x:0,z:i*40/unit},b={x:0,z:(i+1)*40/unit};
  roads.push({sourceFeatureId,pts:[a,b],transportSurfaceModel:{reviewedSurfacePhase:'accepted'},transportRecord:{crossSection:{pavementSections:{coordinateSpace:'world',nodeDistances:[0,40/unit],nodeFrames:[{x:-1,z:0},{x:-1,z:0}],samples:[0,40/unit].map(distance=>({distance,positive:4/unit,negative:12/unit,bankNegative:6/unit}))}}}});
  for(const [lo,hi]of [[-12,-6],[-6,0],[0,4]])for(const [l,z]of [[lo,a.z],[hi,a.z],[hi,b.z],[lo,a.z],[hi,b.z],[lo,b.z]])positions.push(-l/unit,height(l),z);
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));const mesh=new T.Mesh(geometry);mesh.userData.terrainMode='at_grade';
 const index=createRoadContactIndex([mesh]);
 return {ctx:{METERS_PER_WORLD_UNIT:unit,worldLoadRuntimeState:{venuePack:{id:'daytona-tri-oval',sourceFeatureIds:roads.map(r=>r.sourceFeatureId)}},buildingMeshes:[],roads,roadContactIndex:index},dispose(){index.dispose();geometry.dispose();mesh.material.dispose();}};
}
test('paint stays on actual bank triangles and outer-wall collision leaves all pavement and apron clear at both unit scales',()=>{
 for(const unit of [1,1.11]){
  const f=fixture(unit),plan=buildDaytonaPerimeter(f.ctx);assert.ok(plan);assert.ok(Math.abs(plan.lengthMeters-200)<1e-9);assert.equal(plan.chunks.length,2);assert.ok(plan.colliders.length>=25&&plan.colliders.length<=30);
  for(const c of plan.chunks){assert.ok(c.paint.length&&c.wall.length&&c.fence.length);assert.equal(c.colors.length,c.paint.length);assert.equal(c.fenceUvs.length,c.fence.length/3*2);
   for(let i=0;i<c.paint.length;i+=3){const x=c.paint[i],y=c.paint[i+1],z=c.paint[i+2],support=f.ctx.roadContactIndex.sampleAt(x,z,NaN,'at_grade');assert.ok(Number.isFinite(support));assert.ok(Math.abs((y-support)*unit-.008)<1e-6);assert.ok(x*unit<6&&x*unit> -4);}
  }
  for(const collider of plan.colliders){assert.equal(collider.collisionKind,'barrier');assert.ok(collider.pts.every(p=>p.x*unit< -4.03));assert.ok(collider.height*unit>=1.29);}
  f.dispose();
 }
});
test('unpublished or incomplete support cannot produce a floating perimeter',()=>{
 const f=fixture(1);assert.equal(buildDaytonaPerimeter({...f.ctx,roadContactIndex:null}),null);assert.equal(buildDaytonaPerimeter({...f.ctx,roads:f.ctx.roads.slice(1)}),null);
 assert.throws(()=>buildDaytonaPerimeter({...f.ctx,roadContactIndex:{...f.ctx.roadContactIndex,sampleAt:()=>null}}),/surface_unavailable/);f.dispose();
});
test('LOD selection reads no heights and the existing landmark owner releases every unique resource',()=>{
 const f=fixture(1.11),oldDocument=globalThis.document;
 globalThis.document={createElement:()=>({getContext:()=>({beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){}})})};
 try{
  const model=createDaytonaPerimeterExterior(T,f.ctx);assert.ok(model);assert.equal(model.root.children.length,2);
  for(const c of model.root.children){const levels=c.children[0].levels;assert.deepEqual(levels.map(l=>l.object.children.length),[4,2,0]);}
  f.ctx.buildingMeshes.push(model.root);assert.equal(createDaytonaPerimeterExterior(T,f.ctx),null);
  f.ctx.roadContactIndex.sampleAt=()=>{throw Error('live height read');};model.root.updateMatrixWorld(true);model.root.traverse(o=>{if(o.isLOD)o.update(new T.PerspectiveCamera());});
  const resources=new Set();model.root.traverse(o=>{if(o.geometry)resources.add(o.geometry);if(o.material){resources.add(o.material);if(o.material.map)resources.add(o.material.map);}});
  let disposed=0;for(const r of resources)r.addEventListener('dispose',()=>disposed++);disposeLandmarkModel(model.root);assert.equal(disposed,resources.size);
 }finally{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;f.dispose();}
});
